/**
 * lib/tiktok-sync.ts
 *
 * Server-only shared helper for syncing TikTok official data (user info + videos).
 *
 * Used by:
 *  - app/actions/tiktok-sync.ts  (manual Refresh TikTok action)
 *  - app/api/auth/callback/tiktok/route.ts  (post-OAuth initial sync)
 *
 * Security:
 *  - Never returns access tokens, refresh tokens, or raw TikTok response bodies.
 *  - All provider calls go through tiktokFetch() — never getTikTokAccessToken() directly.
 *  - Only the calling userId's data is read/written.
 */

import "server-only";

import { db } from "@/lib/db";
import { tiktokFetch } from "@/lib/tiktok-token";
import { computeFollowerCache } from "@/lib/creator-metrics";
import type { Prisma } from "@/lib/generated/prisma";

// ── API URLs ───────────────────────────────────────────────────────────────────

const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const TIKTOK_VIDEO_LIST_URL = "https://open.tiktokapis.com/v2/video/list/";

// ── Public result type ─────────────────────────────────────────────────────────

/**
 * Safe semantic result — never contains tokens, raw TikTok bodies, or secret values.
 */
export type TikTokSyncResult =
  | { ok: true }
  | { ok: false; reason: "not_connected" }
  | { ok: false; reason: "reauth_required" }
  | { ok: false; reason: "temporary_failure" }
  | { ok: false; reason: "configuration_error" }
  | { ok: false; reason: "identity_mismatch" };

// ── Internal TikTok API types ──────────────────────────────────────────────────

interface TikTokUserInfo {
  open_id?: string;
  union_id?: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
  bio_description?: string;
  profile_deep_link?: string;
  is_verified?: boolean;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

interface TikTokUserInfoResponse {
  data?: { user?: TikTokUserInfo };
  error?: { code?: string; message?: string; log_id?: string };
}

interface TikTokVideo {
  id?: string;
  create_time?: number;
  cover_image_url?: string;
  share_url?: string;
  video_description?: string;
  title?: string;
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  embed_link?: string;
}

interface TikTokVideoListResponse {
  data?: {
    videos?: TikTokVideo[];
    cursor?: number;
    has_more?: boolean;
  };
  error?: { code?: string; message?: string; log_id?: string };
}

// ── Sync helper ────────────────────────────────────────────────────────────────

/**
 * Fetches fresh TikTok user-info and (when video.list scope is granted) videos,
 * then atomically writes PlatformStats, SocialPost rows, and CreatorProfile cache.
 *
 * Identity guard:
 *   The TikTok open_id returned by user.info MUST exactly match the
 *   PlatformToken.platformUserId stored for this user. If they differ (or either
 *   is absent), NO data is written and identity_mismatch is returned.
 *
 * Failure safety:
 *   If any required in-scope provider call fails, existing DB rows are NOT
 *   overwritten. The exception is video.list absence (scope not granted): in
 *   that case stats-only sync succeeds and existing SocialPost rows are
 *   untouched.
 *
 * @param userId  Duolync (Better Auth) user ID — never a TikTok identifier.
 */
export async function syncTikTokOfficialData(
  userId: string,
): Promise<TikTokSyncResult> {
  // ── Step 1: Load connection metadata ──────────────────────────────────────
  // Only safe metadata — no accessToken/refreshToken exposed.
  const token = await db.platformToken.findUnique({
    where: { userId_platform: { userId, platform: "tiktok" } },
    select: {
      id: true,
      platformUserId: true,
      scopes: true,
      username: true,
    },
  });

  if (!token) {
    return { ok: false, reason: "not_connected" };
  }

  // platformUserId (open_id) is required for identity verification.
  if (!token.platformUserId) {
    return { ok: false, reason: "identity_mismatch" };
  }

  const storedOpenId = token.platformUserId;

  // ── Step 2: Parse stored scopes truthfully ────────────────────────────────
  const grantedScopeSet = new Set(
    (token.scopes ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // ── Step 3: Build user.info field list based on granted scopes ────────────
  // user.info.basic fields are always requested — it is the minimal required scope.
  const userInfoFields: string[] = [
    "open_id",
    "union_id",
    "avatar_url",
    "display_name",
  ];
  if (grantedScopeSet.has("user.info.profile")) {
    userInfoFields.push(
      "username",
      "bio_description",
      "profile_deep_link",
      "is_verified",
    );
  }
  if (grantedScopeSet.has("user.info.stats")) {
    userInfoFields.push(
      "follower_count",
      "following_count",
      "likes_count",
      "video_count",
    );
  }

  // ── Step 4: Fetch user.info via tiktokFetch ───────────────────────────────
  // tiktokFetch handles: proactive refresh, rotation, row-lock, invalid retry.
  const userInfoUrl = new URL(TIKTOK_USER_INFO_URL);
  userInfoUrl.searchParams.set("fields", userInfoFields.join(","));

  const userInfoResult = await tiktokFetch<TikTokUserInfoResponse>(
    userId,
    userInfoUrl.toString(),
  );

  if (!userInfoResult.ok) {
    // Map tiktokFetch failure reasons to safe sync result reasons.
    if (userInfoResult.reason === "reauth_required") {
      return { ok: false, reason: "reauth_required" };
    }
    if (userInfoResult.reason === "configuration_error") {
      return { ok: false, reason: "configuration_error" };
    }
    // Token row was concurrently removed between our initial check and tiktokFetch.
    if (userInfoResult.reason === "not_connected") {
      return { ok: false, reason: "not_connected" };
    }
    return { ok: false, reason: "temporary_failure" };
  }

  // ── Step 5: Validate user.info response ───────────────────────────────────
  const userInfo = userInfoResult.data?.data?.user;
  if (!userInfo) {
    // Malformed response — no data.user object.
    return { ok: false, reason: "temporary_failure" };
  }

  // ── Step 6: Identity guard ────────────────────────────────────────────────
  // returned open_id must exist and exactly equal stored PlatformToken.platformUserId.
  // If either is absent or they differ: write NOTHING.
  const returnedOpenId = userInfo.open_id;

  if (!returnedOpenId) {
    return { ok: false, reason: "identity_mismatch" };
  }

  if (returnedOpenId !== storedOpenId) {
    // Log only a fixed string — never log the open_id values.
    console.warn(
      "[tiktok-sync] open_id mismatch during manual sync — discarding, preserving existing connection",
    );
    return { ok: false, reason: "identity_mismatch" };
  }

  // ── Step 7: Extract user info fields ──────────────────────────────────────
  // Numeric fields: typeof check so 0 is preserved (not converted to null).
  // username is the real @handle — requires user.info.profile scope.
  // display_name must NEVER become PlatformToken.username.
  const username =
    typeof userInfo.username === "string" && userInfo.username.length > 0
      ? userInfo.username
      : null;
  const followerCount =
    typeof userInfo.follower_count === "number" ? userInfo.follower_count : null;
  const followingCount =
    typeof userInfo.following_count === "number"
      ? userInfo.following_count
      : null;
  const likesCount =
    typeof userInfo.likes_count === "number" ? userInfo.likes_count : null;
  const videoCount =
    typeof userInfo.video_count === "number" ? userInfo.video_count : null;

  // ── Step 8: Fetch video.list when scope is granted ────────────────────────
  const hasVideoListScope = grantedScopeSet.has("video.list");
  let officialVideos: TikTokVideo[] = [];
  let videoListFetchedSuccessfully = false;

  if (hasVideoListScope) {
    const videoFields = [
      "id",
      "create_time",
      "cover_image_url",
      "share_url",
      "video_description",
      "title",
      "like_count",
      "comment_count",
      "view_count",
      "embed_link",
    ].join(",");

    const videoUrl = new URL(TIKTOK_VIDEO_LIST_URL);
    videoUrl.searchParams.set("fields", videoFields);

    // body must be a replayable string for tiktokFetch one-retry logic.
    const videoResult = await tiktokFetch<TikTokVideoListResponse>(
      userId,
      videoUrl.toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: 10 }),
      },
    );

    if (!videoResult.ok) {
      // In-scope fetch failed — do NOT partially write stats.
      // Preserve all existing stored TikTok data.
      if (videoResult.reason === "reauth_required") {
        return { ok: false, reason: "reauth_required" };
      }
      if (videoResult.reason === "configuration_error") {
        return { ok: false, reason: "configuration_error" };
      }
      // Token row was concurrently removed between user.info and video.list calls.
      if (videoResult.reason === "not_connected") {
        return { ok: false, reason: "not_connected" };
      }
      return { ok: false, reason: "temporary_failure" };
    }

    const videoBody = videoResult.data;

    // Use Array.isArray so an empty [] is treated as a legitimate success.
    // A failed/malformed response leaves videoListFetchedSuccessfully = false.
    if (Array.isArray(videoBody?.data?.videos)) {
      officialVideos = videoBody.data!.videos!;
      videoListFetchedSuccessfully = true;
    } else {
      // Malformed video list response — preserve existing posts.
      return { ok: false, reason: "temporary_failure" };
    }
  }

  // ── Step 9: All required reads succeeded — compute write values ───────────

  // Fetch existing stats for numeric preserve (fields TikTok omitted → keep DB value).
  const existingStats = await db.platformStats.findUnique({
    where: { userId_platform: { userId, platform: "tiktok" } },
    select: {
      followerCount: true,
      followingCount: true,
      postCount: true,
      raw: true,
    },
  });

  // Preserve rule: if TikTok returned a number (including 0), write it.
  // If TikTok omitted the field (null), keep the existing DB value.
  const effectiveFollowerCount =
    followerCount !== null ? followerCount : (existingStats?.followerCount ?? null);
  const effectiveFollowingCount =
    followingCount !== null
      ? followingCount
      : (existingStats?.followingCount ?? null);
  const effectivePostCount =
    videoCount !== null ? videoCount : (existingStats?.postCount ?? null);

  // Preserve existing raw fields that TikTok didn't return this sync.
  // existingRaw is read as a plain JS object (JSON column); safe to spread.
  const existingRawObj =
    existingStats?.raw !== null &&
    typeof existingStats?.raw === "object" &&
    !Array.isArray(existingStats?.raw)
      ? (existingStats.raw as Record<string, Prisma.JsonValue>)
      : ({} as Record<string, Prisma.JsonValue>);

  // Build the merged raw object.
  //
  // Overwrite rule:
  //   • "field" in userInfo → TikTok actually returned the key (even as null/false/
  //     empty-string) → write the returned value.
  //   • key absent from userInfo → TikTok omitted the field (scope not granted or
  //     user has no value) → preserve the previously stored raw value.
  //
  // This correctly handles:
  //   - is_verified=false: "is_verified" in userInfo is true → false is written.
  //   - user.info.profile not in scope: bio_description/profile_deep_link/
  //     is_verified/username absent from response → existing DB values kept.
  //   - Unknown existing raw keys: preserved via the initial spread.
  const rawDraft: Record<string, Prisma.JsonValue> = { ...existingRawObj };

  // Fields conditionally returned by TikTok — only overwrite when actually present.
  if ("display_name" in userInfo) rawDraft.display_name = userInfo.display_name ?? null;
  if ("avatar_url" in userInfo) rawDraft.avatar_url = userInfo.avatar_url ?? null;
  if ("union_id" in userInfo) rawDraft.union_id = userInfo.union_id ?? null;
  if ("bio_description" in userInfo) rawDraft.bio_description = userInfo.bio_description ?? null;
  if ("profile_deep_link" in userInfo) rawDraft.profile_deep_link = userInfo.profile_deep_link ?? null;
  if ("is_verified" in userInfo) rawDraft.is_verified = userInfo.is_verified ?? null;

  // username: store the real @handle when available; preserve existing otherwise.
  rawDraft.username = username !== null ? username : (existingRawObj.username ?? null);
  // Numeric raw fields: preserve existing when TikTok omitted.
  rawDraft.likes_count = likesCount !== null ? likesCount : (existingRawObj.likes_count ?? null);
  rawDraft.video_count = videoCount !== null ? videoCount : (existingRawObj.video_count ?? null);

  const newRaw = rawDraft as Prisma.InputJsonObject;

  // Load creator profile for SocialPost scoping.
  const creator = await db.creatorProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!creator) {
    return { ok: false, reason: "temporary_failure" };
  }

  // Filter to videos with a non-null, non-empty id.
  const validVideos = officialVideos.filter(
    (v): v is TikTokVideo & { id: string } =>
      typeof v.id === "string" && v.id.length > 0,
  );

  // ── Step 10: Atomic DB write ──────────────────────────────────────────────
  try {
    await db.$transaction(async (tx) => {
      // A. Update PlatformToken.username only when a new non-empty username exists.
      //    display_name must NEVER become PlatformToken.username.
      if (username !== null) {
        await tx.platformToken.update({
          where: { userId_platform: { userId, platform: "tiktok" } },
          data: {
            username,
            updatedAt: new Date(),
          },
        });
      }

      // B. Upsert PlatformStats with OFFICIAL_API data.
      await tx.platformStats.upsert({
        where: { userId_platform: { userId, platform: "tiktok" } },
        create: {
          userId,
          platform: "tiktok",
          followerCount: effectiveFollowerCount,
          followingCount: effectiveFollowingCount,
          postCount: effectivePostCount,
          // engagementRate intentionally omitted — computed read-time from SocialPost
          fetchedAt: new Date(),
          raw: newRaw,
          dataSource: "OFFICIAL_API",
          providerAccountId: storedOpenId,
        },
        update: {
          followerCount: effectiveFollowerCount,
          followingCount: effectiveFollowingCount,
          postCount: effectivePostCount,
          // engagementRate intentionally omitted
          fetchedAt: new Date(),
          raw: newRaw,
          dataSource: "OFFICIAL_API",
          providerAccountId: storedOpenId,
        },
      });

      // C. Replace TikTok SocialPost rows atomically when video.list was fetched.
      //    Scoped strictly to {creatorProfileId, platform:"tiktok"}.
      //    Other platforms are never touched.
      if (videoListFetchedSuccessfully) {
        await tx.socialPost.deleteMany({
          where: {
            creatorProfileId: creator.id,
            platform: "tiktok",
          },
        });
        if (validVideos.length > 0) {
          await tx.socialPost.createMany({
            data: validVideos.map((v) => ({
              creatorProfileId: creator.id,
              platform: "tiktok",
              providerPostId: v.id,
              caption: v.video_description ?? v.title ?? null,
              imageUrl: v.cover_image_url ?? null,
              postUrl: v.share_url ?? null,
              postedAt:
                typeof v.create_time === "number"
                  ? new Date(v.create_time * 1_000)
                  : null,
              likes: v.like_count ?? null,
              comments: v.comment_count ?? null,
              views: v.view_count ?? null,
              dataSource: "OFFICIAL_API",
              fetchedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }
        // Successful well-formed empty video list: delete old TikTok posts, insert none.
      }

      // D. Recompute CreatorProfile.followerCount using computeFollowerCache.
      //    Read all stats inside the transaction so the just-upserted TikTok row
      //    is included in the aggregate.
      const allStats = await tx.platformStats.findMany({
        where: { userId },
        select: { followerCount: true },
      });
      const cachedFollowers = computeFollowerCache(allStats);

      // E. Atomically ensure "tiktok" is in connectedPlatforms without touching
      //    other platform entries.  Uses a PostgreSQL array_append + containment
      //    check so the update is safe against concurrent connect/disconnect of
      //    other providers — never reads the array into JavaScript.
      await tx.$executeRaw`
        UPDATE "CreatorProfile"
        SET    "connectedPlatforms" = CASE
                 WHEN NOT ("connectedPlatforms" @> ARRAY['tiktok']::text[])
                 THEN array_append("connectedPlatforms", 'tiktok')
                 ELSE "connectedPlatforms"
               END
        WHERE  "userId" = ${userId}
      `;

      // F. Update CreatorProfile: lastSyncedAt and followerCount cache.
      //    connectedPlatforms is handled atomically above.
      await tx.creatorProfile.update({
        where: { userId },
        data: {
          lastSyncedAt: new Date(),
          ...(cachedFollowers !== null
            ? { followerCount: cachedFollowers }
            : {}),
        },
      });
    });
  } catch {
    // DB transaction failure — all writes rolled back; existing data preserved.
    console.warn("[tiktok-sync] atomic write transaction failed (details omitted)");
    return { ok: false, reason: "temporary_failure" };
  }

  return { ok: true };
}
