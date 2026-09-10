"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConnectionStatus, Role } from "@/lib/generated/prisma";
import { fromPrismaRole } from "@/lib/roles";
import { headers } from "next/headers";

export interface FullProfile {
  id: string;
  user_id: string;
  user_type: "brand" | "creator";
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
  total_followers: number;
  avg_engagement_rate: number;
  followerCount: number | null;
  averageEngagement: number | null;
  topNiches: string[];
  lastSyncedAt: string | null;
  connectedPlatforms: string[];
  platformStats: { platform: string; followerCount: number | null; engagementRate: number | null }[];
  hasCompletedOnboarding: boolean;
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
      platformStats: {
        orderBy: { fetchedAt: "desc" },
        select: { platform: true, followerCount: true, engagementRate: true },
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
        },
      },
    },
  });

  if (!user) return null;

  const userType = fromPrismaRole(user.role);
  const brand = user.brandProfile;
  const creator = user.creatorProfile;

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
    })),
    hasCompletedOnboarding: user.hasCompletedOnboarding,
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
  user_type: "brand" | "creator";
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
            socialPosts: {
              orderBy: { fetchedAt: "desc" },
              take: 9,
              select: {
                id: true,
                platform: true,
                postUrl: true,
                imageUrl: true,
                caption: true,
                likes: true,
                comments: true,
                views: true,
                postedAt: true,
              },
            },
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
    followerCount: creator?.followerCount ?? null,
    averageEngagement: creator?.averageEngagement ?? null,
    topNiches: creator?.topNiches ?? [],
    lastSyncedAt: creator?.lastSyncedAt?.toISOString() ?? null,
    connectedPlatforms: creator?.connectedPlatforms ?? [],
    socialPosts: (creator?.socialPosts ?? []).map((p) => ({
      id: p.id,
      platform: p.platform,
      postUrl: p.postUrl,
      imageUrl: p.imageUrl,
      caption: p.caption,
      likes: p.likes,
      comments: p.comments,
      views: p.views,
      postedAt: p.postedAt?.toISOString() ?? null,
    })),
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
