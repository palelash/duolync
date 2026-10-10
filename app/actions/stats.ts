"use server";

import { lockYouTubeCompliance, youtubeBlocked } from "@/lib/youtube-compliance";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { lockYouTubeOwner } from "@/lib/youtube-lock";
import { canOverwrite } from "@/lib/platform-stats-policy";
import { computeFollowerCache } from "@/lib/creator-metrics";

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

  if (platform === "youtube" && youtubeBlocked(await db.youTubeComplianceState.findUnique({ where: { userId: session.user.id } })))
    return { data: null, error: "YouTube data was removed. Reconnect YouTube to restore access." };
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

  // YouTube lower-source writers share the official coordination domain. The
  // policy gates must be rechecked after HTTP, while reconnect cannot intervene.
  if (platform === "youtube" && liveData) {
    const incoming = liveData;
    const accepted = await db.$transaction(async tx => {
      await lockYouTubeOwner(tx, session.user.id);
      const tokens = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PlatformToken" WHERE "userId" = ${session.user.id} AND "platform" = 'youtube' FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${session.user.id} FOR UPDATE`;
      if (youtubeBlocked(await lockYouTubeCompliance(tx, session.user.id))) return false;
      const current = await tx.platformStats.findFirst({ where: { userId: session.user.id, platform } });
      if (tokens.length || (current && !canOverwrite(current.dataSource, "RAPIDAPI"))) return false;
      const snapshot = { followerCount: incoming.followerCount, followingCount: incoming.followingCount,
        postCount: incoming.postCount, engagementRate: incoming.engagementRate,
        fetchedAt: new Date(), raw: { username, source: "rapidapi" }, dataSource: "RAPIDAPI" as const };
      await tx.platformStats.upsert({ where: { userId_platform: { userId: session.user.id, platform } },
        create: { userId: session.user.id, platform, ...snapshot }, update: snapshot });
      const allStats = await tx.platformStats.findMany({ where: { userId: session.user.id }, select: { followerCount: true } });
      const cachedFollowers = computeFollowerCache(allStats);
      await tx.creatorProfile.updateMany({ where: { userId: session.user.id }, data: {
        ...(cachedFollowers !== null ? { followerCount: cachedFollowers } : {}), lastSyncedAt: new Date(),
      } });
      return true;
    }, { maxWait: 5_000, timeout: 15_000 });
    if (accepted) return { data: incoming, error: null };
    liveData = null;
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
        select: { followerCount: true },
      });
      // §7: Stop writing legacy totalFollowers/avgEngagementRate/lastStatsUpdate.
      // Converge only to the canonical followerCount + lastSyncedAt fields.
      // Engagement is computed at read time from SocialPosts — not stored here.
      const cachedFollowers = computeFollowerCache(allStats);

      await db.creatorProfile.updateMany({
        where: { userId: session.user.id },
        data: {
          ...(cachedFollowers !== null ? { followerCount: cachedFollowers } : {}),
          lastSyncedAt: new Date(),
        },
      });

      return { data: liveData, error: null };
    }
  }

  // ── Return cached data if available ─────────────────────────────────────────
  if (platform === "youtube" && youtubeBlocked(await db.youTubeComplianceState.findUnique({ where: { userId: session.user.id } })))
    return { data: null, error: "YouTube data was removed." };
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
