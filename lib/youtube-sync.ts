import "server-only";
import { db } from "@/lib/db";
import type { PlatformToken, Prisma } from "@/lib/generated/prisma";
import { lockYouTubeOwner } from "@/lib/youtube-lock";
import { getYouTubeAccessToken, clearYouTubeDeadAuth, sameYouTubeCredentialVersion, isYouTubeAccessDeadAuth, type YouTubeCredentialVersion } from "@/lib/youtube-token";
import { youtubeFetch } from "@/lib/youtube-auth";
import { computeFollowerCache } from "@/lib/creator-metrics";

export type YouTubeSyncResult = { ok: true } | { ok: false; reason:
  "not_connected" | "reauth_required" | "identity_mismatch" | "temporary_failure" |
  "configuration_failure" | "provider_failure" | "superseded" | "counter_range" };
const RECENT_LIMIT = 50;
const CURATED_LIMIT = 200;
type ObjectData = Record<string, any>;
class SyncFailure extends Error {
  constructor(readonly reason: Exclude<YouTubeSyncResult, { ok: true }>["reason"] | "dead_auth") { super(reason); }
}
function object(value: unknown): ObjectData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyncFailure("provider_failure");
  return value as ObjectData;
}
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function counter(value: unknown, max = 2147483647): number | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new SyncFailure("provider_failure");
  const number = BigInt(value);
  if (number > BigInt(max)) throw new SyncFailure("counter_range");
  return Number(number);
}
function thumbnail(snippet: ObjectData): string | null {
  return text(snippet.thumbnails?.maxres?.url) ?? text(snippet.thumbnails?.high?.url) ??
    text(snippet.thumbnails?.medium?.url) ?? text(snippet.thumbnails?.default?.url);
}
async function read(resource: string, params: Record<string, string>, accessToken: string): Promise<ObjectData[]> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response, body: ObjectData;
  try {
    response = await youtubeFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    body = object(await response.json());
  } catch (error) {
    if (error instanceof SyncFailure) throw error;
    throw new SyncFailure("temporary_failure");
  }
  if (!response.ok) {
    const reasons = Array.isArray(body.error?.errors) ? body.error.errors.map((e: ObjectData) => e?.reason) : [];
    // Documented core authError proves invalid credentials; generic 401/403 does not.
    if (isYouTubeAccessDeadAuth(response.status, body)) throw new SyncFailure("dead_auth");
    if (response.status >= 500 || response.status === 429 || reasons.some((r: string) =>
      ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded", "backendError"].includes(r)))
      throw new SyncFailure("temporary_failure");
    if (response.status === 403 || reasons.some((r: string) =>
      ["insufficientPermissions", "accessNotConfigured", "youtubeSignupRequired"].includes(r))) throw new SyncFailure("configuration_failure");
    throw new SyncFailure("provider_failure");
  }
  if (body.error) throw new SyncFailure("provider_failure");
  if (body.items === undefined && body.pageInfo?.totalResults === 0) return [];
  if (!Array.isArray(body.items)) throw new SyncFailure("provider_failure");
  return body.items.map(object);
}

/** Callback identity prerequisite only; provider mapping and writes live in sync. */
export async function resolveYouTubeChannelIdentity(accessToken: string): Promise<{ id: string; title: string | null; username: string | null } | null> {
  const channels = await read("channels", { part: "snippet", mine: "true" }, accessToken);
  if (!channels.length) return null;
  if (channels.length !== 1 || !text(channels[0].id)) throw new SyncFailure("provider_failure");
  const snippet = object(channels[0].snippet ?? {});
  return { id: channels[0].id, title: text(snippet.title), username: text(snippet.customUrl) ?? text(snippet.title) };
}

/** All HTTP precedes the short User -> token -> profile coordinated transaction.
 * Callback supplies the exact saved version, so a late callback cannot sync a reconnect.
 */
export async function syncYouTubeOfficialData(userId: string, options?: { credential: YouTubeCredentialVersion }): Promise<YouTubeSyncResult> {
  let credential: YouTubeCredentialVersion | undefined;
  try {
    if (options) credential = options.credential;
    else {
      const token = await getYouTubeAccessToken(userId);
      if (!token.ok) return { ok: false, reason: token.reason === "configuration_error" ? "configuration_failure" : token.reason };
      const current = await db.platformToken.findUnique({ where: { userId_platform: { userId, platform: "youtube" } } });
      if (!current) return { ok: false, reason: "not_connected" };
      if (current.accessToken !== token.accessToken) return { ok: false, reason: "superseded" };
      credential = current;
    }
    const profile = await db.creatorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return { ok: false, reason: "configuration_failure" };
    const curated = await db.creatorContentCuration.findMany({ where: { creatorProfileId: profile.id, platform: "youtube" },
      select: { providerPostId: true }, orderBy: { providerPostId: "asc" }, take: CURATED_LIMIT + 1 });
    if (curated.length > CURATED_LIMIT) return { ok: false, reason: "configuration_failure" };
    const channels = await read("channels", { part: "snippet,contentDetails,statistics", mine: "true" }, credential.accessToken);
    if (channels.length !== 1 || !text(channels[0].id)) throw new SyncFailure("provider_failure");
    const channel = channels[0];
    if (channel.id !== credential.platformUserId) return { ok: false, reason: "identity_mismatch" };
    const snippet = object(channel.snippet), statistics = object(channel.statistics);
    const subscriberCount = counter(statistics.subscriberCount);
    const videoCount = counter(statistics.videoCount);
    const totalViews = counter(statistics.viewCount, Number.MAX_SAFE_INTEGER);
    const uploads = text(channel.contentDetails?.relatedPlaylists?.uploads);
    if (!uploads) throw new SyncFailure("provider_failure");
    const recent = await read("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: String(RECENT_LIMIT) }, credential.accessToken);
    if (recent.length > RECENT_LIMIT) throw new SyncFailure("provider_failure");
    const ids = new Set<string>();
    for (const item of recent) {
      const id = text(item.contentDetails?.videoId);
      if (!id) throw new SyncFailure("provider_failure");
      ids.add(id);
    }
    for (const item of curated) {
      if (!text(item.providerPostId)) throw new SyncFailure("provider_failure");
      ids.add(item.providerPostId);
    }
    const candidates = [...ids], posts: Omit<Prisma.SocialPostCreateManyInput, "creatorProfileId">[] = [], seen = new Set<string>();
    for (let start = 0; start < candidates.length; start += 50) {
      const batch = candidates.slice(start, start + 50);
      const videos = await read("videos", { part: "snippet,status,statistics", id: batch.join(",") }, credential.accessToken);
      for (const video of videos) {
        if (!text(video.id) || !batch.includes(video.id) || seen.has(video.id)) throw new SyncFailure("provider_failure");
        seen.add(video.id);
        if (video.status?.privacyStatus !== "public" || ["deleted", "failed", "rejected"].includes(video.status?.uploadStatus)) continue;
        const vs = object(video.snippet);
        if (vs.channelId !== channel.id) continue;
        if (typeof vs.publishedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(vs.publishedAt) ||
          !Number.isFinite(Date.parse(vs.publishedAt)) || new Date(vs.publishedAt).toISOString().slice(0, 19) !== vs.publishedAt.slice(0, 19) || !text(vs.title)) throw new SyncFailure("provider_failure");
        const counts = object(video.statistics);
        posts.push({ platform: "youtube", providerPostId: video.id as string, dataSource: "OFFICIAL_API" as const,
          postUrl: `https://www.youtube.com/watch?v=${video.id}`, caption: vs.title as string, imageUrl: thumbnail(vs),
          postedAt: new Date(vs.publishedAt), views: counter(counts.viewCount), likes: counter(counts.likeCount), comments: counter(counts.commentCount) });
      }
    }
    const fetchedAt = new Date();
    return await db.$transaction(async tx => {
      await lockYouTubeOwner(tx, userId);
      const tokens = await tx.$queryRaw<PlatformToken[]>`SELECT * FROM "PlatformToken" WHERE "userId" = ${userId} AND "platform" = 'youtube' FOR UPDATE`;
      const profiles = await tx.$queryRaw<{ id: string; connectedPlatforms: string[] }[]>`SELECT "id", "connectedPlatforms" FROM "CreatorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
      if (!tokens[0] || !sameYouTubeCredentialVersion(tokens[0], credential!)) return { ok: false, reason: "superseded" };
      if (!profiles[0] || profiles[0].id !== profile.id) return { ok: false, reason: "superseded" };
      // Curation added during HTTP must not be silently dropped by replacement.
      const latestCuration = await tx.creatorContentCuration.findMany({ where: { creatorProfileId: profile.id, platform: "youtube" }, select: { providerPostId: true } });
      if (latestCuration.some(item => !ids.has(item.providerPostId))) return { ok: false, reason: "superseded" };
      const snapshot = { followerCount: subscriberCount, followingCount: null, postCount: videoCount, engagementRate: null,
        fetchedAt, dataSource: "OFFICIAL_API" as const, providerAccountId: channel.id as string,
        raw: { channel_id: channel.id as string, channel_title: text(snippet.title), custom_url: text(snippet.customUrl),
          thumbnail_url: thumbnail(snippet), description: text(snippet.description), country: text(snippet.country),
          total_views: totalViews, video_count: videoCount, hidden_subscriber_count: typeof statistics.hiddenSubscriberCount === "boolean" ? statistics.hiddenSubscriberCount : null } };
      await tx.platformStats.upsert({ where: { userId_platform: { userId, platform: "youtube" } },
        create: { userId, platform: "youtube", ...snapshot }, update: snapshot });
      // Highest-authority replacement removes ALL YouTube sources, including empty sets.
      await tx.socialPost.deleteMany({ where: { creatorProfileId: profile.id, platform: "youtube" } });
      if (posts.length) await tx.socialPost.createMany({ data: posts.map(post => ({ ...post, creatorProfileId: profile.id, fetchedAt })) });
      const allStats = await tx.platformStats.findMany({ where: { userId }, select: { followerCount: true } });
      const followers = computeFollowerCache(allStats);
      if (followers !== null && followers > 2147483647) throw new SyncFailure("counter_range");
      await tx.creatorProfile.update({ where: { userId }, data: { followerCount: followers, lastSyncedAt: fetchedAt,
        connectedPlatforms: [...new Set([...profiles[0].connectedPlatforms, "youtube"])] } });
      return { ok: true };
    }, { maxWait: 5_000, timeout: 15_000 });
  } catch (error) {
    if (error instanceof SyncFailure && error.reason === "dead_auth" && credential) {
      const cleared = await clearYouTubeDeadAuth(userId, credential);
      return cleared.ok ? { ok: false, reason: "superseded" } : { ok: false, reason: cleared.reason === "configuration_error" ? "configuration_failure" : cleared.reason };
    }
    return { ok: false, reason: error instanceof SyncFailure && error.reason !== "dead_auth" ? error.reason : "temporary_failure" };
  }
}
