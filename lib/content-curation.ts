/**
 * lib/content-curation.ts
 *
 * Server-only shared logic for Content Curation V1.
 * Pure helpers — no session/auth/db here.
 *
 * Responsibilities:
 *   - Portfolio selector (featured-only or recent visible fallback)
 *   - Featured order normalization
 *   - Source authority for deduplication
 *   - Shared invariant constants
 */

// ── Constants ──────────────────────────────────────────────────────────────────

export const MAX_FEATURED = 6;

/**
 * Source authority for deduplication when multiple SocialPost rows share the
 * same (platform, providerPostId). Higher = preferred.
 */
export const SOURCE_AUTHORITY: Record<string, number> = {
  OFFICIAL_API: 3,
  RAPIDAPI: 2,
  APIFY: 1,
  MANUAL_IMPORT: 0,
  LEGACY_UNKNOWN: 0,
};

// ── Input shapes ───────────────────────────────────────────────────────────────

export interface RawSocialPost {
  id: string;
  platform: string;
  providerPostId: string | null;
  postUrl: string | null;
  imageUrl: string | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  postedAt: Date | null;
  fetchedAt: Date;
  dataSource: string;
}

export interface RawCurationRow {
  id: string;
  platform: string;
  providerPostId: string;
  isHidden: boolean;
  isFeatured: boolean;
  featuredOrder: number | null;
}

// ── Output shape ───────────────────────────────────────────────────────────────

export interface PortfolioPost {
  id: string;
  platform: string;
  providerPostId: string | null;
  postUrl: string | null;
  imageUrl: string | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  postedAt: string | null;
  dataSource: string;
  isFeatured: boolean;
  featuredOrder: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Deduplicate SocialPost rows that share the same (platform, providerPostId).
 * Rows without providerPostId are always kept independently.
 * Among duplicates, prefer the highest source authority; ties keep first seen.
 */
export function deduplicatePosts(posts: RawSocialPost[]): RawSocialPost[] {
  const keyed = new Map<string, RawSocialPost>();
  const noId: RawSocialPost[] = [];

  for (const post of posts) {
    if (!post.providerPostId) {
      noId.push(post);
      continue;
    }
    const key = `${post.platform}::${post.providerPostId}`;
    const existing = keyed.get(key);
    if (!existing) {
      keyed.set(key, post);
    } else {
      const existAuth = SOURCE_AUTHORITY[existing.dataSource] ?? 0;
      const newAuth = SOURCE_AUTHORITY[post.dataSource] ?? 0;
      if (newAuth > existAuth) keyed.set(key, post);
      // ties → keep first (stable deterministic)
    }
  }

  return [...keyed.values(), ...noId];
}

/**
 * Build the curated public portfolio.
 *
 * Rules (from spec §6):
 * 1. Hidden posts are excluded.
 * 2. Join curation by (platform, providerPostId).
 * 3. If ≥1 currently-existing Featured post → return only Featured, ordered by
 *    featuredOrder asc, max 6.
 * 4. If 0 currently-existing Featured posts → return up to 6 most recent
 *    non-hidden posts ordered by postedAt DESC (null last).
 * 5. Platforms mix freely.
 * 6. Curation rows whose SocialPost is absent are ignored (selector skips them).
 */
export function buildPortfolio(
  posts: RawSocialPost[],
  curationRows: RawCurationRow[],
): PortfolioPost[] {
  const deduped = deduplicatePosts(posts);

  // Build curation lookup: "platform::providerPostId" → curation row
  const curationByKey = new Map<string, RawCurationRow>();
  for (const row of curationRows) {
    curationByKey.set(`${row.platform}::${row.providerPostId}`, row);
  }

  // Determine hidden/visible status for each post
  function isPostHidden(post: RawSocialPost): boolean {
    if (!post.providerPostId) return false; // no curation = visible
    const row = curationByKey.get(`${post.platform}::${post.providerPostId}`);
    if (!row) return false; // no row = visible
    return row.isHidden; // Hidden wins even if isFeatured is set (reader invariant)
  }

  function isPostFeatured(post: RawSocialPost): boolean {
    if (!post.providerPostId) return false;
    const row = curationByKey.get(`${post.platform}::${post.providerPostId}`);
    if (!row) return false;
    return row.isFeatured && !row.isHidden;
  }

  // Collect currently-existing featured posts
  const featuredPosts = deduped
    .filter(isPostFeatured)
    .sort((a, b) => {
      const rowA = curationByKey.get(`${a.platform}::${a.providerPostId}`);
      const rowB = curationByKey.get(`${b.platform}::${b.providerPostId}`);
      const orderA = rowA?.featuredOrder ?? Infinity;
      const orderB = rowB?.featuredOrder ?? Infinity;
      return orderA - orderB;
    })
    .slice(0, MAX_FEATURED);

  if (featuredPosts.length > 0) {
    return featuredPosts.map((post) => {
      const row = curationByKey.get(`${post.platform}::${post.providerPostId}`);
      return toPortfolioPost(post, { isFeatured: true, featuredOrder: row?.featuredOrder ?? null });
    });
  }

  // Recent visible fallback
  const visiblePosts = deduped
    .filter((p) => !isPostHidden(p))
    .sort((a, b) => {
      const tA = a.postedAt?.getTime() ?? -Infinity;
      const tB = b.postedAt?.getTime() ?? -Infinity;
      return tB - tA; // descending; null postedAt floats to bottom
    })
    .slice(0, MAX_FEATURED);

  return visiblePosts.map((post) =>
    toPortfolioPost(post, { isFeatured: false, featuredOrder: null }),
  );
}

function toPortfolioPost(
  post: RawSocialPost,
  curation: { isFeatured: boolean; featuredOrder: number | null },
): PortfolioPost {
  return {
    id: post.id,
    platform: post.platform,
    providerPostId: post.providerPostId,
    postUrl: post.postUrl,
    imageUrl: post.imageUrl,
    caption: post.caption,
    likes: post.likes,
    comments: post.comments,
    views: post.views,
    postedAt: post.postedAt?.toISOString() ?? null,
    dataSource: post.dataSource,
    isFeatured: curation.isFeatured,
    featuredOrder: curation.featuredOrder,
  };
}

/**
 * Normalize featured order to contiguous 0..n-1 integers.
 * Input: array of curation rows that are currently featured.
 * Returns: mapping of { id, featuredOrder } to write back.
 */
export function normalizeFeaturedOrder(
  featuredRows: { id: string; featuredOrder: number | null }[],
): { id: string; featuredOrder: number }[] {
  const sorted = [...featuredRows].sort(
    (a, b) => (a.featuredOrder ?? Infinity) - (b.featuredOrder ?? Infinity),
  );
  return sorted.map((row, idx) => ({ id: row.id, featuredOrder: idx }));
}

/**
 * Get the next available featuredOrder for a new featured item.
 * Pass the current featured curation rows for this creator.
 */
export function nextFeaturedOrder(
  currentFeaturedRows: { featuredOrder: number | null }[],
): number {
  if (currentFeaturedRows.length === 0) return 0;
  const max = currentFeaturedRows.reduce(
    (m, r) => Math.max(m, r.featuredOrder ?? -1),
    -1,
  );
  return max + 1;
}
