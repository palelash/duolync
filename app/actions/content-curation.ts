"use server";

/**
 * app/actions/content-curation.ts
 *
 * Server actions for Content Curation V1.
 *
 * Security contract:
 *   - Every action authenticates from session — no client userId/creatorProfileId.
 *   - Creator may mutate only their own content.
 *   - Mutations require a matching SocialPost with non-empty providerPostId.
 *   - Max 6 featured items enforced server-side.
 *   - Reorder validates ownership and current featured status before writing.
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  MAX_FEATURED,
  deduplicatePosts,
  normalizeFeaturedOrder,
  nextFeaturedOrder,
} from "@/lib/content-curation";

// ── Session helper ─────────────────────────────────────────────────────────────

async function requireCreatorSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  const creator = await db.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!creator) throw new Error("Creator profile not found");

  return { userId: session.user.id, creatorProfileId: creator.id };
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContentLibraryItem {
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
  /** true when providerPostId is present and curation mutations are allowed */
  isCuratable: boolean;
  /** Current curation state */
  isHidden: boolean;
  isFeatured: boolean;
  featuredOrder: number | null;
}

export interface FeaturedCount {
  current: number;
  max: number;
}

export interface CreatorContentResult {
  items: ContentLibraryItem[];
  featuredCount: FeaturedCount;
  error: string | null;
}

export type CurationActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

// ── getCreatorContentAction ────────────────────────────────────────────────────

/**
 * Returns the creator's full content library (up to 200 posts) with curation
 * state joined in. Used only by the creator's own Content management page.
 *
 * Do NOT use this for the public portfolio — use buildPortfolio() instead.
 */
export async function getCreatorContentAction(): Promise<CreatorContentResult> {
  try {
    const { creatorProfileId } = await requireCreatorSession();

    // Safety cap 200. postedAt DESC with nulls last, then fetchedAt DESC.
    const posts = await db.socialPost.findMany({
      where: { creatorProfileId },
      orderBy: [
        { postedAt: { sort: "desc", nulls: "last" } },
        { fetchedAt: "desc" },
      ],
      take: 200,
      select: {
        id: true,
        platform: true,
        providerPostId: true,
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
    });

    // Load all curation rows for this creator
    const curations = await db.creatorContentCuration.findMany({
      where: { creatorProfileId },
      select: {
        id: true,
        platform: true,
        providerPostId: true,
        isHidden: true,
        isFeatured: true,
        featuredOrder: true,
      },
    });

    // Build curation index by durable key
    const curationByKey = new Map<string, (typeof curations)[number]>();
    for (const row of curations) {
      curationByKey.set(`${row.platform}::${row.providerPostId}`, row);
    }

    // Same durable-identity dedupe as the public portfolio. Rows without
    // providerPostId stay separate. Authority ties keep the first row, which
    // is the newer fetchedAt because the query is already ordered that way.
    const libraryPosts = deduplicatePosts(posts).sort((a, b) => {
      const tA = a.postedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const tB = b.postedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      if (tA !== tB) return tB - tA;
      return b.fetchedAt.getTime() - a.fetchedAt.getTime();
    });

    const items: ContentLibraryItem[] = libraryPosts.map((post) => {
      const isCuratable = Boolean(post.providerPostId);
      const curation = isCuratable
        ? curationByKey.get(`${post.platform}::${post.providerPostId!}`)
        : undefined;

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
        isCuratable,
        isHidden: curation?.isHidden ?? false,
        isFeatured: curation?.isFeatured ?? false,
        featuredOrder: curation?.featuredOrder ?? null,
      };
    });

    const currentFeatured = items.filter((i) => i.isFeatured).length;

    return {
      items,
      featuredCount: { current: currentFeatured, max: MAX_FEATURED },
      error: null,
    };
  } catch (err) {
    console.error("[getCreatorContentAction]", err);
    return {
      items: [],
      featuredCount: { current: 0, max: MAX_FEATURED },
      error: "Failed to load content library",
    };
  }
}

// ── setContentFeaturedAction ───────────────────────────────────────────────────

/**
 * Feature or unfeature a post.
 *
 * Featuring:
 *   - Enforces max 6 server-side
 *   - Sets isFeatured=true, isHidden=false
 *   - Assigns next featuredOrder
 *
 * Unfeaturing:
 *   - Sets isFeatured=false, featuredOrder=null
 *   - Normalizes remaining order
 */
export async function setContentFeaturedAction(input: {
  platform: string;
  providerPostId: string;
  featured: boolean;
}): Promise<CurationActionResult> {
  const { platform, providerPostId, featured } = input;

  if (!providerPostId?.trim()) {
    return { ok: false, error: "Content cannot be curated without a provider ID.", code: "no_provider_id" };
  }

  try {
    const { creatorProfileId } = await requireCreatorSession();

    const result = await db.$transaction(async (tx) => {
      await lockCreatorProfile(tx, creatorProfileId);

      const post = await tx.socialPost.findFirst({
        where: { creatorProfileId, platform, providerPostId },
        select: { id: true },
      });
      if (!post) {
        return { ok: false as const, error: "Post not found in your library.", code: "post_not_found" };
      }

      if (featured) {
        const featuredRows = await tx.creatorContentCuration.findMany({
          where: { creatorProfileId, isFeatured: true, isHidden: false },
          select: { id: true, platform: true, providerPostId: true, featuredOrder: true },
        });

        const alreadyFeatured = featuredRows.find(
          (r) => r.platform === platform && r.providerPostId === providerPostId,
        );

        if (!alreadyFeatured && featuredRows.length >= MAX_FEATURED) {
          return {
            ok: false as const,
            error: "Feature up to 6 items.",
            code: "featured_limit",
          };
        }

        const order = alreadyFeatured
          ? (alreadyFeatured.featuredOrder ?? nextFeaturedOrder(featuredRows))
          : nextFeaturedOrder(featuredRows);

        await tx.creatorContentCuration.upsert({
          where: {
            creatorProfileId_platform_providerPostId: {
              creatorProfileId,
              platform,
              providerPostId,
            },
          },
          create: {
            creatorProfileId,
            platform,
            providerPostId,
            isFeatured: true,
            isHidden: false,
            featuredOrder: order,
          },
          update: {
            isFeatured: true,
            isHidden: false,
            featuredOrder: order,
          },
        });
      } else {
        await tx.creatorContentCuration.upsert({
          where: {
            creatorProfileId_platform_providerPostId: {
              creatorProfileId,
              platform,
              providerPostId,
            },
          },
          create: {
            creatorProfileId,
            platform,
            providerPostId,
            isFeatured: false,
            isHidden: false,
            featuredOrder: null,
          },
          update: {
            isFeatured: false,
            featuredOrder: null,
          },
        });
      }

      await normalizeFeaturedInTx(tx, creatorProfileId);
      return { ok: true as const };
    });

    if (!result.ok) return result;

    await revalidateContentPaths(creatorProfileId);
    return { ok: true };
  } catch (err) {
    console.error("[setContentFeaturedAction]", err);
    return { ok: false, error: "Failed to update featured status." };
  }
}

// ── setContentHiddenAction ────────────────────────────────────────────────────

/**
 * Hide or show a post on the creator's public profile.
 *
 * Hiding:
 *   - Sets isHidden=true, isFeatured=false, featuredOrder=null
 *   - Normalizes featured order
 *
 * Showing:
 *   - Sets isHidden=false
 *   - Does NOT automatically feature (creator must do so explicitly)
 */
export async function setContentHiddenAction(input: {
  platform: string;
  providerPostId: string;
  hidden: boolean;
}): Promise<CurationActionResult> {
  const { platform, providerPostId, hidden } = input;

  if (!providerPostId?.trim()) {
    return { ok: false, error: "Content cannot be curated without a provider ID.", code: "no_provider_id" };
  }

  try {
    const { creatorProfileId } = await requireCreatorSession();

    const result = await db.$transaction(async (tx) => {
      await lockCreatorProfile(tx, creatorProfileId);

      const post = await tx.socialPost.findFirst({
        where: { creatorProfileId, platform, providerPostId },
        select: { id: true },
      });
      if (!post) {
        return { ok: false as const, error: "Post not found in your library.", code: "post_not_found" };
      }

      if (hidden) {
        await tx.creatorContentCuration.upsert({
          where: {
            creatorProfileId_platform_providerPostId: {
              creatorProfileId,
              platform,
              providerPostId,
            },
          },
          create: {
            creatorProfileId,
            platform,
            providerPostId,
            isHidden: true,
            isFeatured: false,
            featuredOrder: null,
          },
          update: {
            isHidden: true,
            isFeatured: false,
            featuredOrder: null,
          },
        });
      } else {
        await tx.creatorContentCuration.upsert({
          where: {
            creatorProfileId_platform_providerPostId: {
              creatorProfileId,
              platform,
              providerPostId,
            },
          },
          create: {
            creatorProfileId,
            platform,
            providerPostId,
            isHidden: false,
            isFeatured: false,
            featuredOrder: null,
          },
          update: {
            isHidden: false,
            // do not touch isFeatured or featuredOrder on show
          },
        });
      }

      await normalizeFeaturedInTx(tx, creatorProfileId);
      return { ok: true as const };
    });

    if (!result.ok) return result;

    await revalidateContentPaths(creatorProfileId);
    return { ok: true };
  } catch (err) {
    console.error("[setContentHiddenAction]", err);
    return { ok: false, error: "Failed to update visibility." };
  }
}

// ── reorderFeaturedContentAction ───────────────────────────────────────────────

/**
 * Reorder featured items using move-up / move-down supplied as an ordered list.
 *
 * Validates, inside the creator row lock:
 *   - Identities are unique
 *   - Every identity belongs to this creator and is currently featured
 *   - The supplied set is exactly the complete current featured set
 *   - ≤ 6 items
 *
 * A subset or extra item is rejected as stale. Order is rewritten to 0..n-1
 * in the same transaction.
 */
export async function reorderFeaturedContentAction(input: {
  ordered: { platform: string; providerPostId: string }[];
}): Promise<CurationActionResult> {
  const { ordered } = input;

  if (!Array.isArray(ordered) || ordered.length === 0) {
    return { ok: false, error: "No items provided." };
  }
  if (ordered.length > MAX_FEATURED) {
    return { ok: false, error: `Cannot order more than ${MAX_FEATURED} featured items.` };
  }

  // Reject duplicates
  const keys = ordered.map((o) => `${o.platform}::${o.providerPostId}`);
  const keySet = new Set(keys);
  if (keySet.size !== keys.length) {
    return { ok: false, error: "Duplicate items in order." };
  }

  // Reject missing providerPostId
  for (const item of ordered) {
    if (!item.providerPostId?.trim()) {
      return { ok: false, error: "All items must have a provider ID." };
    }
  }

  try {
    const { creatorProfileId } = await requireCreatorSession();

    const result = await db.$transaction(async (tx) => {
      await lockCreatorProfile(tx, creatorProfileId);

      const featuredRows = await tx.creatorContentCuration.findMany({
        where: { creatorProfileId, isFeatured: true, isHidden: false },
        select: { id: true, platform: true, providerPostId: true },
      });

      const featuredByKey = new Map(
        featuredRows.map((r) => [`${r.platform}::${r.providerPostId}`, r]),
      );
      const suppliedKeys = ordered.map((item) => `${item.platform}::${item.providerPostId}`);
      const suppliedSet = new Set(suppliedKeys);
      const matchesCompleteSet =
        suppliedSet.size === suppliedKeys.length &&
        suppliedSet.size === featuredRows.length &&
        suppliedKeys.every((key) => featuredByKey.has(key));

      if (!matchesCompleteSet || featuredRows.length > MAX_FEATURED) {
        return {
          ok: false as const,
          error: "Featured order is out of date. Refresh and try again.",
          code: "stale_featured_set",
        };
      }

      for (let i = 0; i < ordered.length; i++) {
        const row = featuredByKey.get(`${ordered[i].platform}::${ordered[i].providerPostId}`);
        if (!row) throw new Error("STALE_FEATURED_SET");
        await tx.creatorContentCuration.update({
          where: { id: row.id },
          data: { featuredOrder: i },
        });
      }

      // Hidden rows must not stay featured. Same transaction as the rewrite.
      await tx.creatorContentCuration.updateMany({
        where: { creatorProfileId, isHidden: true, isFeatured: true },
        data: { isFeatured: false, featuredOrder: null },
      });

      return { ok: true as const };
    });

    if (!result.ok) return result;

    await revalidateContentPaths(creatorProfileId);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "STALE_FEATURED_SET") {
      return {
        ok: false,
        error: "Featured order is out of date. Refresh and try again.",
        code: "stale_featured_set",
      };
    }
    console.error("[reorderFeaturedContentAction]", err);
    return { ok: false, error: "Failed to reorder featured content." };
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Serialize curation mutations for one creator.
 * Matches the PostgreSQL row-lock pattern used by claim merge.
 */
async function lockCreatorProfile(
  tx: Prisma.TransactionClient,
  creatorProfileId: string,
) {
  await tx.$queryRaw`
    SELECT id FROM "CreatorProfile"
    WHERE id = ${creatorProfileId}
    FOR UPDATE
  `;
}

/**
 * Enforce curation invariants inside the caller's transaction:
 * hidden rows are not featured, at most 6 featured, featuredOrder is 0..n-1.
 */
async function normalizeFeaturedInTx(
  tx: Prisma.TransactionClient,
  creatorProfileId: string,
) {
  const featuredRows = await tx.creatorContentCuration.findMany({
    where: { creatorProfileId, isFeatured: true },
    select: { id: true, isHidden: true, featuredOrder: true },
  });

  const hidden = featuredRows.filter((row) => row.isHidden);
  if (hidden.length > 0) {
    await tx.creatorContentCuration.updateMany({
      where: { id: { in: hidden.map((row) => row.id) } },
      data: { isFeatured: false, featuredOrder: null },
    });
  }

  const visible = featuredRows.filter((row) => !row.isHidden);
  const ranked = normalizeFeaturedOrder(visible);
  const keep = ranked.slice(0, MAX_FEATURED);
  const drop = ranked.slice(MAX_FEATURED);

  if (drop.length > 0) {
    await tx.creatorContentCuration.updateMany({
      where: { id: { in: drop.map((row) => row.id) } },
      data: { isFeatured: false, featuredOrder: null },
    });
  }

  for (const row of keep) {
    await tx.creatorContentCuration.update({
      where: { id: row.id },
      data: { featuredOrder: row.featuredOrder },
    });
  }
}

/**
 * Revalidate the paths that show curated content.
 * Uses the creatorProfileId to look up the associated userId for the profile route.
 */
async function revalidateContentPaths(creatorProfileId: string) {
  revalidatePath("/creator/content");

  // Revalidate the creator's own public profile page
  try {
    const profile = await db.creatorProfile.findUnique({
      where: { id: creatorProfileId },
      select: { userId: true },
    });
    if (profile) {
      revalidatePath(`/profile/${profile.userId}`);
    }
  } catch {
    // Non-critical — revalidation failure should not surface to the user
  }
}
