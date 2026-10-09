"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { computeFollowerCache } from "@/lib/creator-metrics";

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
  /**
   * How this row should be presented.
   * "oauth"       = PlatformToken exists. This is the only Connected state.
   * "public_data" = APIFY or RAPIDAPI stats and no PlatformToken.
   * "unknown"     = stats exist (for example LEGACY_UNKNOWN) but the source is
   *                 neither an official connection nor confirmed public data.
   */
  connectedVia: "oauth" | "public_data" | "unknown";
  /** ISO timestamp of last data refresh */
  lastSyncedAt: string | null;
  /**
   * The DataSource of the underlying PlatformStats row (e.g. "OFFICIAL_API",
   * "APIFY", "RAPIDAPI", "LEGACY_UNKNOWN").
   *
   * Useful for distinguishing a previously-OAuth-connected account
   * (connectedVia !== "oauth" but dataSource === "OFFICIAL_API") from a
   * never-connected public-data account. Used to show "Reconnect" UX when the
   * PlatformToken no longer exists but historical OFFICIAL_API data remains.
   */
  dataSource?: string | null;
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
        dataSource: stat?.dataSource ?? null,
      });
    }

    // Stats without a PlatformToken are never Connected.
    // APIFY and RAPIDAPI are public data. Anything else stays unlabeled.
    for (const stat of stats) {
      if (seenPlatforms.has(stat.platform)) continue;
      const rawData = stat.raw as { handle?: string } | null;
      const isPublicSource = stat.dataSource === "APIFY" || stat.dataSource === "RAPIDAPI";
      accounts.push({
        id: stat.id,
        platform: stat.platform,
        username: rawData?.handle ?? null,
        followers: stat.followerCount ?? null,
        engagementRate: stat.engagementRate ?? null,
        connectedVia: isPublicSource ? "public_data" : "unknown",
        lastSyncedAt: stat.fetchedAt.toISOString(),
        dataSource: stat.dataSource,
      });
    }

    return { data: accounts, error: null };
  } catch (err) {
    console.error("[getConnectedAccountsAction]:", err);
    return { data: [], error: "Failed to load connected accounts" };
  }
}

/**
 * Returns the platform identifiers for which the current user has an active
 * PlatformToken (official OAuth connection). This is the canonical source of
 * truth for "Connected" state — Apify/RapidAPI stats do NOT constitute a connection.
 */
export async function getOAuthConnectedPlatformsAction(): Promise<{
  platforms: string[];
  error: string | null;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { platforms: [], error: "Unauthorized" };

    const tokens = await db.platformToken.findMany({
      where: { userId: session.user.id },
      select: { platform: true },
    });

    return { platforms: tokens.map((t) => t.platform), error: null };
  } catch (err) {
    console.error("[getOAuthConnectedPlatformsAction]:", err);
    return { platforms: [], error: "Failed to load OAuth status" };
  }
}

/**
 * Disconnects a platform: deletes PlatformToken (OAuth) and/or PlatformStats +
 * SocialPosts (Apify), then removes it from CreatorProfile.connectedPlatforms.
 */

export async function removePlatformAction(
  platform: string,
): Promise<{ error: string | null }> {
  if (platform === "youtube") return { error: "use_youtube_disconnect" };
  if (platform === "instagram") {
    return { error: "use_instagram_disconnect" };
  }
  // ── TikTok guard ────────────────────────────────────────────────────────────
  // TikTok requires provider-level OAuth revoke before local data deletion.
  // The generic path bypasses that step. Any caller that passes "tiktok" here
  // (including stale clients) must be redirected to the dedicated action.
  // Nothing is deleted.
  if (platform === "tiktok") {
    return {
      error:
        "TikTok must be disconnected using the dedicated TikTok disconnect action. Use disconnectTikTokAction() instead.",
    };
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { error: "Unauthorized" };

    const creatorProfile = await db.creatorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, connectedPlatforms: true },
    });
    if (!creatorProfile) return { error: "Profile not found" };

    // Local platform cleanup commits together. SocialPost and curation deletes
    // for this platform roll back together if either fails. Provider refresh
    // and TikTok disconnect are unchanged.
    await db.$transaction(async (tx) => {
      // Remove OAuth token (if any)
      await tx.platformToken.deleteMany({
        where: { userId: session.user.id, platform },
      });

      // Remove PlatformStats rows for this platform
      await tx.platformStats.deleteMany({
        where: { userId: session.user.id, platform },
      });

      // Remove SocialPosts for this platform
      await tx.socialPost.deleteMany({
        where: { creatorProfileId: creatorProfile.id, platform },
      });

      // Explicit platform disconnect: remove curation rows for this platform.
      // The creator asked to remove this platform's data; reconnect must not
      // silently restore the old curated portfolio for this platform.
      // (Normal sync/refresh MUST NOT delete curation — only explicit disconnect does.)
      await tx.creatorContentCuration.deleteMany({
        where: { creatorProfileId: creatorProfile.id, platform },
      });

      // Remove from connectedPlatforms array
      const updated = creatorProfile.connectedPlatforms.filter((p) => p !== platform);

      // Re-aggregate total followers from remaining platforms
      const remaining = await tx.platformStats.findMany({
        where: { userId: session.user.id },
        select: { followerCount: true },
      });
      // §8: Fix 0→null antipattern (totalFollowers || null turned real 0 into null).
      // Fix averageEngagement write-time cache (removed — computed at read time).
      const cachedFollowers = computeFollowerCache(remaining);

      await tx.creatorProfile.update({
        where: { userId: session.user.id },
        data: {
          connectedPlatforms: updated,
          // Preserve real 0 (computeFollowerCache returns 0 when a genuine 0 exists).
          // Set to null only when NO non-null followerCounts remain.
          ...(cachedFollowers !== null ? { followerCount: cachedFollowers } : { followerCount: null }),
          lastSyncedAt: updated.length === 0 ? null : undefined,
          // averageEngagement: intentionally NOT written here.
          // Real engagement is derived from SocialPost data at read time.
        },
      });
    });

    revalidatePath("/creator/presence");
    revalidatePath("/creator/dashboard");

    return { error: null };
  } catch (err) {
    console.error("[removePlatformAction]:", err);
    return { error: "Failed to remove platform" };
  }
}
