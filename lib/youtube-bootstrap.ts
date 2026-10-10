/** Pure conservative inventory classification. No token is freshness evidence. */
export type BootstrapEvidence = {
  state: { status: string; blockedAt: Date | null } | null;
  token: { platformUserId: string | null } | null;
  stats: { dataSource: string; providerAccountId: string | null; fetchedAt: Date } | null;
  officialPosts: boolean;
  oldestOfficialPostAt?: Date | null;
};
export function planYouTubeBootstrap(e: BootstrapEvidence, now: Date) {
  if (e.state) return { kind: "KEEP" as const };
  const official = e.stats?.dataSource === "OFFICIAL_API" || e.officialPosts;
  if (!e.token) return { kind: official ? "PURGE" as const : "SKIP" as const };
  // A token alone (including token + LEGACY_UNKNOWN/lower-source rows) cannot
  // establish an official compliance lifecycle. Require established official
  // history as well; otherwise an accepted OAuth reconnect must establish it.
  if (!official) return { kind: "SKIP" as const };
  const snapshotAge = e.stats?.fetchedAt;
  const postAge = e.oldestOfficialPostAt;
  const age = snapshotAge && postAge && postAge < snapshotAge ? postAge : snapshotAge;
  const trustworthy = e.stats?.dataSource === "OFFICIAL_API" && e.stats.providerAccountId === e.token.platformUserId &&
    !!e.token.platformUserId && age && Number.isFinite(age.getTime()) && age <= now && !!snapshotAge && snapshotAge <= now && (!postAge || (Number.isFinite(postAge.getTime()) && postAge <= now));
  // A current stats snapshot supplies data evidence only; no validation inferred.
  return { kind: "ACTIVE" as const, refreshAt: trustworthy ? age : null,
    nextAttemptAt: now, deleteByAt: trustworthy ? new Date(age.getTime() + 30 * 86400000) : now };
}
