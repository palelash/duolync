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
  instagram_business_account?: { id: string };
}
interface MetaPagesResponse { data?: MetaPage[]; error?: { message?: string } }
interface IgAccount {
  id: string; username?: string; followers_count?: number; profile_picture_url?: string;
  error?: { message?: string };
}
interface IgMediaItem {
  caption?: string; media_url?: string; thumbnail_url?: string; permalink?: string;
  like_count?: number; comments_count?: number; timestamp?: string;
}
interface IgMediaResponse { data?: IgMediaItem[]; error?: { message?: string } }

/**
 * GET /api/auth/callback/instagram
 *
 * Scope: instagram_basic, instagram_manage_messages,
 *        pages_read_engagement, pages_show_list, business_management
 *
 * Saves: PlatformToken("instagram") + PlatformStats("instagram") + SocialPost[]
 * Redirects to /creator/accounts?instagram_connected=<username>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const oauthError = searchParams.get("error");
  if (oauthError) {
    const desc = searchParams.get("error_description") ?? oauthError;
    return redir(req, "/creator/accounts", { instagram_error: encodeURIComponent(desc) });
  }

  const code = searchParams.get("code");
  if (!code) return redir(req, "/creator/accounts", { instagram_error: "missing_code" });

  // Session
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return redir(req, "/auth", { instagram_error: "unauthenticated" });
    userId = session.user.id;
  } catch {
    return redir(req, "/auth", { instagram_error: "session_error" });
  }

  // Token exchange
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return redir(req, "/creator/accounts", { instagram_error: "server_misconfiguration" });
  }

  let accessToken: string;
  let expiresIn: number | null = null;
  try {
    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("redirect_uri", callbackUri(req, "instagram"));
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    const res = await fetch(tokenUrl.toString());
    const json = (await res.json()) as MetaTokenResponse;
    if (!res.ok || typeof json.access_token !== "string") {
      return redir(req, "/creator/accounts", {
        instagram_error: encodeURIComponent(json.error?.message ?? "token_exchange_failed"),
      });
    }
    accessToken = json.access_token;
    if (typeof json.expires_in === "number") expiresIn = json.expires_in;
  } catch {
    return redir(req, "/creator/accounts", { instagram_error: "network_error" });
  }

  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1_000) : null;

  // Fetch Facebook Pages → IG Business Account
  let igAccountId: string | null = null;
  let igUsername: string | null = null;
  let igFollowers: number | null = null;
  let fbPageToken: string | null = null;

  try {
    const pagesUrl = new URL(`${GRAPH}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,access_token,instagram_business_account");
    pagesUrl.searchParams.set("access_token", accessToken);

    const pagesRes = await fetch(pagesUrl.toString());
    if (pagesRes.ok) {
      const { data = [] } = (await pagesRes.json()) as MetaPagesResponse;
      const pageWithIg = data.find((p) => p.instagram_business_account?.id);
      if (pageWithIg) {
        igAccountId = pageWithIg.instagram_business_account!.id;
        fbPageToken = pageWithIg.access_token ?? null;
      }
    }
  } catch { /* non-fatal */ }

  // Fetch IG account details
  if (igAccountId) {
    try {
      const igUrl = new URL(`${GRAPH}/${igAccountId}`);
      igUrl.searchParams.set("fields", "username,followers_count,profile_picture_url");
      igUrl.searchParams.set("access_token", fbPageToken ?? accessToken);
      const igRes = await fetch(igUrl.toString());
      if (igRes.ok) {
        const ig = (await igRes.json()) as IgAccount;
        igUsername = ig.username ?? null;
        igFollowers = ig.followers_count ?? null;
      }
    } catch { /* non-fatal */ }
  }

  // Fallback to /me if no IG Business Account found
  if (!igAccountId) {
    try {
      const meRes = await fetch(`${GRAPH}/me?fields=id,name&access_token=${accessToken}`);
      if (meRes.ok) {
        const me = (await meRes.json()) as Record<string, unknown>;
        if (typeof me.id === "string") igAccountId = me.id;
        if (typeof me.name === "string") igUsername = me.name;
      }
    } catch { /* non-fatal */ }
  }

  // Fetch recent IG posts
  type Post = {
    postUrl: string | null; imageUrl: string | null; caption: string | null;
    likes: number | null; comments: number | null; views: number | null;
    engagementRate: number | null; postedAt: Date | null;
  };
  let posts: Post[] = [];

  if (igAccountId) {
    try {
      const mediaUrl = new URL(`${GRAPH}/${igAccountId}/media`);
      mediaUrl.searchParams.set(
        "fields",
        "caption,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp",
      );
      mediaUrl.searchParams.set("limit", "3");
      mediaUrl.searchParams.set("access_token", accessToken);
      const mediaRes = await fetch(mediaUrl.toString());
      if (mediaRes.ok) {
        const { data = [] } = (await mediaRes.json()) as IgMediaResponse;
        posts = data.map((item) => ({
          postUrl: item.permalink ?? null,
          imageUrl: item.media_url ?? item.thumbnail_url ?? null,
          caption: item.caption ?? null,
          likes: item.like_count ?? null,
          comments: item.comments_count ?? null,
          views: null, engagementRate: null,
          postedAt: item.timestamp ? new Date(item.timestamp) : null,
        }));
      }
    } catch { /* non-fatal */ }
  }

  // Persist
  try {
    const SCOPES = "instagram_basic,instagram_manage_messages,pages_read_engagement,pages_show_list,business_management";

    await db.platformToken.upsert({
      where: { userId_platform: { userId, platform: "instagram" } },
      create: { userId, platform: "instagram", accessToken, expiresAt, scopes: SCOPES, platformUserId: igAccountId, username: igUsername },
      update: { accessToken, expiresAt, scopes: SCOPES, platformUserId: igAccountId, username: igUsername, updatedAt: new Date() },
    });

    await db.platformStats.upsert({
      where: { userId_platform: { userId, platform: "instagram" } },
      create: { userId, platform: "instagram", followerCount: igFollowers, fetchedAt: new Date(), raw: igUsername ? { handle: igUsername } : undefined },
      update: { followerCount: igFollowers, fetchedAt: new Date(), ...(igUsername ? { raw: { handle: igUsername } } : {}) },
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
          connectedPlatforms: Array.from(new Set([...creator.connectedPlatforms, "instagram"])),
          followerCount: totalFollowers || null,
          lastSyncedAt: new Date(),
        },
      });

      if (posts.length > 0) {
        await db.socialPost.deleteMany({ where: { creatorProfileId: creator.id, platform: "instagram" } });
        await db.socialPost.createMany({
          data: posts.map((p) => ({ creatorProfileId: creator.id, platform: "instagram", ...p })),
        });
      }
    }

    revalidatePath("/creator/accounts");
    revalidatePath("/creator/presence");
    revalidatePath("/creator/dashboard");
  } catch (err) {
    console.error("[instagram/callback] db error:", err);
    return redir(req, "/creator/accounts", { instagram_error: "db_error" });
  }

  return redir(req, "/creator/accounts", {
    instagram_connected: igUsername ?? "1",
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
