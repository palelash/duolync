import "server-only";
import type { Prisma, YouTubeComplianceState } from "@/lib/generated/prisma";

/** Call only after User -> token -> profile coordination. Missing is not ACTIVE. */
export async function lockYouTubeCompliance(tx: Prisma.TransactionClient, userId: string): Promise<YouTubeComplianceState | null> {
  const rows = await tx.$queryRaw<YouTubeComplianceState[]>`SELECT * FROM "YouTubeComplianceState" WHERE "userId" = ${userId} FOR UPDATE`;
  return rows[0] ?? null;
}
export function youtubeBlocked(state: Pick<YouTubeComplianceState, "status" | "blockedAt"> | null): boolean {
  return !!state && (state.status === "PURGED" || state.blockedAt !== null);
}
export function sameYouTubeFence(current: YouTubeComplianceState | null, expected: YouTubeComplianceState | null): boolean {
  return !!current && !!expected && current.status === "ACTIVE" && !youtubeBlocked(current) &&
    current.connectionGeneration === expected.connectionGeneration && current.revision === expected.revision &&
    current.leaseId === expected.leaseId;
}
export async function youtubeDatabaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
  return row.now;
}

/** Lease expectations are explicit: interactive work supplies no lease. */
export type YouTubeOperationFence = {
  connectionGeneration: number;
  revision: number;
  profileId?: string;
  lease?: { id: string };
};
export function compatibleYouTubeOperation(current: YouTubeComplianceState | null,
  expected: YouTubeOperationFence, now: Date): boolean {
  return !!current && current.status === "ACTIVE" && !youtubeBlocked(current) &&
    current.connectionGeneration === expected.connectionGeneration && current.revision === expected.revision &&
    (!expected.lease || (current.leaseId === expected.lease.id && !!current.leaseExpiresAt && current.leaseExpiresAt > now));
}
