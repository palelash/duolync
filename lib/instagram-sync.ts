import "server-only";

import { db } from "@/lib/db";
import { lockInstagramOwner } from "@/lib/instagram-lock";
import type { Prisma } from "@/lib/generated/prisma";
import { computeFollowerCache } from "@/lib/creator-metrics";
import {
  INSTAGRAM_GRAPH, parseInstagramJson, readInstagramGraphErrorCode,
} from "@/lib/instagram-auth";
import {
  getInstagramAccessToken, handleInstagramGraphFailure,
} from "@/lib/instagram-token";
import {
  fetchAccountInsights, fetchMediaInsights, mergeInstagramRaw,
  type AccountInsightsSnapshot, type MediaInsightsMetrics,
} from "@/lib/instagram-insights";

export type InstagramSyncResult =
  | { ok: true; insightsUnavailable: boolean }
  | { ok: false; reason: "not_connected" | "reauth_required" | "identity_mismatch" | "temporary_failure" | "configuration_failure" | "not_professional_account" };

class SyncFailure extends Error {
  constructor(readonly reason: Extract<InstagramSyncResult, { ok: false }>["reason"]) {
    super(reason);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyncFailure("temporary_failure");
  return value as Record<string, unknown>;
}
function string(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new SyncFailure("temporary_failure");
  return value;
}
function count(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new SyncFailure("temporary_failure");
  return value;
}

/** Provider reads first; one dataset transaction second. No session auth or public-data fallback. */
export async function syncInstagramOfficialData(userId: string): Promise<InstagramSyncResult> {
  try {
    const token = await getInstagramAccessToken(userId);
    if (!token.ok) return { ok: false, reason: token.reason === "configuration_error" ? "configuration_failure" : token.reason };
    const stored = await db.platformToken.findUnique({ where: { userId_platform: { userId, platform: "instagram" } } });
    if (!stored) return { ok: false, reason: "not_connected" };
    // A concurrent reconnect/refresh must not pair another token with this identity.
    if (stored.accessToken !== token.accessToken) return { ok: false, reason: "temporary_failure" };
    const accessToken = token.accessToken;
    const deadAuth = async (): Promise<never> => {
      const outcome = await handleInstagramGraphFailure(userId, { errorCode: 190, failedAccessToken: accessToken });
      throw new SyncFailure(!outcome.ok && outcome.reason === "reauth_required" ? "reauth_required" : "temporary_failure");
    };
    const graph = async (path: string, params: Record<string, string>) => {
      const url = new URL(`${INSTAGRAM_GRAPH}/${path}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      url.searchParams.set("access_token", accessToken);
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const body: unknown = parseInstagramJson(await res.text());
      if (Number(readInstagramGraphErrorCode(body)) === 190) await deadAuth();
      const parsed = object(body);
      if (!res.ok || parsed.error) throw new SyncFailure("temporary_failure");
      return parsed;
    };

    const profile = await graph("me", { fields: "id,username,name,profile_picture_url,biography,followers_count,follows_count,media_count,account_type" });
    const id = string(profile.id);
    if (!id) throw new SyncFailure("temporary_failure");
    if (id !== stored.platformUserId) throw new SyncFailure("identity_mismatch");
    if (profile.account_type === "PERSONAL") throw new SyncFailure("not_professional_account");
    const identity = {
      instagram_id: id,
      username: string(profile.username),
      name: string(profile.name),
      profile_picture_url: string(profile.profile_picture_url),
      biography: string(profile.biography),
      account_type: string(profile.account_type),
    };
    const stats = {
      followerCount: count(profile.followers_count),
      followingCount: count(profile.follows_count),
      postCount: count(profile.media_count),
    };
    const response = await graph("me/media", {
      fields: "id,caption,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp,media_type,media_product_type",
      limit: "10",
    });
    if (!Array.isArray(response.data) || response.data.length > 10) throw new SyncFailure("temporary_failure");
    const posts = response.data.map((value: unknown) => {
      const media = object(value);
      const providerPostId = string(media.id);
      if (!providerPostId) throw new SyncFailure("temporary_failure");
      const timestamp = string(media.timestamp);
      const postedAt = timestamp ? new Date(timestamp) : null;
      if (postedAt && Number.isNaN(postedAt.getTime())) throw new SyncFailure("temporary_failure");
      return {
        providerPostId,
        postUrl: string(media.permalink),
        imageUrl: string(media.media_url) ?? string(media.thumbnail_url),
        caption: string(media.caption),
        likes: count(media.like_count),
        comments: count(media.comments_count),
        postedAt,
        mediaType: string(media.media_type),
        mediaProductType: string(media.media_product_type),
        views: null as number | null,
      };
    });
    if (new Set(posts.map(p => p.providerPostId)).size !== posts.length) throw new SyncFailure("temporary_failure");

    const hasInsights = stored.scopes?.split(/[ ,]+/).includes("instagram_business_manage_insights") ?? false;
    let insightsUnavailable = !hasInsights;
    let account: AccountInsightsSnapshot | null | undefined;
    const mediaInsights: Record<string, MediaInsightsMetrics> = {};
    let preserveMediaHistory = false;
    if (hasInsights) {
      const result = await fetchAccountInsights(id, accessToken);
      if (result.permissionState === "auth_invalid") await deadAuth();
      if (result.permissionState === "unknown") throw new SyncFailure("temporary_failure");
      if (result.permissionState === "missing") insightsUnavailable = true;
      else account = result.snapshot;
      // Continue checking each media: any confirmed 190 aborts the entire dataset.
      for (const post of posts) {
        const result = await fetchMediaInsights(post.providerPostId, accessToken, post.mediaType, post.mediaProductType);
        if (result.permissionState === "auth_invalid") await deadAuth();
        if (result.permissionState === "unknown") throw new SyncFailure("temporary_failure");
        if (result.permissionState === "missing" || !result.available) {
          insightsUnavailable = true;
          // Denied and skipped requests retain history without new timestamps.
          preserveMediaHistory = true;
        } else if (result.metrics) {
          mediaInsights[post.providerPostId] = { ...result.metrics, fetchedAt: new Date().toISOString() };
          post.views = count(result.metrics.views);
        }
      }
    }

    const fetchedAt = new Date();
    await db.$transaction(async tx => {
      await lockInstagramOwner(tx, userId);
      // Serialize against Pass 1 cleanup/save and reject reads from superseded auth.
      const rows = await tx.$queryRaw<{ accessToken: string; platformUserId: string | null }[]>`
        SELECT "accessToken", "platformUserId" FROM "PlatformToken"
        WHERE "userId" = ${userId} AND "platform" = 'instagram' FOR UPDATE
      `;
      if (!rows[0]) throw new SyncFailure("reauth_required");
      if (rows[0].platformUserId !== id) throw new SyncFailure("identity_mismatch");
      if (rows[0].accessToken !== accessToken) throw new SyncFailure("temporary_failure");
      const creator = await tx.creatorProfile.findUnique({ where: { userId }, select: { id: true } });
      if (creator) {
        await tx.$queryRaw`
          SELECT id FROM "CreatorProfile" WHERE id = ${creator.id} FOR UPDATE
        `;
      }
      // Connected-account UI reads this handle cache. Raw SQL intentionally
      // leaves updatedAt unchanged: Pass 1 uses it to age token renewal.
      await tx.$executeRaw`
        UPDATE "PlatformToken" SET "username" = ${identity.username}
        WHERE "userId" = ${userId} AND "platform" = 'instagram'
      `;
      const old = await tx.platformStats.findUnique({
        where: { userId_platform: { userId, platform: "instagram" } },
        select: { raw: true, providerAccountId: true, dataSource: true },
      });
      // Never carry insights over from a different account or a public source.
      const existing = old?.providerAccountId === id && old.dataSource === "OFFICIAL_API"
        && old.raw && typeof old.raw === "object" && !Array.isArray(old.raw)
        ? old.raw as Prisma.InputJsonObject : {};
      const raw = mergeInstagramRaw(
        existing, identity, account, hasInsights ? mediaInsights : undefined,
        { preserveMedia: preserveMediaHistory },
      );
      const data = {
        ...stats, fetchedAt, raw, dataSource: "OFFICIAL_API" as const,
        providerAccountId: id, engagementRate: null,
      };
      await tx.platformStats.upsert({
        where: { userId_platform: { userId, platform: "instagram" } },
        create: { userId, platform: "instagram", ...data },
        update: data,
      });
      if (creator) {
        // The successfully fetched current list is authoritative even when empty.
        // Curation is independent of SocialPost ids and is never deleted here.
        await tx.socialPost.deleteMany({ where: { creatorProfileId: creator.id, platform: "instagram" } });
        if (posts.length) {
          await tx.socialPost.createMany({
            data: posts.map(({ mediaType, mediaProductType, ...post }) => ({
              ...post, creatorProfileId: creator.id, platform: "instagram",
              dataSource: "OFFICIAL_API", fetchedAt, engagementRate: null,
            })),
          });
        }
        const allStats = await tx.platformStats.findMany({ where: { userId }, select: { followerCount: true } });
        const followerCount = computeFollowerCache(allStats);
        await tx.creatorProfile.update({ where: { userId }, data: { lastSyncedAt: fetchedAt, ...(followerCount !== null ? { followerCount } : {}) } });
        await tx.$executeRaw`UPDATE "CreatorProfile" SET "connectedPlatforms" = array_append("connectedPlatforms", 'instagram') WHERE "userId" = ${userId} AND NOT ('instagram' = ANY("connectedPlatforms"))`;
      }
    }, { maxWait: 5_000, timeout: 15_000 });
    return { ok: true, insightsUnavailable };
  } catch (error) {
    return { ok: false, reason: error instanceof SyncFailure ? error.reason : "temporary_failure" };
  }
}
