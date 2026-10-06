import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma";
import { computeFollowerCache } from "@/lib/creator-metrics";
import {
  INSTAGRAM_TOKEN_ENDPOINT,
  INSTAGRAM_LONG_LIVED_ENDPOINT,
  INSTAGRAM_GRAPH,
} from "@/lib/instagram-auth";
import {
  fetchAccountInsights,
  fetchMediaInsights,
  mergeInstagramRaw,
  type AccountInsightsSnapshot,
  type MediaInsightsMetrics,
} from "@/lib/instagram-insights";

// ─── Response shape types ─────────────────────────────────────────────────────

interface IgShortLivedTokenResponse {
  access_token?: string;
  token_type?: string;
  user_id?: number;
  // Present in some API versions — parse defensively
  permissions?: unknown;
}

interface IgLongLivedTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  // Present in some API versions — parse defensively
  permissions?: unknown;
}

interface IgProfile {
  id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  biography?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  /**
   * account_type values documented by Meta: BUSINESS, MEDIA_CREATOR, PERSONAL.
   * Only PERSONAL is treated as ineligible. Missing or unknown values are not rejected.
   * VERIFY WITH META DOCS for exact enum under instagram_business_basic.
   */
  account_type?: string;
  error?: { message?: string; code?: number; type?: string };
}

interface IgMediaItem {
  id?: string;
  caption?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
}

interface IgMediaResponse {
  data?: IgMediaItem[];
  error?: { message?: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * All known valid Instagram Business Login scope strings.
 * Used to validate any permissions array returned by the provider before storage.
 */
const KNOWN_IG_SCOPES = new Set([
  "instagram_business_basic",
  "instagram_business_manage_insights",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
  "instagram_business_content_publish",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clears the __instagram_state HttpOnly cookie on the given response.
 * Must be called on every terminal callback path — success and all error branches.
 */
function clearStateCookie(res: NextResponse): void {
  res.cookies.set("__instagram_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    maxAge: 0,
  });
}

/**
 * Redirects to /creator/accounts with an internal error code and clears the state cookie.
 * Never forwards raw provider error strings to the client.
 */
function errorRedir(appUrl: string, code: string): NextResponse {
  const dest = new URL("/creator/accounts", appUrl);
  dest.searchParams.set("instagram_error", code);
  const res = NextResponse.redirect(dest);
  clearStateCookie(res);
  return res;
}

/**
 * Redirects to /auth (login page) and clears the state cookie.
 * Used when no Duolync session exists.
 */
function authRedir(appUrl: string, code: "unauthenticated" | "session_error"): NextResponse {
  const dest = new URL("/auth", appUrl);
  dest.searchParams.set("instagram_error", code);
  const res = NextResponse.redirect(dest);
  clearStateCookie(res);
  return res;
}

/**
 * Parses a raw permissions value from a token response.
 *
 * Returns a sorted, comma-joined string of confirmed known Instagram scopes,
 * or null if the value is absent, not an array, or contains no known scope strings.
 *
 * This is the only source from which we may confirm that
 * instagram_business_manage_insights was actually granted.
 */
function parseGrantedScopes(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const valid = (raw as unknown[])
    .filter((s): s is string => typeof s === "string" && KNOWN_IG_SCOPES.has(s))
    .sort();
  return valid.length > 0 ? valid.join(",") : null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/auth/callback/instagram
 *
 * Direct Instagram Business Login callback.
 *
 * Scopes requested: instagram_business_basic (required),
 *                   instagram_business_manage_insights (optional — connection
 *                   succeeds whether or not the creator grants this)
 *
 * Writes:
 *   PlatformToken("instagram")  — long-lived access token, ~60-day expiry
 *   PlatformStats("instagram")  — profile stats, DataSource.OFFICIAL_API
 *   SocialPost[]                — up to 10 recent media items, DataSource.OFFICIAL_API
 *
 * Redirects to /creator/accounts?instagram_connected=<username>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  // ── Canonical app URL ─────────────────────────────────────────────────────
  // All redirects and the OAuth redirect_uri use NEXT_PUBLIC_APP_URL exclusively.
  // Never derive the production redirect URI from an arbitrary request Host header.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return new NextResponse(
      "Server misconfiguration: NEXT_PUBLIC_APP_URL is not set.",
      { status: 500 },
    );
  }

  // The redirect_uri sent here MUST be byte-for-byte identical to the one sent
  // in the authorization request built by /api/auth/instagram/start.
  const callbackUri = `${appUrl.replace(/\/$/, "")}/api/auth/callback/instagram`;

  // ── Provider-level OAuth error ────────────────────────────────────────────
  // Map to a stable internal code. Never forward raw error_description strings.
  const oauthError = searchParams.get("error");
  if (oauthError) {
    console.warn("[instagram/callback] provider OAuth error code:", oauthError);
    return errorRedir(appUrl, "oauth_error");
  }

  // ── CSRF state validation ─────────────────────────────────────────────────
  // The __instagram_state cookie is HttpOnly — only readable server-side.
  // This check must happen before the code is used for anything.
  const stateParam = searchParams.get("state");
  const cookieHeader = req.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("__instagram_state="))
    ?.split("=")[1]
    ?.trim();

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    console.warn("[instagram/callback] CSRF state mismatch or missing cookie");
    return errorRedir(appUrl, "invalid_state");
  }

  // ── Authorization code ────────────────────────────────────────────────────
  const code = searchParams.get("code");
  if (!code) {
    return errorRedir(appUrl, "missing_code");
  }

  // ── Session ───────────────────────────────────────────────────────────────
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return authRedir(appUrl, "unauthenticated");
    }
    userId = session.user.id;
  } catch {
    return authRedir(appUrl, "session_error");
  }

  // ── Credentials ───────────────────────────────────────────────────────────
  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return errorRedir(appUrl, "server_misconfiguration");
  }

  // ── Step 1: Short-lived token exchange ────────────────────────────────────
  // Never log the authorization code or any access token.
  let shortLivedToken: string;
  let shortLivedPermissions: unknown;

  try {
    const body = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: callbackUri,
      code,
    });

    const res = await fetch(INSTAGRAM_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    // Parse the body before checking status so error details are available
    const json = (await res.json()) as IgShortLivedTokenResponse;

    if (!res.ok || typeof json.access_token !== "string") {
      console.error(
        "[instagram/callback] short-lived token exchange failed. HTTP status:",
        res.status,
      );
      return errorRedir(appUrl, "token_exchange_failed");
    }

    shortLivedToken = json.access_token;
    shortLivedPermissions = json.permissions;
  } catch {
    console.error("[instagram/callback] network error during short-lived token exchange");
    return errorRedir(appUrl, "network_error");
  }

  // ── Step 2: Long-lived token exchange ─────────────────────────────────────
  // Exchanges the ~1-hour short-lived token for a ~60-day long-lived token.
  // This MUST happen in Task 1 — storing a short-lived token produces a
  // token that is already near-expiry by the time it is persisted.
  // Proactive renewal (graph.instagram.com/refresh_access_token) is deferred
  // to the token lifecycle task.
  let accessToken: string;
  let expiresAt: Date | null = null;
  let longLivedPermissions: unknown;

  try {
    const exchangeUrl = new URL(INSTAGRAM_LONG_LIVED_ENDPOINT);
    exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
    exchangeUrl.searchParams.set("client_secret", appSecret);
    exchangeUrl.searchParams.set("access_token", shortLivedToken);

    const res = await fetch(exchangeUrl.toString());
    const json = (await res.json()) as IgLongLivedTokenResponse;

    if (!res.ok || typeof json.access_token !== "string") {
      console.error(
        "[instagram/callback] long-lived token exchange failed. HTTP status:",
        res.status,
      );
      return errorRedir(appUrl, "token_exchange_failed");
    }

    accessToken = json.access_token;
    longLivedPermissions = json.permissions;
    if (typeof json.expires_in === "number") {
      expiresAt = new Date(Date.now() + json.expires_in * 1_000);
    }
  } catch {
    console.error("[instagram/callback] network error during long-lived token exchange");
    return errorRedir(appUrl, "network_error");
  }

  // ── Granted scopes — truthful storage ─────────────────────────────────────
  // Prefer actual granted-scope data from the token responses when present.
  // If neither response includes a permissions field, store only the minimum
  // confirmed grant: instagram_business_basic (proven by successful token exchange).
  // Never assume instagram_business_manage_insights was granted just because
  // it was requested.
  const grantedScopes: string =
    parseGrantedScopes(longLivedPermissions) ??
    parseGrantedScopes(shortLivedPermissions) ??
    "instagram_business_basic";

  // ── Step 3: Profile fetch ─────────────────────────────────────────────────
  // All fields requested. Missing fields are stored as null — they are never
  // used as heuristics for account type or eligibility.
  let igAccountId: string;
  let igUsername: string | null = null;
  let igName: string | null = null;
  let igProfilePic: string | null = null;
  let igBiography: string | null = null;
  let igFollowers: number | null = null;
  let igFollows: number | null = null;
  let igMediaCount: number | null = null;
  let igAccountType: string | null = null;

  try {
    const profileUrl = new URL(`${INSTAGRAM_GRAPH}/me`);
    profileUrl.searchParams.set(
      "fields",
      "id,username,name,profile_picture_url,biography,followers_count,follows_count,media_count,account_type",
    );
    profileUrl.searchParams.set("access_token", accessToken);

    const res = await fetch(profileUrl.toString());
    const profile = (await res.json()) as IgProfile;

    if (!res.ok || profile.error || !profile.id) {
      console.error("[instagram/callback] profile fetch failed or returned no id");
      return errorRedir(appUrl, "no_instagram_account");
    }

    igAccountId = profile.id;
    igUsername = profile.username ?? null;
    igName = profile.name ?? null;
    igProfilePic = profile.profile_picture_url ?? null;
    igBiography = profile.biography ?? null;
    igFollowers = profile.followers_count ?? null;
    igFollows = profile.follows_count ?? null;
    igMediaCount = profile.media_count ?? null;
    igAccountType = profile.account_type ?? null;
  } catch {
    console.error("[instagram/callback] network error during profile fetch");
    return errorRedir(appUrl, "network_error");
  }

  // ── Professional account check ────────────────────────────────────────────
  // Reject only when account_type is explicitly documented as ineligible.
  // Missing account_type field: do not reject — missing data ≠ ineligible.
  // A null followers_count is never treated as a rejection criterion.
  if (igAccountType === "PERSONAL") {
    return errorRedir(appUrl, "not_professional_account");
  }

  // ── Step 4: Recent media (up to 10 items) ─────────────────────────────────
  // Non-fatal: a connection without posts is preferable to a failed connection.
  // views are stored as null — standard feed media does not expose view counts
  // via this endpoint. VIDEO media may expose video_view_count in a future task.
  type IgPost = {
    providerPostId: string;
    postUrl: string | null;
    imageUrl: string | null;
    caption: string | null;
    likes: number | null;
    comments: number | null;
    views: null;
    engagementRate: null;
    postedAt: Date | null;
  };

  let posts: IgPost[] = [];

  try {
    const mediaUrl = new URL(`${INSTAGRAM_GRAPH}/me/media`);
    mediaUrl.searchParams.set(
      "fields",
      "id,caption,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp",
    );
    mediaUrl.searchParams.set("limit", "10");
    mediaUrl.searchParams.set("access_token", accessToken);

    const res = await fetch(mediaUrl.toString());
    if (res.ok) {
      const { data = [] } = (await res.json()) as IgMediaResponse;
      posts = data
        .filter((item): item is IgMediaItem & { id: string } => typeof item.id === "string")
        .map((item) => ({
          providerPostId: item.id,
          postUrl: item.permalink ?? null,
          imageUrl: item.media_url ?? item.thumbnail_url ?? null,
          caption: item.caption ?? null,
          likes: item.like_count ?? null,
          comments: item.comments_count ?? null,
          views: null,
          engagementRate: null,
          postedAt: item.timestamp ? new Date(item.timestamp) : null,
        }));
    } else {
      console.warn("[instagram/callback] media fetch returned non-OK status:", res.status);
    }
  } catch {
    console.warn("[instagram/callback] network error during media fetch — continuing without posts");
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  try {
    // 1. PlatformToken — long-lived token, truthful scopes
    await db.platformToken.upsert({
      where: { userId_platform: { userId, platform: "instagram" } },
      create: {
        userId,
        platform: "instagram",
        accessToken,
        refreshToken: null, // Instagram Login does not issue a refresh token
        expiresAt,          // ~60 days from now; proactive renewal deferred
        scopes: grantedScopes,
        platformUserId: igAccountId,
        username: igUsername,
      },
      update: {
        accessToken,
        refreshToken: null,
        expiresAt,
        scopes: grantedScopes,
        platformUserId: igAccountId,
        username: igUsername,
        updatedAt: new Date(),
      },
    });

    // 2. PlatformStats — real Instagram identity and metrics, DataSource.OFFICIAL_API
    //
    // RAW JSON MERGE STRATEGY:
    //   Fetch existing raw before the upsert so a reconnect does NOT erase
    //   raw.insights (written by the Insights sync below).
    //   Identity fields are overlaid onto the existing raw object.
    //   mergeInstagramRaw guarantees safety in both create and update paths.
    const existingStatsRaw = await db.platformStats.findUnique({
      where: { userId_platform: { userId, platform: "instagram" } },
      select: { raw: true },
    });
    const existingRaw: Prisma.InputJsonObject =
      typeof existingStatsRaw?.raw === "object" && existingStatsRaw.raw !== null
        ? (existingStatsRaw.raw as Prisma.InputJsonObject)
        : {};

    const identityFields = {
      instagram_id: igAccountId,
      username: igUsername,
      name: igName,
      profile_picture_url: igProfilePic,
      biography: igBiography,
      account_type: igAccountType,
    };
    // Overlay identity fields on top of existing raw (preserves raw.insights).
    const mergedRaw = mergeInstagramRaw(existingRaw, identityFields);

    await db.platformStats.upsert({
      where: { userId_platform: { userId, platform: "instagram" } },
      create: {
        userId,
        platform: "instagram",
        followerCount: igFollowers,    // null when not returned — never fake 0
        followingCount: igFollows,     // null when not returned
        postCount: igMediaCount,       // null when not returned
        fetchedAt: new Date(),
        raw: mergedRaw,
        dataSource: "OFFICIAL_API",
        providerAccountId: igAccountId,
      },
      update: {
        followerCount: igFollowers,
        followingCount: igFollows,
        postCount: igMediaCount,
        fetchedAt: new Date(),
        raw: mergedRaw,
        dataSource: "OFFICIAL_API",
        providerAccountId: igAccountId,
      },
    });

    // 3. SocialPosts and CreatorProfile update
    const creator = await db.creatorProfile.findUnique({
      where: { userId },
      select: { id: true, connectedPlatforms: true },
    });

    if (creator) {
      if (posts.length > 0) {
        // OFFICIAL_API is authoritative — replace all lower-source posts for instagram.
        // This preserves DataSource authority ordering from platform-stats-policy.ts.
        await db.socialPost.deleteMany({
          where: {
            creatorProfileId: creator.id,
            platform: "instagram",
            dataSource: { in: ["OFFICIAL_API", "APIFY", "LEGACY_UNKNOWN"] },
          },
        });

        await db.socialPost.createMany({
          data: posts.map((p) => ({
            creatorProfileId: creator.id,
            platform: "instagram",
            providerPostId: p.providerPostId, // stable Instagram media ID — fixed from null
            postUrl: p.postUrl,
            imageUrl: p.imageUrl,
            caption: p.caption,
            likes: p.likes,
            comments: p.comments,
            views: p.views,
            engagementRate: p.engagementRate, // null — computed at read time from SocialPost rows
            postedAt: p.postedAt,
            dataSource: "OFFICIAL_API" as const,
          })),
        });
      }

      // Re-aggregate canonical follower cache after PlatformStats write.
      // Uses computeFollowerCache to correctly handle null follower counts
      // (e.g. when a platform like Threads is also connected).
      const allStats = await db.platformStats.findMany({
        where: { userId },
        select: { followerCount: true },
      });
      const cachedFollowers = computeFollowerCache(allStats);

      await db.creatorProfile.update({
        where: { userId },
        data: {
          connectedPlatforms: Array.from(
            new Set([...creator.connectedPlatforms, "instagram"]),
          ),
          lastSyncedAt: new Date(),
          // Only update cache when computeFollowerCache returns a computable value.
          // Avoids overwriting a valid import aggregate with null.
          ...(cachedFollowers !== null ? { followerCount: cachedFollowers } : {}),
        },
      });
    }

    revalidatePath("/creator/accounts");
    revalidatePath("/creator/presence");
    revalidatePath("/creator/dashboard");
  } catch (err) {
    console.error("[instagram/callback] db error:", err);
    return errorRedir(appUrl, "db_error");
  }

  // ── Insights V1 sync (NON-FATAL) ─────────────────────────────────────────
  //
  // Runs after the core connection write succeeds.
  // Any failure here MUST NOT affect:
  //   • PlatformToken validity or the stored access token
  //   • PlatformStats identity data already written above
  //   • SocialPost rows
  //   • The success redirect
  //
  // Skip only when we have CONFIRMED scope data that clearly lacks insights.
  // If scopes are uncertain (token response returned no permissions field and
  // we fell back to the "instagram_business_basic" minimum), we still try —
  // the API will return a permission error which we handle gracefully.
  const scopesList = grantedScopes.split(",").map((s) => s.trim());
  const insightsScopeClearlyMissing =
    (longLivedPermissions !== null || shortLivedPermissions !== null) &&
    !scopesList.includes("instagram_business_manage_insights");

  if (!insightsScopeClearlyMissing) {
    try {
      await syncInstagramInsights(userId, igAccountId, accessToken, posts);
    } catch (insightsErr) {
      // Sanitized diagnostic only — no token, no raw provider error string.
      console.warn(
        "[instagram/callback] insights sync threw unexpectedly — connection remains valid:",
        insightsErr instanceof Error ? insightsErr.message : "unknown error",
      );
    }
  } else {
    console.info(
      "[instagram/callback] skipping insights sync: instagram_business_manage_insights not in confirmed scopes",
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  const successDest = new URL("/creator/presence", appUrl);
  successDest.searchParams.set("instagram_connected", igUsername ?? "1");
  const successRes = NextResponse.redirect(successDest);
  clearStateCookie(successRes);
  return successRes;
}

// ─── Insights V1 sync ────────────────────────────────────────────────────────

/**
 * Fetches and persists Instagram Insights V1 data.
 *
 * NON-FATAL: caller wraps this in try/catch.
 *
 * Writes:
 *   PlatformStats.raw.insights.account  — 28-day account snapshot (merged)
 *   PlatformStats.raw.insights.media    — per-post lifetime metrics (merged)
 *   SocialPost.views                    — updated from confirmed lifetime views
 *
 * Does NOT overwrite:
 *   SocialPost.likes / comments / postUrl / imageUrl / caption /
 *   postedAt / providerPostId / dataSource / engagementRate
 *
 * Does NOT replace raw identity metadata (mergeInstagramRaw guarantees this).
 */
async function syncInstagramInsights(
  userId: string,
  igAccountId: string,
  accessToken: string,
  posts: Array<{ providerPostId: string }>,
): Promise<void> {
  // ── Resolve creatorProfileId — scopes all SocialPost writes to this user ──
  // Instagram providerPostId values are globally unique, but we explicitly
  // scope every SocialPost.updateMany to this creator's profile to guarantee
  // that no other creator's row can ever be touched.
  const creatorProfile = await db.creatorProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  const creatorProfileId = creatorProfile?.id ?? null;

  // ── Account insights (28-day) ─────────────────────────────────────────────
  const accountResult = await fetchAccountInsights(igAccountId, accessToken);

  // ── Media insights (lifetime, per post) ──────────────────────────────────
  // Only process posts that have a stable providerPostId.
  const mediaInsightsMap: Record<string, MediaInsightsMetrics> = {};

  for (const post of posts) {
    if (!post.providerPostId) continue;

    const mediaResult = await fetchMediaInsights(post.providerPostId, accessToken);

    if (!mediaResult.available) {
      // Individual media failure is isolated — continue to next post.
      continue;
    }

    if (mediaResult.metrics) {
      mediaInsightsMap[post.providerPostId] = mediaResult.metrics;
    }
  }

  // ── Merge into PlatformStats.raw ─────────────────────────────────────────
  // Read current raw to preserve identity fields and any pre-existing insights.
  // This is a second read (the first was in the main persist block) to get the
  // freshest state in case a race condition overwrote something — acceptable
  // since insights sync is intentionally asynchronous from the core write.
  const currentStats = await db.platformStats.findUnique({
    where: { userId_platform: { userId, platform: "instagram" } },
    select: { raw: true },
  });

  if (currentStats) {
    const currentRaw: Prisma.InputJsonObject =
      typeof currentStats.raw === "object" && currentStats.raw !== null
        ? (currentStats.raw as Prisma.InputJsonObject)
        : {};

    // Reconstruct identity fields from existing raw so mergeInstagramRaw
    // does not lose them during an insights-only write.
    const identityFromRaw = {
      instagram_id:
        typeof currentRaw["instagram_id"] === "string"
          ? currentRaw["instagram_id"]
          : igAccountId,
      username:
        typeof currentRaw["username"] === "string"
          ? currentRaw["username"]
          : null,
      name:
        typeof currentRaw["name"] === "string" ? currentRaw["name"] : null,
      profile_picture_url:
        typeof currentRaw["profile_picture_url"] === "string"
          ? currentRaw["profile_picture_url"]
          : null,
      biography:
        typeof currentRaw["biography"] === "string"
          ? currentRaw["biography"]
          : null,
      account_type:
        typeof currentRaw["account_type"] === "string"
          ? currentRaw["account_type"]
          : null,
    };

    const newMediaInsights =
      Object.keys(mediaInsightsMap).length > 0 ? mediaInsightsMap : null;

    const mergedRaw = mergeInstagramRaw(
      currentRaw,
      identityFromRaw,
      // Pass the snapshot only when we have real data.
      // Pass undefined (not null) in all other cases so the helper preserves
      // any previously-stored snapshot instead of overwriting it with null.
      // Covers: available=false, and available=true but empty data (snapshot=null).
      accountResult.available && accountResult.snapshot !== null
        ? accountResult.snapshot
        : undefined,
      newMediaInsights,
    );

    await db.platformStats.update({
      where: { userId_platform: { userId, platform: "instagram" } },
      data: { raw: mergedRaw },
    });

    if (accountResult.permissionState === "granted") {
      console.info(
        "[instagram/callback] insights sync complete. account reach:",
        accountResult.snapshot?.reach ?? "no data",
        "views:",
        accountResult.snapshot?.views ?? "no data",
      );
    } else if (accountResult.permissionState === "missing") {
      console.info(
        "[instagram/callback] insights sync: account insights permission not granted",
      );
    }
  }

  // ── Update SocialPost.views from media lifetime views ─────────────────────
  // Only updates the `views` column.
  // Does NOT touch: likes, comments, postUrl, imageUrl, providerPostId,
  // caption, postedAt, dataSource, engagementRate.
  // Explicit 0 is written as 0. null metrics are skipped.
  //
  // SCOPING GUARANTEE: every updateMany is scoped to:
  //   • creatorProfileId — this creator's rows only (never touches another user)
  //   • providerPostId   — the exact media object
  //   • platform         — instagram only
  //   • dataSource       — OFFICIAL_API only
  // If creatorProfileId is unavailable (profile deleted mid-sync), skip writes.
  if (!creatorProfileId) {
    console.warn("[instagram/callback] insights sync: creatorProfile not found, skipping SocialPost.views update");
    return;
  }

  for (const [providerPostId, metrics] of Object.entries(mediaInsightsMap)) {
    if (metrics.views == null) continue; // skip null; write 0 if provider returned 0

    await db.socialPost.updateMany({
      where: {
        creatorProfileId,   // ← scoped to this creator — prevents cross-user writes
        providerPostId,
        platform: "instagram",
        dataSource: "OFFICIAL_API",
      },
      data: { views: metrics.views },
    });
  }
}
