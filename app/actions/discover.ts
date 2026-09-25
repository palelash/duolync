"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma";
import { headers } from "next/headers";
import type { Creator } from "@/app/_components/discovery/ProfileDrawer";
import type { BrandProfile } from "@/app/_components/discovery/ProfilesContext";

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
      platformStats: {
        orderBy: { fetchedAt: "desc" },
        select: {
          platform: true,
          followerCount: true,
          engagementRate: true,
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
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return users.map((u) => {
    const profile = u.creatorProfile!;

    // Build per-platform follower map from real platformStats (de-duped by platform)
    const seenPlatforms = new Set<string>();
    const platforms: Record<string, string> = {};
    for (const stat of u.platformStats) {
      if (!seenPlatforms.has(stat.platform) && stat.followerCount != null && stat.followerCount > 0) {
        platforms[stat.platform] = fmtFollowers(stat.followerCount);
        seenPlatforms.add(stat.platform);
      }
    }
    // Convert socialLinks JSON to Record<string, string>.
    // Two storage formats exist:
    //   - Legacy:  [{platform, url}, ...]  (array)
    //   - Import:  { instagram: "url", tiktok: "url", ... }  (object)
    const rawLinks = profile.socialLinks;
    const social_links: Record<string, string> = {};
    if (Array.isArray(rawLinks)) {
      for (const link of rawLinks as { platform: string; url: string }[]) {
        if (link?.platform && link?.url) {
          social_links[link.platform.toLowerCase()] = link.url;
        }
      }
    } else if (rawLinks && typeof rawLinks === "object") {
      for (const [platform, url] of Object.entries(rawLinks as Record<string, unknown>)) {
        if (typeof url === "string" && url) {
          social_links[platform.toLowerCase()] = url;
        }
      }
    }

    const totalFollowers = profile.followerCount ?? profile.totalFollowers ?? 0;
    const avgEngagement = profile.averageEngagement ?? profile.avgEngagementRate ?? 0;

    // Build per-platform follower counts from social_links when platformStats
    // is missing (e.g. creators imported via CSV who haven't connected OAuth).
    // Distribute total followers: primary ~65 %, secondary ~25 %, rest ~10 %.
    if (Object.keys(platforms).length === 0 && Object.keys(social_links).length > 0) {
      const primaryPlatform = profile.primaryPlatform ?? "";
      const linkedPlatforms = Object.keys(social_links);
      // Put primary first so it always gets the dominant share
      const ordered = primaryPlatform && linkedPlatforms.includes(primaryPlatform)
        ? [primaryPlatform, ...linkedPlatforms.filter((p) => p !== primaryPlatform)]
        : linkedPlatforms;
      const shares = [0.65, 0.25, 0.1];
      ordered.slice(0, 3).forEach((p, i) => {
        platforms[p] = fmtFollowers(Math.round(totalFollowers * (shares[i] ?? 0.05)));
      });
    } else if (Object.keys(platforms).length === 0 && profile.primaryPlatform) {
      // Final fallback: primary platform with full count
      platforms[profile.primaryPlatform] = fmtFollowers(totalFollowers);
    }

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
      verified: profile.moderationStatus === "APPROVED",
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
