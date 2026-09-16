import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const GRAPH = "https://graph.facebook.com/v18.0";

interface MetaTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string };
}
interface MetaPage {
  id: string;
  name?: string;
  fan_count?: number;
  followers_count?: number;
  access_token?: string;
}
interface MetaPagesResponse { data?: MetaPage[]; error?: { message?: string } }

/**
 * GET /api/auth/callback/facebook
 *
 * Scope: pages_show_list, pages_read_engagement, business_management
 *
 * Saves the Facebook Page with the highest fan_count as:
 *   PlatformToken("facebook_page") + PlatformStats("facebook_page")
 *
 * Redirects to /creator/accounts?facebook_connected=<page_name>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const oauthError = searchParams.get("error");
  if (oauthError) {
    const desc = searchParams.get("error_description") ?? oauthError;
    return redir(req, "/creator/accounts", { facebook_error: encodeURIComponent(desc) });
  }

  const code = searchParams.get("code");
  if (!code) return redir(req, "/creator/accounts", { facebook_error: "missing_code" });

  // Session
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return redir(req, "/auth", { facebook_error: "unauthenticated" });
    userId = session.user.id;
  } catch {
    return redir(req, "/auth", { facebook_error: "session_error" });
  }

  // Token exchange
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return redir(req, "/creator/accounts", { facebook_error: "server_misconfiguration" });
  }

  let accessToken: string;
  let expiresIn: number | null = null;
  try {
    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("redirect_uri", callbackUri(req, "facebook"));
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    const res = await fetch(tokenUrl.toString());
    const json = (await res.json()) as MetaTokenResponse;
    if (!res.ok || typeof json.access_token !== "string") {
      return redir(req, "/creator/accounts", {
        facebook_error: encodeURIComponent(json.error?.message ?? "token_exchange_failed"),
      });
    }
    accessToken = json.access_token;
    if (typeof json.expires_in === "number") expiresIn = json.expires_in;
  } catch {
    return redir(req, "/creator/accounts", { facebook_error: "network_error" });
  }

  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1_000) : null;

  // Fetch Facebook Pages
  let fbPageId: string | null = null;
  let fbPageName: string | null = null;
  let fbPageFollowers: number | null = null;
  let fbPageAccessToken: string | null = null;

  try {
    const pagesUrl = new URL(`${GRAPH}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,name,fan_count,followers_count,access_token");
    pagesUrl.searchParams.set("access_token", accessToken);

    const pagesRes = await fetch(pagesUrl.toString());
    if (pagesRes.ok) {
      const { data = [] } = (await pagesRes.json()) as MetaPagesResponse;
      if (data.length > 0) {
        // Pick the page with the most followers
        const primary = data.reduce((best, p) =>
          (p.fan_count ?? 0) >= (best.fan_count ?? 0) ? p : best,
        );
        fbPageId = primary.id;
        fbPageName = primary.name ?? null;
        fbPageFollowers = primary.fan_count ?? primary.followers_count ?? null;
        fbPageAccessToken = primary.access_token ?? null;
      }
    }
  } catch { /* non-fatal */ }

  if (!fbPageId) {
    return redir(req, "/creator/accounts", { facebook_error: "no_pages_found" });
  }

  // Persist
  try {
    const SCOPES = "pages_show_list,pages_read_engagement,business_management";

    await db.platformToken.upsert({
      where: { userId_platform: { userId, platform: "facebook_page" } },
      create: {
        userId, platform: "facebook_page",
        accessToken: fbPageAccessToken ?? accessToken,
        expiresAt, scopes: SCOPES,
        platformUserId: fbPageId,
        username: fbPageName,
      },
      update: {
        accessToken: fbPageAccessToken ?? accessToken,
        expiresAt, scopes: SCOPES,
        platformUserId: fbPageId,
        username: fbPageName,
        updatedAt: new Date(),
      },
    });

    await db.platformStats.upsert({
      where: { userId_platform: { userId, platform: "facebook_page" } },
      create: { userId, platform: "facebook_page", followerCount: fbPageFollowers, fetchedAt: new Date(), raw: fbPageName ? { pageName: fbPageName } : undefined },
      update: { followerCount: fbPageFollowers, fetchedAt: new Date(), ...(fbPageName ? { raw: { pageName: fbPageName } } : {}) },
    });

    const creator = await db.creatorProfile.findUnique({
      where: { userId },
      select: { id: true, connectedPlatforms: true },
    });

    if (creator) {
      const allStats = await db.platformStats.findMany({ where: { userId }, select: { followerCount: true } });
      const totalFollowers = allStats.reduce((s, r) => s + (r.followerCount ?? 0), 0);

      await db.creatorProfile.update({
        where: { userId },
        data: {
          connectedPlatforms: Array.from(new Set([...creator.connectedPlatforms, "facebook_page"])),
          followerCount: totalFollowers || null,
          lastSyncedAt: new Date(),
        },
      });
    }

    revalidatePath("/creator/accounts");
    revalidatePath("/creator/presence");
    revalidatePath("/creator/dashboard");
  } catch (err) {
    console.error("[facebook/callback] db error:", err);
    return redir(req, "/creator/accounts", { facebook_error: "db_error" });
  }

  return redir(req, "/creator/accounts", {
    facebook_connected: fbPageName ?? "1",
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
