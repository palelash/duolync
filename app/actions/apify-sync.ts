"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { canOverwrite } from "@/lib/platform-stats-policy";

// ─── Apify actor IDs ──────────────────────────────────────────────────────────
const ACTOR_IDS = {
  instagram: "apify/instagram-profile-scraper",
  tiktok: "clockworks/free-tiktok-scraper",
} as const;

export type Platform = keyof typeof ACTOR_IDS;

// ─── Apify response types ─────────────────────────────────────────────────────

interface ApifyRunResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
  };
}

// Instagram profile item (first element of dataset)
interface InstagramProfileItem {
  username?: string;
  fullName?: string;
  profilePicUrl?: string;
  followersCount?: number;
  private?: boolean;
  categoryName?: string;
  latestPosts?: {
    url?: string;
    displayUrl?: string;
    imageUrl?: string;
    caption?: string;
    likesCount?: number;
    commentsCount?: number;
    videoViewCount?: number;
    timestamp?: string;
  }[];
  [key: string]: unknown;
}

// TikTok video item — profile data is nested under authorMeta
interface TikTokAuthorMeta {
  name?: string;        // handle
  nickName?: string;    // display name
  avatar?: string;
  fans?: number;        // follower count ← THE BUG WAS HERE
  heart?: number;       // total likes
  video?: number;
  following?: number;
  verified?: boolean;
  signature?: string;
}

interface TikTokVideoItem {
  id?: string;
  text?: string;
  createTime?: number;
  authorMeta?: TikTokAuthorMeta;
  webVideoUrl?: string;
  videoMeta?: { coverUrl?: string; duration?: number };
  diggCount?: number;
  commentCount?: number;
  playCount?: number;
  shareCount?: number;
  hashtags?: { name?: string }[];
  [key: string]: unknown;
}

// ─── Public result types ──────────────────────────────────────────────────────

export interface AccountPreview {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  isPrivate: boolean;
}

export interface SyncResult {
  success: boolean;
  error?: string;
  data?: {
    followerCount: number;
    averageEngagement: number;
    topNiches: string[];
    lastSyncedAt: string;
  };
}

export type VerifyStatus =
  | { state: "running" }
  | { state: "found"; preview: AccountPreview; datasetId: string }
  | { state: "not_found" }
  | { state: "private"; handle: string }
  | { state: "failed"; error: string };

export type PollStatus =
  | { state: "running" }
  | {
      state: "succeeded";
      data: NonNullable<SyncResult["data"]> & {
        platform: Platform;
        platformFollowers: number;
        platformEngagement: number;
      };
    }
  | { state: "failed"; error: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN environment variable is not set.");
  return token;
}

// ─── Image proxy ─────────────────────────────────────────────────────────────
// CDN URLs from Instagram (fbcdn.net) and TikTok expire within hours.
// Routing through wsrv.nl proxies the image, bypasses CORS/CSP, and caches
// it at the CDN layer so subsequent views work even after the original URL expires.
// We omit the `n` (max-age) override so wsrv.nl uses its own default cache TTL
// rather than forcing no-cache, which would re-hit the expired CDN URL every time.
function proxyImage(url: string | null | undefined): string | null {
  if (!url) return null;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg`;
}

function buildActorInput(platform: Platform, handle: string, full: boolean) {
  if (platform === "instagram") {
    // resultsLimit controls how many recent posts are included in latestPosts
    return { usernames: [handle], resultsLimit: full ? 3 : 0 };
  }
  // TikTok: the scraper batches in page-sized increments. Requesting a small
  // number like 3 can cause it to under-fetch (returns 1). Request a larger
  // batch and slice to 3 in extractTikTokSync / extractTikTokPreview.
  return {
    profiles: [`https://www.tiktok.com/@${handle}`],
    resultsPerPage: full ? 20 : 5,
  };
}

function extractInstagramPreview(item: InstagramProfileItem, handle: string): AccountPreview {
  return {
    handle: item.username ?? handle,
    displayName: item.fullName ?? null,
    // Instagram profile pic CDN URL expires — proxy through wsrv.nl
    avatarUrl: proxyImage(item.profilePicUrl),
    followerCount: item.followersCount ?? null,
    isPrivate: item.private ?? false,
  };
}

function extractTikTokPreview(item: TikTokVideoItem, handle: string): AccountPreview {
  const meta = item.authorMeta ?? {};
  return {
    handle: meta.name ?? handle,
    displayName: meta.nickName ?? null,
    // TikTok avatar CDN URL also expires — proxy through wsrv.nl
    avatarUrl: proxyImage(meta.avatar),
    followerCount: meta.fans ?? null,
    isPrivate: false,
  };
}

function extractInstagramSync(item: InstagramProfileItem) {
  const followerCount = item.followersCount ?? 0;
  // Apify Instagram profile scraper does not return engagement rate data.
  // null is the honest value — do not invent 0 or a derived formula here.
  const engagementRate = null;

  const rawPosts = item.latestPosts ?? [];
  console.info(`[apify] Instagram raw post count: ${rawPosts.length}`);

  const posts = rawPosts.slice(0, 3).map((p) => {
    // Instagram CDN URLs (fbcdn.net / cdninstagram.com) expire within hours.
    // Route through wsrv.nl which caches on first fetch, bypassing both expiry and CORS.
    // NOTE: instagram.com/p/{shortCode}/media/ requires an auth session since 2023 — do not use.
    const imageUrl = proxyImage(p.displayUrl ?? p.imageUrl);

    return {
      postUrl: p.url ?? null,
      imageUrl,
      caption: p.caption ?? null,
      likes: p.likesCount ?? null,
      comments: p.commentsCount ?? null,
      views: p.videoViewCount ?? null,
      engagementRate: null as number | null,
      postedAt: p.timestamp ? new Date(p.timestamp) : null,
    };
  });

  const niches: string[] = [];
  if (item.categoryName) niches.push(item.categoryName);

  return { followerCount, engagementRate, posts, niches };
}

function extractTikTokSync(items: TikTokVideoItem[]) {
  if (!items.length) return { followerCount: 0, engagementRate: 0, posts: [], niches: [] };

  const meta = items[0].authorMeta ?? {};
  const fans = meta.fans ?? 0;
  const hearts = meta.heart ?? 0;
  const engagementRate = fans > 0 && hearts > 0
    ? Math.min(100, parseFloat(((hearts / fans) * 100).toFixed(2)))
    : 0;

  console.info(`[apify] TikTok raw item count: ${items.length}`);

  // Each item is a video; take up to 3, skip items with no usable data
  const posts = items
    .filter((v) => v.webVideoUrl || v.diggCount != null)
    .slice(0, 3)
    .map((v) => ({
      postUrl: v.webVideoUrl ?? null,
      // Proxy the cover URL through wsrv.nl to avoid CDN expiry + CORS issues
      imageUrl: proxyImage(v.videoMeta?.coverUrl),
      caption: v.text ?? null,
      likes: v.diggCount ?? null,
      comments: v.commentCount ?? null,
      views: v.playCount ?? null,
      engagementRate: null as number | null,
      postedAt: v.createTime ? new Date(v.createTime * 1000) : null,
    }));

  // Extract niches from hashtags
  const niches: string[] = [];
  for (const item of items.slice(0, 3)) {
    for (const tag of (item.hashtags ?? []) as { name?: string }[]) {
      const name = tag.name?.trim();
      if (name && !niches.includes(name) && niches.length < 5) niches.push(name);
    }
  }

  console.info(`[apify] TikTok extracted posts: ${posts.length}`);
  return { followerCount: fans, engagementRate, posts, niches };
}

async function triggerRun(
  platform: Platform,
  handle: string,
  full: boolean,
  token: string,
): Promise<{ runId: string } | { error: string }> {
  const actorId = ACTOR_IDS[platform];
  const input = buildActorInput(platform, handle, full);

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trigger failed (${res.status}): ${body}`);
    }
    const json = (await res.json()) as ApifyRunResponse;
    console.info(`[apify] Run started: ${json.data.id} (${platform}, full=${full})`);
    return { runId: json.data.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start run" };
  }
}

async function fetchRunStatus(runId: string, token: string) {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status} ${res.statusText}`);
  return ((await res.json()) as ApifyRunResponse).data;
}

async function fetchDataset(datasetId: string, token: string) {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&format=json`,
  );
  if (!res.ok) throw new Error(`Dataset fetch failed (${res.status})`);
  return res.json();
}

// ─── AUTH helper ─────────────────────────────────────────────────────────────

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

// ─── Action 1: Start verify run (lightweight, no DB writes) ──────────────────

/**
 * Triggers a lightweight Apify run to retrieve profile preview data only.
 * Does NOT write to the database.
 */
export async function startVerifyAction(
  handle: string,
  platform: Platform,
): Promise<{ runId: string } | { error: string }> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try { session = await requireSession(); } catch { return { error: "Unauthorized" }; }

  const existingToken = await db.platformToken.findFirst({
    where: { userId: session.user.id, platform },
    select: { id: true },
  });
  if (existingToken) return { error: "platform_oauth_protected" };

  const h = handle.replace(/^@/, "").trim();
  if (!h) return { error: "Username is required." };

  let token: string;
  try { token = getApifyToken(); } catch (err) {
    return { error: err instanceof Error ? err.message : "Config error" };
  }

  return triggerRun(platform, h, false, token);
}

// ─── Action 2: Poll verify run (returns preview, no DB writes) ────────────────

/**
 * Checks the verify run status and returns profile preview when ready.
 * Safe to call repeatedly — never writes to DB.
 */
export async function pollVerifyAction(
  runId: string,
  platform: Platform,
  handle: string,
): Promise<VerifyStatus> {
  try { await requireSession(); } catch { return { state: "failed", error: "Unauthorized" }; }

  let token: string;
  try { token = getApifyToken(); } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "Config error" };
  }

  let runData: ApifyRunResponse["data"];
  try {
    runData = await fetchRunStatus(runId, token);
  } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "Status check error" };
  }

  const { status, defaultDatasetId } = runData;

  if (["RUNNING", "READY", "CREATED"].includes(status)) return { state: "running" };
  if (status !== "SUCCEEDED") return { state: "failed", error: `Run ended with status: ${status}` };

  let items: unknown[];
  try { items = await fetchDataset(defaultDatasetId, token); } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "Dataset fetch error" };
  }

  if (!items.length) return { state: "not_found" };

  let preview: AccountPreview;
  if (platform === "instagram") {
    const item = items[0] as InstagramProfileItem;
    if (item.private) return { state: "private", handle: item.username ?? handle };
    preview = extractInstagramPreview(item, handle);
  } else {
    const item = items[0] as TikTokVideoItem;
    if (!item.authorMeta?.fans && !item.authorMeta?.name) return { state: "not_found" };
    preview = extractTikTokPreview(item, handle);
  }

  if (!preview.followerCount && platform === "instagram") {
    const item = items[0] as InstagramProfileItem;
    if (item.private) return { state: "private", handle: item.username ?? handle };
  }

  return { state: "found", preview, datasetId: defaultDatasetId };
}

// ─── Action 3: Confirm sync (reads existing dataset → saves to DB) ────────────

/**
 * Called after user confirms their account preview.
 * Re-fetches the already-completed dataset (no new Apify run) and saves to DB.
 * `handle` is optional — when provided it is persisted in PlatformStats.raw so
 * future one-click re-syncs can trigger a new run without asking again.
 */
export async function confirmSyncAction(
  datasetId: string,
  platform: Platform,
  handle?: string,
): Promise<{ success: true; platformFollowers: number; platformEngagement: number } | { success: false; error: string }> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try { session = await requireSession(); } catch { return { success: false, error: "Unauthorized" }; }
  // userId is always derived from the authenticated session — clients never supply it
  const userId = session.user.id;

  // Block before any Apify dataset read when this platform is officially connected.
  const existingToken = await db.platformToken.findFirst({
    where: { userId, platform },
    select: { id: true },
  });
  if (existingToken) {
    return { success: false, error: "platform_oauth_protected" };
  }

  let token: string;
  try { token = getApifyToken(); } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Config error" };
  }

  let items: unknown[];
  try { items = await fetchDataset(datasetId, token); } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to read data" };
  }

  if (!items.length) return { success: false, error: "No data available. Please try syncing again." };

  let followerCount: number;
  let engagementRate: number | null;
  let posts: { postUrl: string | null; imageUrl: string | null; caption: string | null; likes: number | null; comments: number | null; views: number | null; engagementRate: number | null; postedAt: Date | null }[];
  let niches: string[];

  if (platform === "instagram") {
    const item = items[0] as InstagramProfileItem;
    if (item.private) return { success: false, error: "This account is private. Please make it public first." };
    ({ followerCount, engagementRate, posts, niches } = extractInstagramSync(item));
  } else {
    ({ followerCount, engagementRate, posts, niches } = extractTikTokSync(items as TikTokVideoItem[]));
  }

  if (followerCount === 0) {
    return {
      success: false,
      error: platform === "instagram"
        ? "This account appears to be private or has no public data."
        : "Could not read follower data. Ensure the account is public and not restricted.",
    };
  }

  const lastSyncedAt = new Date();

  try {
    const creatorProfile = await db.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!creatorProfile) return { success: false, error: "Creator profile not found." };

    // Gate 1 (PlatformToken) already returned above, before the dataset fetch.
    // Gate 2 — source authority: APIFY cannot overwrite a higher-authority row.
    const existingStats = await db.platformStats.findFirst({
      where: { userId, platform },
      select: { dataSource: true },
    });

    if (existingStats && !canOverwrite(existingStats.dataSource, "APIFY")) {
      return {
        success: false,
        error: "platform_stats_protected",
      };
    }

    // Both gates passed — proceed with write.
    // Delete old row and create fresh APIFY-stamped row.
    await db.platformStats.deleteMany({ where: { userId, platform } });
    await db.platformStats.create({
      data: {
        userId,
        platform,
        followerCount,
        engagementRate,
        fetchedAt: lastSyncedAt,
        dataSource: "APIFY",
        // Apify actors don't return a stable platform account ID we can trust;
        // providerAccountId is left null until a reliable source is identified.
        providerAccountId: null,
        ...(handle ? { raw: { handle } } : {}),
      },
    });

    // Aggregate totals across all platforms for this user
    const allStats = await db.platformStats.findMany({
      where: { userId },
      select: { followerCount: true, engagementRate: true },
    });
    const totalFollowers = allStats.reduce((s, r) => s + (r.followerCount ?? 0), 0);
    const ratedStats = allStats.filter((r) => r.engagementRate !== null);
    const avgEng = ratedStats.length
      ? ratedStats.reduce((s, r) => s + (r.engagementRate ?? 0), 0) / ratedStats.length
      : (engagementRate ?? 0);

    await db.creatorProfile.update({
      where: { userId },
      data: {
        followerCount: totalFollowers,
        averageEngagement: parseFloat(avgEng.toFixed(2)),
        topNiches: niches,
        lastSyncedAt,
        // connectedPlatforms is written ONLY by OAuth callbacks — Apify never touches it
      },
    });

    // ── SocialPost write policy ────────────────────────────────────────────────
    if (posts.length) {
      // If OFFICIAL_API posts exist for this platform, Apify must not replace them.
      const officialPostCount = await db.socialPost.count({
        where: { creatorProfileId: creatorProfile.id, platform, dataSource: "OFFICIAL_API" },
      });

      if (officialPostCount === 0) {
        // No official posts — Apify may write as fallback.
        // Only delete Apify and legacy rows; never touch other sources.
        await db.socialPost.deleteMany({
          where: {
            creatorProfileId: creatorProfile.id,
            platform,
            dataSource: { in: ["APIFY", "LEGACY_UNKNOWN"] },
          },
        });
        await db.socialPost.createMany({
          data: posts.map((p, i) => ({
            creatorProfileId: creatorProfile.id,
            platform,
            ...p,
            dataSource: "APIFY" as const,
            // TikTok: use stable video ID from actor response (already in posts array via index).
            // Instagram: no stable post ID is extracted by the current actor fields; null is correct.
            providerPostId: platform === "tiktok"
              ? ((items as TikTokVideoItem[]).filter((v) => v.webVideoUrl || v.diggCount != null)[i]?.id ?? null)
              : null,
          })),
        });
      }
      // else: OFFICIAL_API posts exist — Apify does not touch SocialPost for this platform.
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Database update failed" };
  }

  console.info(`[apify] Confirmed sync: ${platform} for user ${userId}`);
  revalidatePath("/creator/presence");
  revalidatePath("/creator/dashboard");
  revalidatePath(`/profile/${userId}`);

  return { success: true, platformFollowers: followerCount, platformEngagement: engagementRate ?? 0 };
}

// ─── Legacy: start full sync run (used by poll action below) ─────────────────

export async function startApifySyncAction(
  socialHandle: string,
  platform: Platform = "instagram",
): Promise<{ runId: string } | { error: string }> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try { session = await requireSession(); } catch { return { error: "Unauthorized" }; }
  const userId = session.user.id;

  // Pre-check: if a PlatformToken already exists, block before starting any Apify run.
  // This prevents wasted API credits when the platform is already OAuth-connected.
  const existingToken = await db.platformToken.findFirst({
    where: { userId, platform },
    select: { id: true },
  });
  if (existingToken) return { error: "platform_oauth_protected" };

  // Rate limit: max 5 syncs per hour per user
  const { rateLimit } = await import("@/lib/rate-limit");
  const allowed = await rateLimit(`${userId}:apify-sync`, 5, 60 * 60_000);
  if (!allowed) return { error: "Too many sync requests. Please wait before syncing again." };

  const handle = socialHandle.replace(/^@/, "").trim();
  if (!handle) return { error: "A social handle is required." };

  let token: string;
  try { token = getApifyToken(); } catch (err) {
    return { error: err instanceof Error ? err.message : "Config error" };
  }

  return triggerRun(platform, handle, true, token);
}

// ─── Legacy: poll full sync run (kept for existing callers) ──────────────────

export async function pollApifyRunAction(
  runId: string,
  platform: Platform = "instagram",
): Promise<PollStatus> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try { session = await requireSession(); } catch { return { state: "failed", error: "Unauthorized" }; }
  const userId = session.user.id;

  let token: string;
  try { token = getApifyToken(); } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "Config error" };
  }

  let runData: ApifyRunResponse["data"];
  try { runData = await fetchRunStatus(runId, token); } catch (err) {
    return { state: "failed", error: err instanceof Error ? err.message : "Status check error" };
  }

  const { status, defaultDatasetId } = runData;
  if (["RUNNING", "READY", "CREATED"].includes(status)) return { state: "running" };
  if (status !== "SUCCEEDED") return { state: "failed", error: `Run ended with status: ${status}` };

  const result = await confirmSyncAction(defaultDatasetId, platform);
  if (!result.success) return { state: "failed", error: result.error };

  const creatorProfile = await db.creatorProfile.findUnique({
    where: { userId },
    select: { followerCount: true, averageEngagement: true, topNiches: true, lastSyncedAt: true },
  });

  return {
    state: "succeeded",
    data: {
      followerCount: creatorProfile?.followerCount ?? result.platformFollowers,
      averageEngagement: creatorProfile?.averageEngagement ?? result.platformEngagement,
      topNiches: creatorProfile?.topNiches ?? [],
      lastSyncedAt: (creatorProfile?.lastSyncedAt ?? new Date()).toISOString(),
      platform,
      platformFollowers: result.platformFollowers,
      platformEngagement: result.platformEngagement,
    },
  };
}

// ─── Portfolio Re-sync ────────────────────────────────────────────────────────

/**
 * One-click portfolio re-sync.  Looks up the creator's stored handle for the
 * given platform (saved in PlatformStats.raw during initial sync), then triggers
 * a fresh Apify full-scrape run.  Returns the runId immediately so the caller
 * can poll via `pollApifyRunAction`.
 *
 * If the handle has never been stored (accounts synced before this feature was
 * added), returns `{ error: "no_handle" }` so the UI can fall back to the full
 * connect modal.
 */
export async function startPortfolioResyncAction(
  platform: Platform,
): Promise<{ runId: string } | { error: string }> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try { session = await requireSession(); } catch { return { error: "Unauthorized" }; }

  // Pre-check before any Apify HTTP call so an OAuth-connected platform never starts a paid run.
  const existingToken = await db.platformToken.findFirst({
    where: { userId: session.user.id, platform },
    select: { id: true },
  });
  if (existingToken) return { error: "platform_oauth_protected" };

  let token: string;
  try { token = getApifyToken(); } catch (err) {
    return { error: err instanceof Error ? err.message : "Config error" };
  }

  // Look up the handle we persisted during the last successful sync
  const stats = await db.platformStats.findFirst({
    where: { userId: session.user.id, platform },
    select: { raw: true },
  });

  const rawData = stats?.raw as { handle?: string } | null;
  const handle = rawData?.handle?.trim();

  if (!handle) {
    console.warn(`[apify] re-sync: no stored handle for ${platform} / user ${session.user.id}`);
    return { error: "no_handle" };
  }

  console.info(`[apify] re-sync: starting full run for @${handle} on ${platform}`);
  return triggerRun(platform, handle, true, token);
}

// ─── Legacy wrapper ───────────────────────────────────────────────────────────

export async function syncCreatorProfileAction(
  socialHandle: string,
  platform: Platform = "instagram",
): Promise<SyncResult> {
  const startResult = await startApifySyncAction(socialHandle, platform);
  if ("error" in startResult) return { success: false, error: startResult.error };
  const { runId } = startResult;
  const deadline = Date.now() + 110_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));
    const poll = await pollApifyRunAction(runId, platform);
    if (poll.state === "succeeded") return { success: true, data: poll.data };
    if (poll.state === "failed") return { success: false, error: poll.error };
  }
  return { success: false, error: "Timed out." };
}
