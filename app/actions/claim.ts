"use server";

import { guardThreadsClaim } from "@/lib/threads-connection";
import { guardYouTubeClaim, lockClaimOwners } from "@/lib/youtube-claim";
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
      await lockClaimOwners(tx, [targetProfile.userId, currentUser.id]);
      const locked = await tx.creatorProfile.findUnique({ where: { id: profileId },
        select: { claimStatus: true, profileOrigin: true, userId: true } });
      if (!locked || locked.userId !== targetProfile.userId || locked.profileOrigin !== "IMPORTED" || locked.claimStatus !== "UNCLAIMED")
        throw new Error("This profile is no longer available for claiming.");
      const requester = await tx.user.findUnique({ where: { id: currentUser.id },
        select: { isImported: true, role: true, banned: true, emailVerified: true } });
      if (!requester || requester.isImported || requester.role !== "CREATOR" || requester.banned || !requester.emailVerified)
        throw new Error("Claim requester is no longer eligible.");
      const liveProfile = await tx.creatorProfile.findUnique({ where: { userId: currentUser.id }, select: { id: true } });
      await tx.creatorProfile.update({
        where: { id: profileId },
        data: { claimStatus: "CLAIM_PENDING" },
      });

      await tx.profileClaim.create({
        data: {
          creatorProfileId: profileId,
          requesterUserId: currentUser.id,
          status: "PENDING",
          requiresMerge: liveProfile !== null,
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
      const observed = await tx.profileClaim.findUnique({ where: { id: claimId },
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
              moderationStatus: true,
              profileOrigin: true,
              userId: true,
            },
          },
        },
      });
      if (!observed) throw new Error("CLAIM_NOT_FOUND");
      if (!observed.requesterUserId) throw new Error("CLAIM_NO_REQUESTER");
      await guardYouTubeClaim(tx, observed.creatorProfile.userId, observed.requesterUserId, adminUser.id);
      await guardThreadsClaim(tx, observed.creatorProfile.userId, observed.requesterUserId);
      await tx.$queryRaw`SELECT "id" FROM "ProfileClaim" WHERE "id" = ${claimId} FOR UPDATE`;
      const claim = await tx.profileClaim.findUnique({ where: { id: claimId },
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
              moderationStatus: true,
              profileOrigin: true,
              userId: true,
            },
          },
        },
      });
      if (!claim) throw new Error("CLAIM_NOT_FOUND");
      if (claim.status !== "PENDING") throw new Error("CLAIM_NOT_PENDING");
      if (!claim.requesterUserId || claim.requesterUserId !== observed.requesterUserId) throw new Error("CLAIM_NO_REQUESTER");
      if (claim.creatorProfile.userId !== observed.creatorProfile.userId || claim.creatorProfileId !== observed.creatorProfileId)
        throw new Error("PROFILE_NOT_PENDING");
      if (claim.creatorProfile.claimStatus !== "CLAIM_PENDING" || claim.creatorProfile.moderationStatus !== observed.creatorProfile.moderationStatus)
        throw new Error("PROFILE_NOT_PENDING");
      if (claim.creatorProfile.profileOrigin !== "IMPORTED") throw new Error("PROFILE_NOT_IMPORTED");
      const { requesterUserId, creatorProfileId } = claim;
      const placeholderUserId = claim.creatorProfile.userId;
      // ── 3. Re-validate requester (live DB — do NOT trust cached state) ────
      const requester = await tx.user.findUnique({
        where: { id: requesterUserId },
        select: {
          id: true,
          isImported: true,
          banned: true,
          emailVerified: true,
          role: true,
          name: true,
          email: true,
        },
      });
      if (!requester) throw new Error("REQUESTER_NOT_FOUND");
      if (requester.isImported) throw new Error("REQUESTER_IS_IMPORTED");
      if (!requester.emailVerified || requester.role !== "CREATOR") throw new Error("REQUESTER_EMAIL_UNVERIFIED");
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
      THREADS_IDENTITY_REQUIRES_MANUAL_REVIEW: "Threads identity requires manual review before ownership movement.",
      YOUTUBE_COMPLIANCE_REQUIRES_MANUAL_REVIEW: "YouTube compliance state requires manual review; automatic ownership movement is blocked.",
      PLACEHOLDER_HAS_TOKEN: "Imported profiles cannot transfer Threads OAuth credentials. Manual review is required.",
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
      const observed = await tx.profileClaim.findUnique({ where: { id: claimId },
        select: { requesterUserId: true, creatorProfile: { select: { userId: true } } } });
      if (!observed) throw new Error("CLAIM_NOT_FOUND");
      await lockClaimOwners(tx, [observed.creatorProfile.userId, adminUser.id, ...(observed.requesterUserId ? [observed.requesterUserId] : [])]);
      await tx.$queryRaw`SELECT "id" FROM "ProfileClaim" WHERE "id" = ${claimId} FOR UPDATE`;
      const c = await tx.profileClaim.findUnique({ where: { id: claimId }, select: {
        id: true, status: true, requesterUserId: true, creatorProfileId: true,
        creatorProfile: { select: { userId: true, claimStatus: true } },
      } });
      if (!c) throw new Error("CLAIM_NOT_FOUND");
      if (c.status !== "PENDING") throw new Error("CLAIM_NOT_PENDING");
      if (c.requesterUserId !== observed.requesterUserId || c.creatorProfile.userId !== observed.creatorProfile.userId || c.creatorProfile.claimStatus !== "CLAIM_PENDING")
        throw new Error("CLAIM_NOT_PENDING");
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

// ─── F. Merge preview (admin — read-only) ────────────────────────────────────
//
// Called when an admin expands a MERGE REQUIRED claim to show a compact live
// summary before deciding whether to Merge & Approve.
//
// This action is INFORMATIONAL ONLY.
// mergeAndApproveClaimAction re-computes every guard independently inside its
// transaction and NEVER trusts data returned here.

export interface PlatformStatConflict {
  platform: string;
  userPSource: string;
  userRSource: string;
  resolution: "user_r_wins_gate1_token" | "user_r_wins_authority" | "user_p_wins_authority" | "user_r_wins_freshness" | "user_p_wins_freshness" | "no_conflict_migrate";
}

export interface MergePreviewHardBlock {
  code: string;
  message: string;
}

export interface ClaimMergePreview {
  // ── Profiles ────────────────────────────────────────────────────────────
  importedProfile: {
    id: string;
    name: string | null;
    bio: string | null;
    niche: string | null;
    location: string | null;
    socialLinks: { platform: string; url: string }[];
    importedEmail: string | null;
    profileOrigin: string;
    claimStatus: string;
    moderationStatus: string;
    followerCount: number | null;
    totalFollowers: number;
  };
  registeredProfile: {
    id: string;
    name: string | null;
    bio: string | null;
    niche: string | null;
    location: string | null;
    socialLinks: { platform: string; url: string }[];
    profileOrigin: string;
    claimStatus: string;
    moderationStatus: string;
    applicationCount: number;
    contractCount: number;
  };
  // ── Stats ────────────────────────────────────────────────────────────────
  oauthPlatforms: string[];          // UserR connected platforms
  statConflicts: PlatformStatConflict[];
  // ── Content ──────────────────────────────────────────────────────────────
  socialPostDuplicateCount: number;  // posts sharing (platform, providerPostId)
  // ── Commercial ───────────────────────────────────────────────────────────
  applicationCollisions: string[];   // campaignIds with collision
  // ── Relations ────────────────────────────────────────────────────────────
  connectionDedupeCount: number;     // UserP connections that would be merged/deduped
  listMemberDedupeCount: number;     // CommunityListMember dupes
  invitationDedupeCount: number;     // Invitation dupes
  selfConnectionCount: number;       // UserP↔UserR connections that would be deleted
  // ── Resolution ───────────────────────────────────────────────────────────
  hardBlocks: MergePreviewHardBlock[];
  safeAutoMerge: string[];
}

export async function getClaimMergePreviewAction(claimId: string): Promise<{
  preview: ClaimMergePreview | null;
  error: string | null;
}> {
  try {
    await requireAdmin();
  } catch {
    return { preview: null, error: "Unauthorized" };
  }

  try {
    // ── Load claim ──────────────────────────────────────────────────────────
    const claim = await db.profileClaim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        status: true,
        requiresMerge: true,
        requesterUserId: true,
        creatorProfileId: true,
      },
    });
    if (!claim) return { preview: null, error: "Claim not found." };
    if (!claim.requiresMerge) return { preview: null, error: "This claim does not require a merge." };
    if (!claim.requesterUserId) return { preview: null, error: "Requester no longer exists." };

    // ── Load IP (imported profile) ──────────────────────────────────────────
    const ip = await db.creatorProfile.findUnique({
      where: { id: claim.creatorProfileId },
      select: {
        id: true,
        userId: true,
        bio: true,
        niche: true,
        location: true,
        socialLinks: true,
        importedEmail: true,
        profileOrigin: true,
        claimStatus: true,
        moderationStatus: true,
        followerCount: true,
        totalFollowers: true,
        socialPosts: {
          select: { platform: true, providerPostId: true, dataSource: true },
        },
        user: { select: { id: true, name: true } },
      },
    });
    if (!ip) return { preview: null, error: "Imported profile not found." };

    const placeholderUserId = ip.userId;

    // ── Load registered profile ─────────────────────────────────────────────
    const rp = await db.creatorProfile.findUnique({
      where: { userId: claim.requesterUserId },
      select: {
        id: true,
        userId: true,
        bio: true,
        niche: true,
        location: true,
        socialLinks: true,
        profileOrigin: true,
        claimStatus: true,
        moderationStatus: true,
        user: { select: { id: true, name: true } },
        socialPosts: {
          select: { platform: true, providerPostId: true, dataSource: true },
        },
        _count: {
          select: {
            applications: true,
            contracts: true,
            profileClaims: true,
            profileAliases: true,
          },
        },
      },
    });

    // ── Load UserP and UserR ────────────────────────────────────────────────
    const [userP, userR] = await Promise.all([
      db.user.findUnique({
        where: { id: placeholderUserId },
        select: {
          id: true,
          isImported: true,
          emailVerified: true,
          _count: {
            select: {
              accounts: true,
              sessions: true,
              platformTokens: true,
            },
          },
        },
      }),
      db.user.findUnique({
        where: { id: claim.requesterUserId },
        select: {
          id: true,
          name: true,
          banned: true,
          platformTokens: { select: { platform: true } },
          platformStats: { select: { platform: true, dataSource: true, fetchedAt: true, followerCount: true } },
        },
      }),
    ]);

    // ── Load UserP stats, messages, and existing ProfileAlias ───────────────
    const [userPStats, userPMessages, userPTwoFactor, existingPlaceholderAlias] = await Promise.all([
      db.platformStats.findMany({
        where: { userId: placeholderUserId },
        select: { platform: true, dataSource: true, fetchedAt: true, followerCount: true },
      }),
      db.message.count({
        where: { OR: [{ senderId: placeholderUserId }, { receiverId: placeholderUserId }] },
      }),
      db.twoFactor.findUnique({ where: { userId: placeholderUserId }, select: { id: true } }),
      db.profileAlias.findUnique({
        where: { fromUserId: placeholderUserId },
        select: { creatorProfileId: true },
      }),
    ]);

    // ── Load application / invitation / community collision data ────────────
    const [rpApplicationCampaignIds, ipApplicationCampaignIds] = await Promise.all([
      rp
        ? db.application.findMany({
            where: { creatorProfileId: rp.id },
            select: { campaignId: true },
          })
        : Promise.resolve([]),
      db.application.findMany({
        where: { creatorProfileId: ip.id },
        select: { campaignId: true },
      }),
    ]);

    const rpCampaignSet = new Set(rpApplicationCampaignIds.map((a) => a.campaignId));
    const ipCampaignSet = new Set(ipApplicationCampaignIds.map((a) => a.campaignId));
    const applicationCollisions = [...rpCampaignSet].filter((id) => ipCampaignSet.has(id));

    // ── Connection dedup analysis ───────────────────────────────────────────
    const userPConnections = await db.connection.findMany({
      where: { OR: [{ senderId: placeholderUserId }, { receiverId: placeholderUserId }] },
      select: { id: true, senderId: true, receiverId: true, status: true },
    });

    let selfConnectionCount = 0;
    let wouldDedupe = 0;
    const requesterUserId = claim.requesterUserId;
    for (const conn of userPConnections) {
      const otherId = conn.senderId === placeholderUserId ? conn.receiverId : conn.senderId;
      if (otherId === requesterUserId) {
        // Would become self-connection — delete
        selfConnectionCount++;
        continue;
      }
      // Check if equivalent UserR connection already exists
      const exists = await db.connection.findFirst({
        where: {
          OR: [
            { senderId: requesterUserId, receiverId: otherId },
            { senderId: otherId, receiverId: requesterUserId },
          ],
        },
        select: { id: true },
      });
      if (exists) wouldDedupe++;
    }

    // ── List member + invitation dedup ──────────────────────────────────────
    const [userPListMembers, userPInvitations] = await Promise.all([
      db.communityListMember.findMany({
        where: { creatorUserId: placeholderUserId },
        select: { listId: true },
      }),
      db.invitation.findMany({
        where: { creatorUserId: placeholderUserId },
        select: { campaignId: true },
      }),
    ]);

    let listDedupeCount = 0;
    for (const m of userPListMembers) {
      const exists = await db.communityListMember.findUnique({
        where: { listId_creatorUserId: { listId: m.listId, creatorUserId: requesterUserId } },
        select: { id: true },
      });
      if (exists) listDedupeCount++;
    }

    let invitationDedupeCount = 0;
    const userRInvCampaigns = new Set(
      (
        await db.invitation.findMany({
          where: { creatorUserId: requesterUserId },
          select: { campaignId: true },
        })
      ).map((i) => i.campaignId),
    );
    for (const inv of userPInvitations) {
      if (userRInvCampaigns.has(inv.campaignId)) invitationDedupeCount++;
    }

    // ── SocialPost duplicate count ──────────────────────────────────────────
    const rpPostKeys = new Set(
      (rp?.socialPosts ?? [])
        .filter((p) => p.providerPostId != null)
        .map((p) => `${p.platform}::${p.providerPostId}`),
    );
    const ipPostKeys = new Set(
      ip.socialPosts
        .filter((p) => p.providerPostId != null)
        .map((p) => `${p.platform}::${p.providerPostId}`),
    );
    const socialPostDuplicateCount = [...rpPostKeys].filter((k) => ipPostKeys.has(k)).length;

    // ── PlatformStats conflict analysis ─────────────────────────────────────
    const SOURCE_AUTHORITY: Record<string, number> = {
      OFFICIAL_API: 3,
      RAPIDAPI: 2,
      APIFY: 1,
      MANUAL_IMPORT: 0,
      LEGACY_UNKNOWN: 0,
    };

    const userRTokenPlatforms = new Set((userR?.platformTokens ?? []).map((t) => t.platform));
    const userRStatMap = new Map((userR?.platformStats ?? []).map((s) => [s.platform, s]));

    const statConflicts: PlatformStatConflict[] = [];
    for (const pStat of userPStats) {
      const rStat = userRStatMap.get(pStat.platform);
      if (!rStat) {
        statConflicts.push({
          platform: pStat.platform,
          userPSource: pStat.dataSource,
          userRSource: "none",
          resolution: "no_conflict_migrate",
        });
        continue;
      }
      if (userRTokenPlatforms.has(pStat.platform)) {
        statConflicts.push({
          platform: pStat.platform,
          userPSource: pStat.dataSource,
          userRSource: rStat.dataSource,
          resolution: "user_r_wins_gate1_token",
        });
        continue;
      }
      const pAuth = SOURCE_AUTHORITY[pStat.dataSource] ?? 0;
      const rAuth = SOURCE_AUTHORITY[rStat.dataSource] ?? 0;
      if (rAuth > pAuth) {
        statConflicts.push({ platform: pStat.platform, userPSource: pStat.dataSource, userRSource: rStat.dataSource, resolution: "user_r_wins_authority" });
      } else if (pAuth > rAuth) {
        statConflicts.push({ platform: pStat.platform, userPSource: pStat.dataSource, userRSource: rStat.dataSource, resolution: "user_p_wins_authority" });
      } else {
        // Same authority — use fetchedAt
        const pFresh = pStat.fetchedAt?.getTime() ?? 0;
        const rFresh = rStat.fetchedAt?.getTime() ?? 0;
        statConflicts.push({
          platform: pStat.platform,
          userPSource: pStat.dataSource,
          userRSource: rStat.dataSource,
          resolution: pFresh > rFresh ? "user_p_wins_freshness" : "user_r_wins_freshness",
        });
      }
    }

    // ── Build hard-block list ───────────────────────────────────────────────
    const hardBlocks: MergePreviewHardBlock[] = [];
    const safeAutoMerge: string[] = [];
    const youtubeStates = await db.youTubeComplianceState.count({ where: { userId: { in: [placeholderUserId, claim.requesterUserId] } } });
    const youtubeConnections = await db.platformToken.count({ where: { userId: { in: [placeholderUserId, claim.requesterUserId] }, platform: "youtube" } });
    if (youtubeStates || youtubeConnections) hardBlocks.push({ code: "YOUTUBE_COMPLIANCE_REQUIRES_MANUAL_REVIEW", message: "YouTube lifecycle or official connection requires manual review before ownership movement." });

    if (!rp) {
      hardBlocks.push({ code: "NO_REGISTERED_PROFILE", message: "Requester does not have a CreatorProfile. Use Scenario A approval instead." });
    } else {
      if (rp.profileOrigin !== "REGISTERED" || rp.claimStatus !== "NOT_APPLICABLE") {
        hardBlocks.push({ code: "EXISTING_PROFILE_REQUIRES_ADVANCED_MERGE", message: `RP has unsupported state: profileOrigin=${rp.profileOrigin}, claimStatus=${rp.claimStatus}. V1 merge only supports REGISTERED+NOT_APPLICABLE.` });
      }
      if ((rp._count?.profileClaims ?? 0) > 0) {
        hardBlocks.push({ code: "RP_HAS_CLAIM_HISTORY", message: `Registered profile has ${rp._count.profileClaims} existing ProfileClaim record(s). Cannot safely delete.` });
      }
      if ((rp._count?.profileAliases ?? 0) > 0) {
        hardBlocks.push({ code: "RP_HAS_ALIASES", message: `Registered profile has ${rp._count.profileAliases} existing ProfileAlias record(s). Deletion would break URL redirects.` });
      }
    }

    if ((userP?._count?.accounts ?? 0) > 0) {
      hardBlocks.push({ code: "PLACEHOLDER_HAS_ACCOUNT", message: "Placeholder user has Account rows (unexpected auth state). Investigate import pipeline." });
    }
    if ((userP?._count?.sessions ?? 0) > 0) {
      hardBlocks.push({ code: "PLACEHOLDER_HAS_SESSION", message: "Placeholder user has active Sessions (should never happen for imported users)." });
    }
    if (userPTwoFactor) {
      hardBlocks.push({ code: "PLACEHOLDER_HAS_TWOFACTOR", message: "Placeholder user has a TwoFactor record (unexpected)." });
    }
    if ((userP?._count?.platformTokens ?? 0) > 0) {
      hardBlocks.push({ code: "PLACEHOLDER_HAS_TOKEN", message: "Placeholder user has PlatformToken rows (invariant violation — imported users cannot connect OAuth)." });
    }
    if (userPMessages > 0) {
      hardBlocks.push({ code: "PLACEHOLDER_HAS_MESSAGES", message: `Placeholder user has ${userPMessages} message(s). Cannot auto-migrate conversation history.` });
    }
    if (userPStats.some((s) => s.dataSource === "OFFICIAL_API")) {
      hardBlocks.push({ code: "PLACEHOLDER_HAS_OFFICIAL_STATS", message: "Placeholder user has OFFICIAL_API PlatformStats (invariant violation — imported users cannot have OAuth stats)." });
    }
    if (applicationCollisions.length > 0) {
      hardBlocks.push({ code: "APPLICATION_COLLISION", message: `Both profiles have Applications for the same campaign(s): ${applicationCollisions.join(", ")}. Cannot auto-merge commercial history.` });
    }
    // Identity/URL safety invariant: if a ProfileAlias already exists for UserP
    // but points to a profile other than IP, overwriting it would silently
    // retarget live URL redirects to a different creator — hard block.
    if (existingPlaceholderAlias && existingPlaceholderAlias.creatorProfileId !== ip.id) {
      hardBlocks.push({
        code: "PLACEHOLDER_ALIAS_CONFLICT",
        message: `A ProfileAlias for the placeholder user already exists and points to a different profile (${existingPlaceholderAlias.creatorProfileId}). Cannot overwrite an alias targeting another creator — this is an identity/URL safety invariant.`,
      });
    }

    // ── Safe auto-merge items ───────────────────────────────────────────────
    if (hardBlocks.length === 0) {
      safeAutoMerge.push("Profile fields: bio, niche, location, primaryPlatform (creator-authored wins)");
      safeAutoMerge.push("Social links: merged per-platform, RP links take precedence");
      safeAutoMerge.push("Moderation reset to PENDING");
      if (rp && (rp._count?.applications ?? 0) > 0) safeAutoMerge.push(`${rp._count.applications} Application(s) migrated RP→IP`);
      if (rp && (rp._count?.contracts ?? 0) > 0) safeAutoMerge.push(`${rp._count.contracts} Contract(s) migrated RP→IP`);
      if (socialPostDuplicateCount > 0) safeAutoMerge.push(`${socialPostDuplicateCount} SocialPost duplicate(s) deduped by source authority`);
      if (statConflicts.length > 0) safeAutoMerge.push(`${statConflicts.length} PlatformStats platform(s) resolved by authority/freshness`);
      if (selfConnectionCount > 0) safeAutoMerge.push(`${selfConnectionCount} self-referential placeholder↔real connection(s) removed`);
      if (wouldDedupe > 0) safeAutoMerge.push(`${wouldDedupe} duplicate connection(s) deduped`);
      if (listDedupeCount > 0) safeAutoMerge.push(`${listDedupeCount} duplicate community list membership(s) deduped`);
      if (invitationDedupeCount > 0) safeAutoMerge.push(`${invitationDedupeCount} duplicate invitation(s) deduped`);
    }

    const rawIpLinks = Array.isArray(ip.socialLinks) ? (ip.socialLinks as { platform: string; url: string }[]) : [];
    const rawRpLinks = Array.isArray(rp?.socialLinks) ? (rp!.socialLinks as { platform: string; url: string }[]) : [];

    return {
      preview: {
        importedProfile: {
          id: ip.id,
          name: ip.user.name,
          bio: ip.bio,
          niche: ip.niche,
          location: ip.location,
          socialLinks: rawIpLinks,
          importedEmail: ip.importedEmail,
          profileOrigin: ip.profileOrigin,
          claimStatus: ip.claimStatus,
          moderationStatus: ip.moderationStatus,
          followerCount: ip.followerCount,
          totalFollowers: ip.totalFollowers,
        },
        registeredProfile: {
          id: rp?.id ?? "",
          name: rp?.user?.name ?? null,
          bio: rp?.bio ?? null,
          niche: rp?.niche ?? null,
          location: rp?.location ?? null,
          socialLinks: rawRpLinks,
          profileOrigin: rp?.profileOrigin ?? "",
          claimStatus: rp?.claimStatus ?? "",
          moderationStatus: rp?.moderationStatus ?? "",
          applicationCount: rp?._count?.applications ?? 0,
          contractCount: rp?._count?.contracts ?? 0,
        },
        oauthPlatforms: userR?.platformTokens.map((t) => t.platform) ?? [],
        statConflicts,
        socialPostDuplicateCount,
        applicationCollisions,
        connectionDedupeCount: wouldDedupe,
        listMemberDedupeCount: listDedupeCount,
        invitationDedupeCount,
        selfConnectionCount,
        hardBlocks,
        safeAutoMerge,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getClaimMergePreviewAction]", err);
    return { preview: null, error: "Failed to load merge preview. Please try again." };
  }
}

// ─── G. Merge & Approve claim (admin — Scenario B) ───────────────────────────
//
// Full atomic Scenario B merge transaction. Canonical result:
//   - User R remains authenticated identity
//   - IP survives as canonical CreatorProfile (IP.userId reassigned to UserR)
//   - RP is deleted after all its relations are migrated to IP
//   - UserP retained as inert historical placeholder
//
// This action NEVER trusts data from getClaimMergePreviewAction.
// All guards are recomputed live inside the transaction.

export async function mergeAndApproveClaimAction(
  claimId: string,
): Promise<ClaimResult & { errorCode?: string }> {
  let adminUser: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    adminUser = await requireAdmin();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  // Capture for post-commit use (outside transaction)
  let postCommitData: {
    requesterUserId: string;
    requesterEmail: string;
    requesterName: string | null;
    hasCompletedOnboarding: boolean;
    profileId: string;
  } | null = null;

  try {
    await db.$transaction(
      async (tx) => {
        // ────────────────────────────────────────────────────────────────────
        // Acquire both owner coordination domains before the claim row, matching
        // account deletion (owner -> profile -> claim) and preventing a cycle.
        const ownerSnapshot = await tx.profileClaim.findUnique({ where: { id: claimId },
          select: { requesterUserId: true, creatorProfile: { select: { userId: true, moderationStatus: true } } } });
        if (!ownerSnapshot?.requesterUserId) throw new Error("CLAIM_NO_REQUESTER");
        await guardYouTubeClaim(tx, ownerSnapshot.creatorProfile.userId, ownerSnapshot.requesterUserId, adminUser.id);
        await guardThreadsClaim(tx, ownerSnapshot.creatorProfile.userId, ownerSnapshot.requesterUserId);
        // STEP 1 — Acquire PostgreSQL row-level lock on the ProfileClaim.
        // This serializes concurrent admin merge attempts at the DB level.
        // SELECT FOR UPDATE blocks any other transaction from locking the same
        // row until this transaction commits or rolls back.
        // ────────────────────────────────────────────────────────────────────
        await tx.$queryRaw`
          SELECT id FROM "ProfileClaim"
          WHERE id = ${claimId}
          FOR UPDATE
        `;

        // ────────────────────────────────────────────────────────────────────
        // STEP 2 — Re-read and validate claim (never trust pre-transaction data)
        // ────────────────────────────────────────────────────────────────────
        const claim = await tx.profileClaim.findUnique({
          where: { id: claimId },
          select: {
            id: true,
            status: true,
            requesterUserId: true,
            creatorProfileId: true,
          },
        });
        if (!claim) throw new Error("CLAIM_NOT_FOUND");
        if (claim.status !== "PENDING") throw new Error("CLAIM_NOT_PENDING");
        if (!claim.requesterUserId) throw new Error("CLAIM_NO_REQUESTER");

        const { requesterUserId, creatorProfileId } = claim;

        // ────────────────────────────────────────────────────────────────────
        // STEP 3 — Validate IP (imported profile)
        // ────────────────────────────────────────────────────────────────────
        const ip = await tx.creatorProfile.findUnique({
          where: { id: creatorProfileId },
          select: {
            id: true,
            userId: true,
            bio: true,
            niche: true,
            location: true,
            primaryPlatform: true,
            socialLinks: true,
            topNiches: true,
            lastSyncedAt: true,
            followerCount: true,
            totalFollowers: true,
            importedEmail: true,
            importedAt: true,
            importBatchId: true,
            profileOrigin: true,
            claimStatus: true,
          },
        });
        if (!ip) throw new Error("PROFILE_NOT_FOUND");
        if (ip.profileOrigin !== "IMPORTED") throw new Error("PROFILE_NOT_IMPORTED");
        const currentModeration = await tx.creatorProfile.findUnique({ where: { id: ip.id }, select: { moderationStatus: true } });
        if (currentModeration?.moderationStatus !== ownerSnapshot.creatorProfile.moderationStatus) throw new Error("PROFILE_NOT_PENDING");
        if (ip.claimStatus !== "CLAIM_PENDING") throw new Error("PROFILE_NOT_PENDING");

        const placeholderUserId = ip.userId;
        if (placeholderUserId !== ownerSnapshot.creatorProfile.userId || requesterUserId !== ownerSnapshot.requesterUserId) throw new Error("PROFILE_NOT_PENDING");
        const liveOwner = await tx.creatorProfile.findUnique({ where: { id: ip.id }, select: { userId: true } });
        if (liveOwner?.userId !== placeholderUserId) throw new Error("PROFILE_NOT_PENDING");

        // ────────────────────────────────────────────────────────────────────
        // STEP 4 — Validate UserP (placeholder)
        // ────────────────────────────────────────────────────────────────────
        const userP = await tx.user.findUnique({
          where: { id: placeholderUserId },
          select: { id: true, isImported: true, emailVerified: true },
        });
        if (!userP) throw new Error("PLACEHOLDER_NOT_FOUND");
        if (!userP.isImported) throw new Error("PLACEHOLDER_NOT_IMPORTED");

        // ────────────────────────────────────────────────────────────────────
        // STEP 5 — Validate UserR (real requester)
        // ────────────────────────────────────────────────────────────────────
        const userR = await tx.user.findUnique({
          where: { id: requesterUserId },
          select: {
            id: true,
            name: true,
            email: true,
            isImported: true,
            banned: true,
            emailVerified: true,
            role: true,
            hasCompletedOnboarding: true,
          },
        });
        if (!userR) throw new Error("REQUESTER_NOT_FOUND");
        if (userR.isImported) throw new Error("REQUESTER_IS_IMPORTED");
        if (userR.banned) throw new Error("REQUESTER_BANNED");
        if (userR.role !== "CREATOR") throw new Error("REQUESTER_IS_IMPORTED");
        if (!userR.emailVerified) throw new Error("REQUESTER_EMAIL_UNVERIFIED");

        // ────────────────────────────────────────────────────────────────────
        // STEP 6 — Validate RP (registered profile) — V1 eligibility guard
        // ────────────────────────────────────────────────────────────────────
        const rp = await tx.creatorProfile.findUnique({
          where: { userId: requesterUserId },
          select: {
            id: true,
            bio: true,
            niche: true,
            location: true,
            primaryPlatform: true,
            socialLinks: true,
            topNiches: true,
            lastSyncedAt: true,
            followerCount: true,
            totalFollowers: true,
            profileOrigin: true,
            claimStatus: true,
          },
        });
        if (!rp) throw new Error("NO_REGISTERED_PROFILE");

        // V1 only supports REGISTERED + NOT_APPLICABLE
        if (rp.profileOrigin !== "REGISTERED" || rp.claimStatus !== "NOT_APPLICABLE") {
          throw new Error("EXISTING_PROFILE_REQUIRES_ADVANCED_MERGE");
        }

        // RP must not have ProfileClaim history or ProfileAlias rows
        const [rpClaimCount, rpAliasCount] = await Promise.all([
          tx.profileClaim.count({ where: { creatorProfileId: rp.id } }),
          tx.profileAlias.count({ where: { creatorProfileId: rp.id } }),
        ]);
        if (rpClaimCount > 0) throw new Error("RP_HAS_CLAIM_HISTORY");
        if (rpAliasCount > 0) throw new Error("RP_HAS_ALIASES");

        // ────────────────────────────────────────────────────────────────────
        // STEP 7 — UserP invariant guards (all before any destructive write)
        // ────────────────────────────────────────────────────────────────────
        const [
          accountCount,
          sessionCount,
          twoFactor,
          tokenCount,
          messageCount,
          officialStats,
        ] = await Promise.all([
          tx.account.count({ where: { userId: placeholderUserId } }),
          tx.session.count({ where: { userId: placeholderUserId } }),
          tx.twoFactor.findUnique({ where: { userId: placeholderUserId }, select: { id: true } }),
          tx.platformToken.count({ where: { userId: placeholderUserId } }),
          tx.message.count({
            where: { OR: [{ senderId: placeholderUserId }, { receiverId: placeholderUserId }] },
          }),
          tx.platformStats.findMany({
            where: { userId: placeholderUserId, dataSource: "OFFICIAL_API" },
            select: { id: true },
          }),
        ]);

        if (accountCount > 0) throw new Error("PLACEHOLDER_HAS_ACCOUNT");
        if (sessionCount > 0) throw new Error("PLACEHOLDER_HAS_SESSION");
        if (twoFactor) throw new Error("PLACEHOLDER_HAS_TWOFACTOR");
        if (tokenCount > 0) throw new Error("PLACEHOLDER_HAS_TOKEN");
        if (messageCount > 0) throw new Error("PLACEHOLDER_HAS_MESSAGES");
        if (officialStats.length > 0) throw new Error("PLACEHOLDER_HAS_OFFICIAL_STATS");

        // ────────────────────────────────────────────────────────────────────
        // STEP 8 — Application collision check (HARD BLOCK)
        // ────────────────────────────────────────────────────────────────────
        const [rpApps, ipApps] = await Promise.all([
          tx.application.findMany({
            where: { creatorProfileId: rp.id },
            select: { campaignId: true },
          }),
          tx.application.findMany({
            where: { creatorProfileId: ip.id },
            select: { campaignId: true },
          }),
        ]);
        const rpCampaignIds = new Set(rpApps.map((a) => a.campaignId));
        const ipCampaignIds = new Set(ipApps.map((a) => a.campaignId));
        const collisions = [...rpCampaignIds].filter((id) => ipCampaignIds.has(id));
        if (collisions.length > 0) {
          throw new Error(`APPLICATION_COLLISION:${collisions.join(",")}`);
        }

        // ────────────────────────────────────────────────────────────────────
        // STEP 8b — ProfileAlias safety guard (identity/URL invariant)
        // Query by fromUserId = UserP.id.
        //   • no alias → safe, continue
        //   • alias exists AND creatorProfileId === ip.id → safe, upsert is idempotent
        //   • alias exists AND creatorProfileId !== ip.id → HARD BLOCK
        //     (would silently retarget a live URL redirect to a different creator)
        // ────────────────────────────────────────────────────────────────────
        const existingAlias = await tx.profileAlias.findUnique({
          where: { fromUserId: placeholderUserId },
          select: { creatorProfileId: true },
        });
        if (existingAlias && existingAlias.creatorProfileId !== ip.id) {
          throw new Error("PLACEHOLDER_ALIAS_CONFLICT");
        }

        // ────────────────────────────────────────────────────────────────────
        // STEP 9 — PlatformStats migration (UserP → UserR)
        // Uses Gate 1 (PlatformToken) + Gate 2 (canOverwrite authority) policy
        // ────────────────────────────────────────────────────────────────────
        const [userPStats, userRStats, userRTokens] = await Promise.all([
          tx.platformStats.findMany({ where: { userId: placeholderUserId } }),
          tx.platformStats.findMany({ where: { userId: requesterUserId } }),
          tx.platformToken.findMany({ where: { userId: requesterUserId }, select: { platform: true } }),
        ]);

        const SOURCE_AUTH: Record<string, number> = {
          OFFICIAL_API: 3,
          RAPIDAPI: 2,
          APIFY: 1,
          MANUAL_IMPORT: 0,
          LEGACY_UNKNOWN: 0,
        };

        const userRTokenSet = new Set(userRTokens.map((t) => t.platform));
        const userRStatByPlatform = new Map(userRStats.map((s) => [s.platform, s]));

        for (const pStat of userPStats) {
          const rStat = userRStatByPlatform.get(pStat.platform);

          if (!rStat) {
            // No collision — migrate directly
            await tx.platformStats.update({
              where: { id: pStat.id },
              data: { userId: requesterUserId },
            });
            continue;
          }

          // Gate 1: UserR has a PlatformToken → UserR stat wins unconditionally
          if (userRTokenSet.has(pStat.platform)) {
            await tx.platformStats.delete({ where: { id: pStat.id } });
            continue;
          }

          // Gate 2: authority comparison
          const pAuth = SOURCE_AUTH[pStat.dataSource] ?? 0;
          const rAuth = SOURCE_AUTH[rStat.dataSource] ?? 0;

          let userPWins: boolean;
          if (pAuth !== rAuth) {
            userPWins = pAuth > rAuth;
          } else {
            // Same authority: use fetchedAt recency; tie → UserR wins
            const pFresh = pStat.fetchedAt?.getTime() ?? 0;
            const rFresh = rStat.fetchedAt?.getTime() ?? 0;
            userPWins = pFresh > rFresh;
          }

          if (userPWins) {
            // Must delete UserR stat first to clear the @@unique([userId, platform]) slot
            await tx.platformStats.delete({ where: { id: rStat.id } });
            await tx.platformStats.update({
              where: { id: pStat.id },
              data: { userId: requesterUserId },
            });
          } else {
            await tx.platformStats.delete({ where: { id: pStat.id } });
          }
        }

        // ────────────────────────────────────────────────────────────────────
        // STEP 10 — SocialPost dedup + migration (RP → IP)
        // ────────────────────────────────────────────────────────────────────
        const [rpPosts, ipPosts] = await Promise.all([
          tx.socialPost.findMany({
            where: { creatorProfileId: rp.id },
            select: { id: true, platform: true, providerPostId: true, dataSource: true, fetchedAt: true },
          }),
          tx.socialPost.findMany({
            where: { creatorProfileId: ip.id },
            select: { id: true, platform: true, providerPostId: true, dataSource: true, fetchedAt: true },
          }),
        ]);

        // Build an index of IP posts by (platform, providerPostId) for dedup
        const ipPostIndex = new Map(
          ipPosts
            .filter((p) => p.providerPostId != null)
            .map((p) => [`${p.platform}::${p.providerPostId}`, p]),
        );

        const rpPostIdsToDelete: string[] = [];
        for (const rpPost of rpPosts) {
          if (rpPost.providerPostId == null) continue; // null-providerPostId: migrate without dedup
          const key = `${rpPost.platform}::${rpPost.providerPostId}`;
          const ipDup = ipPostIndex.get(key);
          if (!ipDup) continue;

          // Collision: same (platform, providerPostId) on both profiles
          const rpAuth = SOURCE_AUTH[rpPost.dataSource] ?? 0;
          const ipAuth = SOURCE_AUTH[ipDup.dataSource] ?? 0;

          let rpWins: boolean;
          if (rpAuth !== ipAuth) {
            rpWins = rpAuth > ipAuth;
          } else {
            rpWins = (rpPost.fetchedAt?.getTime() ?? 0) > (ipDup.fetchedAt?.getTime() ?? 0);
          }

          if (rpWins) {
            // IP duplicate is lower quality — delete it so the RP post can migrate to IP.id
            await tx.socialPost.delete({ where: { id: ipDup.id } });
          } else {
            // RP duplicate is lower quality — mark it for deletion (don't migrate)
            rpPostIdsToDelete.push(rpPost.id);
          }
        }

        if (rpPostIdsToDelete.length > 0) {
          await tx.socialPost.deleteMany({ where: { id: { in: rpPostIdsToDelete } } });
        }

        // Migrate all remaining RP posts (including null-providerPostId ones) to IP
        await tx.socialPost.updateMany({
          where: { creatorProfileId: rp.id },
          data: { creatorProfileId: ip.id },
        });

        // ────────────────────────────────────────────────────────────────────
        // STEP 11 — Contract migration (RP → IP)
        // ────────────────────────────────────────────────────────────────────
        await tx.contract.updateMany({
          where: { creatorProfileId: rp.id },
          data: { creatorProfileId: ip.id },
        });

        // ────────────────────────────────────────────────────────────────────
        // STEP 12 — CampaignEvent migration (RP → IP)
        // ────────────────────────────────────────────────────────────────────
        await tx.campaignEvent.updateMany({
          where: { creatorProfileId: rp.id },
          data: { creatorProfileId: ip.id },
        });

        // ────────────────────────────────────────────────────────────────────
        // STEP 13 — Application migration (RP → IP)
        // Application collision already hard-blocked in step 8 — safe bulk migrate
        // ────────────────────────────────────────────────────────────────────
        await tx.application.updateMany({
          where: { creatorProfileId: rp.id },
          data: { creatorProfileId: ip.id },
        });

        // ────────────────────────────────────────────────────────────────────
        // STEP 14 — Invitation migration (UserP → UserR)
        // Unique constraint: @@unique([campaignId, creatorUserId])
        // ────────────────────────────────────────────────────────────────────
        const userPInvitations = await tx.invitation.findMany({
          where: { creatorUserId: placeholderUserId },
          select: { id: true, campaignId: true },
        });
        const userRInvCampaigns = new Set(
          (
            await tx.invitation.findMany({
              where: { creatorUserId: requesterUserId },
              select: { campaignId: true },
            })
          ).map((i) => i.campaignId),
        );
        for (const inv of userPInvitations) {
          if (userRInvCampaigns.has(inv.campaignId)) {
            // UserR already has an invitation for this campaign — delete placeholder duplicate
            await tx.invitation.delete({ where: { id: inv.id } });
          } else {
            await tx.invitation.update({
              where: { id: inv.id },
              data: { creatorUserId: requesterUserId },
            });
          }
        }

        // ────────────────────────────────────────────────────────────────────
        // STEP 15 — CommunityListMember migration (UserP → UserR)
        // Unique constraint: @@unique([listId, creatorUserId])
        // ────────────────────────────────────────────────────────────────────
        const userPMemberships = await tx.communityListMember.findMany({
          where: { creatorUserId: placeholderUserId },
          select: { id: true, listId: true },
        });
        for (const m of userPMemberships) {
          const exists = await tx.communityListMember.findUnique({
            where: { listId_creatorUserId: { listId: m.listId, creatorUserId: requesterUserId } },
            select: { id: true },
          });
          if (exists) {
            await tx.communityListMember.delete({ where: { id: m.id } });
          } else {
            await tx.communityListMember.update({
              where: { id: m.id },
              data: { creatorUserId: requesterUserId },
            });
          }
        }

        // ────────────────────────────────────────────────────────────────────
        // STEP 16 — Connection migration (UserP → UserR)
        // Unique constraint: @@unique([senderId, receiverId])
        // Self-connection guard: delete any UserP↔UserR connection
        // ────────────────────────────────────────────────────────────────────
        const userPConnections = await tx.connection.findMany({
          where: { OR: [{ senderId: placeholderUserId }, { receiverId: placeholderUserId }] },
          select: { id: true, senderId: true, receiverId: true },
        });

        for (const conn of userPConnections) {
          const otherId = conn.senderId === placeholderUserId ? conn.receiverId : conn.senderId;

          // Self-connection guard: if the other party is UserR, this would become UserR→UserR
          if (otherId === requesterUserId) {
            await tx.connection.delete({ where: { id: conn.id } });
            continue;
          }

          // Check for equivalent UserR connection to avoid duplicate
          const existingConn = await tx.connection.findFirst({
            where: {
              OR: [
                { senderId: requesterUserId, receiverId: otherId },
                { senderId: otherId, receiverId: requesterUserId },
              ],
            },
            select: { id: true },
          });
          if (existingConn) {
            await tx.connection.delete({ where: { id: conn.id } });
          } else {
            // Reassign the appropriate side to UserR
            if (conn.senderId === placeholderUserId) {
              await tx.connection.update({
                where: { id: conn.id },
                data: { senderId: requesterUserId },
              });
            } else {
              await tx.connection.update({
                where: { id: conn.id },
                data: { receiverId: requesterUserId },
              });
            }
          }
        }

        // ────────────────────────────────────────────────────────────────────
        // STEP 17 — Profile field merge into IP
        // Key rules:
        //   - Creator-authored RP fields win when meaningful (non-null/non-empty)
        //   - Imported provenance (importedEmail/importedAt/importBatchId) always preserved
        //   - DO NOT write avgEngagementRate or averageEngagement (read-time derived)
        //   - Follower cache uses computeFollowerCache on surviving PlatformStats
        // ────────────────────────────────────────────────────────────────────

        // Compute follower cache from surviving PlatformStats (after step 9 migrations)
        const survivingStats = await tx.platformStats.findMany({
          where: { userId: requesterUserId },
          select: { followerCount: true },
        });

        // Canonical follower cache logic (mirrors computeFollowerCache in lib/creator-metrics.ts)
        //   A) At least one non-null followerCount → sum them
        //   B) All null → fall back to RP aggregate then IP aggregate
        //   C) No stats → same fallback chain
        const statsWithFollowers = survivingStats.filter((s) => s.followerCount !== null);
        let newFollowerCount: number | null;
        if (statsWithFollowers.length > 0) {
          newFollowerCount = statsWithFollowers.reduce((sum, s) => sum + (s.followerCount as number), 0);
        } else {
          // Fallback chain: RP.followerCount → RP.totalFollowers (>0 only) → IP.followerCount → IP.totalFollowers (>0 only)
          newFollowerCount =
            rp.followerCount ??
            (rp.totalFollowers > 0 ? rp.totalFollowers : null) ??
            ip.followerCount ??
            (ip.totalFollowers > 0 ? ip.totalFollowers : null);
        }

        // Merge socialLinks: RP per-platform wins, IP-only links fill gaps
        const rawRpLinks = Array.isArray(rp.socialLinks)
          ? (rp.socialLinks as { platform: string; url: string }[])
          : [];
        const rawIpLinks = Array.isArray(ip.socialLinks)
          ? (ip.socialLinks as { platform: string; url: string }[])
          : [];
        const mergedLinkMap = new Map<string, string>();
        for (const link of rawIpLinks) mergedLinkMap.set(link.platform, link.url);
        for (const link of rawRpLinks) mergedLinkMap.set(link.platform, link.url); // RP overrides
        const mergedSocialLinks = [...mergedLinkMap.entries()].map(([platform, url]) => ({ platform, url }));

        // Derive connectedPlatforms strictly from UserR PlatformTokens (legacy compat only)
        const newConnectedPlatforms = (
          await tx.platformToken.findMany({
            where: { userId: requesterUserId },
            select: { platform: true },
          })
        ).map((t) => t.platform);

        // lastSyncedAt: take max of non-null values
        let newLastSyncedAt: Date | null = null;
        if (rp.lastSyncedAt && ip.lastSyncedAt) {
          newLastSyncedAt = rp.lastSyncedAt > ip.lastSyncedAt ? rp.lastSyncedAt : ip.lastSyncedAt;
        } else {
          newLastSyncedAt = rp.lastSyncedAt ?? ip.lastSyncedAt ?? null;
        }

        const now = new Date();

        await tx.creatorProfile.update({
          where: { id: ip.id },
          data: {
            bio:             rp.bio           ?? ip.bio,
            niche:           rp.niche         ?? ip.niche,
            location:        rp.location      ?? ip.location,
            primaryPlatform: rp.primaryPlatform ?? ip.primaryPlatform,
            socialLinks:     mergedSocialLinks,
            topNiches:       rp.topNiches.length > 0 ? rp.topNiches : ip.topNiches,
            followerCount:   newFollowerCount,
            totalFollowers:  newFollowerCount ?? 0,
            // Engagement caches intentionally NOT written — derived at read-time by getNormalizedCreatorMetrics
            connectedPlatforms: newConnectedPlatforms,
            lastSyncedAt:    newLastSyncedAt,
            // Imported provenance always preserved
            importedEmail:   ip.importedEmail,
            importedAt:      ip.importedAt,
            importBatchId:   ip.importBatchId,
            profileOrigin:   "IMPORTED",
            claimStatus:     "CLAIMED",
            claimedByUserId: requesterUserId,
            claimedAt:       now,
            moderationStatus: "PENDING",
            moderatedAt:     null,
            moderationNote:  null,
          },
        });

        // ────────────────────────────────────────────────────────────────────
        // STEP 17b — Migrate CreatorContentCuration from RP to IP
        //
        // RP is the requester's registered profile (being deleted).
        // IP is the surviving imported profile (destination).
        //
        // Curation mutations lock CreatorProfile FOR UPDATE. Lock both profiles
        // here, in sorted id order, before any curation read or write so this
        // merge serializes with those mutations and two merges cannot deadlock.
        //
        // Rules:
        //   - Same durable-key conflict: requester (RP) state wins.
        //   - Requester featured choices outrank pre-existing IP featured choices.
        //   - Requester relative featured order is preserved.
        //   - Remaining slots up to 6 are filled with IP-only featured items
        //     in their prior order.
        //   - Featured rows beyond those 6 become unfeatured.
        //   - Hidden rows never remain featured.
        //
        // Capture RP featured identity BEFORE creatorProfileId is rewritten.
        // On a key conflict the surviving row is the IP row; otherwise the RP row moves.
        // ────────────────────────────────────────────────────────────────────
        const curationLockIds = [...new Set([rp.id, ip.id])].sort();
        for (const profileId of curationLockIds) {
          await tx.$queryRaw`
            SELECT id FROM "CreatorProfile"
            WHERE id = ${profileId}
            FOR UPDATE
          `;
        }

        const [rpCurations, ipCurations] = await Promise.all([
          tx.creatorContentCuration.findMany({
            where: { creatorProfileId: rp.id },
            select: { id: true, platform: true, providerPostId: true, isHidden: true, isFeatured: true, featuredOrder: true },
          }),
          tx.creatorContentCuration.findMany({
            where: { creatorProfileId: ip.id },
            select: { id: true, platform: true, providerPostId: true, isHidden: true, isFeatured: true, featuredOrder: true },
          }),
        ]);

        const curationKey = (row: { platform: string; providerPostId: string }) =>
          `${row.platform}::${row.providerPostId}`;

        const ipCurationByKey = new Map(
          ipCurations.map((r) => [curationKey(r), r]),
        );

        const byFeaturedOrder = (
          a: { featuredOrder: number | null },
          b: { featuredOrder: number | null },
        ) =>
          (a.featuredOrder ?? Number.POSITIVE_INFINITY) -
          (b.featuredOrder ?? Number.POSITIVE_INFINITY);

        const requesterFeatured = rpCurations
          .filter((row) => row.isFeatured && !row.isHidden)
          .sort(byFeaturedOrder);

        const requesterFeaturedKeys = new Set(requesterFeatured.map(curationKey));

        // Surviving row ids, in requester relative order, recorded before the move.
        const requesterFeaturedSurvivingIds = requesterFeatured.map((rpRow) => {
          const ipRow = ipCurationByKey.get(curationKey(rpRow));
          return ipRow ? ipRow.id : rpRow.id;
        });

        // IP featured rows the requester did not also feature. Their ids do not change.
        const ipOnlyFeaturedIds = ipCurations
          .filter((row) => row.isFeatured && !row.isHidden && !requesterFeaturedKeys.has(curationKey(row)))
          .sort(byFeaturedOrder)
          .map((row) => row.id);

        for (const rpRow of rpCurations) {
          const ipRow = ipCurationByKey.get(curationKey(rpRow));

          if (!ipRow) {
            await tx.creatorContentCuration.update({
              where: { id: rpRow.id },
              data: { creatorProfileId: ip.id },
            });
          } else {
            // Conflict: requester's (RP) choice wins. RP row is cascade-deleted with RP.
            await tx.creatorContentCuration.update({
              where: { id: ipRow.id },
              data: {
                isHidden: rpRow.isHidden,
                isFeatured: rpRow.isFeatured,
                featuredOrder: rpRow.featuredOrder,
              },
            });
          }
        }

        const mergedRows = await tx.creatorContentCuration.findMany({
          where: { creatorProfileId: ip.id },
          select: { id: true, isHidden: true, isFeatured: true, featuredOrder: true },
        });
        const mergedById = new Map(mergedRows.map((row) => [row.id, row]));

        const chosenIds: string[] = [];
        const consider = (id: string) => {
          if (chosenIds.length >= 6 || chosenIds.includes(id)) return;
          const row = mergedById.get(id);
          if (!row || row.isHidden || !row.isFeatured) return;
          chosenIds.push(id);
        };
        for (const id of requesterFeaturedSurvivingIds) consider(id);
        for (const id of ipOnlyFeaturedIds) consider(id);

        const chosenSet = new Set(chosenIds);
        for (const row of mergedRows) {
          if (chosenSet.has(row.id)) continue;
          if (row.isFeatured || row.featuredOrder != null) {
            await tx.creatorContentCuration.update({
              where: { id: row.id },
              data: { isFeatured: false, featuredOrder: null },
            });
          }
        }
        for (let idx = 0; idx < chosenIds.length; idx++) {
          await tx.creatorContentCuration.update({
            where: { id: chosenIds[idx] },
            data: { isFeatured: true, featuredOrder: idx },
          });
        }

        // ────────────────────────────────────────────────────────────────────
        // STEP 18 — Pre-deletion final re-verification of RP
        // ────────────────────────────────────────────────────────────────────
        const rpFinal = await tx.creatorProfile.findUnique({
          where: { id: rp.id },
          select: {
            profileOrigin: true,
            claimStatus: true,
            _count: { select: { profileClaims: true, profileAliases: true } },
          },
        });
        if (!rpFinal) throw new Error("RP_DISAPPEARED");
        if (rpFinal.profileOrigin !== "REGISTERED") throw new Error("EXISTING_PROFILE_REQUIRES_ADVANCED_MERGE");
        if (rpFinal.claimStatus !== "NOT_APPLICABLE") throw new Error("EXISTING_PROFILE_REQUIRES_ADVANCED_MERGE");
        if (rpFinal._count.profileClaims > 0) throw new Error("RP_HAS_CLAIM_HISTORY");
        if (rpFinal._count.profileAliases > 0) throw new Error("RP_HAS_ALIASES");

        // ────────────────────────────────────────────────────────────────────
        // STEP 19 — Delete RP
        // At this point all RP.creatorProfileId-keyed relations have been migrated.
        // CASCADE will clean up any stale profileClaims/profileAliases (verified=0 above).
        // ────────────────────────────────────────────────────────────────────
        await tx.creatorProfile.delete({ where: { id: rp.id } });

        // ────────────────────────────────────────────────────────────────────
        // STEP 20 — Reassign IP.userId to UserR
        // This is only safe now that RP has been deleted (freeing the @unique userId slot)
        // ────────────────────────────────────────────────────────────────────
        await tx.creatorProfile.update({
          where: { id: ip.id },
          data: { userId: requesterUserId },
        });

        // ────────────────────────────────────────────────────────────────────
        // STEP 21 — Create/upsert ProfileAlias for UserP
        // fromUserId=UserP.id → creatorProfileId=IP.id
        // This enables /profile/{UserP.id} → /profile/{UserR.id} redirect
        // ────────────────────────────────────────────────────────────────────
        await tx.profileAlias.upsert({
          where: { fromUserId: placeholderUserId },
          create: { fromUserId: placeholderUserId, creatorProfileId: ip.id },
          update: {}, // idempotent if alias already exists
        });

        // ────────────────────────────────────────────────────────────────────
        // STEP 22 — Mark ProfileClaim APPROVED with audit fields
        // These fields are written ONLY on successful commit — if the transaction
        // rolls back, the claim remains PENDING with no audit trail.
        // ────────────────────────────────────────────────────────────────────
        await tx.profileClaim.update({
          where: { id: claimId },
          data: {
            status: "APPROVED",
            reviewedByUserId: adminUser.id,
            reviewedAt: now,
            requiresMerge: false,
            mergedFromProfileId: rp.id,  // plain String, NOT FK — RP is now deleted
            mergeCompletedAt: now,
          },
        });

        // ── Capture data needed for post-commit work ──────────────────────
        postCommitData = {
          requesterUserId: userR.id,
          requesterEmail: userR.email,
          requesterName: userR.name,
          hasCompletedOnboarding: userR.hasCompletedOnboarding,
          profileId: ip.id,
        };
      },
      {
        // Increase timeout for complex merges with many relation migrations
        timeout: 30_000,
      },
    );

    // ── POST-COMMIT: notifications and email (best-effort, non-transactional)
    // Transaction has already committed. Failures here must NOT roll back the merge.
    if (postCommitData) {
      const { requesterUserId, requesterEmail, requesterName, hasCompletedOnboarding, profileId } = postCommitData;
      const appUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      try {
        await db.notification.create({
          data: {
            userId: requesterUserId,
            type: "SYSTEM",
            title: "Your profile claim was approved and your accounts have been merged.",
            body: "Congratulations! Your claim has been approved and your creator profiles have been merged into one.",
            // If already onboarded, go to dashboard; otherwise continue onboarding
            link: hasCompletedOnboarding ? "/creator/dashboard" : "/onboarding",
          },
        });
      } catch {
        // Non-blocking
      }

      try {
        await sendClaimApprovedEmail({
          to: requesterEmail,
          name: requesterName ?? requesterEmail,
          onboardingUrl: hasCompletedOnboarding
            ? `${appUrl}/creator/dashboard`
            : `${appUrl}/onboarding`,
        });
      } catch {
        // Email failure must not surface as an error
      }

      void profileId; // referenced for future use (e.g. deep link)
    }

    return { success: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";

    // APPLICATION_COLLISION carries a payload after the colon
    const errorCode = msg.startsWith("APPLICATION_COLLISION:")
      ? "APPLICATION_COLLISION"
      : msg;

    const errorMessages: Record<string, string> = {
      THREADS_IDENTITY_REQUIRES_MANUAL_REVIEW: "Threads identity requires manual review before ownership movement.",
      YOUTUBE_COMPLIANCE_REQUIRES_MANUAL_REVIEW: "YouTube compliance state requires manual review; automatic ownership movement is blocked.",
      CLAIM_NOT_FOUND:                          "Claim not found.",
      CLAIM_NOT_PENDING:                        "This claim is no longer pending.",
      CLAIM_NO_REQUESTER:                       "The requester account no longer exists.",
      PROFILE_NOT_FOUND:                        "The imported profile no longer exists.",
      PROFILE_NOT_IMPORTED:                     "The target profile is not an imported profile.",
      PROFILE_NOT_PENDING:                      "The imported profile is no longer in the CLAIM_PENDING state.",
      PLACEHOLDER_NOT_FOUND:                    "The placeholder user no longer exists.",
      PLACEHOLDER_NOT_IMPORTED:                 "The placeholder user is not an imported account.",
      REQUESTER_NOT_FOUND:                      "The requester account no longer exists.",
      REQUESTER_IS_IMPORTED:                    "The requester is an imported account and cannot own a profile.",
      REQUESTER_BANNED:                         "The requester account is suspended.",
      REQUESTER_EMAIL_UNVERIFIED:               "The requester has not verified their email address.",
      NO_REGISTERED_PROFILE:                    "The requester does not have a registered CreatorProfile. Use the standard approval action instead.",
      EXISTING_PROFILE_REQUIRES_ADVANCED_MERGE: "The requester's existing profile cannot be merged in V1 (it is not a plain REGISTERED+NOT_APPLICABLE profile). This case requires advanced merge tooling.",
      RP_HAS_CLAIM_HISTORY:                     "The requester's registered profile has existing ProfileClaim records that would be lost. Cannot safely merge in V1.",
      RP_HAS_ALIASES:                           "The requester's registered profile has existing ProfileAlias records that would be lost. Cannot safely merge in V1.",
      PLACEHOLDER_HAS_ACCOUNT:                  "The placeholder user has Account rows (unexpected auth state). Investigate the import pipeline before proceeding.",
      PLACEHOLDER_HAS_SESSION:                  "The placeholder user has active Sessions (should never happen for imported users). Investigate before proceeding.",
      PLACEHOLDER_HAS_TWOFACTOR:                "The placeholder user has a TwoFactor record (unexpected). Investigate before proceeding.",
      PLACEHOLDER_HAS_TOKEN:                    "The placeholder user has PlatformToken rows (invariant violation — imported users cannot connect OAuth). Investigate the import pipeline.",
      PLACEHOLDER_HAS_MESSAGES:                 "The placeholder user has message rows. Cannot auto-migrate conversation history.",
      PLACEHOLDER_HAS_OFFICIAL_STATS:           "The placeholder user has OFFICIAL_API PlatformStats (invariant violation — imported users cannot have OAuth stats). Investigate.",
      APPLICATION_COLLISION:                    "Both profiles have Applications for the same campaign. Cannot auto-merge commercial history. Resolve the collision manually before approving.",
      RP_DISAPPEARED:                           "The registered profile disappeared during the merge transaction. Please retry.",
      PLACEHOLDER_ALIAS_CONFLICT:               "A ProfileAlias for the placeholder user already points to a different creator profile. Cannot overwrite an existing alias — this is an identity/URL safety invariant. Investigate before proceeding.",
    };

    console.error("[mergeAndApproveClaimAction]", err);
    return {
      success: false,
      error: errorMessages[errorCode] ?? "Merge failed. Please try again.",
      errorCode,
    };
  }
}

