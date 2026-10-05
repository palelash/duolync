import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";

/**
 * GET /api/auth/tiktok/start
 *
 * Server-side entry point for TikTok Login Kit v2 OAuth.
 *
 * Security properties:
 *  - Session is verified before any OAuth flow begins.
 *  - CSRF state is generated server-side using Node.js crypto.
 *  - State is stored in an HttpOnly cookie — inaccessible to client JavaScript.
 *  - Redirect URI is derived exclusively from NEXT_PUBLIC_APP_URL (canonical
 *    configured URL), never from an arbitrary Host header.
 *  - Fails closed (server_misconfiguration) if any required env var is absent.
 *
 * Both TikTok Connect and Reconnect UI entry points navigate to this ONE route.
 * No client-side state generation or OAuth URL construction is performed.
 *
 * NOTE: Sandbox and production TikTok credentials are distinct and must be
 * configured manually per environment via NEXT_PUBLIC_TIKTOK_CLIENT_KEY and
 * TIKTOK_CLIENT_SECRET. Do not share sandbox credentials with production.
 */

/** The four scopes this Duolync app requests from TikTok. */
const TIKTOK_SCOPES =
  "user.info.basic,user.info.profile,user.info.stats,video.list";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  // ── Canonical app URL ─────────────────────────────────────────────────────
  // Must be set in all environments. Used to construct the OAuth redirect URI
  // and all internal redirects. Never fall back to a request-derived host.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return new NextResponse(
      "Server misconfiguration: NEXT_PUBLIC_APP_URL is not set.",
      { status: 500 },
    );
  }

  // ── Session check ─────────────────────────────────────────────────────────
  // Require an active Duolync session before initiating the OAuth flow.
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/auth", appUrl));
    }
  } catch {
    return NextResponse.redirect(new URL("/auth", appUrl));
  }

  // ── Client key check ──────────────────────────────────────────────────────
  const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    const dest = new URL("/creator/accounts", appUrl);
    dest.searchParams.set("tiktok_error", "server_misconfiguration");
    return NextResponse.redirect(dest);
  }

  // ── Canonical redirect URI ────────────────────────────────────────────────
  // This value MUST be identical to what is used in the token exchange.
  // It must also be registered in the TikTok Developer Portal.
  const callbackUri = `${appUrl.replace(/\/$/, "")}/api/auth/callback/tiktok`;

  // ── CSRF state ────────────────────────────────────────────────────────────
  const state = randomUUID();

  // ── TikTok authorization URL ──────────────────────────────────────────────
  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authUrl.searchParams.set("client_key", clientKey);
  authUrl.searchParams.set("redirect_uri", callbackUri);
  authUrl.searchParams.set("scope", TIKTOK_SCOPES);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  // ── Redirect to TikTok with HttpOnly state cookie ─────────────────────────
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("__tiktok_state", state, {
    httpOnly: true,                                       // not readable by client JS
    sameSite: "lax",                                      // CSRF protection on redirect
    secure: process.env.NODE_ENV === "production",        // HTTPS only in production
    path: "/",
    maxAge: 300,                                          // 5-minute expiry
  });
  return response;
}
