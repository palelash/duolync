"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role, ApplicationStatus, CampaignStatus, CampaignEventType } from "@/lib/generated/prisma";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getCreatorProfile() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      name: true,
      creatorProfile: { select: { id: true } },
    },
  });
  if (!user || user.role !== Role.CREATOR || !user.creatorProfile) return null;
  return { userId: session.user.id, profileId: user.creatorProfile.id, name: user.name };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublicCampaign {
  id: string;
  title: string;
  description: string;
  budget: number;
  status: string;
  deadline: string | null;
  imageUrl: string | null;
  platforms: string[];
  contentFormats: string[];
  requirements: string | null;
  briefDescription: string | null;
  goal: string | null;
  dosAndDonts: string | null;
  brand: {
    companyName: string;
    industry: string | null;
    location: string | null;
    userId: string;
    avatarUrl: string | null;
  };
  applicationStatus: string | null;
  applicationId: string | null;
  negotiatedRate: number | null;
  brandNote: string | null;
  applicationContentFormats: string[];
}

export interface PublicCampaignDetail extends PublicCampaign {
  totalApplications: number;
}

export interface MyApplication {
  id: string;
  status: string;
  proposedRate: number;
  coverLetter: string | null;
  createdAt: string;
  updatedAt: string;
  campaign: {
    id: string;
    title: string;
    description: string;
    budget: number;
    deadline: string | null;
    imageUrl: string | null;
    platforms: string[];
    brand: {
      companyName: string;
      industry: string | null;
      userId: string;
    };
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function getPublicCampaignsAction(): Promise<{
  data: PublicCampaign[];
  error: string | null;
}> {
  try {
  const creator = await getCreatorProfile();
  if (!creator) return { data: [], error: "Unauthorized" };

  const [campaigns, myApplications] = await Promise.all([
    db.campaign.findMany({
      where: { status: "ACTIVE", moderationStatus: "APPROVED" },
      include: {
        brand: {
          include: {
            user: { select: { id: true, image: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.application.findMany({
      where: { creatorProfileId: creator.profileId },
      select: {
        campaignId: true, status: true, id: true,
        negotiatedRate: true, brandNote: true, contentFormats: true,
      },
    }),
  ]);

  const appMap = new Map(myApplications.map((a) => [a.campaignId, a]));

  return {
    data: campaigns.map((c) => {
      const app = appMap.get(c.id);
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        budget: c.budget,
        status: c.status,
        deadline: c.deadline?.toISOString() ?? null,
        imageUrl: c.imageUrl ?? null,
        platforms: c.platforms ?? [],
        contentFormats: c.contentFormats ?? [],
        requirements: c.requirements ?? null,
        briefDescription: c.briefDescription ?? null,
        goal: c.goal ?? null,
        dosAndDonts: c.dosAndDonts ?? null,
        brand: {
          companyName: c.brand.companyName,
          industry: c.brand.industry,
          location: c.brand.location,
          userId: c.brand.user.id,
          avatarUrl: c.brand.user.image ?? null,
        },
        applicationStatus: app ? app.status : null,
        applicationId: app ? app.id : null,
        negotiatedRate: app?.negotiatedRate ?? null,
        brandNote: app?.brandNote ?? null,
        applicationContentFormats: app?.contentFormats ?? [],
      };
    }),
    error: null,
  };
  } catch (e) {
    console.error("[getPublicCampaignsAction]", e);
    return { data: [], error: "Failed to load campaigns" };
  }
}

export async function getMyApplicationsAction(): Promise<{
  data: MyApplication[];
  error: string | null;
}> {
  try {
  const creator = await getCreatorProfile();
  if (!creator) return { data: [], error: "Unauthorized" };

  const applications = await db.application.findMany({
    where: { creatorProfileId: creator.profileId },
    include: {
      campaign: {
        include: {
          brand: {
            include: { user: { select: { id: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    data: applications.map((a) => ({
      id: a.id,
      status: a.status,
      proposedRate: a.proposedRate,
      coverLetter: a.coverLetter,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      campaign: {
        id: a.campaign.id,
        title: a.campaign.title,
        description: a.campaign.description,
        budget: a.campaign.budget,
        deadline: a.campaign.deadline?.toISOString() ?? null,
        imageUrl: a.campaign.imageUrl ?? null,
        platforms: a.campaign.platforms ?? [],
        brand: {
          companyName: a.campaign.brand.companyName,
          industry: a.campaign.brand.industry,
          userId: a.campaign.brand.user.id,
        },
      },
    })),
    error: null,
  };
  } catch (e) {
    console.error("[getMyApplicationsAction]", e);
    return { data: [], error: "Failed to load applications" };
  }
}

export async function applyToCampaignAction(input: {
  campaignId: string;
  proposedRate: number;
  coverLetter?: string;
  selectedPlatform?: string;
}): Promise<{ data: { id: string; status: string } | null; error: string | null }> {
  const creator = await getCreatorProfile();
  if (!creator) return { data: null, error: "Unauthorized" };

  if (input.proposedRate <= 0) return { data: null, error: "Rate must be positive." };

  const campaign = await db.campaign.findUnique({
    where: { id: input.campaignId },
    include: { brand: { include: { user: { select: { id: true } } } } },
  });
  if (!campaign) return { data: null, error: "Campaign not found." };
  if (campaign.status !== "ACTIVE") return { data: null, error: "This campaign is not accepting applications." };

  const existing = await db.application.findFirst({
    where: { campaignId: input.campaignId, creatorProfileId: creator.profileId },
  });
  if (existing) return { data: null, error: "You have already applied to this campaign." };

  const application = await db.application.create({
    data: {
      campaignId: input.campaignId,
      creatorProfileId: creator.profileId,
      proposedRate: input.proposedRate,
      coverLetter: input.coverLetter?.trim() || null,
      selectedPlatform: input.selectedPlatform?.trim() || null,
      status: ApplicationStatus.PENDING,
    },
  });

  const platformNote = input.selectedPlatform ? ` via ${input.selectedPlatform}` : "";
  await db.notification.create({
    data: {
      userId: campaign.brand.user.id,
      type: "PROPOSAL_RECEIVED",
      title: `New proposal for "${campaign.title}"`,
      body: `${creator.name ?? "A creator"} sent a proposal${platformNote} at $${input.proposedRate}.`,
      link: `/brand/proposals`,
    },
  });

  revalidatePath("/creator/campaigns");
  revalidatePath("/creator/applications");
  revalidatePath("/brand/proposals");

  return { data: { id: application.id, status: application.status }, error: null };
}

export async function getPublicCampaignDetailAction(campaignId: string): Promise<{
  data: PublicCampaignDetail | null;
  error: string | null;
}> {
  const creator = await getCreatorProfile();
  if (!creator) return { data: null, error: "Unauthorized" };

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, status: { in: ["ACTIVE", "PENDING", "ACCEPTED", "IN_PROGRESS", "SUBMITTED", "COMPLETED"] } },
    include: {
      brand: { include: { user: { select: { id: true, image: true } } } },
      _count: { select: { applications: true } },
    },
  });

  if (!campaign) return { data: null, error: "Campaign not found." };

  const myApp = await db.application.findFirst({
    where: { campaignId, creatorProfileId: creator.profileId },
    select: {
      id: true, status: true, proposedRate: true, coverLetter: true,
      negotiatedRate: true, brandNote: true, contentFormats: true,
    },
  });

  return {
    data: {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      budget: campaign.budget,
      status: campaign.status,
      deadline: campaign.deadline?.toISOString() ?? null,
      imageUrl: campaign.imageUrl ?? null,
      platforms: campaign.platforms ?? [],
      contentFormats: campaign.contentFormats ?? [],
      requirements: campaign.requirements ?? null,
      briefDescription: campaign.briefDescription ?? null,
      goal: campaign.goal ?? null,
      dosAndDonts: campaign.dosAndDonts ?? null,
      brand: {
        companyName: campaign.brand.companyName,
        industry: campaign.brand.industry,
        location: campaign.brand.location,
        userId: campaign.brand.user.id,
        avatarUrl: campaign.brand.user.image ?? null,
      },
      applicationStatus: myApp?.status ?? null,
      applicationId: myApp?.id ?? null,
      negotiatedRate: myApp?.negotiatedRate ?? null,
      brandNote: myApp?.brandNote ?? null,
      applicationContentFormats: myApp?.contentFormats ?? [],
      totalApplications: campaign._count.applications,
    },
    error: null,
  };
}

export async function respondToCampaignAction(
  campaignId: string,
  response: "ACCEPTED" | "DECLINED",
  declineReason?: string,
): Promise<{ error: string | null }> {
  const creator = await getCreatorProfile();
  if (!creator) return { error: "Unauthorized" };

  // Fetch the campaign and verify creator has an accepted application
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, status: CampaignStatus.PENDING },
    include: {
      brand: {
        include: {
          user: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!campaign) return { error: "Campaign not found or not awaiting your response." };

  const application = await db.application.findFirst({
    where: {
      campaignId,
      creatorProfileId: creator.profileId,
      status: ApplicationStatus.ACCEPTED,
    },
  });
  if (!application) return { error: "No accepted application found for this campaign." };

  const brandUserId = campaign.brand.user.id;

  if (response === "ACCEPTED") {
    // Update campaign to ACCEPTED
    await db.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.ACCEPTED },
    });

    // Auto-create a deadline calendar event if the campaign has a deadline
    if (campaign.deadline) {
      await db.campaignEvent.create({
        data: {
          campaignId,
          creatorProfileId: creator.profileId,
          title: `Deadline — ${campaign.title}`,
          type: CampaignEventType.DEADLINE,
          scheduledAt: campaign.deadline,
          createdById: creator.userId,
        },
      });
    }

    // Notify brand via system message
    await db.message.create({
      data: {
        senderId: creator.userId,
        receiverId: brandUserId,
        text: `✅ ${creator.name ?? "The creator"} has accepted the campaign "${campaign.title}". The collaboration is now active — let's get started!`,
      },
    });

    // Notify brand via notification
    await db.notification.create({
      data: {
        userId: brandUserId,
        type: "APPLICATION_UPDATE",
        title: `Creator accepted "${campaign.title}"`,
        body: `${creator.name ?? "A creator"} has accepted your campaign workflow. The campaign is now active.`,
        link: `/brand/campaigns/${campaignId}`,
      },
    });
  } else {
    // DECLINED — revert campaign to ACTIVE so brand can find another creator
    await db.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.ACTIVE },
    });

    const reason = declineReason?.trim();

    // Notify brand via system message
    await db.message.create({
      data: {
        senderId: creator.userId,
        receiverId: brandUserId,
        text: reason
          ? `❌ ${creator.name ?? "The creator"} has declined the campaign "${campaign.title}". Reason: ${reason}`
          : `❌ ${creator.name ?? "The creator"} has declined the campaign "${campaign.title}".`,
      },
    });

    // Notify brand via notification
    await db.notification.create({
      data: {
        userId: brandUserId,
        type: "APPLICATION_UPDATE",
        title: `Creator declined "${campaign.title}"`,
        body: `${creator.name ?? "A creator"} declined the campaign workflow.${reason ? ` Reason: ${reason}` : ""}`,
        link: `/brand/campaigns/${campaignId}`,
      },
    });
  }

  revalidatePath(`/creator/campaigns/${campaignId}`);
  revalidatePath(`/brand/campaigns/${campaignId}`);
  revalidatePath("/brand/dashboard");
  revalidatePath("/creator/campaigns");

  return { error: null };
}

export async function getCreatorConnectedPlatformsAction(): Promise<{
  primaryPlatform: string | null;
  connectedPlatforms: string[];
  error: string | null;
}> {
  const creator = await getCreatorProfile();
  if (!creator) return { primaryPlatform: null, connectedPlatforms: [], error: "Unauthorized" };

  const profile = await db.creatorProfile.findUnique({
    where: { id: creator.profileId },
    select: { primaryPlatform: true, connectedPlatforms: true },
  });

  return {
    primaryPlatform: profile?.primaryPlatform ?? null,
    connectedPlatforms: profile?.connectedPlatforms ?? [],
    error: null,
  };
}

export async function withdrawApplicationAction(
  applicationId: string,
): Promise<{ error: string | null }> {
  const creator = await getCreatorProfile();
  if (!creator) return { error: "Unauthorized" };

  const application = await db.application.findFirst({
    where: { id: applicationId, creatorProfileId: creator.profileId },
  });
  if (!application) return { error: "Application not found." };
  if (application.status !== ApplicationStatus.PENDING)
    return { error: "Only pending applications can be withdrawn." };

  await db.application.update({
    where: { id: applicationId },
    data: { status: ApplicationStatus.WITHDRAWN },
  });

  revalidatePath("/creator/campaigns");
  revalidatePath("/creator/applications");

  return { error: null };
}
