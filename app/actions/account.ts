"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { revokeTikTokAuthorization } from "@/lib/tiktok-revoke";
import { prepareYouTubeAccountDeletion, assertYouTubeAccountDeletion, isYouTubeRevokeConfirmationUnavailable } from "@/lib/youtube-revoke";

export type DeleteAccountResult =
  | { success: true; error: null }
  | { success: false; error: string };

/**
 * Permanently deletes the authenticated user and all cascaded relations
 * (profiles, sessions, accounts, tokens, messages, etc.).
 *
 * Guards:
 * 1. CLAIMED profile owner → blocked (soft block: contact support)
 * 2. PENDING claim requester → transactionally cancel claims + reset target
 *    profile claimStatus before deletion
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return { success: false, error: "Unauthorized" };
  }

  const userId = session.user.id;

  try {
    // ── Guard 1: Block if user owns a CLAIMED CreatorProfile ─────────────────
    // Deleting this user triggers onDelete: Cascade on CreatorProfile.userId,
    // which would destroy the entire claimed profile and cascade to
    // Applications, Contracts, SocialPosts, etc.
    const claimedProfile = await db.creatorProfile.findFirst({
      where: { userId, claimStatus: "CLAIMED" },
      select: { id: true },
    });
    if (claimedProfile) {
      return {
        success: false,
        error:
          "Your account owns a claimed creator profile. Please contact support to transfer or remove your profile before deleting your account.",
      };
    }

    // Provider HTTP stays outside DB transactions. On failure, keep the
    // account and credential for retry. Existing cascades remove YouTube data.
    let youtube = await prepareYouTubeAccountDeletion(userId);
    if (youtube.error) return { success: false, error: youtube.error };

    // ── TikTok revoke (OUTSIDE delete transaction) ────────────────────────────
    // Only reached after the claimed-profile guard — a deletion that is already
    // forbidden must not revoke the user's TikTok connection while leaving their
    // Duolync account intact.
    const revokeResult = await revokeTikTokAuthorization(userId);

    switch (revokeResult) {
      case "temporary_failure":
        return {
          success: false,
          error:
            "Your account was not deleted because TikTok authorization could not be revoked. Please try again.",
        };

      case "configuration_error":
        return {
          success: false,
          error:
            "Your account was not deleted because TikTok authorization could not be revoked. Please contact support.",
        };

      case "revoked": {
        // TikTok authorization is now dead at TikTok's end, but the local
        // PlatformToken row still exists. Remove it in its own committed
        // operation BEFORE the user-delete transaction so that a later retry
        // (if the subsequent user delete fails) sees not_connected and can
        // proceed safely without attempting to re-revoke an already-dead grant.
        try {
          await db.platformToken.deleteMany({
            where: { userId, platform: "tiktok" },
          });
        } catch (tokenErr) {
          console.error(
            "[deleteAccount] Failed to delete TikTok PlatformToken after revoke",
            tokenErr,
          );
          return { success: false, error: "Failed to delete account" };
        }
        break;
      }

      // already_revoked / not_connected — authorization is already gone or
      // never existed; safe to proceed without extra cleanup.
      case "already_revoked":
      case "not_connected":
        break;
    }

    // ── Guard 2: Cancel any PENDING claims before deleting ────────────────────
    // If left unhandled, ProfileClaim.requesterUserId would be set to NULL by
    // onDelete: SetNull, but CreatorProfile.claimStatus would remain CLAIM_PENDING
    // — an invalid orphaned state.
    // One bounded recovery retry if expiry/pruning wins receipt consumption.
    // The failed transaction has rolled back before any provider probe runs.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await db.$transaction(async (tx) => {
          // Consume exact confirmation atomically with the final cascade.
          await assertYouTubeAccountDeletion(tx, userId, youtube.credential);
          const pendingClaims = await tx.profileClaim.findMany({
            where: { requesterUserId: userId, status: "PENDING" },
            select: { id: true, creatorProfileId: true },
          });

          for (const claim of pendingClaims) {
            await tx.profileClaim.update({
              where: { id: claim.id },
              data: { status: "CANCELLED" },
            });
            // Reset the target profile so other users can submit a new claim
            await tx.creatorProfile.updateMany({
              where: { id: claim.creatorProfileId, claimStatus: "CLAIM_PENDING" },
              data: { claimStatus: "UNCLAIMED" },
            });
          }

          await tx.user.delete({ where: { id: userId } });
        });
        break;
      } catch (error) {
        if (attempt !== 0 || !isYouTubeRevokeConfirmationUnavailable(error)) throw error;
        youtube = await prepareYouTubeAccountDeletion(userId);
        if (youtube.error) return { success: false, error: youtube.error };
      }
    }

    // Session row is cascade-deleted; clear the auth cookie on the client response.
    try {
      await auth.api.signOut({ headers: await headers() });
    } catch {
      // Cookie cleanup is best-effort after the user record is gone.
    }

    return { success: true, error: null };
  } catch (err) {
    console.error("[deleteAccount]", err);
    return { success: false, error: "Failed to delete account" };
  }
}
