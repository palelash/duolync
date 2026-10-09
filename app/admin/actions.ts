"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/roles";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { revokeTikTokAuthorization } from "@/lib/tiktok-revoke";
import { prepareYouTubeAccountDeletion, assertYouTubeAccountDeletion, isYouTubeRevokeConfirmationUnavailable } from "@/lib/youtube-revoke";
import {
  normaliseUrl,
  isValidAvatarUrl,
  isValidSocialLinkUrl,
  isTrustableImportedEmail,
  extractHandle,
  extractHandlesFromSocialLinks,
} from "@/lib/import-utils";
import { parseSocialLinks } from "@/lib/social-links";

// ── Notification helper ───────────────────────────────────────────────────────

async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
  link = "/dashboard",
) {
  try {
    await db.notification.create({ data: { userId, type, title, body, link } });
  } catch {
    // Notification failure must never break the main moderation action
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = null> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

// ── Admin guard ───────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !isAdmin(session.user.role)) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

// ── Test user generation ──────────────────────────────────────────────────────

const TEST_PASSWORD = "TestDuolync#2024!";

const FIRST_NAMES = [
  "Alex", "Jordan", "Sam", "Taylor", "Morgan",
  "Casey", "Riley", "Avery", "Quinn", "Drew",
  "Reese", "Blake", "Sage", "Skyler", "Dakota",
];
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones",
  "Garcia", "Miller", "Davis", "Wilson", "Moore",
  "Anderson", "Thomas", "Jackson", "White", "Harris",
];
const NICHES = ["Lifestyle", "Tech", "Fashion", "Food", "Travel", "Fitness", "Gaming", "Beauty"];
const INDUSTRIES = ["Technology", "Fashion", "FMCG", "Healthcare", "Media", "Finance", "Retail"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function generateTestUser(
  type: "brand" | "creator",
): Promise<ActionResult<{ email: string; password: string; name: string; type: string }>> {
  try {
    await requireAdmin();

    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const slug = `${firstName.toLowerCase()}${Math.floor(Math.random() * 9000) + 1000}`;
    const email = `test.${slug}@duolync-test.dev`;

    // Use Better Auth's own sign-up so the password is hashed with its algorithm.
    // This means the test account can actually be logged into.
    const result = await auth.api.signUpEmail({
      body: { email, password: TEST_PASSWORD, name },
    });

    const userId = (result as { user: { id: string } }).user.id;

    // Override role, mark onboarding complete, verify email
    await db.user.update({
      where: { id: userId },
      data: {
        role: type === "brand" ? "BRAND" : "CREATOR",
        hasCompletedOnboarding: true,
        emailVerified: true,
      },
    });

    // Seed a minimal profile so the dashboard renders
    if (type === "brand") {
      await db.brandProfile.create({
        data: {
          userId,
          companyName: `${firstName}'s ${pick(INDUSTRIES)} Co.`,
          industry: pick(INDUSTRIES),
        },
      });
    } else {
      await db.creatorProfile.create({
        data: {
          userId,
          bio: `Test creator account — ${pick(NICHES)} niche.`,
          niche: pick(NICHES),
        },
      });
    }

    // Clean up the auto-created session (test user is created, not logged in)
    await db.session.deleteMany({ where: { userId } });

    revalidatePath("/admin/users");

    return {
      success: true,
      data: { email, password: TEST_PASSWORD, name, type },
      error: null,
    };
  } catch (err) {
    console.error("[generateTestUser]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to create test user",
    };
  }
}

// ── Delete user ───────────────────────────────────────────────────────────────

export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (admin.id === userId) {
      return { success: false, data: null, error: "Cannot delete your own account" };
    }

    // Prevent deleting another admin
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (isAdmin(target?.role)) {
      return { success: false, data: null, error: "Cannot delete an admin account" };
    }

    // ── Guard 1: Block if user owns a CLAIMED CreatorProfile ─────────────────
    // Deleting this user triggers onDelete: Cascade on CreatorProfile.userId,
    // which would destroy the claimed profile and cascade to Applications,
    // Contracts, SocialPosts, etc. Use a dedicated admin ownership-transfer
    // workflow instead (not yet implemented).
    const claimedProfile = await db.creatorProfile.findFirst({
      where: { userId, claimStatus: "CLAIMED" },
      select: { id: true },
    });
    if (claimedProfile) {
      return {
        success: false,
        data: null,
        error:
          "Cannot delete a user who owns a claimed creator profile. Use the ownership transfer workflow to reassign the profile first.",
      };
    }

    // Provider HTTP stays outside DB transactions. On failure, keep the
    // account and credential for retry. Existing cascades remove YouTube data.
    let youtube = await prepareYouTubeAccountDeletion(userId);
    if (youtube.error) return { success: false, data: null, error: youtube.error };

    // ── TikTok revoke (OUTSIDE delete transaction) ────────────────────────────
    // All existing admin/security guards and the claimed-profile guard have
    // already run. Revoke only the already-authorized target userId.
    const revokeResult = await revokeTikTokAuthorization(userId);

    switch (revokeResult) {
      case "temporary_failure":
        return {
          success: false,
          data: null,
          error:
            "Account was not deleted because TikTok authorization could not be revoked. Please try again.",
        };

      case "configuration_error":
        return {
          success: false,
          data: null,
          error:
            "Account was not deleted because TikTok authorization could not be revoked. Please contact support.",
        };

      case "revoked": {
        // TikTok authorization is now dead at TikTok's end but the local
        // PlatformToken row still exists. Remove it in its own committed
        // operation BEFORE the user-delete transaction so that a later retry
        // sees not_connected and can proceed safely.
        try {
          await db.platformToken.deleteMany({
            where: { userId, platform: "tiktok" },
          });
        } catch (tokenErr) {
          console.error(
            "[deleteUser] Failed to delete TikTok PlatformToken after revoke",
            tokenErr,
          );
          return { success: false, data: null, error: "Failed to delete user" };
        }
        break;
      }

      // already_revoked / not_connected — safe to proceed.
      case "already_revoked":
      case "not_connected":
        break;
    }

    // ── Guard 2: Cancel any PENDING claims before deleting ────────────────────
    // Without this, ProfileClaim.requesterUserId would be set to NULL but
    // CreatorProfile.claimStatus would remain CLAIM_PENDING — an orphaned state.
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
        if (youtube.error) return { success: false, data: null, error: youtube.error };
      }
    }

    revalidatePath("/admin/users");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[deleteUser]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to delete user",
    };
  }
}

// ── Ban / Unban ───────────────────────────────────────────────────────────────

export async function banUser(
  userId: string,
  reason = "Suspended by admin",
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (admin.id === userId) {
      return { success: false, data: null, error: "Cannot ban your own account" };
    }

    const target = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (isAdmin(target?.role)) {
      return { success: false, data: null, error: "Cannot ban an admin account" };
    }

    await db.user.update({
      where: { id: userId },
      data: { banned: true, banReason: reason },
    });
    // Immediately invalidate all active sessions → user is kicked out
    await db.session.deleteMany({ where: { userId } });

    revalidatePath("/admin/users");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[banUser]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to ban user",
    };
  }
}

export async function unbanUser(userId: string): Promise<ActionResult> {
  try {
    await requireAdmin();

    await db.user.update({
      where: { id: userId },
      data: { banned: false, banReason: null },
    });

    revalidatePath("/admin/users");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[unbanUser]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to unban user",
    };
  }
}

// ── Content & Profile Moderation ──────────────────────────────────────────────

export async function approveCreator(
  creatorProfileId: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const profile = await db.creatorProfile.update({
      where: { id: creatorProfileId },
      data: { moderationStatus: "APPROVED", moderationNote: null, moderatedAt: new Date() },
      select: { userId: true },
    });

    await notify(
      profile.userId,
      "SYSTEM",
      "🎉 Profile approved!",
      "Your creator profile has been approved. You're now visible on the Discover page.",
      "/dashboard",
    );

    revalidatePath("/admin/moderation");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[approveCreator]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to approve creator",
    };
  }
}

export async function rejectCreator(
  creatorProfileId: string,
  reason?: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const profile = await db.creatorProfile.update({
      where: { id: creatorProfileId },
      data: {
        moderationStatus: "REJECTED",
        moderationNote: reason ?? null,
        moderatedAt: new Date(),
      },
      select: { userId: true },
    });

    await notify(
      profile.userId,
      "SYSTEM",
      "Profile review update",
      reason
        ? `Your creator profile was not approved: ${reason}`
        : "Your creator profile was not approved at this time. Please update your profile and it will be re-reviewed.",
      "/dashboard",
    );

    revalidatePath("/admin/moderation");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[rejectCreator]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to reject creator",
    };
  }
}

export async function setPendingCreator(
  creatorProfileId: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    await db.creatorProfile.update({
      where: { id: creatorProfileId },
      data: { moderationStatus: "PENDING", moderationNote: null, moderatedAt: null },
    });

    revalidatePath("/admin/moderation");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[setPendingCreator]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to reset creator status",
    };
  }
}

export async function approveCampaign(
  campaignId: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const campaign = await db.campaign.update({
      where: { id: campaignId },
      data: { moderationStatus: "APPROVED", moderationNote: null, moderatedAt: new Date() },
      select: { title: true, brand: { select: { userId: true } } },
    });

    await notify(
      campaign.brand.userId,
      "CAMPAIGN_UPDATE",
      "🎉 Campaign approved!",
      `Your campaign "${campaign.title}" has been approved and is now visible to creators.`,
      "/brand/campaigns",
    );

    revalidatePath("/admin/moderation");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[approveCampaign]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to approve campaign",
    };
  }
}

export async function rejectCampaign(
  campaignId: string,
  reason?: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const campaign = await db.campaign.update({
      where: { id: campaignId },
      data: {
        moderationStatus: "REJECTED",
        moderationNote: reason ?? null,
        moderatedAt: new Date(),
      },
      select: { title: true, brand: { select: { userId: true } } },
    });

    await notify(
      campaign.brand.userId,
      "CAMPAIGN_UPDATE",
      "Campaign review update",
      reason
        ? `Your campaign "${campaign.title}" was not approved: ${reason}`
        : `Your campaign "${campaign.title}" was not approved at this time. Please review your campaign details.`,
      "/brand/campaigns",
    );

    revalidatePath("/admin/moderation");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[rejectCampaign]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to reject campaign",
    };
  }
}

export async function setPendingCampaign(
  campaignId: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    await db.campaign.update({
      where: { id: campaignId },
      data: { moderationStatus: "PENDING", moderationNote: null, moderatedAt: null },
    });

    revalidatePath("/admin/moderation");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[setPendingCampaign]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to reset campaign status",
    };
  }
}

// ── Dispute Resolution ────────────────────────────────────────────────────────

export type DisputeStatusValue = "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";

export async function updateDisputeStatus(
  disputeId: string,
  status: DisputeStatusValue,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const dispute = await db.dispute.update({
      where: { id: disputeId },
      data: { status },
      select: { brandId: true, creatorId: true, reporterId: true, targetUserId: true, status: true },
    });

    if (status === "RESOLVED" || status === "CLOSED") {
      const label = status === "RESOLVED" ? "resolved" : "closed";
      const partyIds = [
        dispute.brandId,
        dispute.creatorId,
        dispute.reporterId,
        dispute.targetUserId,
      ].filter((id): id is string => id !== null);
      const uniqueIds = [...new Set(partyIds)];
      for (const userId of uniqueIds) {
        await notify(
          userId,
          "SYSTEM",
          `Dispute ${label}`,
          `An admin has marked your dispute as ${label}.`,
          "/dashboard",
        );
      }
    }

    revalidatePath("/admin/disputes");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[updateDisputeStatus]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to update dispute status",
    };
  }
}

export async function addDisputeResolutionNotes(
  disputeId: string,
  notes: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    await db.dispute.update({
      where: { id: disputeId },
      data: { resolutionNotes: notes },
    });

    revalidatePath("/admin/disputes");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[addDisputeResolutionNotes]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to save resolution notes",
    };
  }
}

export async function resolveDispute(
  disputeId: string,
  notes?: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const dispute = await db.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", resolutionNotes: notes ?? null },
      select: { brandId: true, creatorId: true, reporterId: true, targetUserId: true },
    });

    const resolveIds = [
      dispute.brandId, dispute.creatorId, dispute.reporterId, dispute.targetUserId,
    ].filter((id): id is string => id !== null);
    for (const userId of [...new Set(resolveIds)]) {
      await notify(
        userId,
        "SYSTEM",
        "Dispute resolved",
        notes
          ? `Your dispute has been resolved by an admin: ${notes}`
          : "Your dispute has been resolved by an admin.",
        "/dashboard",
      );
    }

    revalidatePath("/admin/disputes");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[resolveDispute]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to resolve dispute",
    };
  }
}

export async function closeDispute(
  disputeId: string,
  notes?: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const dispute = await db.dispute.update({
      where: { id: disputeId },
      data: { status: "CLOSED", resolutionNotes: notes ?? null },
      select: { brandId: true, creatorId: true, reporterId: true, targetUserId: true },
    });

    const closeIds = [
      dispute.brandId, dispute.creatorId, dispute.reporterId, dispute.targetUserId,
    ].filter((id): id is string => id !== null);
    for (const userId of [...new Set(closeIds)]) {
      await notify(
        userId,
        "SYSTEM",
        "Dispute closed",
        "Your dispute has been closed by an admin.",
        "/dashboard",
      );
    }

    revalidatePath("/admin/disputes");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[closeDispute]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to close dispute",
    };
  }
}

/** Fetch messages exchanged between the brand user and creator user for communication audit. */
export async function getDisputeMessages(
  brandUserId: string,
  creatorUserId: string,
): Promise<
  ActionResult<
    {
      id: string;
      text: string;
      createdAt: Date;
      senderId: string;
      sender: { name: string | null; image: string | null };
    }[]
  >
> {
  try {
    await requireAdmin();

    const messages = await db.message.findMany({
      where: {
        OR: [
          { senderId: brandUserId, receiverId: creatorUserId },
          { senderId: creatorUserId, receiverId: brandUserId },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        text: true,
        createdAt: true,
        senderId: true,
        sender: { select: { name: true, image: true } },
      },
    });

    return { success: true, data: messages, error: null };
  } catch (err) {
    console.error("[getDisputeMessages]", err);
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch messages",
    };
  }
}

// ── Imported Creator Builder ──────────────────────────────────────────────────

const IMPORT_BATCH_ID = "admin-builder-v1";
const SOCIAL_PLATFORMS = ["instagram", "tiktok", "youtube", "threads"] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateImportedCreatorInput = {
  name: string;
  imageUrl?: string;
  bio?: string;
  niche?: string;
  location?: string;
  socialLinks: { platform: string; url: string }[];
  importedEmail?: string;
  totalFollowers?: number;
  /** Pass true to proceed despite an importedEmail duplicate warning. */
  acknowledgeEmailDuplicate?: boolean;
};

export type CreateImportedCreatorResult =
  | {
      success: true;
      data: {
        userId: string;
        creatorProfileId: string;
        /** Relative path: /claim/{creatorProfileId} */
        claimUrl: string;
        /** Relative path: /profile/{userId} */
        profileUrl: string;
      };
      error: null;
    }
  | {
      success: false;
      data: null;
      error: "duplicate_social_identity";
      duplicateProfileId: string;
      duplicateUserId: string;
      duplicateName: string | null;
      duplicateClaimStatus: string | null;
    }
  | {
      success: false;
      data: null;
      error: "email_duplicate_warning";
      emailDuplicateWarning: { count: number; matchingProfileIds: string[] };
    }
  | {
      success: false;
      data: null;
      error: string;
    };

export type ImportedCreatorEditData = {
  creatorProfileId: string;
  claimStatus: string;
  profileOrigin: string;
  name: string | null;
  imageUrl: string | null;
  bio: string | null;
  niche: string | null;
  location: string | null;
  socialLinks: { platform: string; url: string }[];
  importedEmail: string | null;
  totalFollowers: number | null;
};

export type UpdateImportedCreatorInput = {
  name?: string;
  imageUrl?: string | null;
  bio?: string | null;
  niche?: string | null;
  location?: string | null;
  /** Only writable when claimStatus = UNCLAIMED */
  socialLinks?: { platform: string; url: string }[];
  /** Only writable when claimStatus = UNCLAIMED */
  importedEmail?: string | null;
  /** Only writable when claimStatus = UNCLAIMED */
  totalFollowers?: number | null;
};

// ── Internal dedup helper ─────────────────────────────────────────────────────

type DedupCheckResult =
  | { isDuplicate: false }
  | {
      isDuplicate: true;
      duplicateProfileId: string;
      duplicateUserId: string;
      duplicateName: string | null;
      duplicateClaimStatus: string | null;
    };

async function checkSocialDuplicates(
  socialLinks: { platform: string; url: string }[],
  excludeProfileId?: string,
): Promise<DedupCheckResult> {
  if (socialLinks.length === 0) return { isDuplicate: false };

  // Load all existing profiles' socialLinks for TypeScript-side comparison.
  // Admin tooling — low volume, acceptable.
  const allProfiles = await db.creatorProfile.findMany({
    select: {
      id: true,
      userId: true,
      claimStatus: true,
      socialLinks: true,
      user: { select: { name: true } },
    },
  });

  for (const platform of SOCIAL_PLATFORMS) {
    const inputLink = socialLinks.find(
      (l) => l.platform.toLowerCase() === platform,
    );
    if (!inputLink?.url?.trim()) continue;

    const normalised = normaliseUrl(inputLink.url.trim());
    const inputHandle = extractHandle(normalised, platform);
    if (!inputHandle) continue; // fail-open on ambiguous URLs

    for (const profile of allProfiles) {
      if (excludeProfileId && profile.id === excludeProfileId) continue;
      const existingHandles = extractHandlesFromSocialLinks(
        profile.socialLinks,
        platform,
      );
      if (existingHandles.includes(inputHandle)) {
        return {
          isDuplicate: true,
          duplicateProfileId: profile.id,
          duplicateUserId: profile.userId,
          duplicateName: profile.user.name,
          duplicateClaimStatus: profile.claimStatus as string,
        };
      }
    }
  }

  return { isDuplicate: false };
}

// ── createImportedCreatorAction ───────────────────────────────────────────────

export async function createImportedCreatorAction(
  input: CreateImportedCreatorInput,
): Promise<CreateImportedCreatorResult> {
  try {
    await requireAdmin();

    // ── 1. Validate inputs ──────────────────────────────────────────────────
    const name = input.name?.trim();
    if (!name) {
      return { success: false, data: null, error: "Name is required" };
    }

    if (input.imageUrl?.trim() && !isValidAvatarUrl(input.imageUrl.trim())) {
      return {
        success: false,
        data: null,
        error: "Avatar URL must be a valid HTTPS URL",
      };
    }

    for (const link of input.socialLinks) {
      if (link.url?.trim() && !isValidSocialLinkUrl(link.url.trim())) {
        return {
          success: false,
          data: null,
          error: `Invalid URL for ${link.platform}`,
        };
      }
    }

    if (
      typeof input.totalFollowers === "number" &&
      (!Number.isInteger(input.totalFollowers) || input.totalFollowers < 0)
    ) {
      return {
        success: false,
        data: null,
        error: "Total followers must be a non-negative integer",
      };
    }

    // ── 2. Normalise social links ───────────────────────────────────────────
    const normalisedLinks = input.socialLinks
      .filter((l) => l.url?.trim())
      .map((l) => ({
        platform: l.platform.toLowerCase().trim(),
        url: normaliseUrl(l.url.trim()),
      }));

    // ── 3. Normalise importedEmail ──────────────────────────────────────────
    const rawEmail = input.importedEmail?.trim().toLowerCase() ?? null;
    const trustedEmail =
      rawEmail && isTrustableImportedEmail(rawEmail) ? rawEmail : null;

    // ── 4. Hard duplicate check: social identity ────────────────────────────
    const dedupResult = await checkSocialDuplicates(normalisedLinks);
    if (dedupResult.isDuplicate) {
      return {
        success: false,
        data: null,
        error: "duplicate_social_identity",
        duplicateProfileId: dedupResult.duplicateProfileId,
        duplicateUserId: dedupResult.duplicateUserId,
        duplicateName: dedupResult.duplicateName,
        duplicateClaimStatus: dedupResult.duplicateClaimStatus,
      };
    }

    // ── 5. Soft duplicate check: importedEmail (warning only) ───────────────
    if (trustedEmail && !input.acknowledgeEmailDuplicate) {
      const emailMatches = await db.creatorProfile.findMany({
        where: { importedEmail: trustedEmail },
        select: { id: true },
      });
      if (emailMatches.length > 0) {
        return {
          success: false,
          data: null,
          error: "email_duplicate_warning",
          emailDuplicateWarning: {
            count: emailMatches.length,
            matchingProfileIds: emailMatches.map((p) => p.id),
          },
        };
      }
    }

    // ── 6. Create User + CreatorProfile in one transaction ──────────────────
    const placeholderEmail = `imported-${crypto.randomUUID()}@placeholder.duolync.invalid`;

    const { newUser, newProfile } = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: placeholderEmail,
          name,
          image: input.imageUrl?.trim() || null,
          role: "CREATOR",
          isImported: true,
          emailVerified: false,
          hasCompletedOnboarding: false,
        },
        select: { id: true },
      });

      const newProfile = await tx.creatorProfile.create({
        data: {
          userId: newUser.id,
          bio: input.bio?.trim() || null,
          niche: input.niche?.trim() || null,
          location: input.location?.trim() || null,
          socialLinks: normalisedLinks.length > 0 ? normalisedLinks : undefined,
          profileOrigin: "IMPORTED",
          claimStatus: "UNCLAIMED",
          moderationStatus: "PENDING",
          importedEmail: trustedEmail,
          importedAt: new Date(),
          importBatchId: IMPORT_BATCH_ID,
          // Follower aggregate — written to both fields per metrics reader contract
          totalFollowers:
            typeof input.totalFollowers === "number" &&
            input.totalFollowers > 0
              ? input.totalFollowers
              : 0,
          followerCount:
            typeof input.totalFollowers === "number" &&
            input.totalFollowers > 0
              ? input.totalFollowers
              : null,
        },
        select: { id: true },
      });

      return { newUser, newProfile };
    });

    revalidatePath("/admin/users");

    return {
      success: true,
      data: {
        userId: newUser.id,
        creatorProfileId: newProfile.id,
        claimUrl: `/claim/${newProfile.id}`,
        profileUrl: `/profile/${newUser.id}`,
      },
      error: null,
    };
  } catch (err) {
    console.error("[createImportedCreatorAction]", err);
    return {
      success: false,
      data: null,
      error:
        err instanceof Error ? err.message : "Failed to create imported creator",
    };
  }
}

// ── getImportedCreatorForEditAction ───────────────────────────────────────────

export async function getImportedCreatorForEditAction(
  creatorProfileId: string,
): Promise<ActionResult<ImportedCreatorEditData>> {
  try {
    await requireAdmin();

    const profile = await db.creatorProfile.findUnique({
      where: { id: creatorProfileId },
      select: {
        id: true,
        claimStatus: true,
        profileOrigin: true,
        bio: true,
        niche: true,
        location: true,
        socialLinks: true,
        importedEmail: true,
        followerCount: true,
        totalFollowers: true,
        user: {
          select: { name: true, image: true },
        },
      },
    });

    if (!profile) {
      return {
        success: false,
        data: null,
        error: "Creator profile not found",
      };
    }

    if (profile.profileOrigin !== "IMPORTED") {
      return {
        success: false,
        data: null,
        error: "This profile is not an imported creator",
      };
    }

    // Normalise socialLinks to array format regardless of stored format
    const parsed = parseSocialLinks(profile.socialLinks);
    const socialLinksArray = Object.entries(parsed).map(
      ([platform, url]) => ({ platform, url }),
    );

    return {
      success: true,
      data: {
        creatorProfileId: profile.id,
        claimStatus: profile.claimStatus as string,
        profileOrigin: profile.profileOrigin as string,
        name: profile.user.name,
        imageUrl: profile.user.image,
        bio: profile.bio,
        niche: profile.niche,
        location: profile.location,
        socialLinks: socialLinksArray,
        importedEmail: profile.importedEmail,
        totalFollowers: profile.followerCount ?? (profile.totalFollowers > 0 ? profile.totalFollowers : null),
      },
      error: null,
    };
  } catch (err) {
    console.error("[getImportedCreatorForEditAction]", err);
    return {
      success: false,
      data: null,
      error:
        err instanceof Error
          ? err.message
          : "Failed to load creator for edit",
    };
  }
}

// ── updateImportedCreatorAction ───────────────────────────────────────────────

export async function updateImportedCreatorAction(
  creatorProfileId: string,
  input: UpdateImportedCreatorInput,
): Promise<ActionResult> {
  try {
    await requireAdmin();

    // ── Load current state ──────────────────────────────────────────────────
    const profile = await db.creatorProfile.findUnique({
      where: { id: creatorProfileId },
      select: {
        claimStatus: true,
        profileOrigin: true,
        userId: true,
      },
    });

    if (!profile) {
      return { success: false, data: null, error: "Creator profile not found" };
    }

    if (profile.profileOrigin !== "IMPORTED") {
      return {
        success: false,
        data: null,
        error: "This profile is not an imported creator",
      };
    }

    const claimStatus = profile.claimStatus as string;

    // CLAIMED: reject all imported builder edits
    if (claimStatus === "CLAIMED") {
      return {
        success: false,
        data: null,
        error:
          "This profile has been claimed and cannot be edited through the imported creator builder",
      };
    }

    // ── Validate shared presentation fields ─────────────────────────────────
    if (input.name !== undefined && !input.name.trim()) {
      return { success: false, data: null, error: "Name cannot be empty" };
    }

    if (
      input.imageUrl !== undefined &&
      input.imageUrl !== null &&
      input.imageUrl.trim() &&
      !isValidAvatarUrl(input.imageUrl.trim())
    ) {
      return {
        success: false,
        data: null,
        error: "Avatar URL must be a valid HTTPS URL",
      };
    }

    // ── CLAIM_PENDING: only presentation fields allowed ─────────────────────
    if (claimStatus === "CLAIM_PENDING") {
      if (
        input.socialLinks !== undefined ||
        input.importedEmail !== undefined ||
        input.totalFollowers !== undefined
      ) {
        return {
          success: false,
          data: null,
          error:
            "Social links, contact email, and follower count cannot be changed while a claim is pending",
        };
      }
    }

    // ── UNCLAIMED: validate extra fields ────────────────────────────────────
    if (claimStatus === "UNCLAIMED") {
      if (input.socialLinks) {
        for (const link of input.socialLinks) {
          if (link.url?.trim() && !isValidSocialLinkUrl(link.url.trim())) {
            return {
              success: false,
              data: null,
              error: `Invalid URL for ${link.platform}`,
            };
          }
        }
      }

      if (
        typeof input.totalFollowers === "number" &&
        (!Number.isInteger(input.totalFollowers) || input.totalFollowers < 0)
      ) {
        return {
          success: false,
          data: null,
          error: "Total followers must be a non-negative integer",
        };
      }

      // Social dedup for UNCLAIMED edit (exclude self)
      if (input.socialLinks && input.socialLinks.length > 0) {
        const normalisedLinks = input.socialLinks
          .filter((l) => l.url?.trim())
          .map((l) => ({
            platform: l.platform.toLowerCase().trim(),
            url: normaliseUrl(l.url.trim()),
          }));
        const dedupResult = await checkSocialDuplicates(
          normalisedLinks,
          creatorProfileId,
        );
        if (dedupResult.isDuplicate) {
          return {
            success: false,
            data: null,
            error: `Social link conflict: a profile with this ${normalisedLinks[0]?.platform ?? "social"} handle already exists`,
          };
        }
      }
    }

    // ── Build update objects ────────────────────────────────────────────────
    const userUpdate: { name?: string; image?: string | null } = {};
    if (input.name !== undefined) userUpdate.name = input.name.trim();
    if (input.imageUrl !== undefined)
      userUpdate.image =
        input.imageUrl?.trim() || null;

    const profileUpdate: Record<string, unknown> = {};
    if (input.bio !== undefined) profileUpdate.bio = input.bio?.trim() || null;
    if (input.niche !== undefined)
      profileUpdate.niche = input.niche?.trim() || null;
    if (input.location !== undefined)
      profileUpdate.location = input.location?.trim() || null;

    // Only write restricted fields when UNCLAIMED
    if (claimStatus === "UNCLAIMED") {
      if (input.socialLinks !== undefined) {
        const normalisedLinks = input.socialLinks
          .filter((l) => l.url?.trim())
          .map((l) => ({
            platform: l.platform.toLowerCase().trim(),
            url: normaliseUrl(l.url.trim()),
          }));
        profileUpdate.socialLinks =
          normalisedLinks.length > 0 ? normalisedLinks : null;
      }

      if (input.importedEmail !== undefined) {
        const raw = input.importedEmail?.trim().toLowerCase() ?? null;
        profileUpdate.importedEmail =
          raw && isTrustableImportedEmail(raw) ? raw : null;
      }

      if (input.totalFollowers !== undefined) {
        const val =
          typeof input.totalFollowers === "number" &&
          input.totalFollowers > 0
            ? input.totalFollowers
            : null;
        profileUpdate.totalFollowers = val ?? 0;
        profileUpdate.followerCount = val;
      }
    }

    // ── Execute updates ─────────────────────────────────────────────────────
    const hasUserUpdate = Object.keys(userUpdate).length > 0;
    const hasProfileUpdate = Object.keys(profileUpdate).length > 0;

    if (hasUserUpdate || hasProfileUpdate) {
      await db.$transaction(async (tx) => {
        if (hasUserUpdate) {
          await tx.user.update({
            where: { id: profile.userId },
            data: userUpdate,
          });
        }
        if (hasProfileUpdate) {
          await tx.creatorProfile.update({
            where: { id: creatorProfileId },
            data: profileUpdate,
          });
        }
      });
    }

    revalidatePath("/admin/users");
    return { success: true, data: null, error: null };
  } catch (err) {
    console.error("[updateImportedCreatorAction]", err);
    return {
      success: false,
      data: null,
      error:
        err instanceof Error
          ? err.message
          : "Failed to update imported creator",
    };
  }
}
