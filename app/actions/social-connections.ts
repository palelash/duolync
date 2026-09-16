"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

// ─── Connected account shape returned to the UI ───────────────────────────────

export interface ConnectedAccount {
  id: string;
  platform: string;
  /** Handle / username, e.g. "john_doe" */
  username: string | null;
  /** Follower count from the last sync */
  followers: number | null;
  /** Engagement rate (0–100) from the last sync */
  engagementRate: number | null;
  /** How this account was connected */
  connectedVia: "oauth" | "apify";
  /** ISO timestamp of last data refresh */
  lastSyncedAt: string | null;
}

/**
 * Returns every platform the current user has connected, merging data from
 * PlatformToken (OAuth) and PlatformStats (Apify or OAuth post-sync).
 */
export async function getConnectedAccountsAction(): Promise<{
  data: ConnectedAccount[];
  error: string | null;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { data: [], error: "Unauthorized" };

    const [tokens, stats] = await Promise.all([
      db.platformToken.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
      }),
      db.platformStats.findMany({
        where: { userId: session.user.id },
        orderBy: { fetchedAt: "desc" },
      }),
    ]);

    const statsByPlatform = new Map(stats.map((s) => [s.platform, s]));
    const seenPlatforms = new Set<string>();
    const accounts: ConnectedAccount[] = [];

    // OAuth-connected first (PlatformToken)
    for (const token of tokens) {
      seenPlatforms.add(token.platform);
      const stat = statsByPlatform.get(token.platform);
      accounts.push({
        id: token.id,
        platform: token.platform,
        username: token.username ?? null,
        followers: stat?.followerCount ?? null,
        engagementRate: stat?.engagementRate ?? null,
        connectedVia: "oauth",
        lastSyncedAt: (stat?.fetchedAt ?? token.updatedAt).toISOString(),
      });
    }

    // Apify-synced platforms not covered by an OAuth token
    for (const stat of stats) {
      if (seenPlatforms.has(stat.platform)) continue;
      const rawData = stat.raw as { handle?: string } | null;
      accounts.push({
        id: stat.id,
        platform: stat.platform,
        username: rawData?.handle ?? null,
        followers: stat.followerCount ?? null,
        engagementRate: stat.engagementRate ?? null,
        connectedVia: "apify",
        lastSyncedAt: stat.fetchedAt.toISOString(),
      });
    }

    return { data: accounts, error: null };
  } catch (err) {
    console.error("[getConnectedAccountsAction]:", err);
    return { data: [], error: "Failed to load connected accounts" };
  }
}

/**
 * Disconnects a platform: deletes PlatformToken (OAuth) and/or PlatformStats +
 * SocialPosts (Apify), then removes it from CreatorProfile.connectedPlatforms.
 */

export async function removePlatformAction(
  platform: string,
): Promise<{ error: string | null }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { error: "Unauthorized" };

    const creatorProfile = await db.creatorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, connectedPlatforms: true },
    });
    if (!creatorProfile) return { error: "Profile not found" };

    // Remove OAuth token (if any)
    await db.platformToken.deleteMany({
      where: { userId: session.user.id, platform },
    });

    // Remove PlatformStats rows for this platform
    await db.platformStats.deleteMany({
      where: { userId: session.user.id, platform },
    });

    // Remove SocialPosts for this platform
    await db.socialPost.deleteMany({
      where: { creatorProfileId: creatorProfile.id, platform },
    });

    // Remove from connectedPlatforms array
    const updated = creatorProfile.connectedPlatforms.filter((p) => p !== platform);

    // Re-aggregate total followers from remaining platforms
    const remaining = await db.platformStats.findMany({
      where: { userId: session.user.id },
      select: { followerCount: true, engagementRate: true },
    });
    const totalFollowers = remaining.reduce((sum, s) => sum + (s.followerCount ?? 0), 0);
    const avgEng =
      remaining.length > 0
        ? remaining.reduce((sum, s) => sum + (s.engagementRate ?? 0), 0) / remaining.length
        : 0;

    await db.creatorProfile.update({
      where: { userId: session.user.id },
      data: {
        connectedPlatforms: updated,
        followerCount: totalFollowers || null,
        averageEngagement: remaining.length > 0 ? parseFloat(avgEng.toFixed(2)) : null,
        lastSyncedAt: updated.length === 0 ? null : undefined,
      },
    });

    revalidatePath("/creator/presence");
    revalidatePath("/creator/dashboard");

    return { error: null };
  } catch (err) {
    console.error("[removePlatformAction]:", err);
    return { error: "Failed to remove platform" };
  }
}
