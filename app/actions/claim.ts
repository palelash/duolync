"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma";
import { headers } from "next/headers";
import { sendClaimSubmittedEmail, sendClaimApprovedEmail, sendClaimRejectedEmail } from "@/lib/email";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

async function requireAdmin() {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("Unauthorized");
  return user;
}

async function notifyAdmins(title: string, body: string, link: string) {
  try {
    const admins = await db.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        db.notification.create({
          data: { userId: admin.id, type: "SYSTEM", title, body, link },
        }),
      ),
    );
  } catch {
    // Non-blocking: admin notification failure must not break the claim action
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClaimResult =
  | { success: true; error: null }
  | { success: false; error: string };

export interface PendingClaim {
  id: string;
  status: string;
  requiresMerge: boolean;
  evidenceNote: string | null;
  evidenceEmail: string | null;
  evidencePlatform: string | null;
  evidenceHandle: string | null;
  requestedAt: string;
  rejectionReason: string | null;
  requester: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  creatorProfile: {
    id: string;
    importedEmail: string | null;
    bio: string | null;
    niche: string | null;
    claimStatus: string;
    profileOrigin: string;
    user: {
      id: string;
      name: string | null;
    };
  };
}

// ─── A. Request claim ─────────────────────────────────────────────────────────

export async function requestProfileClaimAction(
  profileId: string,
  evidence?: {
    evidenceNote?: string;
    evidenceEmail?: string;
    evidencePlatform?: string;
    evidenceHandle?: string;
  },
): Promise<ClaimResult> {
  let currentUser: Awaited<ReturnType<typeof requireSession>>;
  try {
    currentUser = await requireSession();
  } catch {
    return { success: false, error: "You must be signed in to claim a profile." };
  }

  // ── Eligibility checks — fetch live user data (session may miss isImported) ─
  const dbUser = await db.user.findUnique({
    where: { id: currentUser.id },
    select: { isImported: true, role: true, banned: true, emailVerified: true },
  });
  if (!dbUser) {
    return { success: false, error: "User not found." };
  }
  if (dbUser.isImported) {
    return { success: false, error: "Imported accounts cannot submit claim requests." };
  }
  if (dbUser.role !== Role.CREATOR) {
    return { success: false, error: "Only creator accounts can claim profiles." };
  }
  if (dbUser.banned) {
    return { success: false, error: "Your account is suspended." };
  }
  if (!dbUser.emailVerified) {
    return { success: false, error: "Please verify your email address before claiming a profile." };
  }

  // ── Rate limit: max 3 claim requests per user per 24 hours ────────────────
  const { rateLimit } = await import("@/lib/rate-limit");
  const allowed = await rateLimit(`${currentUser.id}:request-claim`, 3, 24 * 60 * 60_000);
  if (!allowed) {
    return { success: false, error: "You have submitted too many claim requests. Please try again in 24 hours." };
  }

  // ── Validate target profile ───────────────────────────────────────────────
  const targetProfile = await db.creatorProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      profileOrigin: true,
      claimStatus: true,
      userId: true,
    },
  });

  if (!targetProfile) {
    return { success: false, error: "Profile not found." };
  }
  if (targetProfile.profileOrigin !== "IMPORTED") {
    return { success: false, error: "This profile is not eligible for claiming." };
  }
  if (targetProfile.claimStatus !== "UNCLAIMED") {
    return { success: false, error: "This profile already has a pending or completed claim." };
  }
  if (targetProfile.userId === currentUser.id) {
    return { success: false, error: "You cannot claim your own profile." };
  }

  // ── Check if requester already has a CreatorProfile (Scenario B) ──────────
  const existingProfile = await db.creatorProfile.findUnique({
    where: { userId: currentUser.id },
    select: { id: true },
  });
  const requiresMerge = existingProfile !== null;

  // ── Atomic: UNCLAIMED → CLAIM_PENDING + create ProfileClaim ──────────────
  // The partial unique index prevents duplicate PENDING claims for the same profile.
  try {
    await db.$transaction(async (tx) => {
      // Re-read inside transaction to prevent race condition
      const locked = await tx.creatorProfile.findUnique({
        where: { id: profileId },
        select: { claimStatus: true },
      });
      if (!locked || locked.claimStatus !== "UNCLAIMED") {
        throw new Error("This profile is no longer available for claiming.");
      }

      await tx.creatorProfile.update({
        where: { id: profileId },
        data: { claimStatus: "CLAIM_PENDING" },
      });

      await tx.profileClaim.create({
        data: {
          creatorProfileId: profileId,
          requesterUserId: currentUser.id,
          status: "PENDING",
          requiresMerge,
          evidenceNote: evidence?.evidenceNote?.trim() || null,
          evidenceEmail: evidence?.evidenceEmail?.trim() || null,
          evidencePlatform: evidence?.evidencePlatform?.trim() || null,
          evidenceHandle: evidence?.evidenceHandle?.trim() || null,
        },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no longer available") || msg.includes("Unique constraint")) {
      return { success: false, error: "This profile already has a pending claim. Please try a different profile." };
    }
    console.error("[requestProfileClaimAction]", err);
    return { success: false, error: "Failed to submit claim. Please try again." };
  }

  // ── In-app notification to requester ─────────────────────────────────────
  try {
    await db.notification.create({
      data: {
        userId: currentUser.id,
        type: "SYSTEM",
        title: "Claim request submitted",
        body: "Your profile claim request has been submitted and is under review. We'll notify you once it's resolved.",
        link: `/claim/${profileId}/pending`,
      },
    });
  } catch {
    // Non-blocking
  }

  // ── Notify admins ─────────────────────────────────────────────────────────
  await notifyAdmins(
    "New profile claim request",
    `A creator has submitted a claim request for an imported profile.${requiresMerge ? " (MERGE REQUIRED)" : ""}`,
    "/admin/claims",
  );

  // ── Email to requester (best-effort) ──────────────────────────────────────
  try {
    const requesterUser = await db.user.findUnique({
      where: { id: currentUser.id },
      select: { email: true, name: true },
    });
    if (requesterUser) {
      await sendClaimSubmittedEmail({
        to: requesterUser.email,
        name: requesterUser.name ?? requesterUser.email,
        claimStatusUrl: `${process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/claim/${profileId}/pending`,
      });
    }
  } catch {
    // Email failure must not break the action
  }

  return { success: true, error: null };
}

// ─── B. Get pending claims (admin) ────────────────────────────────────────────

export async function getPendingClaimsAction(): Promise<{
  data: PendingClaim[];
  error: string | null;
}> {
  try {
    await requireAdmin();
  } catch {
    return { data: [], error: "Unauthorized" };
  }

  const claims = await db.profileClaim.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    select: {
      id: true,
      status: true,
      requiresMerge: true,
      evidenceNote: true,
      evidenceEmail: true,
      evidencePlatform: true,
      evidenceHandle: true,
      requestedAt: true,
      rejectionReason: true,
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      creatorProfile: {
        select: {
          id: true,
          importedEmail: true,
          bio: true,
          niche: true,
          claimStatus: true,
          profileOrigin: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return {
    data: claims.map((c) => ({
      ...c,
      requestedAt: c.requestedAt.toISOString(),
    })),
    error: null,
  };
}

// ─── C. Approve claim (admin) ─────────────────────────────────────────────────

export async function approveProfileClaimAction(claimId: string): Promise<
  ClaimResult & { requiresMerge?: boolean; conflicts?: string[] }
> {
  let adminUser: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    adminUser = await requireAdmin();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // ── 1. Lock and re-read the claim ─────────────────────────────────────
      const claim = await tx.profileClaim.findUnique({
        where: { id: claimId },
        select: {
          id: true,
          status: true,
          requesterUserId: true,
          creatorProfileId: true,
          requiresMerge: true,
          creatorProfile: {
            select: {
              id: true,
              claimStatus: true,
              profileOrigin: true,
              userId: true,
            },
          },
        },
      });

      if (!claim) throw new Error("CLAIM_NOT_FOUND");
      if (claim.status !== "PENDING") throw new Error("CLAIM_NOT_PENDING");
      if (!claim.requesterUserId) throw new Error("CLAIM_NO_REQUESTER");

      const { requesterUserId, creatorProfileId } = claim;
      const placeholderUserId = claim.creatorProfile.userId;

      // ── 2. Re-validate target profile ────────────────────────────────────
      if (claim.creatorProfile.claimStatus !== "CLAIM_PENDING") throw new Error("PROFILE_NOT_PENDING");
      if (claim.creatorProfile.profileOrigin !== "IMPORTED") throw new Error("PROFILE_NOT_IMPORTED");

      // ── 3. Re-validate requester (live DB — do NOT trust cached state) ────
      const requester = await tx.user.findUnique({
        where: { id: requesterUserId },
        select: {
          id: true,
          isImported: true,
          banned: true,
          emailVerified: true,
          name: true,
          email: true,
        },
      });
      if (!requester) throw new Error("REQUESTER_NOT_FOUND");
      if (requester.isImported) throw new Error("REQUESTER_IS_IMPORTED");
      if (requester.banned) throw new Error("REQUESTER_BANNED");

      // ── 4. ALWAYS recompute requiresMerge from live DB state ──────────────
      //     Never trust ProfileClaim.requiresMerge as authoritative.

      const requesterProfile = await tx.creatorProfile.findUnique({
        where: { userId: requesterUserId },
        select: { id: true },
      });
      const hasExistingProfile = requesterProfile !== null;

      const [placeholderTokens, requesterTokens, placeholderStats, requesterStats] = await Promise.all([
        tx.platformToken.findMany({ where: { userId: placeholderUserId }, select: { platform: true } }),
        tx.platformToken.findMany({ where: { userId: requesterUserId }, select: { platform: true } }),
        tx.platformStats.findMany({ where: { userId: placeholderUserId }, select: { platform: true } }),
        tx.platformStats.findMany({ where: { userId: requesterUserId }, select: { platform: true } }),
      ]);

      const requesterTokenPlatforms = new Set(requesterTokens.map((t) => t.platform));
      const requesterStatPlatforms = new Set(requesterStats.map((s) => s.platform));

      const tokenConflicts = placeholderTokens
        .map((t) => t.platform)
        .filter((p) => requesterTokenPlatforms.has(p));
      const statConflicts = placeholderStats
        .map((s) => s.platform)
        .filter((p) => requesterStatPlatforms.has(p));

      const liveConflicts = [...new Set([...tokenConflicts, ...statConflicts])];
      const liveRequiresMerge = hasExistingProfile || liveConflicts.length > 0;

      if (liveRequiresMerge) {
        // Update the cache on the claim row and abort
        await tx.profileClaim.update({
          where: { id: claimId },
          data: { requiresMerge: true },
        });
        return { requiresMerge: true, conflicts: liveConflicts.length > 0 ? liveConflicts : ["existing_profile"] };
      }

      // ── 5. Ownership reassignment ─────────────────────────────────────────
      await tx.creatorProfile.update({
        where: { id: creatorProfileId },
        data: {
          userId: requesterUserId,
          claimStatus: "CLAIMED",
          claimedByUserId: requesterUserId,
          claimedAt: new Date(),
          // Reset moderation so the claimed profile cannot auto-inherit marketplace-approved status
          moderationStatus: "PENDING",
          moderatedAt: null,
          moderationNote: null,
        },
      });

      // ── 6. Migrate PlatformToken + PlatformStats (no conflicts confirmed) ─
      await tx.platformToken.updateMany({
        where: { userId: placeholderUserId },
        data: { userId: requesterUserId },
      });
      await tx.platformStats.updateMany({
        where: { userId: placeholderUserId },
        data: { userId: requesterUserId },
      });

      // ── 7. Delete placeholder credential Account rows only ────────────────
      //     Do NOT delete the placeholder User row (preserves audit trail).
      await tx.account.deleteMany({
        where: { userId: placeholderUserId, providerId: "credential" },
      });

      // ── 8. Create URL alias for the old placeholder URL ───────────────────
      await tx.profileAlias.upsert({
        where: { fromUserId: placeholderUserId },
        create: { fromUserId: placeholderUserId, creatorProfileId },
        update: {}, // idempotent: alias already exists for this placeholder
      });

      // ── 9. Mark claim as approved ─────────────────────────────────────────
      await tx.profileClaim.update({
        where: { id: claimId },
        data: {
          status: "APPROVED",
          reviewedByUserId: adminUser.id,
          reviewedAt: new Date(),
          requiresMerge: false,
        },
      });

      return {
        requiresMerge: false,
        conflicts: [],
        requester: { id: requester.id, name: requester.name, email: requester.email },
        claimId,
        profileId: creatorProfileId,
      };
    });

    if (result.requiresMerge) {
      return {
        success: false,
        error: `Merge required — cannot approve automatically. Conflicts: ${(result.conflicts ?? []).join(", ")}`,
        requiresMerge: true,
        conflicts: result.conflicts,
      };
    }

    // ── Post-approval: notifications (non-transactional, best-effort) ────────
    const approvedResult = result as {
      requiresMerge: false;
      conflicts: string[];
      requester: { id: string; name: string | null; email: string };
      claimId: string;
      profileId: string;
    };

    try {
      await db.notification.create({
        data: {
          userId: approvedResult.requester.id,
          type: "SYSTEM",
          title: "Your profile claim was approved!",
          body: "Congratulations! Your claim has been approved. The imported profile is now yours. Complete your onboarding to finish setting up.",
          link: "/onboarding",
        },
      });
    } catch {
      // Non-blocking
    }

    try {
      await sendClaimApprovedEmail({
        to: approvedResult.requester.email,
        name: approvedResult.requester.name ?? approvedResult.requester.email,
        onboardingUrl: `${process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/onboarding`,
      });
    } catch {
      // Email failure must not break the action
    }

    return { success: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const errorMessages: Record<string, string> = {
      CLAIM_NOT_FOUND: "Claim not found.",
      CLAIM_NOT_PENDING: "This claim is no longer pending.",
      CLAIM_NO_REQUESTER: "The requester account no longer exists.",
      PROFILE_NOT_PENDING: "The target profile is no longer in the pending claim state.",
      PROFILE_NOT_IMPORTED: "The target profile is not an imported profile.",
      REQUESTER_NOT_FOUND: "The requester account no longer exists.",
      REQUESTER_IS_IMPORTED: "The requester is an imported account and cannot own a profile.",
      REQUESTER_BANNED: "The requester account is suspended.",
    };
    console.error("[approveProfileClaimAction]", err);
    return {
      success: false,
      error: errorMessages[msg] ?? "Failed to approve claim. Please try again.",
    };
  }
}

// ─── D. Reject claim (admin) ──────────────────────────────────────────────────

export async function rejectProfileClaimAction(
  claimId: string,
  reason?: string,
): Promise<ClaimResult> {
  let adminUser: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    adminUser = await requireAdmin();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const claim = await db.$transaction(async (tx) => {
      const c = await tx.profileClaim.findUnique({
        where: { id: claimId },
        select: {
          id: true,
          status: true,
          requesterUserId: true,
          creatorProfileId: true,
        },
      });
      if (!c) throw new Error("CLAIM_NOT_FOUND");
      if (c.status !== "PENDING") throw new Error("CLAIM_NOT_PENDING");

      // Reset the target profile to UNCLAIMED
      await tx.creatorProfile.update({
        where: { id: c.creatorProfileId },
        data: { claimStatus: "UNCLAIMED" },
      });

      // Mark claim as rejected
      await tx.profileClaim.update({
        where: { id: claimId },
        data: {
          status: "REJECTED",
          reviewedByUserId: adminUser.id,
          reviewedAt: new Date(),
          rejectionReason: reason?.trim() || null,
        },
      });

      return c;
    });

    // ── Post-rejection notifications (best-effort) ────────────────────────
    if (claim.requesterUserId) {
      try {
        await db.notification.create({
          data: {
            userId: claim.requesterUserId,
            type: "SYSTEM",
            title: "Your profile claim was not approved",
            body: reason
              ? `Your claim request was reviewed and declined: ${reason}`
              : "Your claim request was reviewed and could not be approved at this time. You can still create your own creator profile.",
            link: "/onboarding",
          },
        });
      } catch {
        // Non-blocking
      }

      try {
        const requesterUser = await db.user.findUnique({
          where: { id: claim.requesterUserId },
          select: { email: true, name: true },
        });
        if (requesterUser) {
          await sendClaimRejectedEmail({
            to: requesterUser.email,
            name: requesterUser.name ?? requesterUser.email,
            reason: reason?.trim() || undefined,
            onboardingUrl: `${process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/onboarding`,
          });
        }
      } catch {
        // Email failure must not break the action
      }
    }

    return { success: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "CLAIM_NOT_FOUND") return { success: false, error: "Claim not found." };
    if (msg === "CLAIM_NOT_PENDING") return { success: false, error: "This claim is no longer pending." };
    console.error("[rejectProfileClaimAction]", err);
    return { success: false, error: "Failed to reject claim. Please try again." };
  }
}

// ─── E. Get claim status for the current user (for /claim/[id]/pending) ───────

export async function getMyClaimStatusAction(profileId: string): Promise<{
  claim: {
    id: string;
    status: string;
    requestedAt: string;
    requiresMerge: boolean;
    rejectionReason: string | null;
  } | null;
  error: string | null;
}> {
  let userId: string;
  try {
    const user = await requireSession();
    userId = user.id;
  } catch {
    return { claim: null, error: "Unauthorized" };
  }

  const claim = await db.profileClaim.findFirst({
    where: { creatorProfileId: profileId, requesterUserId: userId },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      status: true,
      requestedAt: true,
      requiresMerge: true,
      rejectionReason: true,
    },
  });

  return {
    claim: claim
      ? { ...claim, requestedAt: claim.requestedAt.toISOString() }
      : null,
    error: null,
  };
}
