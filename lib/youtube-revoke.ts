import "server-only";
import { createHash } from "node:crypto";
import type { PlatformToken, Prisma } from "@/lib/generated/prisma";
import { db } from "@/lib/db";
import { lockYouTubeOwner } from "@/lib/youtube-lock";
import { sameYouTubeCredentialVersion, probeYouTubeAuthorization } from "@/lib/youtube-token";
import { youtubeFetch } from "@/lib/youtube-auth";

export type YouTubeRevokeResult =
  | { state: "success"; credential: PlatformToken; authorizationRevoked: boolean }
  | { state: "authorization_gone"; credential: null }
  | { state: "temporary_failure" | "provider_failure" | "configuration_failure" | "connection_changed" };

async function lockCredential(tx: Prisma.TransactionClient, userId: string) {
  await lockYouTubeOwner(tx, userId);
  const rows = await tx.$queryRaw<PlatformToken[]>`
    SELECT * FROM "PlatformToken" WHERE "userId" = ${userId} AND "platform" = 'youtube' FOR UPDATE
  `;
  return rows[0] ?? null;
}

// Fail closed if deployment configuration no longer establishes isolation.
// Different OAuth clients in the SAME project do not isolate revocation.
export function hasIsolatedYouTubeProject(): boolean {
  const project = (id: string | undefined) => id?.match(/^(\d+)-[a-z0-9]+\.apps\.googleusercontent\.com$/)?.[1];
  const youtube = project(process.env.YOUTUBE_CLIENT_ID);
  const login = project(process.env.GOOGLE_CLIENT_ID);
  return !!youtube && !!login && youtube !== login;
}

// One operation per owner, separate from OAuth state and Better Auth records.
// SHA-256 binds every field used by sameYouTubeCredentialVersion plus the owner.
// Only fingerprints and proof types are stored; never raw credentials.
const RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function receiptId(userId: string): string { return `youtube-revoke:${digest(userId)}`; }
function credentialFingerprint(userId: string, credential: PlatformToken): string {
  return digest(JSON.stringify([userId, credential.id, credential.platformUserId,
    new Date(credential.updatedAt).toISOString(), credential.accessToken, credential.refreshToken]));
}
type Receipt = { version: string; state: "PENDING" | "CONFIRMED"; proof?: "provider_revoked" | "dead_auth" };
function parseReceipt(value: string): Receipt | null {
  try {
    const record = JSON.parse(value);
    return typeof record?.version === "string" && /^[a-f0-9]{64}$/.test(record.version) &&
      (record.state === "PENDING" || (record.state === "CONFIRMED" &&
        (record.proof === "provider_revoked" || record.proof === "dead_auth"))) ? record : null;
  } catch { return null; }
}
async function writeReceipt(tx: Prisma.TransactionClient, userId: string, record: Receipt) {
  const id = receiptId(userId), value = JSON.stringify(record), expiresAt = new Date(Date.now() + RECEIPT_TTL_MS);
  await tx.verification.upsert({ where: { id },
    create: { id, identifier: id, value, expiresAt }, update: { value, expiresAt } });
}

/** Non-consuming inspection under owner/token coordination. Destructive callers
 * must use consumeConfirmedYouTubeRevoke; a read alone cannot defeat pruning.
 */
export async function hasConfirmedYouTubeRevoke(tx: Prisma.TransactionClient, userId: string,
  credential: PlatformToken): Promise<boolean> {
  const row = await tx.verification.findUnique({ where: { id: receiptId(userId) } });
  const record = row && parseReceipt(row.value);
  return !!row && row.expiresAt > new Date() && record?.state === "CONFIRMED" &&
    record.version === credentialFingerprint(userId, credential);
}

/** Conditional deletion takes the receipt row lock and proves consumption in
 * this transaction. A pruner winning after the read makes this fail closed.
 * Caller holds User -> token -> profile; rollback restores the consumed proof.
 */
export async function consumeConfirmedYouTubeRevoke(tx: Prisma.TransactionClient, userId: string,
  credential: PlatformToken): Promise<boolean> {
  const id = receiptId(userId);
  const row = await tx.verification.findUnique({ where: { id } });
  const record = row && parseReceipt(row.value);
  if (!row || record?.state !== "CONFIRMED" ||
    record.version !== credentialFingerprint(userId, credential)) return false;
  // Database wall-clock time also rejects expiry while waiting to execute SQL;
  // transaction-start time (NOW) would allow an already-expired receipt.
  const consumed = await tx.$queryRaw<{ id: string }[]>`
    DELETE FROM "Verification"
    WHERE "id" = ${id} AND "identifier" = ${id} AND "value" = ${row.value}
      AND "expiresAt" > clock_timestamp()
    RETURNING "id"
  `;
  return consumed.length === 1;
}

export function requireYouTubeRevokeConfirmation(consumed: boolean): void {
  if (!consumed) throw new Error("youtube_revoke_confirmation_unavailable");
}

export function isYouTubeRevokeConfirmationUnavailable(error: unknown): boolean {
  return !!error && typeof error === "object" &&
    "message" in error && error.message === "youtube_revoke_confirmation_unavailable";
}

/** Receipt deletion must commit/roll back with the corresponding local cleanup.
 * An exact value predicate also protects a newer operation for the same owner.
 */
export async function deleteYouTubeRevokeReceipt(tx: Prisma.TransactionClient, userId: string,
  credential: PlatformToken | null): Promise<void> {
  const id = receiptId(userId);
  const row = await tx.verification.findUnique({ where: { id } });
  if (!row) return;
  const record = parseReceipt(row.value);
  if (!credential || record?.version === credentialFingerprint(userId, credential)) {
    await tx.verification.deleteMany({ where: { id, value: row.value } });
  }
}

/** A: owner-first snapshot + durable PENDING. B: HTTP without DB locks.
 * C: durable CONFIRMED for exactly that version. Callers perform atomic cleanup
 * only after revalidating the current version AND receipt in their transaction.
 * Uncertain/expired operations probe permanent auth errors; PENDING is no proof.
 */
export async function revokeYouTubeAuthorization(userId: string): Promise<YouTubeRevokeResult> {
  try {
    const snapshot = await db.$transaction(async tx => {
      const credential = await lockCredential(tx, userId);
      const id = receiptId(userId);
      const row = await tx.verification.findUnique({ where: { id } });
      const record = row && parseReceipt(row.value);
      if (!credential) {
        return { state: "authorization_gone", credential: null } as const;
      }
      const version = credentialFingerprint(userId, credential);
      if (row && record?.version !== version) {
        await tx.verification.deleteMany({ where: { id, value: row.value } });
        return { state: "connection_changed" } as const;
      }
      if (row && row.expiresAt > new Date() && record?.state === "CONFIRMED") {
        return { state: "success", credential, authorizationRevoked: record.proof === "provider_revoked" } as const;
      }
      if (!hasIsolatedYouTubeProject()) return { state: "configuration_failure" } as const;
      // Expired proof is never reused; its existence requires safe recovery.
      const recover = !!row;
      await writeReceipt(tx, userId, { state: "PENDING", version });
      return { state: "pending", credential, recover } as const;
    }, { maxWait: 5_000, timeout: 15_000 });
    if (snapshot.state !== "pending") return snapshot;
    // Prune outside owner transactions: deleting other owners' expired rows
    // while holding our receipt lock would introduce a cross-owner lock cycle.
    // Only this namespace is touched; no scheduler is introduced.
    await db.verification.deleteMany({ where: { identifier: { startsWith: "youtube-revoke:" },
      expiresAt: { lte: new Date() } } });
    const { credential } = snapshot;
    let token = credential.refreshToken?.trim() ? credential.refreshToken : credential.accessToken;
    let proof: "provider_revoked" | "dead_auth" = "provider_revoked";
    if (snapshot.recover) {
      const authState = await probeYouTubeAuthorization(credential);
      if (authState === "gone") proof = "dead_auth";
      else if (typeof authState === "string") return { state: authState };
      else token = authState.revokeToken;
    }
    if (proof !== "dead_auth") {
      if (!token?.trim()) return { state: "configuration_failure" };
      const response = await youtubeFetch("https://oauth2.googleapis.com/revoke", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      });
      if (response.status === 429 || response.status >= 500) return { state: "temporary_failure" };
      // Missing/pruned proof may leave an already-revoked stored credential.
      // A 400 is never proof: only the exact credential's permanent auth probe
      // can establish dead authorization and justify a fresh confirmation.
      if (response.status === 400) {
        const authState = await probeYouTubeAuthorization(credential);
        if (authState === "gone") proof = "dead_auth";
        else return { state: typeof authState === "string" ? authState : "provider_failure" };
      } else if (response.status !== 200) return { state: "provider_failure" };
    }
    return await db.$transaction(async tx => {
      const current = await lockCredential(tx, userId);
      if (!matchesRevokedYouTubeCredential(current, credential)) {
        await deleteYouTubeRevokeReceipt(tx, userId, credential);
        return { state: "connection_changed" } as const;
      }
      await writeReceipt(tx, userId, { state: "CONFIRMED", version: credentialFingerprint(userId, credential), proof });
      return { state: "success", credential, authorizationRevoked: proof === "provider_revoked" } as const;
    }, { maxWait: 5_000, timeout: 15_000 });
  } catch { return { state: "temporary_failure" }; }
}

export function matchesRevokedYouTubeCredential(current: PlatformToken | null,
  expected: PlatformToken | null): boolean {
  // Absence after an active snapshot is also a version change: a reconnect may
  // have died in the meantime and left newer history. Retry from a fresh snapshot.
  return current === null ? expected === null :
    expected !== null && sameYouTubeCredentialVersion(current, expected);
}

/** Provider preparation only. All local state and proof survive until the final
 * User deletion transaction commits its receipt consumption and FK cascades.
 */
export async function prepareYouTubeAccountDeletion(userId: string): Promise<{
  error: string | null; credential: PlatformToken | null;
}> {
  const result = await revokeYouTubeAuthorization(userId);
  if (result.state !== "success" && result.state !== "authorization_gone") {
    return { credential: null, error: result.state === "configuration_failure"
      ? "Account was not deleted because YouTube authorization could not be revoked. Please contact support."
      : result.state === "connection_changed" ? "YouTube connection changed. Please retry account deletion."
      : "Account was not deleted because YouTube authorization could not be revoked. Please try again." };
  }
  return { error: null, credential: result.credential };
}

export async function assertYouTubeAccountDeletion(tx: Prisma.TransactionClient, userId: string,
  expected: PlatformToken | null): Promise<void> {
  const current = await lockCredential(tx, userId);
  if (!matchesRevokedYouTubeCredential(current, expected))
    throw new Error("YouTube reconnected during deletion. Please retry account deletion.");
  await tx.$queryRaw`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
  if (current) requireYouTubeRevokeConfirmation(await consumeConfirmedYouTubeRevoke(tx, userId, current));
  else await deleteYouTubeRevokeReceipt(tx, userId, null);
}
