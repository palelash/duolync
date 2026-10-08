import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  INSTAGRAM_TOKEN_ENDPOINT,
  INSTAGRAM_LONG_LIVED_ENDPOINT,
  INSTAGRAM_GRAPH,
  classifyInstagramGraphFailure,
  instagramTokenPermissionsRaw,
  instagramTokenUserMatchesProfile,
  parseInstagramJson,
  parseInstagramTokenResponse,
  readInstagramGraphErrorCode,
  resolveInstagramGrantedScopes,
} from "@/lib/instagram-auth";
import {
  handleInstagramGraphFailure,
  saveInstagramAccessToken,
} from "@/lib/instagram-token";
import { syncInstagramOfficialData } from "@/lib/instagram-sync";

// ─── Response shape types ─────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === "production";

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
 * Reads a token endpoint body without logging it.
 * Returns null when the body is not JSON. Callers must fail before any DB write
 * when the parsed payload has no access_token.
 */
async function readTokenBody(res: Response): Promise<unknown | null> {
  const text = await res.text();
  try {
    return parseInstagramJson(text);
  } catch {
    return null;
  }
}

/** True only for a confirmed Graph OAuth error 190. Permission and transport failures are not auth-invalid. */
function isConfirmedInstagramAuthInvalid(body: unknown): boolean {
  return (
    classifyInstagramGraphFailure({
      errorCode: readInstagramGraphErrorCode(body),
    }) === "auth_invalid"
  );
}

/**
 * Confirmed error 190. Passes the rejected token so a newer stored token is kept.
 * Does not report the callback as connected.
 */
async function finishInstagramReauth(
  userId: string,
  rejectedAccessToken: string,
  appUrl: string,
): Promise<NextResponse> {
  const outcome = await handleInstagramGraphFailure(userId, {
    errorCode: 190,
    failedAccessToken: rejectedAccessToken,
  });
  if (!outcome.ok && outcome.reason === "temporary_failure") {
    console.warn(
      "[instagram/callback] dead-auth cleanup did not complete:",
      outcome.detail ?? "temporary_failure",
    );
  }
  return errorRedir(appUrl, "reauth_required");
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
 * Writes (only after the token user id matches /me.id, when a user id was returned):
 *   PlatformToken("instagram")  — long-lived access token; refreshToken stays null
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
  // Never log the authorization code, the response body, or any access token.
  // Documented body is { data: [{ access_token, user_id, permissions }] }.
  // A flat body is still accepted. Missing access_token fails before any write.
  let shortLivedToken: string;
  let shortLivedUserId: string | null = null;
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
      cache: "no-store",
    });

    const json = await readTokenBody(res);
    const parsed = json === null ? null : parseInstagramTokenResponse(json);

    if (!res.ok || !parsed?.accessToken) {
      console.error(
        "[instagram/callback] short-lived token exchange failed. HTTP status:",
        res.status,
      );
      return errorRedir(appUrl, "token_exchange_failed");
    }

    shortLivedToken = parsed.accessToken;
    shortLivedUserId = parsed.userId;
    shortLivedPermissions = instagramTokenPermissionsRaw(json);
  } catch {
    console.error("[instagram/callback] network error during short-lived token exchange");
    return errorRedir(appUrl, "network_error");
  }

  // ── Step 2: Long-lived token exchange ─────────────────────────────────────
  // Exchanges the ~1-hour short-lived token for a ~60-day long-lived token.
  // Instagram Login does not return a refresh token. Renewal is handled later
  // by getInstagramAccessToken — this callback only stores the new long-lived token.
  let accessToken: string;
  let longLivedUserId: string | null = null;
  let expiresAt: Date | null = null;
  let longLivedPermissions: unknown;

  try {
    const exchangeUrl = new URL(INSTAGRAM_LONG_LIVED_ENDPOINT);
    exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
    exchangeUrl.searchParams.set("client_secret", appSecret);
    exchangeUrl.searchParams.set("access_token", shortLivedToken);

    const res = await fetch(exchangeUrl.toString(), { cache: "no-store" });
    const json = await readTokenBody(res);
    const parsed = json === null ? null : parseInstagramTokenResponse(json);

    if (!res.ok || !parsed?.accessToken) {
      console.error(
        "[instagram/callback] long-lived token exchange failed. HTTP status:",
        res.status,
      );
      return errorRedir(appUrl, "token_exchange_failed");
    }

    accessToken = parsed.accessToken;
    longLivedUserId = parsed.userId;
    longLivedPermissions = instagramTokenPermissionsRaw(json);
    if (parsed.expiresIn !== null) {
      expiresAt = new Date(Date.now() + parsed.expiresIn * 1_000);
    }
  } catch {
    console.error("[instagram/callback] network error during long-lived token exchange");
    return errorRedir(appUrl, "network_error");
  }

  // ── Granted scopes — truthful storage ─────────────────────────────────────
  // Prefer permissions from the long-lived response, then the short-lived one.
  // A missing permissions field stores only instagram_business_basic.
  // Never add instagram_business_manage_insights unless the provider sent it.
  const grantedScopes = resolveInstagramGrantedScopes([
    longLivedPermissions,
    shortLivedPermissions,
  ]);

  // ── Step 3: Profile fetch ─────────────────────────────────────────────────
  // All fields requested. Missing fields are stored as null — they are never
  // used as heuristics for account type or eligibility.
  let igAccountId: string;
  let igUsername: string | null = null;
  let igAccountType: string | null = null;

  try {
    const profileUrl = new URL(`${INSTAGRAM_GRAPH}/me`);
    profileUrl.searchParams.set(
      "fields",
      "id,username,name,profile_picture_url,biography,followers_count,follows_count,media_count,account_type",
    );
    profileUrl.searchParams.set("access_token", accessToken);

    const res = await fetch(profileUrl.toString(), { cache: "no-store" });
    const profileText = await res.text();
    let profileJson: unknown;
    try {
      profileJson = parseInstagramJson(profileText);
    } catch {
      console.error("[instagram/callback] profile fetch returned unparseable JSON");
      return errorRedir(appUrl, "no_instagram_account");
    }
    if (typeof profileJson !== "object" || profileJson === null || Array.isArray(profileJson)) {
      console.error("[instagram/callback] profile fetch returned an unexpected JSON shape");
      return errorRedir(appUrl, "no_instagram_account");
    }
    const profile = profileJson as IgProfile;

    if (isConfirmedInstagramAuthInvalid(profileJson)) {
      console.warn("[instagram/callback] profile fetch: auth invalid (error 190)");
      return finishInstagramReauth(userId, accessToken, appUrl);
    }

    if (!res.ok || profile.error || typeof profile.id !== "string" || profile.id.length === 0) {
      console.error("[instagram/callback] profile fetch failed or returned no id");
      return errorRedir(appUrl, "no_instagram_account");
    }

    igAccountId = profile.id;
    igUsername = profile.username ?? null;
    igAccountType = profile.account_type ?? null;
  } catch {
    console.error("[instagram/callback] network error during profile fetch");
    return errorRedir(appUrl, "network_error");
  }

  // ── Connect identity check ────────────────────────────────────────────────
  // When the token response included user_id, it must equal /me.id.
  // A mismatch writes nothing. A missing user_id keeps /me.id.
  const tokenUserIds = [longLivedUserId, shortLivedUserId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const identityOk = tokenUserIds.every((id) =>
    instagramTokenUserMatchesProfile(id, igAccountId),
  );
  if (!identityOk) {
    console.warn("[instagram/callback] token user_id does not match /me id — no rows written");
    return errorRedir(appUrl, "identity_mismatch");
  }

  // ── Professional account check ────────────────────────────────────────────
  // Reject only when account_type is explicitly documented as ineligible.
  // Missing account_type field: do not reject — missing data ≠ ineligible.
  // A null followers_count is never treated as a rejection criterion.
  if (igAccountType === "PERSONAL") {
    return errorRedir(appUrl, "not_professional_account");
  }

  // Pass 1 token save remains independent of the provider-data transaction.
  try {
    await saveInstagramAccessToken(userId, {
      accessToken, expiresAt, scopes: grantedScopes,
      platformUserId: igAccountId, username: igUsername,
    });
  } catch {
    return errorRedir(appUrl, "db_error");
  }
  const sync = await syncInstagramOfficialData(userId);
  if (!sync.ok) return errorRedir(appUrl, sync.reason);
  for (const path of ["/creator/accounts", "/creator/presence", "/creator/dashboard", "/creator/analytics"]) revalidatePath(path);

  // ── Success ───────────────────────────────────────────────────────────────
  const successDest = new URL("/creator/presence", appUrl);
  successDest.searchParams.set("instagram_connected", igUsername ?? "1");
  const successRes = NextResponse.redirect(successDest);
  clearStateCookie(successRes);
  return successRes;
}
