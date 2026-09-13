export const dynamic = 'force-dynamic';

import { db } from "@/lib/db";
import ModerationClient from "./ModerationClient";

async function getModerationData() {
  const [creators, campaigns] = await Promise.all([
    db.creatorProfile.findMany({
      orderBy: [{ moderationStatus: "asc" }, { moderatedAt: "desc" }],
      select: {
        id: true,
        userId: true,
        bio: true,
        niche: true,
        location: true,
        totalFollowers: true,
        avgEngagementRate: true,
        primaryPlatform: true,
        socialLinks: true,
        connectedPlatforms: true,
        moderationStatus: true,
        moderationNote: true,
        moderatedAt: true,
        user: {
          select: {
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
    }),
    db.campaign.findMany({
      orderBy: [{ moderationStatus: "asc" }, { moderatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        budget: true,
        status: true,
        moderationStatus: true,
        moderationNote: true,
        moderatedAt: true,
        createdAt: true,
        deadline: true,
        requirements: true,
        briefDescription: true,
        goal: true,
        dosAndDonts: true,
        platforms: true,
        contentFormats: true,
        minFollowers: true,
        imageUrl: true,
        brand: {
          select: {
            companyName: true,
            industry: true,
            website: true,
            bio: true,
          },
        },
      },
    }),
  ]);

  return { creators, campaigns };
}

export default async function ModerationPage() {
  const { creators, campaigns } = await getModerationData();

  return (
    <ModerationClient
      creators={creators}
      campaigns={campaigns}
    />
  );
}
