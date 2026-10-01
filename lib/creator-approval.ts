import type { ModerationStatus, ProfileOrigin, ClaimStatus } from "@/lib/generated/prisma";

/**
 * Computes whether a creator profile should receive the marketplace-approved badge.
 *
 * Rules:
 * - `moderationStatus` must be APPROVED (admin has reviewed and approved the profile).
 * - The profile must belong to a genuinely registered or claimed account:
 *   - REGISTERED  → the creator signed up directly on Duolync.
 *   - CLAIMED     → an imported stub that a real user has since claimed.
 *
 * Imported + UNCLAIMED profiles are explicitly excluded even when their
 * moderationStatus is APPROVED, because the import pipeline sets APPROVED
 * wholesale — no human being has registered, verified ownership, or connected
 * a real account on those stubs.
 *
 * This does NOT represent identity verification or KYC.
 */
export function computeIsMarketplaceApproved(fields: {
  moderationStatus: ModerationStatus;
  profileOrigin: ProfileOrigin;
  claimStatus: ClaimStatus;
}): boolean {
  return (
    fields.moderationStatus === "APPROVED" &&
    (fields.profileOrigin === "REGISTERED" || fields.claimStatus === "CLAIMED")
  );
}
