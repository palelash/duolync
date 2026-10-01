"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { canOverwrite } from "@/lib/platform-stats-policy";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export interface PlatformStatsResult {
  platform: string;
  username: string;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  engagementRate: number | null;
  fetchedAt: string;
}

/**
 * Fetch creator stats from RapidAPI's Social Media Scraper.
 * Requires RAPIDAPI_KEY in environment variables.
 * Falls back to cached DB data if the key is missing.
 */
export async function fetchCreatorStatsAction(
  platform: "instagram" | "tiktok" | "youtube",
  username: string,
): Promise<{ data: PlatformStatsResult | null; error: string | null }> {
  const session = await getSession();
  if (!session) return { data: null, error: "Unauthorized" };

  const apiKey = process.env.RAPIDAPI_KEY;

  // ── Try to fetch live data ──────────────────────────────────────────────────
  let liveData: PlatformStatsResult | null = null;

  if (apiKey) {
    try {
      liveData = await fetchFromRapidApi(platform, username, apiKey);
    } catch {
      // Fall through to cached data
    }
  }

  // ── Persist / update cache ──────────────────────────────────────────────────
  if (liveData) {
    // ── Two-gate write policy for RAPIDAPI ──────────────────────────────────
    // Run both queries in parallel to minimise latency.
    const [existing, existingToken] = await Promise.all([
      db.platformStats.findFirst({
        where: { userId: session.user.id, platform },
        select: { id: true, dataSource: true },
      }),
      db.platformToken.findFirst({
        where: { userId: session.user.id, platform },
        select: { id: true },
      }),
    ]);

    // Gate 1 — hard rule: any PlatformToken blocks RAPIDAPI unconditionally.
    // Fall back to cached data rather than erroring, so the UI still shows stats.
    if (existingToken) {
      // Skip RapidAPI write; return cached data below.
      liveData = null;
    }
    // Gate 2 — source authority: RAPIDAPI cannot overwrite a higher-authority row.
    else if (existing && !canOverwrite(existing.dataSource, "RAPIDAPI")) {
      // Skip RapidAPI write; return cached data below.
      liveData = null;
    }

    if (liveData) {
      if (existing) {
        await db.platformStats.update({
          where: { id: existing.id },
          data: {
            followerCount: liveData.followerCount ?? null,
            followingCount: liveData.followingCount ?? null,
            postCount: liveData.postCount ?? null,
            engagementRate: liveData.engagementRate ?? null,
            fetchedAt: new Date(),
            raw: JSON.parse(JSON.stringify({ username, source: "rapidapi" })),
            dataSource: "RAPIDAPI",
          },
        });
      } else {
        await db.platformStats.create({
          data: {
            userId: session.user.id,
            platform,
            followerCount: liveData.followerCount ?? null,
            followingCount: liveData.followingCount ?? null,
            postCount: liveData.postCount ?? null,
            engagementRate: liveData.engagementRate ?? null,
            raw: JSON.parse(JSON.stringify({ username, source: "rapidapi" })),
            dataSource: "RAPIDAPI",
          },
        });
      }

      // Also update aggregated totals on CreatorProfile
      const allStats = await db.platformStats.findMany({
        where: { userId: session.user.id },
        select: { followerCount: true, engagementRate: true },
      });
      const totalFollowers = allStats.reduce(
        (sum, s) => sum + (s.followerCount ?? 0),
        0,
      );
      const ratedPlatforms = allStats.filter((s) => s.engagementRate !== null);
      const avgEngagement =
        ratedPlatforms.length > 0
          ? ratedPlatforms.reduce((sum, s) => sum + (s.engagementRate ?? 0), 0) /
            ratedPlatforms.length
          : 0;

      await db.creatorProfile.updateMany({
        where: { userId: session.user.id },
        data: {
          totalFollowers,
          avgEngagementRate: avgEngagement,
          lastStatsUpdate: new Date(),
        },
      });

      return { data: liveData, error: null };
    }
  }

  // ── Return cached data if available ─────────────────────────────────────────
  const cached = await db.platformStats.findFirst({
    where: { userId: session.user.id, platform },
    orderBy: { fetchedAt: "desc" },
  });

  if (cached) {
    return {
      data: {
        platform: cached.platform,
        username,
        followerCount: cached.followerCount,
        followingCount: cached.followingCount,
        postCount: cached.postCount,
        engagementRate: cached.engagementRate,
        fetchedAt: cached.fetchedAt.toISOString(),
      },
      error: apiKey ? null : "RAPIDAPI_KEY not configured — showing cached data.",
    };
  }

  return {
    data: null,
    error: "No data available. Add RAPIDAPI_KEY to .env to enable live stats.",
  };
}

// ── RapidAPI fetch helpers ────────────────────────────────────────────────────

async function fetchFromRapidApi(
  platform: "instagram" | "tiktok" | "youtube",
  username: string,
  apiKey: string,
): Promise<PlatformStatsResult> {
  if (platform === "instagram") {
    return fetchInstagramStats(username, apiKey);
  }
  if (platform === "tiktok") {
    return fetchTiktokStats(username, apiKey);
  }
  return fetchYoutubeStats(username, apiKey);
}

async function fetchInstagramStats(
  username: string,
  apiKey: string,
): Promise<PlatformStatsResult> {
  const res = await fetch(
    `https://instagram-scraper-api2.p.rapidapi.com/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`,
    {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
      },
      next: { revalidate: 3600 },
    },
  );
  if (!res.ok) throw new Error(`Instagram API error: ${res.status}`);
  const json = (await res.json()) as {
    data?: {
      follower_count?: number;
      following_count?: number;
      media_count?: number;
    };
  };
  const d = json.data ?? {};
  return {
    platform: "instagram",
    username,
    followerCount: d.follower_count ?? null,
    followingCount: d.following_count ?? null,
    postCount: d.media_count ?? null,
    engagementRate: null,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchTiktokStats(
  username: string,
  apiKey: string,
): Promise<PlatformStatsResult> {
  const res = await fetch(
    `https://tiktok-api23.p.rapidapi.com/api/user/info?uniqueId=${encodeURIComponent(username)}`,
    {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "tiktok-api23.p.rapidapi.com",
      },
      next: { revalidate: 3600 },
    },
  );
  if (!res.ok) throw new Error(`TikTok API error: ${res.status}`);
  const json = (await res.json()) as {
    userInfo?: {
      stats?: {
        followerCount?: number;
        followingCount?: number;
        videoCount?: number;
      };
    };
  };
  const stats = json.userInfo?.stats ?? {};
  return {
    platform: "tiktok",
    username,
    followerCount: stats.followerCount ?? null,
    followingCount: stats.followingCount ?? null,
    postCount: stats.videoCount ?? null,
    engagementRate: null,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchYoutubeStats(
  channelHandle: string,
  apiKey: string,
): Promise<PlatformStatsResult> {
  const res = await fetch(
    `https://yt-api.p.rapidapi.com/channel/about?id=${encodeURIComponent(channelHandle)}`,
    {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "yt-api.p.rapidapi.com",
      },
      next: { revalidate: 3600 },
    },
  );
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const json = (await res.json()) as {
    stats?: { subscribers?: number; videos?: number };
  };
  const stats = json.stats ?? {};
  return {
    platform: "youtube",
    username: channelHandle,
    followerCount: stats.subscribers ?? null,
    followingCount: null,
    postCount: stats.videos ?? null,
    engagementRate: null,
    fetchedAt: new Date().toISOString(),
  };
}
