"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConnectionStatus, Role } from "@/lib/generated/prisma";
import { computeIsMarketplaceApproved } from "@/lib/creator-approval";
import { fromPrismaRole } from "@/lib/roles";
import { headers } from "next/headers";
import {
  getNormalizedCreatorMetrics,
  type NormalizedCreatorMetrics,
} from "@/lib/creator-metrics";
import { buildPortfolio } from "@/lib/content-curation";

export interface FullProfile {
  id: string;
  user_id: string;
  user_type: "brand" | "creator" | "admin";
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  brand_account_type: "company" | "personal" | null;
  company_name: string | null;
  industry: string | null;
  website: string | null;
  niche: string | null;
  primary_platform:
    | "youtube"
    | "tiktok"
    | "instagram"
    | "twitter"
    | "twitch"
    | "linkedin"
    | null;
  location: string | null;
  languages: string[];
  /** @deprecated Use metrics.totalFollowers instead */
  total_followers: number;
  /** @deprecated Use metrics.averageEngagementRate instead */
  avg_engagement_rate: number;
  followerCount: number | null;
  averageEngagement: number | null;
  topNiches: string[];
  lastSyncedAt: string | null;
  connectedPlatforms: string[];
  platformStats: {
    platform: string;
    followerCount: number | null;
    engagementRate: number | null;
    dataSource: "OFFICIAL_API" | "APIFY" | "RAPIDAPI" | "MANUAL_IMPORT" | "LEGACY_UNKNOWN";
  }[];
  hasCompletedOnboarding: boolean;
  /** Normalized metrics — canonical source for UI. */
  metrics: NormalizedCreatorMetrics;
}

async function getSessionOrNull() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getMyProfileAction(): Promise<FullProfile | null> {
  try {
  const session = await getSessionOrNull();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      hasCompletedOnboarding: true,
      platformTokens: { select: { platform: true } },
      platformStats: {
        orderBy: { fetchedAt: "desc" },
        select: { platform: true, followerCount: true, engagementRate: true, dataSource: true, fetchedAt: true },
      },
      brandProfile: {
        select: {
          bio: true,
          companyName: true,
          industry: true,
          website: true,
          brandAccountType: true,
          location: true,
        },
      },
      creatorProfile: {
        select: {
          bio: true,
          niche: true,
          primaryPlatform: true,
          location: true,
          totalFollowers: true,
          avgEngagementRate: true,
          followerCount: true,
          averageEngagement: true,
          topNiches: true,
          lastSyncedAt: true,
          connectedPlatforms: true,
          profileOrigin: true,
          socialPosts: {
            orderBy: { postedAt: "desc" },
            take: 20,
            select: { platform: true, likes: true, comments: true, views: true, postedAt: true },
          },
        },
      },
    },
  });

  if (!user) return null;

  const userType = fromPrismaRole(user.role);
  const brand = user.brandProfile;
  const creator = user.creatorProfile;

  const metrics = creator
    ? getNormalizedCreatorMetrics({
        platformStats: user.platformStats.map((s) => ({
          platform: s.platform,
          followerCount: s.followerCount,
          dataSource: s.dataSource,
          fetchedAt: s.fetchedAt,
        })),
        socialPosts: (creator.socialPosts ?? []).map((p) => ({
          platform: p.platform,
          likes: p.likes,
          comments: p.comments,
          views: p.views,
          postedAt: p.postedAt,
        })),
        creatorProfile: {
          followerCount: creator.followerCount,
          totalFollowers: creator.totalFollowers,
          averageEngagement: creator.averageEngagement,
          avgEngagementRate: creator.avgEngagementRate,
          lastSyncedAt: creator.lastSyncedAt,
          lastStatsUpdate: null,
          profileOrigin: creator.profileOrigin,
        },
        oauthPlatforms: user.platformTokens.map((t) => t.platform),
      })
    : getNormalizedCreatorMetrics({
        platformStats: [],
        socialPosts: [],
        creatorProfile: {
          followerCount: null,
          totalFollowers: 0,
          averageEngagement: null,
          avgEngagementRate: 0,
          lastSyncedAt: null,
          lastStatsUpdate: null,
          profileOrigin: "REGISTERED",
        },
        oauthPlatforms: [],
      });

  return {
    id: user.id,
    user_id: user.id,
    user_type: userType,
    email: user.email,
    full_name: user.name ?? null,
    avatar_url: user.image ?? null,
    bio: (userType === "brand" ? brand?.bio : creator?.bio) ?? null,
    brand_account_type: (brand?.brandAccountType ?? null) as
      | "company"
      | "personal"
      | null,
    company_name: brand?.companyName ?? null,
    industry: brand?.industry ?? null,
    website: brand?.website ?? null,
    niche: creator?.niche ?? null,
    primary_platform: (creator?.primaryPlatform ?? null) as FullProfile["primary_platform"],
    location: (userType === "brand" ? brand?.location : creator?.location) ?? null,
    languages: ["English"],
    total_followers: creator?.totalFollowers ?? 0,
    avg_engagement_rate: creator?.avgEngagementRate ?? 0,
    followerCount: creator?.followerCount ?? null,
    averageEngagement: creator?.averageEngagement ?? null,
    topNiches: creator?.topNiches ?? [],
    lastSyncedAt: creator?.lastSyncedAt?.toISOString() ?? null,
    connectedPlatforms: creator?.connectedPlatforms ?? [],
    platformStats: user.platformStats.map((s) => ({
      platform: s.platform,
      followerCount: s.followerCount,
      engagementRate: s.engagementRate,
      dataSource: s.dataSource,
    })),
    hasCompletedOnboarding: user.hasCompletedOnboarding,
    metrics,
  };
  } catch (e) {
    console.error("[getMyProfileAction]", e);
    return null;
  }
}

// ── Public profile view (any authenticated user can look up another user) ─────

export interface SocialLink {
  platform: string;
  url: string;
}

export interface PublicProfile {
  id: string;
  userId: string;
  user_type: "brand" | "creator" | "admin";
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  connectionCount: number;
  socialLinks: SocialLink[];
  // Creator fields
  niche: string | null;
  primary_platform: string | null;
  total_followers: number;
  avg_engagement_rate: number;
  /** True when the creator is marketplace-approved: moderationStatus=APPROVED AND (profileOrigin=REGISTERED OR claimStatus=CLAIMED). Does not imply identity verification. */
  isMarketplaceApproved: boolean;
  /** Profile origin: REGISTERED (normal sign-up) or IMPORTED (synthetic profile). Used to decide whether to show the Claim CTA. */
  profileOrigin: string | null;
  /** Claim status of an imported profile: UNCLAIMED, CLAIM_PENDING, CLAIMED, NOT_APPLICABLE. */
  claimStatus: string | null;
  // Apify analytics fields
  followerCount: number | null;
  averageEngagement: number | null;
  topNiches: string[];
  lastSyncedAt: string | null;
  connectedPlatforms: string[];
  socialPosts: {
    id: string;
    platform: string;
    postUrl: string | null;
    imageUrl: string | null;
    caption: string | null;
    likes: number | null;
    comments: number | null;
    views: number | null;
    postedAt: string | null;
  }[];
  platformStats: {
    platform: string;
    followerCount: number | null;
    followingCount: number | null;
    postCount: number | null;
    engagementRate: number | null;
    fetchedAt: string;
  }[];
  // Brand fields
  company_name: string | null;
  industry: string | null;
  website: string | null;
  communityListCount: number;
  campaigns: {
    id: string;
    title: string;
    description: string;
    budget: number;
    status: string;
    createdAt: string;
  }[];
}

export async function getProfileAction(
  targetUserId: string,
): Promise<PublicProfile | null> {
  try {
  const session = await getSessionOrNull();
  if (!session) return null;

  const [user, connectionCount] = await Promise.all([
    db.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        image: true,
        role: true,
        platformStats: {
          orderBy: { fetchedAt: "desc" },
          select: {
            platform: true,
            followerCount: true,
            followingCount: true,
            postCount: true,
            engagementRate: true,
            fetchedAt: true,
          },
        },
        brandProfile: {
          select: {
            id: true,
            companyName: true,
            industry: true,
            website: true,
            bio: true,
            location: true,
            socialLinks: true,
            _count: { select: { communityLists: true } },
            campaigns: {
              where: { status: { not: "DRAFT" } },
              orderBy: { createdAt: "desc" },
              take: 10,
              select: {
                id: true,
                title: true,
                description: true,
                budget: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        creatorProfile: {
          select: {
            id: true,
            bio: true,
            niche: true,
            primaryPlatform: true,
            location: true,
            totalFollowers: true,
            avgEngagementRate: true,
            socialLinks: true,
            followerCount: true,
            averageEngagement: true,
            topNiches: true,
            lastSyncedAt: true,
            connectedPlatforms: true,
            moderationStatus: true,
            profileOrigin: true,
            claimStatus: true,
          },
        },
      },
    }),
    db.connection.count({
      where: {
        OR: [{ senderId: targetUserId }, { receiverId: targetUserId }],
        status: ConnectionStatus.ACCEPTED,
      },
    }),
  ]);

  if (!user) return null;

  const userType = fromPrismaRole(user.role);
  const brand = user.brandProfile;
  const creator = user.creatorProfile;
  const rawLinks = (userType === "brand" ? brand?.socialLinks : creator?.socialLinks) ?? [];
  const socialLinks = Array.isArray(rawLinks) ? (rawLinks as unknown as SocialLink[]) : [];

  // ── Curated portfolio (creator only) ──────────────────────────────────────
  let curatedSocialPosts: PublicProfile["socialPosts"] = [];
  if (creator) {
    const [rawPosts, curationRows] = await Promise.all([
      db.socialPost.findMany({
        where: { creatorProfileId: creator.id },
        orderBy: [
          { postedAt: { sort: "desc", nulls: "last" } },
          { fetchedAt: "desc" },
        ],
        take: 200,
        select: {
          id: true,
          platform: true,
          providerPostId: true,
          postUrl: true,
          imageUrl: true,
          caption: true,
          likes: true,
          comments: true,
          views: true,
          postedAt: true,
          fetchedAt: true,
          dataSource: true,
        },
      }),
      db.creatorContentCuration.findMany({
        where: { creatorProfileId: creator.id },
        select: {
          platform: true,
          providerPostId: true,
          isHidden: true,
          isFeatured: true,
          featuredOrder: true,
        },
      }),
    ]);

    const portfolio = buildPortfolio(
      rawPosts,
      curationRows.map((r, i) => ({ ...r, id: String(i) })),
    );

    curatedSocialPosts = portfolio.map((p) => ({
      id: p.id,
      platform: p.platform,
      postUrl: p.postUrl,
      imageUrl: p.imageUrl,
      caption: p.caption,
      likes: p.likes,
      comments: p.comments,
      views: p.views,
      postedAt: p.postedAt,
    }));
  }

  return {
    id: brand?.id ?? creator?.id ?? user.id,
    userId: user.id,
    user_type: userType,
    full_name: user.name ?? null,
    avatar_url: user.image ?? null,
    bio: (userType === "brand" ? brand?.bio : creator?.bio) ?? null,
    location:
      (userType === "brand" ? brand?.location : creator?.location) ?? null,
    connectionCount,
    socialLinks,
    niche: creator?.niche ?? null,
    primary_platform: (creator?.primaryPlatform ?? null) as string | null,
    total_followers: creator?.totalFollowers ?? 0,
    avg_engagement_rate: creator?.avgEngagementRate ?? 0,
    isMarketplaceApproved: creator
      ? computeIsMarketplaceApproved({
          moderationStatus: creator.moderationStatus,
          profileOrigin: creator.profileOrigin,
          claimStatus: creator.claimStatus,
        })
      : false,
    profileOrigin: creator?.profileOrigin ?? null,
    claimStatus: creator?.claimStatus ?? null,
    followerCount: creator?.followerCount ?? null,
    averageEngagement: creator?.averageEngagement ?? null,
    topNiches: creator?.topNiches ?? [],
    lastSyncedAt: creator?.lastSyncedAt?.toISOString() ?? null,
    connectedPlatforms: creator?.connectedPlatforms ?? [],
    socialPosts: curatedSocialPosts,
    platformStats: user.platformStats.map((s) => ({
      platform: s.platform,
      followerCount: s.followerCount,
      followingCount: s.followingCount,
      postCount: s.postCount,
      engagementRate: s.engagementRate,
      fetchedAt: s.fetchedAt.toISOString(),
    })),
    company_name: brand?.companyName ?? null,
    industry: brand?.industry ?? null,
    website: brand?.website ?? null,
    communityListCount: brand?._count?.communityLists ?? 0,
    campaigns: (brand?.campaigns ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      budget: c.budget,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
  };
  } catch (e) {
    console.error("[getProfileAction]", e);
    return null;
  }
}

export interface OnboardingData {
  imageUrl?: string;
  // Creator
  niche?: string;
  primaryPlatform?: string;
  location?: string;
  // Brand
  brandAccountType?: string;
  companyName?: string;
  industry?: string;
  website?: string;
  // Shared
  bio?: string;
}

export async function updateAvatarAction(
  imageUrl: string | null,
): Promise<{ error: string | null }> {
  const session = await getSessionOrNull();
  if (!session) return { error: "Unauthorized" };

  await db.user.update({
    where: { id: session.user.id },
    data: { image: imageUrl },
  });

  return { error: null };
}

export async function updateProfileAction(data: {
  name?: string | null;
  bio?: string | null;
  niche?: string | null;
  primaryPlatform?: string | null;
  location?: string | null;
  companyName?: string | null;
  industry?: string | null;
  website?: string | null;
  brandAccountType?: string | null;
}): Promise<{ error: string | null }> {
  const session = await getSessionOrNull();
  if (!session) return { error: "Unauthorized" };

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!user) return { error: "User not found" };

  if (data.name !== undefined) {
    await db.user.update({
      where: { id: session.user.id },
      data: { name: data.name ?? undefined },
    });
  }

  if (user.role === Role.BRAND) {
    await db.brandProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        companyName: data.companyName?.trim() || "Brand",
        industry: data.industry ?? null,
        website: data.website ?? null,
        brandAccountType: data.brandAccountType ?? null,
        bio: data.bio ?? null,
        location: data.location ?? null,
      },
      update: {
        ...(data.companyName !== undefined
          ? { companyName: data.companyName ?? "Brand" }
          : {}),
        ...(data.industry !== undefined ? { industry: data.industry } : {}),
        ...(data.website !== undefined ? { website: data.website } : {}),
        ...(data.brandAccountType !== undefined
          ? { brandAccountType: data.brandAccountType }
          : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
      },
    });
  } else {
    // ── Defense-in-depth: block upsert CREATE for pending claimants ──────────
    // If the user has no CreatorProfile AND has a PENDING ProfileClaim, the
    // upsert would silently create a new REGISTERED profile, turning them into
    // Scenario B before admin approval. Block this path.
    // If the user already HAS a CreatorProfile, legitimate editing proceeds
    // regardless of any pending claim (Scenario B users keep their profile).
    const existingCreatorProfile = await db.creatorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!existingCreatorProfile) {
      const pendingClaim = await db.profileClaim.findFirst({
        where: { requesterUserId: session.user.id, status: "PENDING" },
        select: { id: true },
      });
      if (pendingClaim) {
        return { error: "Your profile claim is under review. Profile editing will be available once your claim is resolved." };
      }
    }

    await db.creatorProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        bio: data.bio ?? null,
        niche: data.niche ?? null,
        primaryPlatform: data.primaryPlatform ?? null,
        location: data.location ?? null,
      },
      update: {
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.niche !== undefined ? { niche: data.niche } : {}),
        ...(data.primaryPlatform !== undefined
          ? { primaryPlatform: data.primaryPlatform }
          : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
      },
    });
  }

  return { error: null };
}

export async function updateSocialLinksAction(
  links: SocialLink[],
): Promise<{ error: string | null }> {
  const session = await getSessionOrNull();
  if (!session) return { error: "Unauthorized" };

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!user) return { error: "User not found" };

  const sanitized = links
    .filter((l) => l.platform && l.url)
    .map((l) => ({ platform: l.platform.trim(), url: l.url.trim() }));

  if (user.role === Role.BRAND) {
    await db.brandProfile.updateMany({
      where: { userId: session.user.id },
      data: { socialLinks: sanitized },
    });
  } else {
    await db.creatorProfile.updateMany({
      where: { userId: session.user.id },
      data: { socialLinks: sanitized },
    });
  }

  return { error: null };
}
