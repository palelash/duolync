import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeFollowerCache } from "@/lib/creator-metrics";

// ── TikTok Login Kit v2 endpoints ─────────────────────────────────────────────
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const TIKTOK_VIDEO_LIST_URL = "https://open.tiktokapis.com/v2/video/list/";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

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

/**
 * GET /api/auth/callback/tiktok
 *
 * TikTok Login Kit v2 OAuth callback.
 * Requested scopes: user.info.basic, user.info.profile, user.info.stats, video.list
 *
 * Security:
 *  - State is validated against the HttpOnly __tiktok_state cookie set by
 *    /api/auth/tiktok/start. State cookie is cleared on all terminal paths.
 *  - Provider error_description is never forwarded to the user.
 *  - Tokens, auth codes, and client secret are never logged.
 *
 * Saves: PlatformToken("tiktok") + PlatformStats("tiktok") + SocialPost rows
 * Redirects to /creator/accounts?tiktok_connected=<username|1>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  // ── OAuth-level error ──────────────────────────────────────────────────────
  const oauthError = searchParams.get("error");
  if (oauthError) {
    // Log the provider error code only — never log error_description
    console.warn("[tiktok/callback] provider error:", oauthError);
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "access_denied" }),
      req,
    );
  }

  // ── State validation (CSRF) ────────────────────────────────────────────────
  // State cookie is set HttpOnly by /api/auth/tiktok/start.
  const stateParam = searchParams.get("state");
  const stateCookie = req.cookies.get("__tiktok_state")?.value ?? null;

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "invalid_state" }),
      req,
    );
  }

  // ── Authorization code ─────────────────────────────────────────────────────
  const code = searchParams.get("code");
  if (!code) {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "missing_code" }),
      req,
    );
  }

  // ── Session ────────────────────────────────────────────────────────────────
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return withClearedStateCookie(
        redir(req, "/auth", { tiktok_error: "unauthenticated" }),
        req,
      );
    }
    userId = session.user.id;
  } catch {
    return withClearedStateCookie(
      redir(req, "/auth", { tiktok_error: "session_error" }),
      req,
    );
  }

  // ── Env vars ───────────────────────────────────────────────────────────────
  const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "server_misconfiguration" }),
      req,
    );
  }

  // ── Token exchange ─────────────────────────────────────────────────────────
  let accessToken: string;
  let newRefreshToken: string | null = null;
  let openId: string | null = null;
  let expiresIn: number | null = null;
  let grantedScopes: string | null = null;

  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: canonicalCallbackUri(req),
    });

    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const json = (await res.json()) as TikTokTokenResponse;

    if (!res.ok || json.error || typeof json.access_token !== "string") {
      // Log only the error code — never log error_description or tokens
      console.warn("[tiktok/callback] token exchange failed, code:", json.error ?? res.status);
      return withClearedStateCookie(
        redir(req, "/creator/accounts", { tiktok_error: "token_exchange_failed" }),
        req,
      );
    }

    accessToken = json.access_token;
    newRefreshToken = json.refresh_token ?? null;
    openId = json.open_id ?? null;
    expiresIn = json.expires_in ?? null;
    // Ground truth for granted scopes: token response `scope` field.
    // Do NOT hardcode the requested scopes as granted.
    grantedScopes = json.scope ?? null;
  } catch {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "network_error" }),
      req,
    );
  }

  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1_000) : null;

  // Parse granted scopes into a Set for efficient lookup
  const grantedScopeSet = new Set(
    (grantedScopes ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // ── Build user info field list based on granted scopes ────────────────────
  // Only request fields for scopes the user actually granted to avoid API errors.
  // user.info.basic fields are always requested — it is the minimal required scope.
  const userInfoFields: string[] = ["open_id", "union_id", "avatar_url", "display_name"];
  if (grantedScopeSet.has("user.info.profile")) {
    userInfoFields.push("username", "bio_description", "profile_deep_link", "is_verified");
  }
  if (grantedScopeSet.has("user.info.stats")) {
    userInfoFields.push("follower_count", "following_count", "likes_count", "video_count");
  }

  // ── Fetch TikTok user info ─────────────────────────────────────────────────
  let userInfoFetched = false;
  let userInfo: TikTokUserInfo | null = null;

  try {
    const url = new URL(TIKTOK_USER_INFO_URL);
    url.searchParams.set("fields", userInfoFields.join(","));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const json = (await res.json()) as TikTokUserInfoResponse;
      const user = json.data?.user;
      if (user && (!json.error || json.error.code === "ok")) {
        userInfoFetched = true;
        userInfo = user;
        // openId from token response is preferred; fall back to user info
        if (!openId && user.open_id) openId = user.open_id;
      } else if (json.error && json.error.code !== "ok") {
        console.warn("[tiktok/callback] user info error code:", json.error.code);
      }
    } else {
      console.warn("[tiktok/callback] user info HTTP error:", res.status);
    }
  } catch {
    console.warn("[tiktok/callback] user info fetch threw");
  }

  // ── Identity check ────────────────────────────────────────────────────────
  // A real open_id is required for a successful first connection.
  // Without it we cannot safely identify the TikTok account.
  if (!openId) {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "no_tiktok_account" }),
      req,
    );
  }

  // ── Extract user info fields (null = not granted or not returned) ──────────
  // Missing != zero. Fields not in granted scopes or not returned are null.
  const displayName = userInfo?.display_name ?? null;
  // username is the real TikTok @handle — requires user.info.profile scope.
  // Do NOT store display_name as the @handle.
  const username = userInfo?.username ?? null;
  const followerCount = userInfo?.follower_count ?? null;
  const followingCount = userInfo?.following_count ?? null;
  const likesCount = userInfo?.likes_count ?? null;
  const videoCount = userInfo?.video_count ?? null;
  const avatarUrl = userInfo?.avatar_url ?? null;
  const unionId = userInfo?.union_id ?? null;
  const bioDescription = userInfo?.bio_description ?? null;
  const profileDeepLink = userInfo?.profile_deep_link ?? null;
  const isVerified = userInfo?.is_verified ?? null;

  // ── Fetch video.list when scope was granted ────────────────────────────────
  // cover_image_url has a ~6h TTL — stored for immediate rendering only.
  // A future refresh/query task should renew these URLs; do not treat as permanent.
  let officialVideos: TikTokVideo[] = [];
  // Tracks whether video.list returned a well-formed success response.
  // Distinguishes a legitimate empty list (0 videos, still a success → stale posts
  // should be cleared) from a failed/malformed response (stale posts must be kept).
  let videoListFetchedSuccessfully = false;

  if (grantedScopeSet.has("video.list")) {
    try {
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

      const res = await fetch(videoUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ max_count: 10 }),
      });

      if (res.ok) {
        const json = (await res.json()) as TikTokVideoListResponse;
        // Use Array.isArray — NOT a truthy check — so an empty [] is treated as
        // a legitimate success, not a missing/failed response.
        if (
          Array.isArray(json.data?.videos) &&
          (!json.error || json.error.code === "ok")
        ) {
          officialVideos = json.data!.videos!;
          videoListFetchedSuccessfully = true;
        } else if (json.error && json.error.code !== "ok") {
          console.warn("[tiktok/callback] video.list error code:", json.error.code);
        }
      } else {
        console.warn("[tiktok/callback] video.list HTTP error:", res.status);
      }
    } catch {
      console.warn("[tiktok/callback] video.list fetch threw");
    }
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  try {
    // Preserve existing refresh token if the new token exchange response
    // did not return one. TikTok should always return a refresh token on initial
    // authorization_code exchange, but be conservative on reconnect.
    // Never erase a valid existing refresh token merely because a response omits one.
    const existingToken = await db.platformToken.findUnique({
      where: { userId_platform: { userId, platform: "tiktok" } },
      select: { refreshToken: true },
    });
    const effectiveRefreshToken =
      newRefreshToken ?? existingToken?.refreshToken ?? null;

    // ── PlatformToken ───────────────────────────────────────────────────────
    await db.platformToken.upsert({
      where: { userId_platform: { userId, platform: "tiktok" } },
      create: {
        userId,
        platform: "tiktok",
        accessToken,
        refreshToken: effectiveRefreshToken,
        expiresAt,
        // Truthful granted scopes from the token response — never hardcoded.
        scopes: grantedScopes,
        platformUserId: openId,
        // Real TikTok @handle (user.info.profile scope). Null if scope not granted.
        // Do NOT use display_name here.
        username,
      },
      update: {
        accessToken,
        refreshToken: effectiveRefreshToken,
        expiresAt,
        scopes: grantedScopes,
        platformUserId: openId,
        username,
        updatedAt: new Date(),
      },
    });

    // ── PlatformStats ────────────────────────────────────────────────────────
    // Only write if user info was successfully fetched — to avoid overwriting
    // a valid existing row with all-null values when user info fails.
    // When user info succeeds but a field was not granted, store null truthfully.
    // Do NOT carry forward engagementRate; canonical engagement is computed read-time.
    if (userInfoFetched) {
      await db.platformStats.upsert({
        where: { userId_platform: { userId, platform: "tiktok" } },
        create: {
          userId,
          platform: "tiktok",
          followerCount,
          followingCount,
          postCount: videoCount,           // official video_count → postCount
          // engagementRate intentionally omitted — computed read-time from SocialPost
          fetchedAt: new Date(),
          raw: {
            display_name: displayName,     // kept separately in raw; NOT the @handle
            username,
            avatar_url: avatarUrl,
            union_id: unionId,
            bio_description: bioDescription,
            profile_deep_link: profileDeepLink,
            is_verified: isVerified,
            likes_count: likesCount,
            video_count: videoCount,
          },
          dataSource: "OFFICIAL_API",
          providerAccountId: openId,
        },
        update: {
          followerCount,
          followingCount,
          postCount: videoCount,
          // engagementRate intentionally omitted
          fetchedAt: new Date(),
          raw: {
            display_name: displayName,
            username,
            avatar_url: avatarUrl,
            union_id: unionId,
            bio_description: bioDescription,
            profile_deep_link: profileDeepLink,
            is_verified: isVerified,
            likes_count: likesCount,
            video_count: videoCount,
          },
          dataSource: "OFFICIAL_API",
          providerAccountId: openId,
        },
      });
    }

    // ── SocialPost rows from official video.list ───────────────────────────
    const creator = await db.creatorProfile.findUnique({
      where: { userId },
      select: { id: true, connectedPlatforms: true },
    });

    // Only act on SocialPost rows when video.list returned a well-formed
    // success response (videoListFetchedSuccessfully = true).
    //
    // • Failed/malformed/HTTP-error fetch → videoListFetchedSuccessfully = false
    //   → no deletion, existing posts are preserved.
    // • Scope not granted → videoListFetchedSuccessfully = false
    //   → no deletion.
    // • Successful response with 0 videos (legitimate empty public-video list)
    //   → videoListFetchedSuccessfully = true, officialVideos = []
    //   → stale public-data posts are cleared (no official content exists).
    // • Successful response with ≥1 videos
    //   → delete all existing TikTok posts and replace atomically.
    if (creator && videoListFetchedSuccessfully) {
      // Filter to videos with a non-null id (providerPostId required for official rows)
      const validVideos = officialVideos.filter((v): v is TikTokVideo & { id: string } =>
        typeof v.id === "string" && v.id.length > 0,
      );

      if (validVideos.length > 0) {
        // Atomic replace: delete + insert inside a single Prisma transaction.
        // A failed createMany cannot leave the creator with zero TikTok posts.
        // Scoped strictly to {creatorProfileId, platform:"tiktok"} — other
        // creators and other platforms are never touched.
        await db.$transaction([
          db.socialPost.deleteMany({
            where: {
              creatorProfileId: creator.id,
              platform: "tiktok",
            },
          }),
          db.socialPost.createMany({
            data: validVideos.map((v) => ({
              creatorProfileId: creator.id,
              platform: "tiktok",
              providerPostId: v.id,                                         // non-null guaranteed by filter
              caption: v.video_description ?? v.title ?? null,
              imageUrl: v.cover_image_url ?? null,                          // TTL ~6h — immediate rendering only
              postUrl: v.share_url ?? null,
              postedAt: typeof v.create_time === "number"
                ? new Date(v.create_time * 1_000)                           // Unix seconds → Date
                : null,
              likes: v.like_count ?? null,
              comments: v.comment_count ?? null,
              views: v.view_count ?? null,
              dataSource: "OFFICIAL_API",
              fetchedAt: new Date(),
            })),
            skipDuplicates: true,
          }),
        ]);
      } else {
        // Successful fetch returned 0 valid videos (e.g., all videos are private).
        // Clear stale lower-authority posts — no official content exists to show.
        await db.socialPost.deleteMany({
          where: {
            creatorProfileId: creator.id,
            platform: "tiktok",
          },
        });
      }
    }

    // ── CreatorProfile side-write (connectedPlatforms + follower cache) ─────
    if (creator) {
      const allStats = await db.platformStats.findMany({
        where: { userId },
        select: { followerCount: true },
      });
      const cachedFollowers = computeFollowerCache(allStats);

      await db.creatorProfile.update({
        where: { userId },
        data: {
          connectedPlatforms: Array.from(
            new Set([...creator.connectedPlatforms, "tiktok"]),
          ),
          lastSyncedAt: new Date(),
          ...(cachedFollowers !== null ? { followerCount: cachedFollowers } : {}),
        },
      });
    }

    revalidatePath("/creator/accounts");
    revalidatePath("/creator/presence");
  } catch (err) {
    console.error("[tiktok/callback] db error:", err);
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "db_error" }),
      req,
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  // Use real username (the TikTok @handle) when available.
  // Fall back to "1" so the UI shows the generic "TikTok connected" message.
  const connectedValue = username ?? "1";
  return withClearedStateCookie(
    redir(req, "/creator/presence", { tiktok_connected: connectedValue }),
    req,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Canonical callback URI derived from NEXT_PUBLIC_APP_URL, never from request host. */
function canonicalCallbackUri(req: NextRequest): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base.replace(/\/$/, "")}/api/auth/callback/tiktok`;
}

function redir(
  req: NextRequest,
  path: string,
  params: Record<string, string>,
): NextResponse {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
}

/** Attaches a clearing Set-Cookie for __tiktok_state to the given response. */
function withClearedStateCookie(
  response: NextResponse,
  _req: NextRequest,
): NextResponse {
  response.cookies.set("__tiktok_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
