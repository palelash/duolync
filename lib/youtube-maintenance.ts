import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { PlatformToken, Prisma, YouTubeComplianceState, YouTubeMaintenanceOutcome } from "@/lib/generated/prisma";
import { compatibleYouTubeOperation, lockYouTubeCompliance, youtubeDatabaseNow, youtubeDeadlineReached, type YouTubeOperationFence } from "@/lib/youtube-compliance";
import { forceYouTubeAuthorizationValidation, sameYouTubeCredentialVersion } from "@/lib/youtube-token";
import { syncYouTubeOfficialData, validateYouTubeAccessAuthorization } from "@/lib/youtube-sync";
import { removeYouTubeLocalData } from "@/lib/youtube-removal";
import { lockYouTubeOwner } from "@/lib/youtube-lock";

import { maintenanceConfig, maintenanceInteger as integer, type YouTubeMaintenanceConfig } from "@/lib/youtube-maintenance-config";
export { maintenanceConfig } from "@/lib/youtube-maintenance-config";
export type { YouTubeMaintenanceConfig } from "@/lib/youtube-maintenance-config";

const DAY = 86_400_000;
const TX = { maxWait: 5_000, timeout: 15_000 };
// A short, local-only claim distinguishes cleanup from ordinary HTTP work using
// existing lease fields. Other cleanup workers must not steal this claim.
const DEADLINE_LEASE_PREFIX = "deadline:";
const DEADLINE_LEASE_MS = 30_000;
export type YouTubeMaintenanceClaim = {
  userId: string; state: YouTubeComplianceState; credential: PlatformToken | null;
  profileId?: string; observedAt: Date; fence: YouTubeOperationFence;
};
/** channels.list + playlistItems.list + ceil((50 recent + <=200 curated)/50)
 * videos.list. Each list costs one unit. An access-only probe adds one unit.
 * https://developers.google.com/youtube/v3/docs/{channels,playlistItems,videos}/list
 */
export function estimateYouTubeMaintenanceQuota(accessOnly: boolean): number { return 7 + Number(accessOnly); }
export function maintenanceRetryAt(outcome: YouTubeMaintenanceOutcome, attempts: number, now: Date, deadline: Date | null): Date {
  const delay = outcome === "QUOTA_EXHAUSTED" ? 2 * DAY : outcome === "CONFIGURATION_FAILURE" ? 3 * DAY :
    Math.min(3, Math.max(1, attempts)) * DAY;
  return new Date(Math.min(now.getTime() + delay, deadline?.getTime() ?? now.getTime()));
}

export function maintenanceLeaseAvailable(state: YouTubeComplianceState, now: Date): boolean {
  if (!state.leaseId || !state.leaseExpiresAt || state.leaseExpiresAt <= now) return true;
  return youtubeDeadlineReached(state, now) && !state.leaseId.startsWith(DEADLINE_LEASE_PREFIX);
}

/** One owner per transaction avoids holding owners in deadline order against
 * claim merges that lock owners in ID order. Selection itself locks User FIRST.
 * SKIP LOCKED plus the locked lease recheck handles independent workers safely.
 */
export async function claimYouTubeMaintenance(leaseMs = 300000): Promise<YouTubeMaintenanceClaim | null> {
  integer(leaseMs, 1000, 3600000);
  return db.$transaction(async tx => {
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT u."id" FROM "User" u JOIN "YouTubeComplianceState" s ON s."userId" = u."id"
      WHERE s."status" = 'ACTIVE' AND s."blockedAt" IS NULL
        AND (s."leaseId" IS NULL OR s."leaseExpiresAt" IS NULL OR s."leaseExpiresAt" <= clock_timestamp()
          OR ((s."deleteByAt" IS NULL OR s."deleteByAt" <= clock_timestamp())
            AND s."leaseId" NOT LIKE ${`${DEADLINE_LEASE_PREFIX}%`}))
        AND (s."deleteByAt" IS NULL OR s."deleteByAt" <= clock_timestamp()
          OR s."nextAttemptAt" IS NULL OR s."nextAttemptAt" <= clock_timestamp())
      ORDER BY s."deleteByAt" ASC NULLS FIRST, s."nextAttemptAt" ASC NULLS FIRST, u."id"
      LIMIT 1 FOR UPDATE OF u SKIP LOCKED
    `;
    if (!owners[0]) return null;
    const userId = owners[0].id;
    const tokens = await tx.$queryRaw<PlatformToken[]>`SELECT * FROM "PlatformToken" WHERE "userId" = ${userId} AND "platform" = 'youtube' FOR UPDATE`;
    const profiles = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
    const state = await lockYouTubeCompliance(tx, userId), now = await youtubeDatabaseNow(tx);
    if (!state || state.status !== "ACTIVE" || state.blockedAt ||
      !maintenanceLeaseAvailable(state, now) ||
      (state.deleteByAt && state.deleteByAt > now && state.nextAttemptAt && state.nextAttemptAt > now)) return null;
    const deadline = youtubeDeadlineReached(state, now);
    const leaseId = `${deadline ? DEADLINE_LEASE_PREFIX : ""}${randomUUID()}`;
    const leaseExpiresAt = deadline ? new Date(now.getTime() + DEADLINE_LEASE_MS) :
      new Date(Math.min(now.getTime() + leaseMs, state.deleteByAt!.getTime()));
    const claimed = await tx.youTubeComplianceState.update({ where: { userId }, data: {
      leaseId, leaseExpiresAt, ...(deadline ? { revision: { increment: 1 } } : {}),
    } });
    return { userId, state: claimed, credential: tokens[0] ?? null, profileId: profiles[0]?.id, observedAt: now,
      fence: { connectionGeneration: claimed.connectionGeneration, revision: claimed.revision, profileId: profiles[0]?.id, lease: { id: leaseId } } };
  }, TX);
}

async function currentClaim(tx: Prisma.TransactionClient, claim: YouTubeMaintenanceClaim) {
  await lockYouTubeOwner(tx, claim.userId);
  const tokens = await tx.$queryRaw<PlatformToken[]>`SELECT * FROM "PlatformToken" WHERE "userId" = ${claim.userId} AND "platform" = 'youtube' FOR UPDATE`;
  const profiles = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${claim.userId} FOR UPDATE`;
  const state = await lockYouTubeCompliance(tx, claim.userId), now = await youtubeDatabaseNow(tx);
  const sameCredential = claim.credential ? !!tokens[0] && sameYouTubeCredentialVersion(tokens[0], claim.credential) : !tokens[0];
  return { state, now, compatible: sameCredential && profiles[0]?.id === claim.profileId && compatibleYouTubeOperation(state, claim.fence, now) };
}

async function purgeClaim(claim: YouTubeMaintenanceClaim): Promise<YouTubeMaintenanceOutcome> {
  let leaseExpiresAt: Date | null = null;
  const result = await removeYouTubeLocalData(claim.userId, async (token, tx) => {
    const state = await lockYouTubeCompliance(tx, claim.userId), now = await youtubeDatabaseNow(tx);
    const profile = await tx.creatorProfile.findUnique({ where: { userId: claim.userId }, select: { id: true } });
    leaseExpiresAt = state?.leaseExpiresAt ?? null;
    return (claim.credential ? !!token && sameYouTubeCredentialVersion(token, claim.credential) : !token) &&
      profile?.id === claim.profileId && compatibleYouTubeOperation(state, claim.fence, now) &&
      youtubeDeadlineReached(state!, now);
  }, async tx => {
    const now = await youtubeDatabaseNow(tx);
    if (!leaseExpiresAt || leaseExpiresAt <= now) throw new Error("youtube_stale_operation");
    await tx.youTubeComplianceState.update({ where: { userId: claim.userId }, data: {
      lastAttemptAt: now, lastOutcome: "DEADLINE_PURGED", attemptCount: { increment: 1 },
    } });
  }, "DEADLINE_EXCEEDED");
  return result.error === "connection_changed" ? "SUPERSEDED" : result.error ? "TEMPORARY_FAILURE" : "DEADLINE_PURGED";
}

/** Failure observations cannot change a newer connection or another lease. */
async function finishFailure(claim: YouTubeMaintenanceClaim, outcome: YouTubeMaintenanceOutcome): Promise<YouTubeMaintenanceOutcome> {
  const result = await db.$transaction(async tx => {
    const current = await currentClaim(tx, claim);
    if (!current.compatible) return "SUPERSEDED" as const;
    if (youtubeDeadlineReached(current.state!, current.now)) return "DEADLINE_PURGED" as const;
    const attempts = Math.min(2147483647, current.state!.attemptCount + 1);
    await tx.youTubeComplianceState.update({ where: { userId: claim.userId }, data: {
      lastOutcome: outcome, lastAttemptAt: current.now, attemptCount: attempts,
      nextAttemptAt: maintenanceRetryAt(outcome, attempts, current.now, current.state!.deleteByAt),
      revision: { increment: 1 }, leaseId: null, leaseExpiresAt: null,
    } });
    return outcome;
  }, TX);
  return result === "DEADLINE_PURGED" ? purgeClaim(claim) : result;
}
function classify(reason: string): YouTubeMaintenanceOutcome {
  const outcomes: Record<string, YouTubeMaintenanceOutcome> = {
    not_connected: "NOT_CONNECTED", reauth_required: "AUTHORIZATION_LOST", temporary_failure: "TEMPORARY_FAILURE",
    quota_exhausted: "QUOTA_EXHAUSTED", configuration_error: "CONFIGURATION_FAILURE", configuration_failure: "CONFIGURATION_FAILURE",
    provider_failure: "PROVIDER_FAILURE", counter_range: "PROVIDER_FAILURE", identity_mismatch: "IDENTITY_MISMATCH", superseded: "SUPERSEDED",
  };
  return outcomes[reason] ?? "PROVIDER_FAILURE";
}
export async function processYouTubeMaintenanceClaim(claim: YouTubeMaintenanceClaim,
  consumeQuota: () => boolean, allowProviderWork = true): Promise<YouTubeMaintenanceOutcome> {
  try {
    // Recheck before any provider request; expired claims never contact Google.
    const current = await db.$transaction(tx => currentClaim(tx, claim), TX);
    if (!current.compatible) return "SUPERSEDED";
    if (youtubeDeadlineReached(current.state!, current.now)) return await purgeClaim(claim);
    if (!claim.credential) return await finishFailure(claim, "NOT_CONNECTED");
    if (!claim.profileId) return await finishFailure(claim, "CONFIGURATION_FAILURE");
    if (!allowProviderWork) return await finishFailure(claim, "QUOTA_EXHAUSTED");
    if (claim.credential.refreshToken?.trim()) {
      const validation = await forceYouTubeAuthorizationValidation(claim.userId, claim.credential, claim.fence);
      if (!validation.ok) {
        // clearYouTubeDeadAuth has already atomically purged this exact claim.
        if (validation.reason === "reauth_required") return "AUTHORIZATION_LOST";
        return await finishFailure(claim, classify(validation.reason));
      }
      if (!validation.credential) return await finishFailure(claim, "SUPERSEDED");
      claim = { ...claim, credential: validation.credential as PlatformToken };
    } else {
      const validation = await validateYouTubeAccessAuthorization(claim.credential, consumeQuota);
      if (!validation.ok) return await finishFailure(claim, classify(validation.reason));
    }
    const synced = await syncYouTubeOfficialData(claim.userId, { credential: claim.credential!, expectedFence: claim.fence,
      lease: claim.fence.lease, recoveryAttempted: true, maintenance: { observedAt: claim.observedAt, consumeQuota } });
    return synced.ok ? "SUCCESS" : await finishFailure(claim, classify(synced.reason));
  } catch (error) {
    if (error instanceof Error && ["youtube_owner_missing", "youtube_stale_operation"].includes(error.message)) return "SUPERSEDED";
    // A database failure is isolated, and its lease remains recoverable if even
    // the short failure transaction cannot commit. No error body is persisted.
    return await finishFailure(claim, "TEMPORARY_FAILURE");
  }
}

export async function runYouTubeMaintenance(config: YouTubeMaintenanceConfig = {}) {
  const settings = maintenanceConfig(config), startedAt = Date.now();
  let remaining = settings.quotaBudget, quotaUsed = 0, processed = 0, itemErrors = 0, providerQuotaExhausted = false;
  const outcomes: Partial<Record<YouTubeMaintenanceOutcome, number>> = {};
  while (processed < settings.itemLimit && Date.now() - startedAt < settings.runLimitMs) {
    const claims: YouTubeMaintenanceClaim[] = [];
    // Claim only immediately runnable slots, never leave an entire page waiting
    // behind provider latency while its leases expire.
    for (let i = 0; i < Math.min(settings.batchSize, settings.concurrency, settings.itemLimit - processed); i++) {
      const claim = await claimYouTubeMaintenance(settings.leaseMs);
      if (!claim) break;
      claims.push(claim);
    }
    if (!claims.length) break;
    await Promise.all(claims.map(async claim => {
      const reservation = estimateYouTubeMaintenanceQuota(!claim.credential?.refreshToken?.trim());
      const needsProvider = !!claim.credential && !!claim.profileId && !youtubeDeadlineReached(claim.state, claim.observedAt);
      const allowed = needsProvider && !providerQuotaExhausted && remaining >= reservation;
      if (allowed) remaining -= reservation;
      let used = 0;
      try {
        const outcome = await processYouTubeMaintenanceClaim(claim, () => {
          if (!allowed || providerQuotaExhausted || used >= reservation) return false;
          used++; quotaUsed++; return true;
        }, allowed);
        if (allowed && outcome === "QUOTA_EXHAUSTED") providerQuotaExhausted = true;
        outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      } catch { itemErrors++; }
      finally { if (allowed) remaining += reservation - used; processed++; }
    }));
  }
  return { processed, outcomes, quotaUsed, quotaBudget: settings.quotaBudget, itemErrors };
}
