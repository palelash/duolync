"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/roles";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

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

    await db.user.delete({ where: { id: userId } });
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
