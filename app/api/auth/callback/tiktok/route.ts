import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// TikTok Login Kit v2 endpoints
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface TikTokUserInfo {
  open_id?: string;
  union_id?: string;
  display_name?: string;
  avatar_url?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

interface TikTokUserInfoResponse {
  data?: { user?: TikTokUserInfo };
  error?: { code?: string; message?: string; log_id?: string };
}

/**
 * GET /api/auth/callback/tiktok
 *
 * TikTok Login Kit v2 OAuth callback.
 * Scopes: user.info.basic, user.info.stats
 *
 * Saves: PlatformToken("tiktok") + PlatformStats("tiktok")
 * Redirects to /creator/accounts?tiktok_connected=<display_name>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  // ── OAuth-level error ──────────────────────────────────────────────────────
  const oauthError = searchParams.get("error");
  if (oauthError) {
    const desc = searchParams.get("error_description") ?? oauthError;
    return redir(req, "/creator/accounts", {
      tiktok_error: encodeURIComponent(desc),
    });
  }

  // ── State validation (CSRF) ────────────────────────────────────────────────
  const stateParam = searchParams.get("state");
  const cookieHeader = req.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("__tiktok_state="))
    ?.split("=")[1]
    ?.trim();

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return redir(req, "/creator/accounts", { tiktok_error: "invalid_state" });
  }

  // ── Authorization code ─────────────────────────────────────────────────────
  const code = searchParams.get("code");
  if (!code) {
    return redir(req, "/creator/accounts", { tiktok_error: "missing_code" });
  }

  // ── Session ────────────────────────────────────────────────────────────────
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return redir(req, "/auth", { tiktok_error: "unauthenticated" });
    }
    userId = session.user.id;
  } catch {
    return redir(req, "/auth", { tiktok_error: "session_error" });
  }

  // ── Env vars ───────────────────────────────────────────────────────────────
  const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return redir(req, "/creator/accounts", {
      tiktok_error: "server_misconfiguration",
    });
  }

  // ── Token exchange ─────────────────────────────────────────────────────────
  let accessToken: string;
  let refreshToken: string | null = null;
  let openId: string | null = null;
  let expiresIn: number | null = null;

  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUri(req, "tiktok"),
    });

    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const json = (await res.json()) as TikTokTokenResponse;

    if (!res.ok || json.error || typeof json.access_token !== "string") {
      const errMsg = json.error_description ?? json.error ?? "token_exchange_failed";
      return redir(req, "/creator/accounts", {
        tiktok_error: encodeURIComponent(errMsg),
      });
    }

    accessToken = json.access_token;
    refreshToken = json.refresh_token ?? null;
    openId = json.open_id ?? null;
    expiresIn = json.expires_in ?? null;
  } catch {
    return redir(req, "/creator/accounts", { tiktok_error: "network_error" });
  }

  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1_000)
    : null;

  // ── Fetch TikTok user info ─────────────────────────────────────────────────
  let displayName: string | null = null;
  let followerCount: number | null = null;
  let followingCount: number | null = null;
  let likesCount: number | null = null;
  let videoCount: number | null = null;

  try {
    const url = new URL(TIKTOK_USER_INFO_URL);
    url.searchParams.set(
      "fields",
      "open_id,union_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count",
    );

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const json = (await res.json()) as TikTokUserInfoResponse;
      const user = json.data?.user;
      if (user && (!json.error || json.error.code === "ok")) {
        if (!openId && user.open_id) openId = user.open_id;
        displayName = user.display_name ?? null;
        followerCount = user.follower_count ?? null;
        followingCount = user.following_count ?? null;
        likesCount = user.likes_count ?? null;
        videoCount = user.video_count ?? null;
      } else if (json.error && json.error.code !== "ok") {
        console.warn("[tiktok/callback] user info error:", json.error.message);
      }
    }
  } catch {
    // Non-fatal — we still have openId from the token response
  }

  if (!openId) {
    return redir(req, "/creator/accounts", {
      tiktok_error: "no_tiktok_account",
    });
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  try {
    await db.platformToken.upsert({
      where: { userId_platform: { userId, platform: "tiktok" } },
      create: {
        userId,
        platform: "tiktok",
        accessToken,
        refreshToken,
        expiresAt,
        scopes: "user.info.basic,user.info.stats,video.list",
        platformUserId: openId,
        username: displayName,
      },
      update: {
        accessToken,
        refreshToken,
        expiresAt,
        scopes: "user.info.basic,user.info.stats,video.list",
        platformUserId: openId,
        username: displayName,
        updatedAt: new Date(),
      },
    });

    await db.platformStats.upsert({
      where: { userId_platform: { userId, platform: "tiktok" } },
      create: {
        userId,
        platform: "tiktok",
        followerCount,
        followingCount,
        fetchedAt: new Date(),
        raw: {
          display_name: displayName,
          likes_count: likesCount,
          video_count: videoCount,
        },
      },
      update: {
        followerCount,
        followingCount,
        fetchedAt: new Date(),
        raw: {
          display_name: displayName,
          likes_count: likesCount,
          video_count: videoCount,
        },
      },
    });

    const creator = await db.creatorProfile.findUnique({
      where: { userId },
      select: { connectedPlatforms: true },
    });

    if (creator) {
      await db.creatorProfile.update({
        where: { userId },
        data: {
          connectedPlatforms: Array.from(
            new Set([...creator.connectedPlatforms, "tiktok"]),
          ),
          lastSyncedAt: new Date(),
        },
      });
    }

    revalidatePath("/creator/accounts");
    revalidatePath("/creator/presence");
  } catch (err) {
    console.error("[tiktok/callback] db error:", err);
    return redir(req, "/creator/accounts", { tiktok_error: "db_error" });
  }

  // Clear the state cookie on success
  const successRes = redir(req, "/creator/accounts", {
    tiktok_connected: displayName ?? "1",
  });
  successRes.cookies.set("__tiktok_state", "", { maxAge: 0, path: "/" });
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
