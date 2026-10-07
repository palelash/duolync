"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  MAX_FEATURED,
  buildPortfolio,
  normalizeFeaturedOrder,
} from "@/lib/content-curation";

export interface SocialPostItem {
  id: string;
  platform: string;
  postUrl: string | null;
  imageUrl: string | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  postedAt: string | null;
  /** Provenance of this post — distinguishes OFFICIAL_API from APIFY/public-data rows. */
  dataSource: string;
  /** Stable platform post ID; non-null for OFFICIAL_API rows. */
  providerPostId: string | null;
}

export async function getSocialPostsAction(): Promise<{
  data: SocialPostItem[];
  error: string | null;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { data: [], error: "Unauthorized" };

    const creator = await db.creatorProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        socialPosts: {
          orderBy: { fetchedAt: "desc" },
          take: 9,
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
            dataSource: true,
            providerPostId: true,
          },
        },
      },
    });

    if (!creator) return { data: [], error: null };

    return {
      data: creator.socialPosts.map((p) => ({
        ...p,
        postedAt: p.postedAt?.toISOString() ?? null,
        dataSource: p.dataSource as string,
        providerPostId: p.providerPostId ?? null,
      })),
      error: null,
    };
  } catch (err) {
    console.error("[getSocialPostsAction]:", err);
    return { data: [], error: "Failed to load social posts" };
  }
}

/**
 * Clears posts whose image URLs are known-broken patterns so the UI shows
 * the platform emoji fallback cleanly until the user re-syncs.
 * Called automatically on the Social Connections page load.
 */
export async function clearBrokenPostImagesAction(): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    const creator = await db.creatorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!creator) return;

    // Null-out image URLs that point to the broken shortCode redirect pattern
    await db.socialPost.updateMany({
      where: {
        creatorProfileId: creator.id,
        imageUrl: { contains: "instagram.com/p/" },
      },
      data: { imageUrl: null },
    });
  } catch (err) {
    console.error("[clearBrokenPostImagesAction]:", err);
  }
}

/**
 * Fetch the CURATED PORTFOLIO for any creator by their user ID.
 * Used by the brand-side discovery view and ProfileDrawer.
 *
 * Returns the same curated portfolio the creator's public profile shows:
 *   - Live Featured max 6 (if any featured items exist)
 *   - OR recent visible fallback max 6
 *
 * The `limit` parameter is honoured only when falling back (no featured items).
 * When featured items exist the selector always returns them (max 6).
 */
export async function getCreatorPostsByUserIdAction(
  creatorUserId: string,
  limit = 6,
): Promise<{ data: SocialPostItem[]; error: string | null }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { data: [], error: "Unauthorized" };

    const creator = await db.creatorProfile.findUnique({
      where: { userId: creatorUserId },
      select: { id: true },
    });
    if (!creator) return { data: [], error: null };

    const [rawPosts, curationRows] = await Promise.all([
      db.socialPost.findMany({
        where: { creatorProfileId: creator.id },
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
      }),
      db.creatorContentCuration.findMany({
        where: { creatorProfileId: creator.id },
        select: {
          platform: true,
          providerPostId: true,
          isHidden: true,
          isFeatured: true,
          featuredOrder: true,
        },
      }),
    ]);

    const portfolio = buildPortfolio(
      rawPosts,
      curationRows.map((r, i) => ({ ...r, id: String(i) })),
    );

    // Respect limit only for fallback scenario; featured always returns up to 6
    const result = portfolio.slice(0, limit);

    return {
      data: result.map((p) => ({
        id: p.id,
        platform: p.platform,
        postUrl: p.postUrl,
        imageUrl: p.imageUrl,
        caption: p.caption,
        likes: p.likes,
        comments: p.comments,
        views: p.views,
        postedAt: p.postedAt,
        dataSource: p.dataSource,
        providerPostId: p.providerPostId,
      })),
      error: null,
    };
  } catch (err) {
    console.error("[getCreatorPostsByUserIdAction]:", err);
    return { data: [], error: "Failed to load creator posts" };
  }
}

/**
 * Fetch the curated portfolio for any creator ("View All" brand view).
 * Uses the same curated selector — curation cannot be bypassed by View All.
 */
export async function getAllCreatorPostsByUserIdAction(
  creatorUserId: string,
): Promise<{ data: SocialPostItem[]; error: string | null }> {
  // 6 is the maximum the selector ever returns, so limit=6 is correct
  return getCreatorPostsByUserIdAction(creatorUserId, 6);
}

export async function deletePostAction(postId: string): Promise<{ error: string | null }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { error: "Unauthorized" };

    const creator = await db.creatorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!creator) return { error: "Profile not found" };

    // Owner check, curation cleanup, and SocialPost delete commit together.
    // A failure in either delete rolls back both. Provider refresh is unchanged.
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "CreatorProfile"
        WHERE id = ${creator.id}
        FOR UPDATE
      `;

      const post = await tx.socialPost.findFirst({
        where: { id: postId, creatorProfileId: creator.id },
        select: { platform: true, providerPostId: true },
      });
      if (!post) return;

      let deletedWasFeatured = false;
      if (post.providerPostId) {
        const curation = await tx.creatorContentCuration.findFirst({
          where: {
            creatorProfileId: creator.id,
            platform: post.platform,
            providerPostId: post.providerPostId,
          },
          select: { isFeatured: true },
        });
        deletedWasFeatured = curation?.isFeatured === true;

        await tx.creatorContentCuration.deleteMany({
          where: {
            creatorProfileId: creator.id,
            platform: post.platform,
            providerPostId: post.providerPostId,
          },
        });
      }

      await tx.socialPost.deleteMany({
        where: { id: postId, creatorProfileId: creator.id },
      });

      // Featured hard-delete must not leave gaps. Same transaction as the delete.
      if (deletedWasFeatured) {
        const featuredRows = await tx.creatorContentCuration.findMany({
          where: { creatorProfileId: creator.id, isFeatured: true },
          select: { id: true, isHidden: true, featuredOrder: true },
        });

        const hidden = featuredRows.filter((row) => row.isHidden);
        if (hidden.length > 0) {
          await tx.creatorContentCuration.updateMany({
            where: { id: { in: hidden.map((row) => row.id) } },
            data: { isFeatured: false, featuredOrder: null },
          });
        }

        const ranked = normalizeFeaturedOrder(
          featuredRows.filter((row) => !row.isHidden),
        );
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
    });

    revalidatePath("/creator/presence");
    revalidatePath("/creator/content");

    return { error: null };
  } catch (err) {
    console.error("[deletePostAction]:", err);
    return { error: "Failed to delete post" };
  }
}
