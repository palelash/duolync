/**
 * lib/analytics-v2.ts
 *
 * Pure, testable Analytics V2 calculator.
 *
 * This module MUST NOT:
 *   - read session
 *   - query Prisma directly
 *   - mutate the database
 *   - know about React
 *
 * All functions are pure and side-effect-free.
 * Authority: OFFICIAL_API > RAPIDAPI > APIFY > MANUAL_IMPORT / LEGACY_UNKNOWN
 */

import type { DataSource } from "@/lib/generated/prisma";

// ─── Source authority ─────────────────────────────────────────────────────────

const SOURCE_AUTHORITY_MAP: Record<DataSource, number> = {
  OFFICIAL_API: 3,
  RAPIDAPI: 2,
  APIFY: 1,
  MANUAL_IMPORT: 0,
  LEGACY_UNKNOWN: 0,
};

export function sourceAuthority(source: DataSource): number {
  return SOURCE_AUTHORITY_MAP[source];
}

// ─── Source badge ─────────────────────────────────────────────────────────────

/**
 * Client-safe source display label.
 * Internal enum names are NEVER exposed to the UI.
 * Extensible: new sources (e.g. TIKTOK_ONE) can be added without breaking callers.
 */
export type SourceBadgeType =
  | "official_connected"    // OFFICIAL_API + PlatformToken present
  | "official_historical"   // OFFICIAL_API + no PlatformToken
  | "public_data"           // RAPIDAPI or APIFY
  | "imported_data"         // MANUAL_IMPORT
  | "unverified";           // LEGACY_UNKNOWN

export interface SourceBadgeInfo {
  type: SourceBadgeType;
  label: string;
}

/**
 * Derives the client-safe source badge from the data source and connection state.
 *
 * Rules:
 *   OFFICIAL_API + token present  → "Official API"
 *   OFFICIAL_API + no token       → "Historical official data"
 *   RAPIDAPI | APIFY              → "Public data"
 *   MANUAL_IMPORT                 → "Imported data"
 *   LEGACY_UNKNOWN                → "Unverified"
 */
export function getSourceBadgeInfo(
  dataSource: DataSource,
  isConnected: boolean,
): SourceBadgeInfo {
  switch (dataSource) {
    case "OFFICIAL_API":
      return isConnected
        ? { type: "official_connected", label: "Official API" }
        : { type: "official_historical", label: "Historical official data" };
    case "RAPIDAPI":
    case "APIFY":
      return { type: "public_data", label: "Public data" };
    case "MANUAL_IMPORT":
      return { type: "imported_data", label: "Imported data" };
    case "LEGACY_UNKNOWN":
    default:
      return { type: "unverified", label: "Unverified" };
  }
}

// ─── Platform display names ───────────────────────────────────────────────────

export const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook_page: "Facebook",
  facebook: "Facebook",
};

// ─── Input types (action → lib boundary) ─────────────────────────────────────

export interface RawSocialPost {
  id: string;
  platform: string;
  postUrl: string | null;
  imageUrl: string | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  postedAt: Date | null;
  fetchedAt: Date;
  dataSource: DataSource;
}

export interface RawPlatformStats {
  platform: string;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  engagementRate: number | null;
  fetchedAt: Date;
  raw: unknown;
  dataSource: DataSource;
}

export interface RawPlatformToken {
  platform: string;
  scopes: string | null;
}

// ─── V2 payload types ─────────────────────────────────────────────────────────

export interface InstagramInsightsV2 {
  available: boolean;
  reach: number | null;
  views: number | null;
  profileViews: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
  /** ISO 8601 from raw.insights.account.fetchedAt */
  fetchedAt: string | null;
}

export interface RecentPostV2 {
  id: string;
  platform: string;
  caption: string | null;
  imageUrl: string | null;
  postUrl: string | null;
  /** ISO 8601 or null */
  postedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** Per-post engagement if eligible; null otherwise */
  engagementRate: number | null;
  dataSource: DataSource;
  sourceBadge: SourceBadgeInfo;
}

export interface PlatformAnalyticsSlice {
  /** Lowercase: 'instagram' | 'tiktok' | 'youtube' | 'facebook_page' */
  platform: string;
  displayName: string;
  /** true only when a PlatformToken exists — SOLE source of connection truth */
  connected: boolean;
  statsSource: DataSource | null;
  sourceBadge: SourceBadgeInfo | null;

  // Account metrics (from selected PlatformStats)
  followers: number | null;
  following: number | null;
  postCount: number | null;

  // Content metrics (from selected-source posts only)
  /** null = unavailable; 0 = real zero */
  avgEngagementRate: number | null;
  avgViews: number | null;
  avgLikes: number | null;
  avgComments: number | null;

  syncedPostCount: number;

  // Freshness — NEVER from CreatorProfile.lastSyncedAt
  statsUpdatedAt: string | null;
  postsUpdatedAt: string | null;

  // Platform-specific extras
  lifetimeLikes: number | null;
  instagramInsights: InstagramInsightsV2 | null;
  channelLifetimeViews: number | null;

  recentPosts: RecentPostV2[];
  /** Whether this slice should appear as a navigable tab */
  showAsTab: boolean;
}

export interface CreatorAnalyticsV2Overview {
  /** SUM of non-null followerCount from selected stats. null if none. */
  totalFollowers: number | null;
  /** Count of slices with at least one usable metric */
  platformsWithData: number;
  /** Count of PlatformToken-backed visible platforms (instagram/tiktok/youtube) */
  connectedAccounts: number;
}

export interface CreatorAnalyticsV2 {
  overview: CreatorAnalyticsV2Overview;
  slices: PlatformAnalyticsSlice[];
  crossPlatformRecentContent: RecentPostV2[];
}

// ─── Source selection ─────────────────────────────────────────────────────────

/**
 * Determines the selected source for a platform.
 *
 * If PlatformStats row exists: use its dataSource (always authoritative).
 * If no stats but posts exist: use highest-authority post source.
 * Otherwise: null (no data available).
 *
 * Source selection is PER PLATFORM. Never mixes sources.
 */
export function selectPlatformSource(
  statsSource: DataSource | null,
  availablePostSources: DataSource[],
): DataSource | null {
  if (statsSource !== null) return statsSource;
  if (availablePostSources.length === 0) return null;
  return availablePostSources.reduce<DataSource>(
    (best, src) =>
      sourceAuthority(src) > sourceAuthority(best) ? src : best,
    availablePostSources[0],
  );
}

/**
 * Filters posts to those matching the platform AND selected source.
 *
 * CRITICAL: Lower-authority posts MUST NOT be used with higher-authority stats.
 * If selectedSource is OFFICIAL_API and no OFFICIAL_API posts exist,
 * the result is an empty array — do NOT fall back to lower-source posts.
 */
export function filterPostsBySource(
  posts: RawSocialPost[],
  platform: string,
  selectedSource: DataSource,
): RawSocialPost[] {
  const pl = platform.toLowerCase();
  return posts.filter(
    (p) =>
      p.platform.toLowerCase() === pl && p.dataSource === selectedSource,
  );
}

// ─── Engagement rate ──────────────────────────────────────────────────────────

/**
 * Per-post engagement rate: (likes + comments) / followerCount * 100
 *
 * Eligibility requirements (all must hold):
 *   - likes !== null
 *   - comments !== null  (real 0 is valid)
 *   - followerCount > 0
 *   - postedAt !== null
 *
 * Returns null when any required field is missing.
 * NEVER converts null to 0.
 */
export function calcPostEngagementRate(
  likes: number | null,
  comments: number | null,
  followerCount: number | null,
  postedAt: Date | null,
): number | null {
  if (
    likes === null ||
    comments === null ||
    followerCount === null ||
    followerCount <= 0 ||
    postedAt === null
  )
    return null;
  return parseFloat((((likes + comments) / followerCount) * 100).toFixed(2));
}

/**
 * Arithmetic mean engagement rate over up to 10 eligible posts.
 *
 * Same eligibility rules as calcPostEngagementRate.
 * Returns null when no eligible posts exist.
 * NEVER returns 0 for "no data".
 */
export function calcAvgEngagementRate(
  posts: RawSocialPost[],
  followerCount: number | null,
): number | null {
  if (followerCount === null || followerCount <= 0) return null;

  const eligible = posts
    .filter(
      (p) =>
        p.likes !== null &&
        p.comments !== null &&
        p.postedAt !== null,
    )
    .slice(0, 10);

  if (eligible.length === 0) return null;

  const total = eligible.reduce(
    (sum, p) =>
      sum +
      (((p.likes as number) + (p.comments as number)) / followerCount) * 100,
    0,
  );
  return parseFloat((total / eligible.length).toFixed(2));
}

// ─── Content averages ─────────────────────────────────────────────────────────

/**
 * Mean views from posts where views !== null.
 * 0 is a real value and is included.
 * Returns null when no posts have view data.
 */
export function calcAvgViews(posts: RawSocialPost[]): number | null {
  const withViews = posts.filter((p) => p.views !== null);
  if (withViews.length === 0) return null;
  return Math.round(
    withViews.reduce((s, p) => s + (p.views as number), 0) / withViews.length,
  );
}

/**
 * Mean likes from posts where likes !== null.
 * Returns null when none have likes data.
 */
export function calcAvgLikes(posts: RawSocialPost[]): number | null {
  const withLikes = posts.filter((p) => p.likes !== null);
  if (withLikes.length === 0) return null;
  return Math.round(
    withLikes.reduce((s, p) => s + (p.likes as number), 0) / withLikes.length,
  );
}

/**
 * Mean comments from posts where comments !== null.
 * Returns null when none have comment data.
 */
export function calcAvgComments(posts: RawSocialPost[]): number | null {
  const withComments = posts.filter((p) => p.comments !== null);
  if (withComments.length === 0) return null;
  return Math.round(
    withComments.reduce((s, p) => s + (p.comments as number), 0) /
      withComments.length,
  );
}

// ─── Platform-specific extractors ────────────────────────────────────────────

/**
 * Extracts Instagram 28-day insights from PlatformStats.raw.
 *
 * Only available when:
 *   - selectedSource === OFFICIAL_API
 *   - raw.insights.account snapshot exists
 *
 * Does NOT require a live PlatformToken.
 * A stored snapshot remains valid after the token expires.
 * Public Instagram (non-official source) never gets the 28-day block.
 */
export function extractInstagramInsightsV2(
  raw: unknown,
  selectedSource: DataSource,
): InstagramInsightsV2 | null {
  if (selectedSource !== "OFFICIAL_API") return null;

  const rawObj =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;
  if (!rawObj) return null;

  const insightsObj =
    typeof rawObj["insights"] === "object" && rawObj["insights"] !== null
      ? (rawObj["insights"] as Record<string, unknown>)
      : null;
  if (!insightsObj) return null;

  const accountObj =
    typeof insightsObj["account"] === "object" &&
    insightsObj["account"] !== null
      ? (insightsObj["account"] as Record<string, unknown>)
      : null;
  if (!accountObj) return null;

  const safeNum = (v: unknown): number | null =>
    typeof v === "number" ? v : null;

  return {
    available: true,
    reach: safeNum(accountObj["reach"]),
    views: safeNum(accountObj["views"]),
    profileViews: safeNum(accountObj["profileViews"]),
    accountsEngaged: safeNum(accountObj["accountsEngaged"]),
    totalInteractions: safeNum(accountObj["totalInteractions"]),
    fetchedAt:
      typeof accountObj["fetchedAt"] === "string"
        ? accountObj["fetchedAt"]
        : null,
  };
}

/**
 * Extracts TikTok lifetime likes from PlatformStats.raw.likes_count.
 */
export function extractTikTokLifetimeLikes(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return typeof r["likes_count"] === "number" ? r["likes_count"] : null;
}

/**
 * Extracts TikTok video_count from PlatformStats.raw (fallback for postCount).
 */
export function extractTikTokVideoCount(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return typeof r["video_count"] === "number" ? r["video_count"] : null;
}

/**
 * Extracts YouTube channel lifetime views from PlatformStats.raw.total_views.
 */
export function extractYouTubeTotalViews(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return typeof r["total_views"] === "number" ? r["total_views"] : null;
}

/**
 * Extracts YouTube video count from PlatformStats.raw.video_count (fallback).
 */
export function extractYouTubeVideoCount(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return typeof r["video_count"] === "number" ? r["video_count"] : null;
}

// ─── Freshness ────────────────────────────────────────────────────────────────

/**
 * Returns the newest SocialPost.fetchedAt from a set of posts as ISO string.
 * Returns null when the array is empty.
 */
export function maxPostFetchedAt(posts: RawSocialPost[]): string | null {
  if (posts.length === 0) return null;
  const max = posts.reduce<Date | null>((best, p) => {
    if (!best || p.fetchedAt > best) return p.fetchedAt;
    return best;
  }, null);
  return max ? max.toISOString() : null;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

/**
 * Formats a metric value for display.
 * STRICT null vs 0 semantics:
 *   null → "—"  (unavailable — NEVER shown as "0")
 *   0    → "0"  (real zero)
 *   ≥1K  → "X.XK"
 *   ≥1M  → "X.XM"
 */
export function fmtMetric(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

/**
 * Formats a percentage.
 * null → "—"  (unavailable engagement rate)
 * 0   → "0.0%" (real zero engagement)
 */
export function fmtPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

/**
 * Formats an ISO date string for human-readable display.
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
