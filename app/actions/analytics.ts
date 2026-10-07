"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import type { AccountInsightsSnapshot } from "@/lib/instagram-insights";

export interface EngagementDataPoint {
  month: string;
  rate: number;
}

/**
 * Normalized Instagram Insights V1 shape returned to the Analytics page.
 *
 * The client MUST NOT parse PlatformStats.raw directly —
 * this typed shape is the only sanctioned way to consume insights data.
 *
 * available:          true when at least one fetch succeeded (or was tried).
 * permissionGranted:  true = confirmed granted; false = confirmed missing; null = unknown.
 * windowDays:         always 28 when available.
 * All metric fields:  number (including 0) when the provider returned a value,
 *                     null when absent or not enough data.
 * fetchedAt:          ISO 8601 string of when the snapshot was captured.
 */
export interface InstagramInsights {
  available: boolean;
  permissionGranted: boolean | null;
  windowDays: 28 | null;
  reach: number | null;
  views: number | null;
  profileViews: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
  fetchedAt: string | null;
}

export interface CreatorAnalytics {
  engagementTrend: EngagementDataPoint[];
  /**
   * Mean of SocialPost.views for recent posts.
   * null when no posts carry view data.
   * NEVER substitutes followerCount (§6 rename avgReach → avgViewsPerPost).
   */
  avgViewsPerPost: number | null;
  bestPlatform: { name: string; label: string } | null;
  peakHour: number | null;
  /**
   * Creator-level average ER.
   * null when no eligible posts exist.
   * Each post uses its own platform's followerCount as denominator (§3).
   */
  avgEngagementRate: number | null;
  totalFollowers: number | null;
  /**
   * Instagram Insights V1 — 28-day account metrics.
   * null when the creator has no Instagram PlatformStats row.
   */
  instagramInsights: InstagramInsights | null;
}

export async function getCreatorAnalyticsAction(creatorUserId: string): Promise<{
  data: CreatorAnalytics | null;
  error: string | null;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { data: null, error: "Unauthorized" };

  // Creators can always see their own analytics.
  // Brands may only see analytics for creators they are working with.
  const isSelf = session.user.id === creatorUserId;
  if (!isSelf) {
    const isConnectedBrand = await db.application.findFirst({
      where: {
        status: { in: ["ACCEPTED", "UNDER_REVIEW"] },
        creator: { userId: creatorUserId },
        campaign: { brand: { userId: session.user.id } },
      },
      select: { id: true },
    });
    if (!isConnectedBrand) return { data: null, error: "Unauthorized" };
  }

  try {
    const userWithData = await db.user.findUnique({
      where: { id: creatorUserId },
      select: {
        platformStats: {
          select: { platform: true, followerCount: true, raw: true },
        },
        platformTokens: {
          where: { platform: "instagram" },
          select: { scopes: true },
        },
        creatorProfile: {
          include: {
            socialPosts: {
              orderBy: { postedAt: "desc" },
              take: 100,
            },
          },
        },
      },
    });

    const profile = userWithData?.creatorProfile ?? null;

    if (!profile) {
      return { data: null, error: "Creator not found" };
    }

    const posts = profile.socialPosts.filter((p) => p.postedAt !== null);

    // §3: Build per-platform follower map for engagement denominator.
    // Each post's ER must use ITS OWN platform's followerCount.
    const platformFollowerMap = new Map<string, number>();
    for (const stat of (userWithData?.platformStats ?? [])) {
      if (stat.followerCount !== null && stat.followerCount > 0) {
        platformFollowerMap.set(stat.platform.toLowerCase(), stat.followerCount);
      }
    }

    // §2: Total followers from PlatformStats SUM when possible.
    const statsWithFollowers = (userWithData?.platformStats ?? []).filter((s) => s.followerCount !== null);
    const totalFollowers: number | null =
      statsWithFollowers.length > 0
        ? statsWithFollowers.reduce((sum, s) => sum + (s.followerCount as number), 0)
        : (profile.followerCount ?? (profile.totalFollowers > 0 ? profile.totalFollowers : null));

    // §3: Map each post to its per-platform ER.
    const postsWithEng = posts
      .filter(
        (p) =>
          p.likes !== null &&
          platformFollowerMap.has(p.platform.toLowerCase()),
      )
      .map((p) => {
        const denom = platformFollowerMap.get(p.platform.toLowerCase())!;
        const computedEngRate = (((p.likes as number) + (p.comments ?? 0)) / denom) * 100;
        return { ...p, computedEngRate };
      });

    // Average engagement over last 10 eligible posts.
    const last10 = postsWithEng.slice(0, 10);
    const avgEngagementRate: number | null =
      last10.length > 0
        ? parseFloat(
            (last10.reduce((s, p) => s + p.computedEngRate, 0) / last10.length).toFixed(2),
          )
        : null; // null means genuinely unknown — never fake 0

    // Engagement trend: last 3 calendar months.
    const now = new Date();
    const engagementTrend: EngagementDataPoint[] = [];
    for (let i = 2; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = start.toLocaleString("default", { month: "short" });
      const monthPosts = postsWithEng.filter((p) => {
        const d = new Date(p.postedAt!);
        return d >= start && d <= end;
      });
      const rate =
        monthPosts.length > 0
          ? monthPosts.reduce((s, p) => s + p.computedEngRate, 0) / monthPosts.length
          : 0;
      engagementTrend.push({ month: label, rate: parseFloat(rate.toFixed(2)) });
    }

    // §6: avgViewsPerPost — mean of post views only. null when no view data.
    // NEVER falls back to followerCount.
    const postsWithViews = posts.filter((p) => p.views != null);
    const avgViewsPerPost: number | null =
      postsWithViews.length > 0
        ? Math.round(
            postsWithViews.reduce((s, p) => s + (p.views as number), 0) /
              postsWithViews.length,
          )
        : null;

    // Best platform by engagement rate.
    const platformGroups: Record<string, number[]> = {};
    postsWithEng.forEach((p) => {
      if (!platformGroups[p.platform]) platformGroups[p.platform] = [];
      platformGroups[p.platform].push(p.computedEngRate);
    });

    const PLATFORM_LABELS: Record<string, string> = {
      tiktok: "TikTok",
      instagram: "Instagram",
      youtube: "YouTube",
      twitter: "X / Twitter",
      twitch: "Twitch",
      linkedin: "LinkedIn",
    };

    let bestPlatform: { name: string; label: string } | null = null;
    let bestAvg = -1;
    for (const [platform, rates] of Object.entries(platformGroups)) {
      const avg = rates.reduce((s, r) => s + r, 0) / rates.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        const platformName = PLATFORM_LABELS[platform] ?? platform;
        const engLabel =
          avg >= 6 ? "High Engagement" : avg >= 3 ? "Good Engagement" : "Moderate";
        bestPlatform = { name: platform, label: `${platformName} — ${engLabel}` };
      }
    }

    // Audience activity peak hour.
    const hourCounts: Record<number, number> = {};
    posts.forEach((p) => {
      if (!p.postedAt) return;
      const h = new Date(p.postedAt).getHours();
      hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    });

    let peakHour: number | null = null;
    let peakCount = 0;
    for (const [h, count] of Object.entries(hourCounts)) {
      if (count > peakCount) {
        peakCount = count;
        peakHour = parseInt(h);
      }
    }

    // ── Instagram Insights V1 ──────────────────────────────────────────────
    // Extract from PlatformStats.raw.insights.account — never from raw provider JSON directly.
    // The client receives a typed InstagramInsights shape, not raw JSON.
    const igStats = (userWithData?.platformStats ?? []).find(
      (s) => s.platform === "instagram",
    );
    const igToken = (userWithData?.platformTokens ?? [])[0] ?? null;

    let instagramInsights: InstagramInsights | null = null;

    if (igStats) {
      // Determine permission state from stored scopes.
      // null scopes = unknown; explicit scope string without insights = missing.
      const igScopes = igToken?.scopes ?? null;
      let permissionGranted: boolean | null = null;
      if (igScopes !== null) {
        permissionGranted = igScopes
          .split(",")
          .map((s) => s.trim())
          .includes("instagram_business_manage_insights");
      }

      // Parse raw.insights.account safely.
      const rawObj =
        typeof igStats.raw === "object" && igStats.raw !== null
          ? (igStats.raw as Record<string, unknown>)
          : {};
      const insightsObj =
        typeof rawObj["insights"] === "object" && rawObj["insights"] !== null
          ? (rawObj["insights"] as Record<string, unknown>)
          : null;
      const accountObj =
        insightsObj &&
        typeof insightsObj["account"] === "object" &&
        insightsObj["account"] !== null
          ? (insightsObj["account"] as Partial<AccountInsightsSnapshot>)
          : null;

      if (accountObj) {
        // Extract each metric safely — provider 0 stays 0, absent stays null.
        const safeNum = (v: unknown): number | null =>
          typeof v === "number" ? v : null;

        instagramInsights = {
          available: true,
          permissionGranted,
          windowDays: 28,
          reach: safeNum(accountObj.reach),
          views: safeNum(accountObj.views),
          profileViews: safeNum(accountObj.profileViews),
          accountsEngaged: safeNum(accountObj.accountsEngaged),
          totalInteractions: safeNum(accountObj.totalInteractions),
          fetchedAt:
            typeof accountObj.fetchedAt === "string" ? accountObj.fetchedAt : null,
        };
      } else {
        // PlatformStats row exists but no account snapshot yet.
        instagramInsights = {
          available: false,
          permissionGranted,
          windowDays: null,
          reach: null,
          views: null,
          profileViews: null,
          accountsEngaged: null,
          totalInteractions: null,
          fetchedAt: null,
        };
      }
    }

    return {
      data: {
        engagementTrend,
        avgViewsPerPost,
        bestPlatform,
        peakHour,
        avgEngagementRate,
        totalFollowers,
        instagramInsights,
      },
      error: null,
    };
  } catch (err) {
    console.error("getCreatorAnalyticsAction error:", err);
    return { data: null, error: "Failed to load analytics" };
  }
}

export async function getMyAnalyticsAction(): Promise<{
  data: CreatorAnalytics | null;
  error: string | null;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { data: null, error: "Unauthorized" };
  return getCreatorAnalyticsAction(session.user.id);
}

// ══════════════════════════════════════════════════════════════════════════════
// Analytics V2 — creator-facing only; Brands/Discover still use V1 above
// ══════════════════════════════════════════════════════════════════════════════

import type {
  CreatorAnalyticsV2,
  PlatformAnalyticsSlice,
  RecentPostV2,
  RawSocialPost,
  RawPlatformStats,
  RawPlatformToken,
} from "@/lib/analytics-v2";
import {
  getSourceBadgeInfo,
  selectPlatformSource,
  filterPostsBySource,
  calcAvgEngagementRate,
  calcEngagementSampleSize,
  calcAvgViews,
  calcAvgLikes,
  calcAvgComments,
  calcPostEngagementRate,
  extractInstagramInsightsV2,
  extractTikTokLifetimeLikes,
  extractTikTokVideoCount,
  extractYouTubeTotalViews,
  extractYouTubeVideoCount,
  maxPostFetchedAt,
  PLATFORM_DISPLAY_NAMES,
} from "@/lib/analytics-v2";

/** Platforms queried for V2. Threads is intentionally excluded. */
const V2_QUERY_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook_page",
] as const;

/** Platforms that can have a navigable tab (never Facebook, never Threads). */
const V2_TAB_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;

/** Per-platform post limits. */
const V2_POST_LIMITS: Record<string, number> = {
  instagram: 10,
  tiktok: 10,
  youtube: 6,
  facebook_page: 0, // Facebook has no posts in V2
};

// ─── Slice builder ────────────────────────────────────────────────────────────

function buildPlatformSlice(
  platform: string,
  allStats: RawPlatformStats[],
  allTokens: RawPlatformToken[],
  allPosts: RawSocialPost[],
): PlatformAnalyticsSlice | null {
  const stats = allStats.find(
    (s) => s.platform.toLowerCase() === platform,
  ) ?? null;

  // PlatformToken is the ONLY source of "connected" truth.
  const connected = allTokens.some(
    (t) => t.platform.toLowerCase() === platform,
  );

  // All posts for this platform (before source filtering)
  const platformPostsAll = allPosts.filter(
    (p) => p.platform.toLowerCase() === platform,
  );

  // Unique post sources available for this platform
  const availablePostSources = [
    ...new Set(platformPostsAll.map((p) => p.dataSource)),
  ];

  // Determine selected source — based on stats.dataSource if stats exist
  const selectedSource = selectPlatformSource(
    stats?.dataSource ?? null,
    availablePostSources,
  );

  // Facebook: only include when OFFICIAL_API stats with followerCount exist
  if (platform === "facebook_page") {
    if (
      !stats ||
      stats.dataSource !== "OFFICIAL_API" ||
      stats.followerCount === null
    ) {
      return null;
    }
  }

  // For non-Facebook: include slice if there's any data
  if (platform !== "facebook_page" && !stats && platformPostsAll.length === 0 && !connected) {
    return null;
  }

  // Badge — only when selectedSource is known
  const sourceBadge = selectedSource
    ? getSourceBadgeInfo(selectedSource, connected)
    : null;

  // Posts filtered to selected source only
  // CRITICAL: Lower-authority posts are NEVER mixed with higher-authority stats
  const selectedPosts: RawSocialPost[] =
    selectedSource && platform !== "facebook_page"
      ? filterPostsBySource(allPosts, platform, selectedSource)
      : [];

  // Limit to most recent N posts (already sorted by postedAt desc nulls last from DB)
  const postLimit = V2_POST_LIMITS[platform] ?? 10;
  const recentRawPosts = selectedPosts.slice(0, postLimit);

  // Account metrics (from selected PlatformStats only)
  const followers = stats?.followerCount ?? null;
  const following = stats?.followingCount ?? null;

  // TikTok: postCount with raw.video_count fallback
  let postCount: number | null = stats?.postCount ?? null;
  if (postCount === null && platform === "tiktok" && stats) {
    postCount = extractTikTokVideoCount(stats.raw);
  }
  // YouTube: postCount with raw.video_count fallback
  if (postCount === null && platform === "youtube" && stats) {
    postCount = extractYouTubeVideoCount(stats.raw);
  }

  // Content metrics (from selected-source posts only)
  const avgEngagementRate =
    platform !== "facebook_page"
      ? calcAvgEngagementRate(recentRawPosts, followers)
      : null;
  const engagementSampleSize =
    platform !== "facebook_page"
      ? calcEngagementSampleSize(recentRawPosts, followers)
      : null;
  const avgViews =
    platform !== "facebook_page" ? calcAvgViews(recentRawPosts) : null;
  const avgLikes =
    platform !== "facebook_page" ? calcAvgLikes(recentRawPosts) : null;
  const avgComments =
    platform !== "facebook_page" ? calcAvgComments(recentRawPosts) : null;

  // Freshness — NEVER from CreatorProfile.lastSyncedAt
  const statsUpdatedAt = stats ? stats.fetchedAt.toISOString() : null;
  const postsUpdatedAt = maxPostFetchedAt(selectedPosts);

  // Platform-specific extras
  const lifetimeLikes =
    platform === "tiktok" && stats
      ? extractTikTokLifetimeLikes(stats.raw)
      : null;

  const instagramInsights =
    platform === "instagram" && stats && selectedSource
      ? extractInstagramInsightsV2(stats.raw, selectedSource)
      : null;

  const channelLifetimeViews =
    platform === "youtube" && stats
      ? extractYouTubeTotalViews(stats.raw)
      : null;

  // Build RecentPostV2 list with per-post ER
  const recentPosts: RecentPostV2[] = recentRawPosts.map((p) => ({
    id: p.id,
    platform: p.platform,
    caption: p.caption,
    imageUrl: p.imageUrl,
    postUrl: p.postUrl,
    postedAt: p.postedAt ? p.postedAt.toISOString() : null,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    engagementRate: calcPostEngagementRate(
      p.likes,
      p.comments,
      followers,
      p.postedAt,
    ),
    dataSource: p.dataSource,
    sourceBadge: getSourceBadgeInfo(p.dataSource, connected),
  }));

  // Tab visibility
  let showAsTab: boolean;
  if (platform === "facebook_page") {
    showAsTab = false; // Facebook never has a tab
  } else if (platform === "youtube") {
    // Only when meaningful official stats OR posts exist
    const hasMeaningfulOfficialStats =
      selectedSource === "OFFICIAL_API" &&
      (followers !== null ||
        postCount !== null ||
        channelLifetimeViews !== null);
    showAsTab = selectedPosts.length > 0 || hasMeaningfulOfficialStats;
  } else {
    // Instagram, TikTok: show when any usable data exists
    showAsTab = connected || stats !== null || selectedPosts.length > 0;
  }

  return {
    platform,
    displayName: PLATFORM_DISPLAY_NAMES[platform] ?? platform,
    connected,
    statsSource: selectedSource,
    sourceBadge,
    followers,
    following,
    postCount,
    avgEngagementRate,
    avgViews,
    avgLikes,
    avgComments,
    syncedPostCount: selectedPosts.length,
    engagementSampleSize,
    statsUpdatedAt,
    postsUpdatedAt,
    lifetimeLikes,
    instagramInsights,
    channelLifetimeViews,
    recentPosts,
    showAsTab,
  };
}

// ─── Overview builder ─────────────────────────────────────────────────────────

function buildV2Overview(
  slices: PlatformAnalyticsSlice[],
  tokens: RawPlatformToken[],
): CreatorAnalyticsV2["overview"] {
  // Total followers = SUM of non-null followerCount from selected stats
  // do NOT add CreatorProfile.followerCount / totalFollowers
  const followerSlices = slices.filter((s) => s.followers !== null);
  const totalFollowers: number | null =
    followerSlices.length > 0
      ? followerSlices.reduce((sum, s) => sum + (s.followers as number), 0)
      : null;

  // Platforms with data = slices with at least followers or posts
  const platformsWithData = slices.filter(
    (s) => s.followers !== null || s.syncedPostCount > 0,
  ).length;

  // Connected accounts = PlatformToken-backed VISIBLE platform connections only
  const connectedAccounts = tokens.filter((t) =>
    (V2_TAB_PLATFORMS as readonly string[]).includes(t.platform.toLowerCase()),
  ).length;

  return { totalFollowers, platformsWithData, connectedAccounts };
}

// ─── Cross-platform content builder ──────────────────────────────────────────

function buildCrossPlatformContent(
  slices: PlatformAnalyticsSlice[],
): RecentPostV2[] {
  // Collect selected-source posts from all tab-eligible platforms (not Facebook)
  const allPosts: RecentPostV2[] = slices
    .filter((s) => s.platform !== "facebook_page" && s.recentPosts.length > 0)
    .flatMap((s) => s.recentPosts);

  // Sort by postedAt descending; null postedAt goes after dated posts
  allPosts.sort((a, b) => {
    if (a.postedAt === null && b.postedAt === null) return 0;
    if (a.postedAt === null) return 1;
    if (b.postedAt === null) return -1;
    return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
  });

  return allPosts.slice(0, 15);
}

// ─── V2 Action ────────────────────────────────────────────────────────────────

/**
 * getCreatorAnalyticsV2Action
 *
 * Creator-facing Analytics V2. Returns ONE payload covering all platforms.
 * No per-tab server requests.
 *
 * V1 (getCreatorAnalyticsAction / getMyAnalyticsAction) is UNCHANGED and
 * continues to serve Brands / Discover.
 */
export async function getCreatorAnalyticsV2Action(): Promise<{
  data: CreatorAnalyticsV2 | null;
  error: string | null;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { data: null, error: "Unauthorized" };

  try {
    const userWithData = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        platformTokens: {
          select: { platform: true, scopes: true },
        },
        platformStats: {
          select: {
            platform: true,
            followerCount: true,
            followingCount: true,
            postCount: true,
            engagementRate: true,
            fetchedAt: true,
            raw: true,
            dataSource: true,
          },
        },
        creatorProfile: {
          select: {
            id: true,
            socialPosts: {
              where: {
                platform: { in: [...V2_QUERY_PLATFORMS] },
              },
              orderBy: [
                // Dated posts first (newest first); null postedAt pushed to end
                { postedAt: { sort: "desc", nulls: "last" } },
              ],
              take: 100,
              select: {
                id: true,
                platform: true,
                postUrl: true,
                imageUrl: true,
                caption: true,
                likes: true,
                comments: true,
                views: true,
                postedAt: true,
                fetchedAt: true,
                dataSource: true,
              },
            },
          },
        },
      },
    });

    // A creator may have tokens/stats but no creatorProfile yet (rare edge case)
    const tokens: RawPlatformToken[] = userWithData?.platformTokens ?? [];
    const stats: RawPlatformStats[] = (userWithData?.platformStats ?? []).map(
      (s) => ({ ...s, raw: s.raw as unknown }),
    );
    const rawPosts: RawSocialPost[] = (
      userWithData?.creatorProfile?.socialPosts ?? []
    ).map((p) => ({ ...p, dataSource: p.dataSource }));

    // Build one slice per visible platform (Threads intentionally excluded)
    const slices: PlatformAnalyticsSlice[] = [];
    for (const platform of V2_QUERY_PLATFORMS) {
      const slice = buildPlatformSlice(platform, stats, tokens, rawPosts);
      if (slice !== null) slices.push(slice);
    }

    const overview = buildV2Overview(slices, tokens);
    const crossPlatformRecentContent = buildCrossPlatformContent(slices);

    return {
      data: { overview, slices, crossPlatformRecentContent },
      error: null,
    };
  } catch (err) {
    console.error("getCreatorAnalyticsV2Action error:", err);
    return { data: null, error: "Failed to load analytics" };
  }
}
