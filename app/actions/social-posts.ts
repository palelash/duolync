"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

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

/** Fetch posts for any creator by their user ID (brand-side discovery view). */
export async function getCreatorPostsByUserIdAction(
  creatorUserId: string,
  limit = 6
): Promise<{ data: SocialPostItem[]; error: string | null }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { data: [], error: "Unauthorized" };

    const creator = await db.creatorProfile.findUnique({
      where: { userId: creatorUserId },
      select: {
        socialPosts: {
          orderBy: { fetchedAt: "desc" },
          take: limit,
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
    console.error("[getCreatorPostsByUserIdAction]:", err);
    return { data: [], error: "Failed to load creator posts" };
  }
}

/** Fetch ALL posts for any creator (used by portfolio "View All" page). */
export async function getAllCreatorPostsByUserIdAction(
  creatorUserId: string
): Promise<{ data: SocialPostItem[]; error: string | null }> {
  return getCreatorPostsByUserIdAction(creatorUserId, 100);
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

    await db.socialPost.deleteMany({
      where: { id: postId, creatorProfileId: creator.id },
    });

    revalidatePath("/creator/presence");

    return { error: null };
  } catch (err) {
    console.error("[deletePostAction]:", err);
    return { error: "Failed to delete post" };
  }
}
