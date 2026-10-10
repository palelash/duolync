"use server";

/**
 * app/actions/tiktok-disconnect.ts
 *
 * Server action for explicit TikTok disconnect + local data deletion.
 *
 * Security:
 *   - Accepts NO userId argument. The user identity is always derived from
 *     the current session. A client can never trigger disconnect for another user.
 *   - Platform is hardcoded as "tiktok" — cannot be supplied by the client.
 *   - Access token and client secret never leave the server-only revoke helper.
 *   - No raw Prisma errors or provider detail are returned to the client.
 *
 * Explicit disconnect contract (see spec §6, §7, §8):
 *
 *   1. Authenticate session.
 *   2. Check whether local TikTok PlatformToken exists.
 *   3. If token exists: call revokeTikTokAuthorization FIRST.
 *      - revoked / already_revoked / not_connected → proceed with cleanup.
 *      - temporary_failure / configuration_error   → return error; NO local deletion.
 *   4. Perform full local TikTok cleanup in ONE atomic Prisma transaction:
 *        A. deleteMany PlatformToken (no-op safe)
 *        B. deleteMany PlatformStats
 *        C. deleteMany SocialPost for this creator
 *        D. array_remove "tiktok" from connectedPlatforms (atomic PostgreSQL)
 *        E. Recompute follower cache from remaining PlatformStats
 *        F. If no connected platforms remain → set lastSyncedAt = null
 *
 * Idempotency (see spec §7):
 *   - No token, no stats, no posts → success (nothing to do).
 *   - No token but historical TikTok data remains → skip provider revoke,
 *     delete history, return success.
 *   - Second disconnect after successful first → success.
 *
 * Dead-auth vs explicit disconnect (see spec §15):
 *   This action MUST NOT be called from the background token lifecycle.
 *   The background lifecycle preserves PlatformStats and SocialPost rows.
 *   Only explicit user disconnect deletes them.
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { lockYouTubeOwner as lockTikTokOwner } from "@/lib/youtube-lock";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { revokeTikTokAuthorization } from "@/lib/tiktok-revoke";
import { computeFollowerCache } from "@/lib/creator-metrics";

// ── Public result type ─────────────────────────────────────────────────────────

/**
 * Client-safe semantic result.
 *
 * Never contains: access token, refresh token, client secret, raw TikTok body,
 * error_description, or any provider detail string.
 */
export type TikTokDisconnectResult =
  | { ok: true }
  | { ok: false; reason: "unauthorized" }
  | { ok: false; reason: "temporary_failure" }
  | { ok: false; reason: "configuration_error" };

// ── Action ─────────────────────────────────────────────────────────────────────

/**
 * Explicitly disconnects TikTok for the currently authenticated creator.
 *
 * Revokes Duolync's TikTok authorization at the provider level before deleting
 * any local data. If revocation fails transiently, local data is preserved so
 * the user can retry.
 */
export async function disconnectTikTokAction(): Promise<TikTokDisconnectResult> {
  // ── Step 1: Authenticate session ──────────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthorized" };
  }

  // session.user.id is the sole authoritative user identifier.
  // The caller cannot inject or override it.
  const userId = session.user.id;

  // ── Step 2: Check whether local TikTok data/token exists ──────────────────
  const [platformToken, creator] = await Promise.all([
    db.platformToken.findUnique({
      where: { userId_platform: { userId, platform: "tiktok" } },
      select: { id: true },
    }),
    db.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    }),
  ]);

  // ── Step 3: If PlatformToken exists, attempt provider revoke FIRST ─────────
  //
  // We must not delete the token before revoking — if we did, we would lose
  // the ability to call TikTok revoke on a successful retry.
  if (platformToken) {
    const revokeResult = await revokeTikTokAuthorization(userId);

    // Preserve local data on any transient or configuration failure.
    // The user must be able to retry.
    if (revokeResult === "temporary_failure") {
      return { ok: false, reason: "temporary_failure" };
    }
    if (revokeResult === "configuration_error") {
      return { ok: false, reason: "configuration_error" };
    }

    // revokeResult is one of: "revoked", "already_revoked", "not_connected".
    // All three confirm that the provider authorization is gone or was never
    // active — safe to proceed with full local cleanup.
  }

  // ── Step 4: Full local TikTok cleanup in ONE atomic transaction ────────────
  //
  // All deletions are inside a single Prisma interactive transaction.
  // If the transaction fails or is rolled back, NO partial deletion occurs —
  // the database state is either fully cleaned up or entirely intact.
  try {
    await db.$transaction(async (tx) => {
      // Match sync/refresh and claims: User -> token -> profile -> datasets.
      await lockTikTokOwner(tx, userId);
      await tx.$queryRaw`SELECT "id" FROM "PlatformToken" WHERE "userId" = ${userId} AND "platform" = 'tiktok' FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
      // A. Delete TikTok PlatformToken (deleteMany is no-op safe when absent).
      await tx.platformToken.deleteMany({
        where: { userId, platform: "tiktok" },
      });

      // B. Delete TikTok PlatformStats.
      await tx.platformStats.deleteMany({
        where: { userId, platform: "tiktok" },
      });

      // C. Delete TikTok SocialPost rows for this creator.
      //    Scoped to {creatorProfileId, platform:"tiktok"} — other platforms untouched.
      if (creator) {
        await tx.socialPost.deleteMany({
          where: { creatorProfileId: creator.id, platform: "tiktok" },
        });

        // C2. Delete TikTok CreatorContentCuration rows.
        //     Explicit disconnect means the creator asked to remove TikTok local data.
        //     Reconnect must NOT silently restore the old curated TikTok portfolio.
        //     Background dead-auth MUST NOT call this action — it preserves curation.
        await tx.creatorContentCuration.deleteMany({
          where: { creatorProfileId: creator.id, platform: "tiktok" },
        });
      }

      // D. Atomically remove "tiktok" from connectedPlatforms using PostgreSQL
      //    array_remove. This is:
      //    - atomic: no stale read-modify-write in JavaScript
      //    - idempotent: safe to call when "tiktok" is already absent
      //    - user-scoped: only touches this user's row
      //    - non-destructive: preserves every other platform entry
      //    Does NOT touch primaryPlatform, socialLinks, bio, niche, topNiches,
      //    or any other CreatorProfile field.
      await tx.$executeRaw`
        UPDATE "CreatorProfile"
        SET    "connectedPlatforms" = array_remove("connectedPlatforms", 'tiktok')
        WHERE  "userId" = ${userId}
      `;

      // E. Recompute follower cache from the remaining PlatformStats rows
      //    INSIDE the transaction so the just-deleted TikTok row is excluded.
      const remainingStats = await tx.platformStats.findMany({
        where: { userId },
        select: { followerCount: true },
      });
      const cachedFollowers = computeFollowerCache(remainingStats);

      // F. Determine whether any connected platforms remain using DB state
      //    read from inside the same transaction (not a stale pre-transaction
      //    JavaScript array).
      const updatedProfile = await tx.creatorProfile.findUnique({
        where: { userId },
        select: { connectedPlatforms: true },
      });
      const hasRemainingPlatforms =
        (updatedProfile?.connectedPlatforms ?? []).length > 0;

      // G. Update CreatorProfile:
      //    - followerCount: recomputed cache (null when no valid counts remain)
      //    - lastSyncedAt: cleared only when no connected platforms remain;
      //      preserved when other platforms still exist so their sync state is
      //      not accidentally cleared.
      await tx.creatorProfile.update({
        where: { userId },
        data: {
          followerCount: cachedFollowers ?? null,
          ...(!hasRemainingPlatforms ? { lastSyncedAt: null } : {}),
        },
      });
    });
  } catch {
    // Transaction timed out, DB error, or deadlock — Prisma rolled back.
    // No partial deletion occurred. The PlatformToken, PlatformStats, and
    // SocialPost rows are all intact.
    console.warn(
      "[tiktok-disconnect] cleanup transaction failed (details omitted)",
    );
    return { ok: false, reason: "temporary_failure" };
  }

  // ── Step 5: Revalidate affected pages ─────────────────────────────────────
  revalidatePath("/creator/presence");
  revalidatePath("/creator/accounts");
  revalidatePath("/creator/dashboard");

  return { ok: true };
}
