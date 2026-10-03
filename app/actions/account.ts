"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";

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

    // ── Guard 2: Cancel any PENDING claims before deleting ────────────────────
    // If left unhandled, ProfileClaim.requesterUserId would be set to NULL by
    // onDelete: SetNull, but CreatorProfile.claimStatus would remain CLAIM_PENDING
    // — an invalid orphaned state.
    await db.$transaction(async (tx) => {
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
