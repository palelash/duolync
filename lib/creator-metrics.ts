/**
 * lib/creator-metrics.ts
 *
 * Shared normalized creator metrics helper.
 * PURE function — no database access, no side effects.
 *
 * Source-of-truth architecture:
 *   PlatformStats   = canonical per-platform storage
 *   CreatorProfile  = derived follower cache + imported/legacy fallback
 *   SocialPosts     = sole source of truth for engagement rate
 *
 * Key rules:
 *   - totalFollowers: SUM(non-null PlatformStats.followerCount) when possible
 *   - averageEngagementRate: post-based, per-platform denominator, null when unknown
 *   - avgViewsPerPost: mean(SocialPost.views), null when no view data
 *   - platforms[]: only real PlatformStats rows — zero synthetic splits
 *   - isImportedAggregate: no PlatformStats AND profileOrigin === IMPORTED
 */

import type { DataSource, ProfileOrigin } from "@/lib/generated/prisma";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PlatformMetric {
  platform: string;
  /** Raw follower count for this platform. null when the API does not expose it (e.g. Threads). */
  followers: number | null;
  /**
   * Per-platform engagement rate in percentage units (0–100).
   * Computed from this platform's own recent SocialPosts using THIS platform's
   * followerCount as the denominator (never the creator-wide total).
   * null when no eligible posts exist or followerCount is unavailable / zero.
   */
  engagementRate: number | null;
  dataSource: DataSource;
  fetchedAt: Date;
  /**
   * True only when a PlatformToken exists for this (userId, platform).
   * PlatformToken is the sole source of "Connected" status — Apify / RapidAPI
   * stats do NOT constitute a connection.
   */
  isOAuthConnected: boolean;
}

export interface NormalizedCreatorMetrics {
  // ── Aggregate ─────────────────────────────────────────────────────────────
  /**
   * Total followers across known platforms.
   * null when absolutely no follower data is available.
   * A genuine 0 follower count is preserved as 0, NEVER converted to null.
   */
  totalFollowers: number | null;
  /**
   * Creator-level average engagement rate in percentage units (0–100).
   * Derived from recent SocialPosts; each post uses its own platform's
   * followerCount as the denominator.
   * null when no eligible posts exist. NEVER fake 0.
   */
  averageEngagementRate: number | null;
  /**
   * Mean of SocialPost.views for recent posts.
   * null when no posts carry view data.
   * NEVER substitutes followerCount.
   */
  avgViewsPerPost: number | null;

  // ── Per-platform ──────────────────────────────────────────────────────────
  /**
   * One entry per PlatformStats row.
   * Empty array when no PlatformStats exist.
   * Contains ONLY real PlatformStats-backed data — no 65/25/10 distributions,
   * no heuristic primaryPlatform allocations, no socialLinks-derived estimates.
   */
  platforms: PlatformMetric[];

  // ── Timestamps ────────────────────────────────────────────────────────────
  /** MAX(PlatformStats.fetchedAt). null when no PlatformStats exist. */
  lastUpdatedAt: Date | null;

  // ── Source flags (for UI labeling) ────────────────────────────────────────
  /** True when any PlatformStats row has dataSource === OFFICIAL_API. */
  hasOfficialData: boolean;
  /** True when any PlatformStats row has dataSource === APIFY or RAPIDAPI. */
  hasPublicData: boolean;
  /**
   * True when NO real PlatformStats exist AND the creator was imported
   * (profileOrigin === IMPORTED).
   * A registered creator with no stats yet is NOT an imported aggregate.
   */
  isImportedAggregate: boolean;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface MetricsPlatformStat {
  platform: string;
  followerCount: number | null;
  dataSource: DataSource;
  fetchedAt: Date;
}

export interface MetricsSocialPost {
  platform: string;
  likes: number | null;
  comments: number | null;
  views: number | null;
  postedAt?: Date | null;
}

export interface MetricsCreatorProfile {
  followerCount: number | null;
  /** Legacy Int @default(0). May be 0 even when unknown — check before use. */
  totalFollowers: number;
  averageEngagement: number | null;
  /** Legacy Float @default(0). */
  avgEngagementRate: number;
  lastSyncedAt: Date | null;
  lastStatsUpdate: Date | null;
  profileOrigin: ProfileOrigin;
}

export interface GetNormalizedMetricsInput {
  platformStats: MetricsPlatformStat[];
  /**
   * Recent social posts for the creator.
   * Caller should provide the most recent ~10–20; this helper uses up to 10 eligible.
   */
  socialPosts: MetricsSocialPost[];
  creatorProfile: MetricsCreatorProfile;
  /** Platform strings from PlatformToken.platform for this user. OAuth truth only. */
  oauthPlatforms: string[];
}

// ─── Main helper ──────────────────────────────────────────────────────────────

export function getNormalizedCreatorMetrics(
  input: GetNormalizedMetricsInput,
): NormalizedCreatorMetrics {
  const { platformStats, socialPosts, creatorProfile, oauthPlatforms } = input;
  const oauthSet = new Set(oauthPlatforms.map((p) => p.toLowerCase()));

  // ── 1. Total Followers ────────────────────────────────────────────────────
  // §2 corrected rule:
  //   A) If any PlatformStats row has followerCount !== null:
  //      totalFollowers = SUM of those non-null values.
  //      A genuine 0 is preserved as 0 (never converted to null).
  //   B) If PlatformStats exist but ALL are null (e.g. Threads-only creator):
  //      fall back to CreatorProfile.followerCount → then totalFollowers legacy.
  //   C) No PlatformStats:
  //      same fallback chain as B.
  //   This prevents Threads-only PlatformStats from destroying a valid import aggregate.
  const statsWithKnownFollowers = platformStats.filter(
    (s) => s.followerCount !== null,
  );

  let totalFollowers: number | null;
  if (statsWithKnownFollowers.length > 0) {
    // Use the SUM — a real 0 is included as 0
    totalFollowers = statsWithKnownFollowers.reduce(
      (sum, s) => sum + (s.followerCount as number),
      0,
    );
  } else {
    // All PlatformStats have null followerCount, or no PlatformStats at all.
    // Fall back to the cached aggregate. Only use totalFollowers (legacy Int @default(0))
    // when it was explicitly written (> 0) to avoid treating a default 0 as real data.
    totalFollowers =
      creatorProfile.followerCount ??
      (creatorProfile.totalFollowers > 0 ? creatorProfile.totalFollowers : null);
  }

  // ── 2. Per-platform follower map for ER denominator ───────────────────────
  // §3: each post's ER uses ITS OWN platform's followerCount, not the creator total.
  const platformFollowerMap = new Map<string, number>();
  for (const stat of platformStats) {
    if (stat.followerCount !== null && stat.followerCount > 0) {
      platformFollowerMap.set(stat.platform.toLowerCase(), stat.followerCount);
    }
  }

  // ── 3. Average Engagement Rate (post-derived, per-platform denominator) ───
  const eligiblePosts = socialPosts
    .filter(
      (p) =>
        p.likes !== null &&
        platformFollowerMap.has(p.platform.toLowerCase()),
    )
    .slice(0, 10);

  let averageEngagementRate: number | null = null;
  if (eligiblePosts.length > 0) {
    const rates = eligiblePosts.map((p) => {
      const denom = platformFollowerMap.get(p.platform.toLowerCase())!;
      return (((p.likes as number) + (p.comments ?? 0)) / denom) * 100;
    });
    averageEngagementRate = parseFloat(
      (rates.reduce((s, r) => s + r, 0) / rates.length).toFixed(2),
    );
  }
  // null means genuinely unknown — never fake 0.

  // ── 4. Average Views Per Post ─────────────────────────────────────────────
  const postsWithViews = socialPosts.filter((p) => p.views !== null);
  const avgViewsPerPost =
    postsWithViews.length > 0
      ? Math.round(
          postsWithViews.reduce((s, p) => s + (p.views as number), 0) /
            postsWithViews.length,
        )
      : null;
  // null when no posts carry view data — never substitutes followerCount.

  // ── 5. Per-platform metrics ───────────────────────────────────────────────
  const platforms: PlatformMetric[] = platformStats.map((stat) => {
    const platformKey = stat.platform.toLowerCase();

    // §4: per-platform ER from this platform's own posts
    const platformPosts = socialPosts.filter(
      (p) => p.platform.toLowerCase() === platformKey && p.likes !== null,
    );

    let platformER: number | null = null;
    if (
      platformPosts.length > 0 &&
      stat.followerCount !== null &&
      stat.followerCount > 0
    ) {
      const rates = platformPosts.slice(0, 10).map(
        (p) =>
          (((p.likes as number) + (p.comments ?? 0)) / stat.followerCount!) *
          100,
      );
      platformER = parseFloat(
        (rates.reduce((s, r) => s + r, 0) / rates.length).toFixed(2),
      );
    }
    // null when no eligible posts or followerCount unavailable — never fake 0.

    return {
      platform: stat.platform,
      followers: stat.followerCount,
      engagementRate: platformER,
      dataSource: stat.dataSource,
      fetchedAt: stat.fetchedAt,
      isOAuthConnected: oauthSet.has(platformKey),
    };
  });

  // ── 6. lastUpdatedAt ──────────────────────────────────────────────────────
  let lastUpdatedAt: Date | null = null;
  for (const stat of platformStats) {
    if (!lastUpdatedAt || stat.fetchedAt > lastUpdatedAt) {
      lastUpdatedAt = stat.fetchedAt;
    }
  }

  // ── 7. Source flags ───────────────────────────────────────────────────────
  const hasOfficialData = platformStats.some(
    (s) => s.dataSource === "OFFICIAL_API",
  );
  const hasPublicData = platformStats.some(
    (s) => s.dataSource === "APIFY" || s.dataSource === "RAPIDAPI",
  );

  // ── 8. isImportedAggregate ────────────────────────────────────────────────
  // §9 correction: NOT just "no PlatformStats" — must also be an IMPORTED profile.
  // A registered creator who hasn't connected any platform yet is not "imported".
  const isImportedAggregate =
    platformStats.length === 0 &&
    creatorProfile.profileOrigin === "IMPORTED";

  return {
    totalFollowers,
    averageEngagementRate,
    avgViewsPerPost,
    platforms,
    lastUpdatedAt,
    hasOfficialData,
    hasPublicData,
    isImportedAggregate,
  };
}

// ─── Follower cache computation (for write-path use) ─────────────────────────

/**
 * Computes the canonical CreatorProfile.followerCount cache value from a fresh
 * set of PlatformStats rows.
 *
 * Returns null when:
 *   - No PlatformStats rows exist, OR
 *   - All rows have null followerCount (e.g. Threads-only).
 * This prevents stale data from being replaced with a manufactured 0.
 *
 * Used by OAuth callbacks, Apify, RapidAPI, and removePlatformAction to keep
 * the cached aggregate consistent after every PlatformStats mutation.
 */
export function computeFollowerCache(
  allStats: { followerCount: number | null }[],
): number | null {
  const withFollowers = allStats.filter((s) => s.followerCount !== null);
  if (withFollowers.length === 0) return null;
  return withFollowers.reduce(
    (sum, s) => sum + (s.followerCount as number),
    0,
  );
}
