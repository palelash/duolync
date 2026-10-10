import { computeFollowerCache } from "@/lib/creator-metrics";

/** Canonical caches have evidence; imported legacy aggregates have no platform
 * attribution. Preserve unknown imported values and keep them aggregate-only. */
export function youtubeAggregateRemovalPatch(profileOrigin: string | undefined,
  hadYouTubeStats: boolean, hadYouTubePosts: boolean,
  remaining: { followerCount: number | null; fetchedAt?: Date }[]) {
  if (!hadYouTubeStats && !hadYouTubePosts) return {};
  const followers = computeFollowerCache(remaining);
  const observations = remaining.map(stat => stat.fetchedAt).filter((date): date is Date => !!date && Number.isFinite(date.getTime()));
  return {
    ...(hadYouTubeStats ? { followerCount: followers } : {}),
    lastSyncedAt: observations.length ? new Date(Math.max(...observations.map(date => date.getTime()))) : null,
    // Imported legacy fields are independently entered/unknown, not proven API
    // caches. Registered historical caches have no imported aggregate source.
    ...(profileOrigin === "REGISTERED" ? {
      totalFollowers: followers ?? 0, averageEngagement: null, avgEngagementRate: 0, lastStatsUpdate: null,
    } : followers !== null ? { totalFollowers: followers } : {}),
  };
}
