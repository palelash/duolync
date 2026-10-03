"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma";
import { headers } from "next/headers";
import { z } from "zod";

export type SelectRoleResult =
  | { success: true; error: null }
  | { success: false; error: string };

export async function selectRole(
  role: "BRAND" | "CREATOR",
): Promise<SelectRoleResult> {
  const authResult = await requireSessionUserId();
  if (!authResult.userId) {
    return { success: false, error: authResult.error ?? "Unauthorized" };
  }
  try {
    await db.user.update({
      where: { id: authResult.userId },
      data: { role: role === "BRAND" ? Role.BRAND : Role.CREATOR },
    });
    return { success: true, error: null };
  } catch {
    return { success: false, error: "Failed to set role" };
  }
}

const imageUrlSchema = z.string().url().optional();

const brandOnboardingSchema = z.object({
  imageUrl: imageUrlSchema,
  bio: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  companyName: z.string().trim().min(1, "Company name is required"),
  industry: z.string().optional(),
  website: z.union([z.string().url(), z.literal("")]).optional(),
  brandAccountType: z.enum(["company", "personal"]).optional(),
});

const creatorOnboardingSchema = z.object({
  imageUrl: imageUrlSchema,
  bio: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  niche: z.string().optional(),
  primaryPlatform: z.string().optional(),
});

export type BrandOnboardingInput = z.infer<typeof brandOnboardingSchema>;
export type CreatorOnboardingInput = z.infer<typeof creatorOnboardingSchema>;
export type CompleteOnboardingInput =
  | BrandOnboardingInput
  | CreatorOnboardingInput;

export type CompleteOnboardingResult =
  | { success: true; error: null }
  | { success: false; error: string };

async function requireSessionUserId(): Promise<
  { userId: string; error: null } | { userId: null; error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { userId: null, error: "Unauthorized" };
  }
  return { userId: session.user.id, error: null };
}

/**
 * Atomically completes multi-step onboarding: marks the user as onboarded,
 * persists the profile image, and upserts the role-specific profile record.
 */
export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  const authResult = await requireSessionUserId();
  if (!authResult.userId) {
    return { success: false, error: authResult.error ?? "Unauthorized" };
  }

  const userId = authResult.userId;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, hasCompletedOnboarding: true },
  });

  if (!user) {
    return { success: false, error: "User not found" };
  }

  if (user.hasCompletedOnboarding) {
    return { success: false, error: "Onboarding already completed" };
  }

  try {
    if (user.role === Role.BRAND) {
      const data = brandOnboardingSchema.parse(input);

      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            hasCompletedOnboarding: true,
            ...(data.imageUrl ? { image: data.imageUrl } : {}),
          },
        });

        await tx.brandProfile.upsert({
          where: { userId },
          create: {
            userId,
            companyName: data.companyName,
            industry: data.industry ?? null,
            website: data.website || null,
            brandAccountType: data.brandAccountType ?? null,
            bio: data.bio ?? null,
            location: data.location ?? null,
          },
          update: {
            companyName: data.companyName,
            industry: data.industry ?? null,
            website: data.website || null,
            brandAccountType: data.brandAccountType ?? null,
            bio: data.bio ?? null,
            location: data.location ?? null,
          },
        });
      });
    } else {
      const data = creatorOnboardingSchema.parse(input);

      // ── Guard: PENDING claim blocks profile creation ───────────────────────
      // If a PENDING claim exists and no CreatorProfile has been created yet,
      // block onboarding to prevent accidentally creating a Scenario B state
      // before the admin reviews the claim.
      //
      // After claim APPROVAL: CreatorProfile.userId = requesterUserId, so
      // findUnique({ where: { userId } }) will find the claimed profile.
      // The upsert fires the UPDATE path — no duplicate profile is created.
      //
      // After claim REJECTION: no PENDING claim exists → guard passes → fresh
      // REGISTERED CreatorProfile is created normally.
      const existingProfile = await db.creatorProfile.findUnique({
        where: { userId },
        select: { id: true, claimStatus: true },
      });

      if (!existingProfile) {
        // No existing profile: check for a pending claim before creating one
        const pendingClaim = await db.profileClaim.findFirst({
          where: { requesterUserId: userId, status: "PENDING" },
          select: { id: true },
        });
        if (pendingClaim) {
          return {
            success: false,
            error:
              "Your profile claim is under review. Onboarding will be available once your claim is resolved.",
          };
        }
      }

      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            hasCompletedOnboarding: true,
            ...(data.imageUrl ? { image: data.imageUrl } : {}),
          },
        });

        // The upsert update clause intentionally touches ONLY user-provided
        // onboarding fields (bio, niche, primaryPlatform, location).
        // It does NOT touch: profileOrigin, claimStatus, claimedByUserId,
        // claimedAt, importedEmail, importedAt, importBatchId, socialLinks,
        // followerCount, averageEngagement, moderationStatus, connectedPlatforms.
        // These fields are preserved across onboarding for claimed profiles.
        await tx.creatorProfile.upsert({
          where: { userId },
          create: {
            userId,
            bio: data.bio ?? null,
            niche: data.niche ?? null,
            primaryPlatform: data.primaryPlatform ?? null,
            location: data.location ?? null,
            // profileOrigin and claimStatus default via @default in schema
          },
          update: {
            // Only update user-provided onboarding fields; preserve all
            // provenance, claim, import, and analytics data.
            bio: data.bio ?? null,
            niche: data.niche ?? null,
            primaryPlatform: data.primaryPlatform ?? null,
            location: data.location ?? null,
          },
        });
      });
    }

    return { success: true, error: null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        error: err.errors[0]?.message ?? "Invalid onboarding data",
      };
    }
    console.error("[completeOnboarding]", err);
    return { success: false, error: "Failed to complete onboarding" };
  }
}
