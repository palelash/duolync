"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma";
import { computeIsMarketplaceApproved } from "@/lib/creator-approval";
import { headers } from "next/headers";
import type { Creator } from "@/app/_components/discovery/ProfileDrawer";
import type { BrandProfile } from "@/app/_components/discovery/ProfilesContext";
import { parseSocialLinks } from "@/lib/social-links";
import { getNormalizedCreatorMetrics } from "@/lib/creator-metrics";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

export async function getCreatorsAction(): Promise<Creator[]> {
  const session = await getSession();
  if (!session) return [];

  const users = await db.user.findMany({
    where: {
      role: Role.CREATOR,
      creatorProfile: { isNot: null },
    },
    select: {
      id: true,
      name: true,
      image: true,
      platformTokens: { select: { platform: true } },
      platformStats: {
        orderBy: { fetchedAt: "desc" },
        select: {
          platform: true,
          followerCount: true,
          engagementRate: true,
          dataSource: true,
          fetchedAt: true,
        },
      },
      creatorProfile: {
        select: {
          bio: true,
          niche: true,
          totalFollowers: true,
          avgEngagementRate: true,
          followerCount: true,
          averageEngagement: true,
          primaryPlatform: true,
          connectedPlatforms: true,
          location: true,
          socialLinks: true,
          moderationStatus: true,
          profileOrigin: true,
          claimStatus: true,
          socialPosts: {
            orderBy: { postedAt: "desc" },
            take: 20,
            select: { platform: true, likes: true, comments: true, views: true, postedAt: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return users.map((u) => {
    const profile = u.creatorProfile!;

    // §5 (normalized metrics): use helper for canonical totalFollowers + avgEngagementRate.
    const metrics = getNormalizedCreatorMetrics({
      platformStats: u.platformStats.map((s) => ({
        platform: s.platform,
        followerCount: s.followerCount,
        dataSource: s.dataSource,
        fetchedAt: s.fetchedAt,
      })),
      socialPosts: (profile.socialPosts ?? []).map((p) => ({
        platform: p.platform,
        likes: p.likes,
        comments: p.comments,
        views: p.views,
        postedAt: p.postedAt,
      })),
      creatorProfile: {
        followerCount: profile.followerCount,
        totalFollowers: profile.totalFollowers,
        averageEngagement: profile.averageEngagement,
        avgEngagementRate: profile.avgEngagementRate,
        lastSyncedAt: null,
        lastStatsUpdate: null,
        profileOrigin: profile.profileOrigin,
      },
      oauthPlatforms: u.platformTokens.map((t) => t.platform),
    });

    const totalFollowers = metrics.totalFollowers ?? 0;
    const avgEngagement = metrics.averageEngagementRate ?? 0;

    // Build per-platform follower display from real PlatformStats only.
    // §2: No 65/25/10 synthetic splits. No primaryPlatform full-count fallback.
    const seenPlatforms = new Set<string>();
    const platforms: Record<string, string> = {};
    for (const stat of u.platformStats) {
      if (!seenPlatforms.has(stat.platform) && stat.followerCount != null && stat.followerCount > 0) {
        platforms[stat.platform] = fmtFollowers(stat.followerCount);
        seenPlatforms.add(stat.platform);
      }
    }

    // Use shared socialLinks parser for the dual-format field.
    const social_links = parseSocialLinks(profile.socialLinks);

    return {
      id: u.id,
      full_name: u.name ?? "Creator",
      avatar_url: u.image ?? null,
      bio: profile.bio ?? null,
      niche: profile.niche ?? null,
      total_followers: totalFollowers,
      avg_engagement_rate: avgEngagement,
      primary_platform: (profile.primaryPlatform ?? null) as Creator["primary_platform"],
      location: profile.location ?? null,
      languages: ["English"],
      isMarketplaceApproved: computeIsMarketplaceApproved({
        moderationStatus: profile.moderationStatus,
        profileOrigin: profile.profileOrigin,
        claimStatus: profile.claimStatus,
      }),
      platforms,
      social_links: Object.keys(social_links).length > 0 ? social_links : null,
    };
  });
}

export async function getBrandsAction(): Promise<BrandProfile[]> {
  const session = await getSession();
  if (!session) return [];

  const users = await db.user.findMany({
    where: {
      role: Role.BRAND,
      hasCompletedOnboarding: true,
      brandProfile: { isNot: null },
    },
    select: {
      id: true,
      name: true,
      image: true,
      brandProfile: {
        select: {
          bio: true,
          companyName: true,
          industry: true,
          website: true,
          brandAccountType: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return users.map((u) => {
    const profile = u.brandProfile!;
    return {
      id: u.id,
      company_name: profile.companyName ?? u.name ?? "Brand",
      full_name: u.name ?? "Brand",
      avatar_url: u.image ?? null,
      bio: profile.bio ?? null,
      industry: profile.industry ?? "Other",
      website: profile.website ?? null,
      brand_account_type: profile.brandAccountType ?? null,
      looking_for: profile.industry ? [profile.industry] : [],
    };
  });
}
