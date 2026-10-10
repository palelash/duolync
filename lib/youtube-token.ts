import "server-only";
import type { Prisma, PlatformToken } from "@/lib/generated/prisma";
import { removeYouTubeLocalData } from "@/lib/youtube-removal";
import { lockYouTubeCompliance, youtubeDatabaseNow, compatibleYouTubeOperation, type YouTubeOperationFence } from "@/lib/youtube-compliance";
import { db } from "@/lib/db";
import { lockYouTubeOwner } from "@/lib/youtube-lock";
import { GOOGLE_TOKEN_URL, parseYouTubeTokenResponse, youtubeFetch, type YouTubeParsedToken } from "@/lib/youtube-auth";

export type YouTubeTokenOutcome =
  | { ok: true; accessToken: string; credential?: YouTubeCredentialVersion }
  | { ok: false; reason: "not_connected" | "reauth_required" | "temporary_failure" | "configuration_error" | "superseded" | "quota_exhausted" | "provider_failure" };
export type YouTubeTokenSaveData = YouTubeParsedToken & { platformUserId: string; username: string | null };
export type YouTubeCredentialVersion = Pick<PlatformToken, "id" | "accessToken" | "refreshToken" | "updatedAt" | "platformUserId">;
const inflight = new Map<string, Promise<YouTubeTokenOutcome>>();

export function isYouTubeRefreshDeadAuth(status: number, body: unknown): boolean {
  return status === 400 && !!body && typeof body === "object" &&
    (body as Record<string, unknown>).error === "invalid_grant";
}

export function isYouTubeAccessDeadAuth(status: number, body: unknown): boolean {
  if (status !== 401 || !body || typeof body !== "object") return false;
  const errors = (body as { error?: { errors?: { reason?: string }[] } }).error?.errors;
  return Array.isArray(errors) && errors.some(error => error?.reason === "authError");
}

/** Recover an uncertain revoke without changing tokens/versions or local data.
 * Check the exact refresh credential even when the access token is unexpired.
 * These are the same permanent-error predicates used by normal lifecycle/sync.
 */
export async function probeYouTubeAuthorization(credential: YouTubeCredentialVersion): Promise<
  { state: "valid"; revokeToken: string } | "gone" | "temporary_failure" | "configuration_failure" | "provider_failure"> {
  try {
    if (credential.refreshToken?.trim()) {
      const clientId = process.env.YOUTUBE_CLIENT_ID;
      const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return "configuration_failure";
      const response = await youtubeFetch(GOOGLE_TOKEN_URL, { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
          grant_type: "refresh_token", refresh_token: credential.refreshToken }).toString() });
      const body: unknown = await response.json();
      if (isYouTubeRefreshDeadAuth(response.status, body)) return "gone";
      if (response.status === 429 || response.status >= 500) return "temporary_failure";
      const parsed = response.ok && parseYouTubeTokenResponse(body);
      // If Google replaces a refresh credential during the probe, revoke that
      // replacement too rather than discarding a newly issued usable grant.
      return parsed ? { state: "valid", revokeToken: parsed.refreshToken ?? credential.refreshToken } : "provider_failure";
    }
    const response = await youtubeFetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", {
      headers: { Authorization: `Bearer ${credential.accessToken}` },
    });
    const body = await response.json();
    // A rejected access credential alone cannot prove permanent grant loss.
    if (isYouTubeAccessDeadAuth(response.status, body)) return "provider_failure";
    if (response.status === 429 || response.status >= 500) return "temporary_failure";
    return response.ok && Array.isArray(body?.items)
      ? { state: "valid", revokeToken: credential.accessToken } : "provider_failure";
  } catch { return "temporary_failure"; }
}

async function coordinated<T>(userId: string, run: (tx: Prisma.TransactionClient, token: PlatformToken | null) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await lockYouTubeOwner(tx, userId);
    const rows = await tx.$queryRaw<PlatformToken[]>`
      SELECT * FROM "PlatformToken" WHERE "userId" = ${userId} AND "platform" = 'youtube' FOR UPDATE
    `;
    return run(tx, rows[0] ?? null);
  }, { maxWait: 5_000, timeout: 15_000 });
}

export function sameYouTubeCredentialVersion(current: PlatformToken, expected: YouTubeCredentialVersion): boolean {
  return current.id === expected.id && current.accessToken === expected.accessToken &&
    current.refreshToken === expected.refreshToken && current.platformUserId === expected.platformUserId &&
    new Date(current.updatedAt).getTime() === new Date(expected.updatedAt).getTime();
}

// Explicit monotonic versions even for two writes within a millisecond.
function nextVersion(current: PlatformToken | null): Date {
  return new Date(Math.max(Date.now(), current ? new Date(current.updatedAt).getTime() + 1 : 0));
}

/** Same-channel refresh preservation only. Optional callback data writes stay in
 * this coordination domain so late callbacks cannot mix credentials/markers/data.
 * No provider HTTP is allowed inside persistData.
 */
export async function saveYouTubeAccessToken(userId: string, data: YouTubeTokenSaveData,
  persistData?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<YouTubeCredentialVersion> {
  if (!data.platformUserId?.trim() || !data.accessToken?.trim() ||
    (data.refreshToken !== null && !data.refreshToken?.trim()) ||
    (data.expiresAt !== null && !Number.isFinite(data.expiresAt.getTime()))) throw new Error("youtube_invalid_credentials");
  return coordinated(userId, async (tx, current) => {
    const refreshToken = data.refreshToken ??
      (current?.platformUserId === data.platformUserId && current.refreshToken?.trim() ? current.refreshToken : null);
    const credential = { ...data, refreshToken, updatedAt: nextVersion(current) };
    const saved = await tx.platformToken.upsert({
      where: { userId_platform: { userId, platform: "youtube" } },
      create: { userId, platform: "youtube", ...credential }, update: credential,
    });
    // SQL update acquires CreatorProfile after User and token, preserving other markers.
    await tx.$executeRaw`
      UPDATE "CreatorProfile" SET "connectedPlatforms" = array_append("connectedPlatforms", 'youtube')
      WHERE "userId" = ${userId} AND NOT ('youtube' = ANY("connectedPlatforms"))
    `;
    await lockYouTubeCompliance(tx, userId);
    const now = await youtubeDatabaseNow(tx);
    const lifecycle = { status: "ACTIVE" as const, blockedAt: null, purgedAt: null, removalReason: null,
      authorizationLostAt: null, lastSuccessfulAuthorizationValidationAt: now,
      lastSuccessfulDataRefreshAt: null, nextAttemptAt: now, deleteByAt: now,
      lastAttemptAt: null, lastOutcome: null, attemptCount: 0, leaseId: null, leaseExpiresAt: null };
    await tx.youTubeComplianceState.upsert({ where: { userId },
      create: { userId, ...lifecycle, connectionGeneration: 1, revision: 1 },
      update: { ...lifecycle, connectionGeneration: { increment: 1 }, revision: { increment: 1 } } });
    if (persistData) await persistData(tx);
    return saved;
  });
}

function usable(token: PlatformToken): boolean {
  // Unknown expiry is truthful: use this token until provider behavior proves otherwise.
  return !!token.accessToken.trim() && (!token.expiresAt || new Date(token.expiresAt).getTime() > Date.now() + 60_000);
}

/** Exact failed credential plus optional observation fence; cleanup and marker share one transaction. */
export async function clearYouTubeDeadAuth(userId: string, failed: YouTubeCredentialVersion,
  fence?: YouTubeOperationFence): Promise<YouTubeTokenOutcome> {
  try {
    let replacement: PlatformToken | null = null;
    let staleOperation = false;
    let leaseExpiresAt: Date | null = null;
    const result = await removeYouTubeLocalData(userId, async (current, tx) => {
      if (!current || !sameYouTubeCredentialVersion(current, failed)) { replacement = current; return false; }
      if (fence) {
        const state = await lockYouTubeCompliance(tx, userId);
        const now = await youtubeDatabaseNow(tx);
        leaseExpiresAt = state?.leaseExpiresAt ?? null;
        const profile = fence.profileId ? await tx.creatorProfile.findUnique({ where: { userId }, select: { id: true } }) : null;
        if (!compatibleYouTubeOperation(state, fence, now) || (fence.profileId && profile?.id !== fence.profileId)) {
          staleOperation = true; return false;
        }
      }
      return true;
    }, fence?.lease ? async tx => {
      // Lease expiry during cleanup must roll back every deletion and marker.
      const now = await youtubeDatabaseNow(tx);
      if (!leaseExpiresAt || leaseExpiresAt <= now) throw new Error("youtube_stale_operation");
      await tx.youTubeComplianceState.update({ where: { userId }, data: { lastAttemptAt: now, attemptCount: { increment: 1 } } });
    } : undefined, "AUTHORIZATION_LOST");
    if (staleOperation) return { ok: false, reason: "superseded" };
    if (result.error === "connection_changed") return replacement
      ? { ok: true, accessToken: (replacement as PlatformToken).accessToken } : { ok: false, reason: "not_connected" };
    return result.error ? { ok: false, reason: "temporary_failure" } : { ok: false, reason: "reauth_required" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.message === "youtube_stale_operation" ? "superseded" : "temporary_failure" };
  }
}

export function getYouTubeAccessToken(userId: string): Promise<YouTubeTokenOutcome> {
  const pending = inflight.get(userId);
  if (pending) return pending;
  const promise = maintain(userId).finally(() => { if (inflight.get(userId) === promise) inflight.delete(userId); });
  inflight.set(userId, promise);
  return promise;
}

async function maintain(userId: string): Promise<YouTubeTokenOutcome> {
  try {
    // Short locked snapshot, HTTP outside transaction, short locked compare-and-save.
    // Local single-flight avoids duplicate requests in one process. Across servers,
    // version comparison rejects losing responses (including invalid_grant) after
    // another refresh or reconnect. The first coordinated writer wins.
    const current = await coordinated(userId, async (_tx, token) => token);
    if (!current) return { ok: false, reason: "not_connected" };
    const observationFence = await db.youTubeComplianceState.findUnique({ where: { userId } });
    if (usable(current)) return { ok: true, accessToken: current.accessToken };
    if (!current.refreshToken?.trim()) return { ok: false, reason: "reauth_required" };
    return await refreshYouTubeCredential(userId, current, observationFence ?? undefined);

  } catch { return { ok: false, reason: "temporary_failure" }; }
}

/** Recover a rejected access token using the exact current refresh grant. No
 * reconnect or new dataset snapshot is substituted for the failed operation. */
export async function recoverYouTubeRejectedAccess(userId: string, failed: YouTubeCredentialVersion,
  fence: YouTubeOperationFence): Promise<YouTubeTokenOutcome> {
  try {
    const current = await coordinated(userId, async (tx, token) => {
      await tx.$queryRaw`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
      const state = await lockYouTubeCompliance(tx, userId);
      if (!token || !sameYouTubeCredentialVersion(token, failed) || !compatibleYouTubeOperation(state, fence, await youtubeDatabaseNow(tx))) return null;
      if (fence.profileId) {
        const profile = await tx.creatorProfile.findUnique({ where: { userId }, select: { id: true } });
        if (profile?.id !== fence.profileId) return null;
      }
      return token;
    });
    if (!current) return { ok: false, reason: "superseded" };
    if (!current.refreshToken?.trim()) return { ok: false, reason: "reauth_required" };
    return await refreshYouTubeCredential(userId, current, fence);
  } catch { return { ok: false, reason: "temporary_failure" }; }
}

/** Maintenance always contacts Google, independent of local access-token expiry. */
export function forceYouTubeAuthorizationValidation(userId: string, current: PlatformToken,
  fence: YouTubeOperationFence): Promise<YouTubeTokenOutcome> {
  return refreshYouTubeCredential(userId, current, fence, true);
}

async function refreshYouTubeCredential(userId: string, current: PlatformToken,
  fence?: YouTubeOperationFence, periodic = false): Promise<YouTubeTokenOutcome> {
    const refreshToken = current.refreshToken;
    if (!refreshToken?.trim()) return { ok: false, reason: "reauth_required" };
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return { ok: false, reason: "configuration_error" };
    let response: Response, body: unknown;
    try {
      response = await youtubeFetch(GOOGLE_TOKEN_URL, { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
          grant_type: "refresh_token", refresh_token: refreshToken }).toString() });
      body = await response.json();
    } catch { return { ok: false, reason: "temporary_failure" }; }
    // Only a documented refresh invalid_grant on a client-error response proves
    // permanent auth failure. Throttling/server errors always preserve auth.
    if (isYouTubeRefreshDeadAuth(response.status, body)) return clearYouTubeDeadAuth(userId, current, fence);
    if (!response.ok) {
      if (periodic && response.status < 500 && response.status !== 429) {
        const error = (body as { error?: string })?.error;
        return { ok: false, reason: ["invalid_client", "unauthorized_client"].includes(error ?? "") ? "configuration_error" : "provider_failure" };
      }
      return { ok: false, reason: "temporary_failure" };
    }
    const parsed = parseYouTubeTokenResponse(body);
    if (!parsed || !parsed.expiresAt) return { ok: false, reason: "temporary_failure" };
    return await coordinated(userId, async (tx, latest): Promise<YouTubeTokenOutcome> => {
      if (!latest) return { ok: false, reason: "not_connected" };
      if (!sameYouTubeCredentialVersion(latest, current)) return periodic ? { ok: false, reason: "superseded" } : { ok: true, accessToken: latest.accessToken };
      if (fence) {
        await tx.$queryRaw`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
        const state = await lockYouTubeCompliance(tx, userId);
        if (!compatibleYouTubeOperation(state, fence, await youtubeDatabaseNow(tx))) return { ok: false, reason: "superseded" };
      }
      const saved = await tx.platformToken.update({ where: { userId_platform: { userId, platform: "youtube" } }, data: {
        accessToken: parsed.accessToken, refreshToken: parsed.refreshToken ?? latest.refreshToken,
        expiresAt: parsed.expiresAt, ...(parsed.scopes !== null ? { scopes: parsed.scopes } : {}),
        updatedAt: nextVersion(latest),
      } });
      return { ok: true, accessToken: parsed.accessToken, ...(periodic ? { credential: saved } : {}) };
    });
}
