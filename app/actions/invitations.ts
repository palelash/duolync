"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role, InvitationStatus } from "@/lib/generated/prisma";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

async function getBrandProfile() {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      name: true,
      brandProfile: { select: { id: true, companyName: true } },
    },
  });
  if (!user || user.role !== Role.BRAND || !user.brandProfile) return null;
  return {
    userId: session.user.id,
    name: user.name,
    profileId: user.brandProfile.id,
    companyName: user.brandProfile.companyName,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvitationItem {
  id: string;
  status: string;
  message: string | null;
  proposedBudget: number | null;
  createdAt: string;
  campaign: {
    id: string;
    title: string;
    description: string;
    budget: number;
    platforms: string[];
    deadline: string | null;
    imageUrl: string | null;
  };
  brand: {
    id: string;
    companyName: string;
    userId: string;
    avatarUrl: string | null;
    industry: string | null;
  };
}

export interface SentInvitationItem {
  id: string;
  status: string;
  message: string | null;
  proposedBudget: number | null;
  createdAt: string;
  campaign: { id: string; title: string };
  creator: {
    userId: string;
    name: string | null;
    avatarUrl: string | null;
  };
}

// ── Brand: send invitation ────────────────────────────────────────────────────

export async function sendBrandInvitationAction(input: {
  creatorUserId: string;
  campaignId: string;
  message?: string;
  proposedBudget?: number;
}): Promise<{ error: string | null; invitationId?: string }> {
  const brand = await getBrandProfile();
  if (!brand) return { error: "Unauthorized" };

  // Rate limit: max 20 invitations per hour per brand
  const { rateLimit } = await import("@/lib/rate-limit");
  const allowed = await rateLimit(`${brand.userId}:send-invitation`, 20, 60 * 60_000);
  if (!allowed) return { error: "You're sending too many invitations. Please wait before sending more." };

  const campaign = await db.campaign.findFirst({
    where: { id: input.campaignId, brandProfileId: brand.profileId },
  });
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status !== "ACTIVE") return { error: "Only active campaigns can be used for invitations." };

  const creatorUser = await db.user.findUnique({
    where: { id: input.creatorUserId },
    select: { id: true, role: true, isImported: true },
  });
  if (!creatorUser || creatorUser.role !== Role.CREATOR) return { error: "Creator not found." };
  if (creatorUser.isImported) {
    return { error: "This creator hasn't joined Duolync yet." };
  }

  const existing = await db.invitation.findUnique({
    where: { campaignId_creatorUserId: { campaignId: input.campaignId, creatorUserId: input.creatorUserId } },
  });
  if (existing) {
    if (existing.status === "DECLINED") {
      // Allow re-invite after decline by updating
      await db.invitation.update({
        where: { id: existing.id },
        data: {
          status: InvitationStatus.PENDING,
          message: input.message?.trim() || null,
          proposedBudget: input.proposedBudget ?? null,
        },
      });
    } else {
      return { error: "You've already invited this creator to this campaign." };
    }
  } else {
    await db.invitation.create({
      data: {
        campaignId: input.campaignId,
        brandProfileId: brand.profileId,
        creatorUserId: input.creatorUserId,
        message: input.message?.trim() || null,
        proposedBudget: input.proposedBudget ?? null,
      },
    });
  }

  const budget = input.proposedBudget ? ` — Budget offered: $${input.proposedBudget.toLocaleString()}` : "";
  await db.notification.create({
    data: {
      userId: input.creatorUserId,
      type: "INVITATION_RECEIVED",
      title: `${brand.companyName} invited you to collaborate!`,
      body: `You've been invited to "${campaign.title}"${budget}. Check your invitations to respond.`,
      link: `/creator/invitations`,
    },
  });

  revalidatePath("/brand/discover");

  return { error: null };
}

// ── Brand: get all sent invitations ──────────────────────────────────────────

export async function getBrandSentInvitationsAction(): Promise<{
  data: SentInvitationItem[];
  error: string | null;
}> {
  const brand = await getBrandProfile();
  if (!brand) return { data: [], error: "Unauthorized" };

  const invitations = await db.invitation.findMany({
    where: { brandProfileId: brand.profileId },
    include: {
      campaign: { select: { id: true, title: true } },
      creator: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    data: invitations.map((inv) => ({
      id: inv.id,
      status: inv.status,
      message: inv.message,
      proposedBudget: inv.proposedBudget,
      createdAt: inv.createdAt.toISOString(),
      campaign: { id: inv.campaign.id, title: inv.campaign.title },
      creator: {
        userId: inv.creator.id,
        name: inv.creator.name,
        avatarUrl: inv.creator.image,
      },
    })),
    error: null,
  };
}

// ── Brand: check invitation status for a creator+campaign ────────────────────

export async function getInvitationStatusAction(
  creatorUserId: string,
  campaignId: string,
): Promise<{ status: string | null; error: string | null }> {
  const brand = await getBrandProfile();
  if (!brand) return { status: null, error: "Unauthorized" };

  const inv = await db.invitation.findUnique({
    where: { campaignId_creatorUserId: { campaignId, creatorUserId } },
    select: { status: true },
  });
  return { status: inv?.status ?? null, error: null };
}

// ── Creator: get received invitations ─────────────────────────────────────────

export async function getMyInvitationsAction(): Promise<{
  data: InvitationItem[];
  unreadCount: number;
  error: string | null;
}> {
  const session = await getSession();
  if (!session) return { data: [], unreadCount: 0, error: "Unauthorized" };

  const invitations = await db.invitation.findMany({
    where: { creatorUserId: session.user.id },
    include: {
      campaign: {
        select: {
          id: true, title: true, description: true, budget: true,
          platforms: true, deadline: true, imageUrl: true,
        },
      },
      brand: {
        include: { user: { select: { id: true, image: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const unreadCount = invitations.filter((inv) => inv.status === "PENDING").length;

  return {
    data: invitations.map((inv) => ({
      id: inv.id,
      status: inv.status,
      message: inv.message,
      proposedBudget: inv.proposedBudget,
      createdAt: inv.createdAt.toISOString(),
      campaign: {
        id: inv.campaign.id,
        title: inv.campaign.title,
        description: inv.campaign.description,
        budget: inv.campaign.budget,
        platforms: inv.campaign.platforms,
        deadline: inv.campaign.deadline?.toISOString() ?? null,
        imageUrl: inv.campaign.imageUrl,
      },
      brand: {
        id: inv.brand.id,
        companyName: inv.brand.companyName,
        userId: inv.brand.user.id,
        avatarUrl: inv.brand.user.image,
        industry: inv.brand.industry,
      },
    })),
    unreadCount,
    error: null,
  };
}

// ── Creator: respond to invitation ────────────────────────────────────────────

export async function respondToInvitationAction(
  invitationId: string,
  response: "ACCEPTED" | "DECLINED",
): Promise<{ error: string | null }> {
  const session = await getSession();
  if (!session) return { error: "Unauthorized" };

  const invitation = await db.invitation.findFirst({
    where: { id: invitationId, creatorUserId: session.user.id },
    include: {
      campaign: { select: { title: true, id: true } },
      brand: {
        select: {
          companyName: true,
          user: { select: { id: true } },
        },
      },
    },
  });

  if (!invitation) return { error: "Invitation not found." };
  if (invitation.status !== "PENDING") return { error: "This invitation has already been responded to." };

  const creator = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });

  await db.invitation.update({
    where: { id: invitationId },
    data: { status: response === "ACCEPTED" ? InvitationStatus.ACCEPTED : InvitationStatus.DECLINED },
  });

  const creatorName = creator?.name ?? "The creator";
  await db.notification.create({
    data: {
      userId: invitation.brand.user.id,
      type: response === "ACCEPTED" ? "APPLICATION_UPDATE" : "APPLICATION_UPDATE",
      title:
        response === "ACCEPTED"
          ? `${creatorName} accepted your invitation! 🎉`
          : `${creatorName} declined your invitation.`,
      body:
        response === "ACCEPTED"
          ? `${creatorName} accepted your invite to "${invitation.campaign.title}". Time to kick things off!`
          : `${creatorName} is not available for "${invitation.campaign.title}" right now.`,
      link: `/brand/campaigns/${invitation.campaign.id}`,
    },
  });

  revalidatePath("/creator/invitations");

  return { error: null };
}

// ── Creator: pending invitation count (for nav badge) ─────────────────────────

export async function getPendingInvitationsCountAction(): Promise<{
  count: number;
  error: string | null;
}> {
  const session = await getSession();
  if (!session) return { count: 0, error: "Unauthorized" };

  const count = await db.invitation.count({
    where: { creatorUserId: session.user.id, status: "PENDING" },
  });
  return { count, error: null };
}
