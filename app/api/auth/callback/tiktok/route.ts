import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveTikTokToken } from "@/lib/tiktok-token";
import { syncTikTokOfficialData } from "@/lib/tiktok-sync";

// ── TikTok Login Kit v2 endpoints ─────────────────────────────────────────────
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface TikTokUserInfoBasic {
  open_id?: string;
}

interface TikTokUserInfoBasicResponse {
  data?: { user?: TikTokUserInfoBasic };
  error?: { code?: string };
}

/**
 * GET /api/auth/callback/tiktok
 *
 * TikTok Login Kit v2 OAuth callback.
 * Requested scopes: user.info.basic, user.info.profile, user.info.stats, video.list
 *
 * Security:
 *  - State is validated against the HttpOnly __tiktok_state cookie set by
 *    /api/auth/tiktok/start. State cookie is cleared on all terminal paths.
 *  - Provider error_description is never forwarded to the user.
 *  - Tokens, auth codes, and client secret are never logged.
 *
 * OAuth-only responsibilities kept here:
 *  - state validation (CSRF)
 *  - authorization code exchange
 *  - initial open_id validation
 *  - saveTikTokToken
 *  - redirect / cookies / error flow
 *
 * Stats, videos, and CreatorProfile sync are delegated to syncTikTokOfficialData().
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  // ── OAuth-level error ──────────────────────────────────────────────────────
  const oauthError = searchParams.get("error");
  if (oauthError) {
    // Log the provider error code only — never log error_description
    console.warn("[tiktok/callback] provider error:", oauthError);
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "access_denied" }),
      req,
    );
  }

  // ── State validation (CSRF) ────────────────────────────────────────────────
  // State cookie is set HttpOnly by /api/auth/tiktok/start.
  const stateParam = searchParams.get("state");
  const stateCookie = req.cookies.get("__tiktok_state")?.value ?? null;

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "invalid_state" }),
      req,
    );
  }

  // ── Authorization code ─────────────────────────────────────────────────────
  const code = searchParams.get("code");
  if (!code) {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "missing_code" }),
      req,
    );
  }

  // ── Session ────────────────────────────────────────────────────────────────
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return withClearedStateCookie(
        redir(req, "/auth", { tiktok_error: "unauthenticated" }),
        req,
      );
    }
    userId = session.user.id;
  } catch {
    return withClearedStateCookie(
      redir(req, "/auth", { tiktok_error: "session_error" }),
      req,
    );
  }

  // ── Env vars ───────────────────────────────────────────────────────────────
  const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "server_misconfiguration" }),
      req,
    );
  }

  // ── Token exchange ─────────────────────────────────────────────────────────
  let accessToken: string;
  let newRefreshToken: string | null = null;
  let openId: string | null = null;
  let expiresIn: number | null = null;
  let grantedScopes: string | null = null;

  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: canonicalCallbackUri(req),
    });

    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const json = (await res.json()) as TikTokTokenResponse;

    if (!res.ok || json.error || typeof json.access_token !== "string") {
      // Log only the error code — never log error_description or tokens
      console.warn("[tiktok/callback] token exchange failed, code:", json.error ?? res.status);
      return withClearedStateCookie(
        redir(req, "/creator/accounts", { tiktok_error: "token_exchange_failed" }),
        req,
      );
    }

    accessToken = json.access_token;
    newRefreshToken = json.refresh_token ?? null;
    openId = json.open_id ?? null;
    expiresIn = json.expires_in ?? null;
    // Ground truth for granted scopes: token response `scope` field.
    grantedScopes = json.scope ?? null;
  } catch {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "network_error" }),
      req,
    );
  }

  // ── Obtain initial open_id (OAuth callback responsibility) ─────────────────
  // open_id from token response is preferred. Fall back to a minimal user.info
  // request when the token response omits it (rare but possible).
  if (!openId) {
    try {
      const url = new URL(TIKTOK_USER_INFO_URL);
      url.searchParams.set("fields", "open_id");
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = (await res.json()) as TikTokUserInfoBasicResponse;
        const uid = json.data?.user?.open_id;
        if (uid) openId = uid;
      }
    } catch {
      // Ignore — if open_id is still null below, we return an error.
    }
  }

  // A real open_id is required for first connection — without it we cannot
  // safely identify the TikTok account.
  if (!openId) {
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "no_tiktok_account" }),
      req,
    );
  }

  // ── Persist token ──────────────────────────────────────────────────────────
  // saveTikTokToken centralises all preserve rules with row-level locking.
  // username is omitted here — the shared sync helper will set it from user.info.
  try {
    await saveTikTokToken(userId, {
      accessToken,
      refreshToken: newRefreshToken,  // null → preserve existing
      expiresIn: expiresIn,           // null → expiresAt stored as null
      scope: grantedScopes,           // null → preserve existing scopes
      openId,
    });
  } catch {
    console.error("[tiktok/callback] token persistence error (details omitted for security)");
    return withClearedStateCookie(
      redir(req, "/creator/accounts", { tiktok_error: "db_error" }),
      req,
    );
  }

  // ── Sync profile data using shared helper ──────────────────────────────────
  // This replaces the inline user-info / video.list / PlatformStats / SocialPost
  // / CreatorProfile blocks from the previous implementation.
  //
  // Failure policy:
  //   temporary_failure / configuration_error → keep connection; user can Refresh later.
  //   identity_mismatch → keep connection; no data overwrite.
  //   reauth_required → unexpected after a just-saved fresh token, but keep connection.
  try {
    const syncResult = await syncTikTokOfficialData(userId);
    if (!syncResult.ok) {
      // Log a fixed safe message — never log provider details or token values.
      console.warn("[tiktok/callback] post-connect sync returned:", syncResult.reason);
    }
  } catch {
    console.warn("[tiktok/callback] post-connect sync threw unexpectedly after token save");
  }

  // ── Revalidate affected pages ──────────────────────────────────────────────
  revalidatePath("/creator/accounts");
  revalidatePath("/creator/presence");

  // ── Success redirect ───────────────────────────────────────────────────────
  // Read the username written by syncTikTokOfficialData (if sync succeeded).
  // Fall back to "1" so the UI shows the generic "TikTok connected" message.
  let connectedValue = "1";
  try {
    const savedToken = await db.platformToken.findUnique({
      where: { userId_platform: { userId, platform: "tiktok" } },
      select: { username: true },
    });
    if (savedToken?.username) {
      connectedValue = savedToken.username;
    }
  } catch {
    // Non-fatal — "1" fallback is fine.
  }

  return withClearedStateCookie(
    redir(req, "/creator/presence", { tiktok_connected: connectedValue }),
    req,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Canonical callback URI derived from NEXT_PUBLIC_APP_URL, never from request host. */
function canonicalCallbackUri(req: NextRequest): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base.replace(/\/$/, "")}/api/auth/callback/tiktok`;
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

/** Attaches a clearing Set-Cookie for __tiktok_state to the given response. */
function withClearedStateCookie(
  response: NextResponse,
  _req: NextRequest,
): NextResponse {
  response.cookies.set("__tiktok_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
