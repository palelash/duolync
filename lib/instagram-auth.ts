/**
 * lib/instagram-auth.ts
 *
 * Server-only module for Instagram Business Login (direct Instagram Login).
 * Do NOT import this file in client components — it reads server-side env vars.
 *
 * Authorization endpoint opens instagram.com directly (not facebook.com).
 *
 * VERIFY WITH META DOCS before the first production deploy:
 *   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
 */

// ─── Authorization endpoint ───────────────────────────────────────────────────

/**
 * Instagram Business Login authorization endpoint.
 * Opens instagram.com directly. Consistent with the live Meta "Generate Token"
 * test result where the consent screen was hosted at instagram.com.
 *
 * VERIFY WITH META DOCS: confirm this matches the documented Business Login URL.
 */
export const INSTAGRAM_AUTH_ENDPOINT = "https://www.instagram.com/oauth/authorize";

// ─── Token endpoints ──────────────────────────────────────────────────────────

/**
 * Short-lived access token exchange endpoint.
 * Accepts: POST application/x-www-form-urlencoded
 * Params:  client_id, client_secret, grant_type, redirect_uri, code
 * Returns: { access_token, token_type, user_id, permissions? }
 *
 * VERIFY WITH META DOCS
 */
export const INSTAGRAM_TOKEN_ENDPOINT = "https://api.instagram.com/oauth/access_token";

/**
 * Short-lived → long-lived token exchange endpoint.
 * Accepts: GET with query params
 * Params:  grant_type=ig_exchange_token, client_secret, access_token
 * Returns: { access_token, token_type, expires_in, permissions? }
 *
 * Long-lived tokens are valid for ~60 days (expires_in ≈ 5,184,000 seconds).
 * Proactive renewal via graph.instagram.com/refresh_access_token is deferred to
 * the token lifecycle task.
 *
 * VERIFY WITH META DOCS
 */
export const INSTAGRAM_LONG_LIVED_ENDPOINT = "https://graph.instagram.com/access_token";

/**
 * Instagram Graph API base URL for profile and media calls.
 * VERIFY WITH META DOCS
 */
export const INSTAGRAM_GRAPH = "https://graph.instagram.com";

// ─── Scopes ───────────────────────────────────────────────────────────────────

/**
 * Scopes sent in the authorization request.
 *
 * instagram_business_basic        — REQUIRED; grants profile + media access.
 * instagram_business_manage_insights — OPTIONAL; creator may decline.
 *
 * Connection MUST succeed when only instagram_business_basic is granted.
 * Never claim instagram_business_manage_insights was granted unless confirmed.
 */
export const INSTAGRAM_SCOPES =
  "instagram_business_basic,instagram_business_manage_insights";

// ─── URL builder ─────────────────────────────────────────────────────────────

/**
 * Builds the Instagram OAuth authorization URL.
 *
 * Returns null when NEXT_PUBLIC_INSTAGRAM_APP_ID is not configured —
 * callers must treat null as server_misconfiguration and fail closed.
 *
 * @param redirectUri  Canonical callback URI (must match what is registered in Meta Dashboard)
 * @param state        Cryptographically secure CSRF state value
 */
export function buildInstagramAuthUrl(
  redirectUri: string,
  state: string,
): string | null {
  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  if (!appId) return null;

  const url = new URL(INSTAGRAM_AUTH_ENDPOINT);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", INSTAGRAM_SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}
