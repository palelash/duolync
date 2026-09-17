import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Google OAuth + YouTube Data API v3 endpoints
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YT_API = "https://www.googleapis.com/youtube/v3";

// ─── Response types ───────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface YTThumbnail {
  url: string;
  width?: number;
  height?: number;
}

interface YTChannelListResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
      thumbnails?: {
        default?: YTThumbnail;
        medium?: YTThumbnail;
        high?: YTThumbnail;
      };
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
    statistics?: {
      viewCount?: string;
      subscriberCount?: string;
      videoCount?: string;
      hiddenSubscriberCount?: boolean;
    };
  }>;
  error?: { code?: number; message?: string };
}

interface YTPlaylistItemsResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: {
        medium?: YTThumbnail;
        high?: YTThumbnail;
        maxres?: YTThumbnail;
      };
      resourceId?: { videoId?: string };
    };
  }>;
  error?: { code?: number; message?: string };
}

interface YTVideosResponse {
  items?: Array<{
    id?: string;
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }>;
  error?: { code?: number; message?: string };
}

/**
 * GET /api/auth/callback/youtube
 *
 * Google OAuth 2.0 callback for the YouTube Data API v3 integration.
 * Scope: https://www.googleapis.com/auth/youtube.readonly
 *
 * Saves:
 *   - PlatformToken("youtube")   — access + refresh token
 *   - PlatformStats("youtube")   — subscriber count, total views, video count
 *   - SocialPost("youtube")      — up to 6 latest uploaded videos
 * Redirects to /creator/accounts?youtube_connected=<channel_title>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  // ── OAuth-level error ──────────────────────────────────────────────────────
  const oauthError = searchParams.get("error");
  if (oauthError) {
    const desc = searchParams.get("error_description") ?? oauthError;
    return redir(req, "/creator/accounts", {
      youtube_error: encodeURIComponent(desc),
    });
  }

  // ── CSRF state validation ──────────────────────────────────────────────────
  const stateParam = searchParams.get("state");
  const cookieHeader = req.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("__youtube_state="))
    ?.split("=")[1]
    ?.trim();

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return redir(req, "/creator/accounts", { youtube_error: "invalid_state" });
  }

  // ── Authorization code ─────────────────────────────────────────────────────
  const code = searchParams.get("code");
  if (!code) {
    return redir(req, "/creator/accounts", { youtube_error: "missing_code" });
  }

  // ── Session ────────────────────────────────────────────────────────────────
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return redir(req, "/auth", { youtube_error: "unauthenticated" });
    }
    userId = session.user.id;
  } catch {
    return redir(req, "/auth", { youtube_error: "session_error" });
  }

  // ── Env vars ───────────────────────────────────────────────────────────────
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redir(req, "/creator/accounts", {
      youtube_error: "server_misconfiguration",
    });
  }

  // ── Token exchange ─────────────────────────────────────────────────────────
  let accessToken: string;
  let refreshToken: string | null = null;
  let expiresIn: number | null = null;

  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUri(req, "youtube"),
      grant_type: "authorization_code",
    });

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const json = (await res.json()) as GoogleTokenResponse;

    if (!res.ok || json.error || typeof json.access_token !== "string") {
      const errMsg =
        json.error_description ?? json.error ?? "token_exchange_failed";
      return redir(req, "/creator/accounts", {
        youtube_error: encodeURIComponent(errMsg),
      });
    }

    accessToken = json.access_token;
    refreshToken = json.refresh_token ?? null;
    expiresIn = json.expires_in ?? null;
  } catch {
    return redir(req, "/creator/accounts", { youtube_error: "network_error" });
  }

  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1_000)
    : null;

  // ── Fetch channel info ─────────────────────────────────────────────────────
  let channelId: string | null = null;
  let channelTitle: string | null = null;
  let channelCustomUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  let uploadsPlaylistId: string | null = null;
  let subscriberCount: number | null = null;
  let totalViewCount: number | null = null;
  let videoCount: number | null = null;

  try {
    const url = new URL(`${YT_API}/channels`);
    url.searchParams.set("part", "snippet,contentDetails,statistics");
    url.searchParams.set("mine", "true");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const json = (await res.json()) as YTChannelListResponse;
      const channel = json.items?.[0];

      if (channel) {
        channelId = channel.id;
        channelTitle = channel.snippet?.title ?? null;
        channelCustomUrl = channel.snippet?.customUrl ?? null;
        thumbnailUrl =
          channel.snippet?.thumbnails?.high?.url ??
          channel.snippet?.thumbnails?.medium?.url ??
          channel.snippet?.thumbnails?.default?.url ??
          null;
        uploadsPlaylistId =
          channel.contentDetails?.relatedPlaylists?.uploads ?? null;

        const stats = channel.statistics;
        if (stats) {
          if (!stats.hiddenSubscriberCount && stats.subscriberCount) {
            subscriberCount = parseInt(stats.subscriberCount, 10) || null;
          }
          if (stats.viewCount) {
            totalViewCount = parseInt(stats.viewCount, 10) || null;
          }
          if (stats.videoCount) {
            videoCount = parseInt(stats.videoCount, 10) || null;
          }
        }
      } else if (json.error) {
        console.warn("[youtube/callback] channel error:", json.error.message);
      }
    }
  } catch {
    // Non-fatal — we continue without channel info
  }

  if (!channelId) {
    return redir(req, "/creator/accounts", {
      youtube_error: "no_youtube_channel",
    });
  }

  // ── Fetch latest uploaded videos (up to 6) ─────────────────────────────────
  type VideoItem = {
    videoId: string;
    title: string | null;
    description: string | null;
    publishedAt: string | null;
    thumbnailUrl: string | null;
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
  };
  const videos: VideoItem[] = [];

  if (uploadsPlaylistId) {
    try {
      // Step 1: get video IDs + basic snippet from the uploads playlist
      const plUrl = new URL(`${YT_API}/playlistItems`);
      plUrl.searchParams.set("part", "snippet");
      plUrl.searchParams.set("playlistId", uploadsPlaylistId);
      plUrl.searchParams.set("maxResults", "6");

      const plRes = await fetch(plUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (plRes.ok) {
        const plJson = (await plRes.json()) as YTPlaylistItemsResponse;
        const items = plJson.items ?? [];

        // Collect video IDs and build base video objects
        const videoIds: string[] = [];
        for (const item of items) {
          const videoId = item.snippet?.resourceId?.videoId;
          if (!videoId) continue;
          videoIds.push(videoId);
          videos.push({
            videoId,
            title: item.snippet?.title ?? null,
            description: item.snippet?.description ?? null,
            publishedAt: item.snippet?.publishedAt ?? null,
            thumbnailUrl:
              item.snippet?.thumbnails?.maxres?.url ??
              item.snippet?.thumbnails?.high?.url ??
              item.snippet?.thumbnails?.medium?.url ??
              null,
            viewCount: null,
            likeCount: null,
            commentCount: null,
          });
        }

        // Step 2: fetch statistics for all video IDs in one request
        if (videoIds.length > 0) {
          const statsUrl = new URL(`${YT_API}/videos`);
          statsUrl.searchParams.set("part", "statistics");
          statsUrl.searchParams.set("id", videoIds.join(","));

          const statsRes = await fetch(statsUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (statsRes.ok) {
            const statsJson = (await statsRes.json()) as YTVideosResponse;
            for (const statItem of statsJson.items ?? []) {
              const vid = videos.find((v) => v.videoId === statItem.id);
              if (!vid) continue;
              vid.viewCount = statItem.statistics?.viewCount
                ? parseInt(statItem.statistics.viewCount, 10) || null
                : null;
              vid.likeCount = statItem.statistics?.likeCount
                ? parseInt(statItem.statistics.likeCount, 10) || null
                : null;
              vid.commentCount = statItem.statistics?.commentCount
                ? parseInt(statItem.statistics.commentCount, 10) || null
                : null;
            }
          }
        }
      }
    } catch {
      // Non-fatal — channel is still connected, videos are a bonus
    }
  }

  // ── Persist to database ────────────────────────────────────────────────────
  try {
    // 1. PlatformToken
    await db.platformToken.upsert({
      where: { userId_platform: { userId, platform: "youtube" } },
      create: {
        userId,
        platform: "youtube",
        accessToken,
        refreshToken,
        expiresAt,
        scopes: "https://www.googleapis.com/auth/youtube.readonly",
        platformUserId: channelId,
        username: channelCustomUrl ?? channelTitle,
      },
      update: {
        accessToken,
        refreshToken,
        expiresAt,
        scopes: "https://www.googleapis.com/auth/youtube.readonly",
        platformUserId: channelId,
        username: channelCustomUrl ?? channelTitle,
        updatedAt: new Date(),
      },
    });

    // 2. PlatformStats
    await db.platformStats.upsert({
      where: { userId_platform: { userId, platform: "youtube" } },
      create: {
        userId,
        platform: "youtube",
        followerCount: subscriberCount,
        postCount: videoCount,
        fetchedAt: new Date(),
        raw: {
          channel_title: channelTitle,
          channel_id: channelId,
          total_views: totalViewCount,
          video_count: videoCount,
          thumbnail_url: thumbnailUrl,
          custom_url: channelCustomUrl,
        },
      },
      update: {
        followerCount: subscriberCount,
        postCount: videoCount,
        fetchedAt: new Date(),
        raw: {
          channel_title: channelTitle,
          channel_id: channelId,
          total_views: totalViewCount,
          video_count: videoCount,
          thumbnail_url: thumbnailUrl,
          custom_url: channelCustomUrl,
        },
      },
    });

    // 3. SocialPosts — latest uploaded videos
    if (videos.length > 0) {
      const creatorProfile = await db.creatorProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (creatorProfile) {
        // Delete stale YouTube posts then re-insert fresh ones
        await db.socialPost.deleteMany({
          where: { creatorProfileId: creatorProfile.id, platform: "youtube" },
        });

        await db.socialPost.createMany({
          data: videos.map((v) => ({
            creatorProfileId: creatorProfile.id,
            platform: "youtube",
            postUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
            imageUrl: v.thumbnailUrl,
            caption: v.title,
            views: v.viewCount,
            likes: v.likeCount,
            comments: v.commentCount,
            postedAt: v.publishedAt ? new Date(v.publishedAt) : null,
            fetchedAt: new Date(),
          })),
        });
      }
    }

    // 4. Update CreatorProfile.connectedPlatforms
    const creator = await db.creatorProfile.findUnique({
      where: { userId },
      select: { connectedPlatforms: true },
    });

    if (creator) {
      await db.creatorProfile.update({
        where: { userId },
        data: {
          connectedPlatforms: Array.from(
            new Set([...creator.connectedPlatforms, "youtube"]),
          ),
          lastSyncedAt: new Date(),
        },
      });
    }

    revalidatePath("/creator/accounts");
    revalidatePath("/creator/presence");
  } catch (err) {
    console.error("[youtube/callback] db error:", err);
    return redir(req, "/creator/accounts", { youtube_error: "db_error" });
  }

  // Clear the state cookie on success
  const successRes = redir(req, "/creator/accounts", {
    youtube_connected: channelTitle ?? "1",
  });
  successRes.cookies.set("__youtube_state", "", { maxAge: 0, path: "/" });
  return successRes;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function callbackUri(req: NextRequest, platform: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base.replace(/\/$/, "")}/api/auth/callback/${platform}`;
}

function redir(
  req: NextRequest,
  path: string,
  params: Record<string, string>,
): NextResponse {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
}
