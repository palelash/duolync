/** Imported identity can survive removal; automated aggregate metrics cannot. */
export function youtubeSafeImportedProfile<T extends Record<string, unknown>>(data: T, blocked: boolean): Partial<T> {
  if (!blocked) return data;
  const { totalFollowers, followerCount, avgEngagementRate, averageEngagement, lastStatsUpdate, lastSyncedAt, ...identity } = data;
  return identity as Partial<T>;
}
