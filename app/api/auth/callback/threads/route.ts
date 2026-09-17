import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const THREADS_GRAPH = "https://graph.threads.net/v1.0";
// Threads token exchange uses a different base than the Facebook Graph API
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";

interface MetaTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string };
}
interface ThreadsProfile {
  id?: string;
  username?: string;
  name?: string;
  error?: { message?: string };
}

/**
 * GET /api/auth/callback/threads
 *
 * Scope: threads_basic
 *
 * Saves: PlatformToken("threads") + PlatformStats("threads")
 * Redirects to /creator/accounts?threads_connected=<username>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const oauthError = searchParams.get("error");
  if (oauthError) {
    const desc = searchParams.get("error_description") ?? oauthError;
    return redir(req, "/creator/accounts", { threads_error: encodeURIComponent(desc) });
  }

  const code = searchParams.get("code");
  if (!code) return redir(req, "/creator/accounts", { threads_error: "missing_code" });

  // Session
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return redir(req, "/auth", { threads_error: "unauthenticated" });
    userId = session.user.id;
  } catch {
    return redir(req, "/auth", { threads_error: "session_error" });
  }

  // Token exchange — Threads has its own App ID/Secret, separate from Meta/Facebook
  const appId = process.env.NEXT_PUBLIC_THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!appId || !appSecret) {
    return redir(req, "/creator/accounts", { threads_error: "server_misconfiguration" });
  }

  let accessToken: string;
  let expiresIn: number | null = null;
  try {
    const tokenUrl = new URL(THREADS_TOKEN_URL);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("redirect_uri", callbackUri(req, "threads"));
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    tokenUrl.searchParams.set("grant_type", "authorization_code");

    const res = await fetch(tokenUrl.toString());
    const json = (await res.json()) as MetaTokenResponse;
    if (!res.ok || typeof json.access_token !== "string") {
      return redir(req, "/creator/accounts", {
        threads_error: encodeURIComponent(json.error?.message ?? "token_exchange_failed"),
      });
    }
    accessToken = json.access_token;
    if (typeof json.expires_in === "number") expiresIn = json.expires_in;
  } catch {
    return redir(req, "/creator/accounts", { threads_error: "network_error" });
  }

  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1_000) : null;

  // Fetch Threads profile
  let threadsId: string | null = null;
  let threadsUsername: string | null = null;

  try {
    const url = new URL(`${THREADS_GRAPH}/me`);
    url.searchParams.set("fields", "id,username,name,threads_profile_picture_url,threads_biography");
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString());
    if (res.ok) {
      const profile = (await res.json()) as ThreadsProfile;
      if (!profile.error && profile.id) {
        threadsId = profile.id;
        threadsUsername = profile.username ?? null;
      } else if (profile.error) {
        console.warn("[threads/callback] profile error:", profile.error.message);
        return redir(req, "/creator/accounts", {
          threads_error: encodeURIComponent(profile.error.message ?? "profile_fetch_failed"),
        });
      }
    }
  } catch {
    return redir(req, "/creator/accounts", { threads_error: "network_error" });
  }

  if (!threadsId) {
    return redir(req, "/creator/accounts", { threads_error: "no_threads_account" });
  }

  // Persist
  try {
    await db.platformToken.upsert({
      where: { userId_platform: { userId, platform: "threads" } },
      create: { userId, platform: "threads", accessToken, expiresAt, scopes: "threads_basic", platformUserId: threadsId, username: threadsUsername },
      update: { accessToken, expiresAt, scopes: "threads_basic", platformUserId: threadsId, username: threadsUsername, updatedAt: new Date() },
    });

    // threads_basic doesn't expose follower count; the row marks it as connected
    await db.platformStats.upsert({
      where: { userId_platform: { userId, platform: "threads" } },
      create: { userId, platform: "threads", followerCount: null, fetchedAt: new Date(), raw: threadsUsername ? { handle: threadsUsername } : undefined },
      update: { fetchedAt: new Date(), ...(threadsUsername ? { raw: { handle: threadsUsername } } : {}) },
    });

    const creator = await db.creatorProfile.findUnique({
      where: { userId },
      select: { connectedPlatforms: true },
    });

    if (creator) {
      await db.creatorProfile.update({
        where: { userId },
        data: {
          connectedPlatforms: Array.from(new Set([...creator.connectedPlatforms, "threads"])),
          lastSyncedAt: new Date(),
        },
      });
    }

    revalidatePath("/creator/accounts");
    revalidatePath("/creator/presence");
  } catch (err) {
    console.error("[threads/callback] db error:", err);
    return redir(req, "/creator/accounts", { threads_error: "db_error" });
  }

  return redir(req, "/creator/accounts", {
    threads_connected: threadsUsername ?? "1",
  });
}

function callbackUri(req: NextRequest, platform: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base.replace(/\/$/, "")}/api/auth/callback/${platform}`;
}

function redir(req: NextRequest, path: string, params: Record<string, string>): NextResponse {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
}
