import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { buildInstagramAuthUrl } from "@/lib/instagram-auth";

/**
 * GET /api/auth/instagram/start
 *
 * Server-side entry point for Instagram Business Login.
 *
 * Security properties:
 *  - Session is verified before any OAuth flow begins.
 *  - CSRF state is generated server-side using Node.js crypto.
 *  - State is stored in an HttpOnly cookie — inaccessible to client JavaScript.
 *  - Redirect URI is derived exclusively from NEXT_PUBLIC_APP_URL (canonical
 *    configured URL), never from an arbitrary Host header.
 *  - Fails closed (server_misconfiguration) if any required env var is absent.
 *
 * Both Instagram Connect and Reconnect UI entry points navigate here.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  // ── Canonical app URL ─────────────────────────────────────────────────────
  // Must be set in all environments. Used to construct the OAuth redirect URI
  // and all internal redirects. Never fall back to a request-derived host.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    // Cannot redirect safely without knowing the canonical app URL.
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

  // ── App ID check ──────────────────────────────────────────────────────────
  if (!process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID) {
    const dest = new URL("/creator/accounts", appUrl);
    dest.searchParams.set("instagram_error", "server_misconfiguration");
    return NextResponse.redirect(dest);
  }

  // ── Canonical redirect URI ────────────────────────────────────────────────
  // This value MUST be identical to what is used in the token exchange.
  // It must also be registered in the Meta App Dashboard.
  const callbackUri = `${appUrl.replace(/\/$/, "")}/api/auth/callback/instagram`;

  // ── CSRF state ────────────────────────────────────────────────────────────
  const state = randomUUID();

  // ── Authorization URL ─────────────────────────────────────────────────────
  const authUrl = buildInstagramAuthUrl(callbackUri, state);
  if (!authUrl) {
    // Defensive: buildInstagramAuthUrl returns null when App ID is missing.
    // Already checked above, but fail closed if somehow reached.
    const dest = new URL("/creator/accounts", appUrl);
    dest.searchParams.set("instagram_error", "server_misconfiguration");
    return NextResponse.redirect(dest);
  }

  // ── Redirect to Instagram with HttpOnly state cookie ──────────────────────
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("__instagram_state", state, {
    httpOnly: true,                                        // not readable by client JS
    sameSite: "lax",                                       // CSRF protection on redirect
    secure: process.env.NODE_ENV === "production",         // HTTPS only in production
    path: "/",
    maxAge: 300,                                           // 5-minute expiry
  });
  return response;
}
