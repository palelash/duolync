/**
 * lib/tiktok-revoke.ts
 *
 * Server-only TikTok authorization revoke helper.
 *
 * Uses the TikTok V2 revoke endpoint:
 *   POST https://open.tiktokapis.com/v2/oauth/revoke/
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: client_key, client_secret, token
 *
 * The access token is NEVER placed in the URL or query string.
 * The access token is NEVER logged.
 * Raw TikTok response bodies are NEVER logged.
 * error_description is NEVER returned or logged.
 *
 * Public API:
 *   revokeTikTokAuthorization(userId)  — obtains a usable token, calls TikTok
 *                                        revoke, returns a typed semantic result.
 *
 * Token lifecycle:
 *   getTikTokAccessToken is called first. Its semantic results are mapped:
 *
 *   not_connected     → "not_connected"      (no token row exists)
 *   reauth_required   → "already_revoked"    (authorization is confirmed dead)
 *   temporary_failure → "temporary_failure"  (transient — preserve local data)
 *   configuration_error → "configuration_error"
 *   ok               → use the returned token to call TikTok revoke
 *
 * This means:
 *   - A healthy token is revoked directly.
 *   - A near-expiry token is refreshed first, then the new token is revoked.
 *   - An expired token is refreshed first, then revoked.
 *   - A confirmed-dead authorization (invalid_grant already processed by the
 *     token lifecycle) is reported as already_revoked without a provider call.
 */

import "server-only";

import { getTikTokAccessToken } from "@/lib/tiktok-token";

// ── Constants ──────────────────────────────────────────────────────────────────

const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";

// ── Public result type ─────────────────────────────────────────────────────────

/**
 * Typed semantic result of revokeTikTokAuthorization().
 *
 * revoked              — TikTok confirmed the authorization was revoked (2xx).
 * already_revoked      — The token lifecycle confirmed authorization is dead;
 *                        no provider call was made (safe to clean up locally).
 * not_connected        — No TikTok PlatformToken row exists for this user.
 * temporary_failure    — Transient error (network, 5xx, ambiguous provider error).
 *                        Local data MUST be preserved.
 * configuration_error  — Missing env vars or invalid_client from TikTok.
 *                        Local data MUST be preserved.
 *
 * Only "revoked", "already_revoked", and "not_connected" are safe to proceed
 * with local data deletion. "temporary_failure" and "configuration_error" must
 * not trigger any local cleanup.
 */
export type TikTokRevokeResult =
  | "revoked"
  | "already_revoked"
  | "not_connected"
  | "temporary_failure"
  | "configuration_error";

// ── Internal response type (never returned to callers) ────────────────────────

interface TikTokRevokeErrorBody {
  error?: string;
  // error_description intentionally omitted — never logged or returned
}

// ── revokeTikTokAuthorization ──────────────────────────────────────────────────

/**
 * Revokes Duolync's TikTok authorization for the given Duolync userId.
 *
 * Never exposes the access token, refresh token, client secret, or raw TikTok
 * response body to callers or logs.
 *
 * @param userId  Duolync (Better Auth) user ID — never a TikTok identifier.
 */
export async function revokeTikTokAuthorization(
  userId: string,
): Promise<TikTokRevokeResult> {
  // ── Step 1: Obtain a usable access token via the hardened token lifecycle ──
  //
  // Do NOT duplicate refresh logic — getTikTokAccessToken handles:
  //   - Fast path: healthy token returned immediately.
  //   - Refresh path: near-expiry or expired token refreshed first.
  //   - Cross-process PostgreSQL row-level lock (no concurrent refresh race).
  //   - invalid_grant cleanup: atomically removes dead token and updates
  //     connectedPlatforms, then returns reauth_required.
  const tokenResult = await getTikTokAccessToken(userId);

  if (!tokenResult.ok) {
    switch (tokenResult.reason) {
      case "not_connected":
        // No PlatformToken row exists — nothing to revoke.
        return "not_connected";

      case "reauth_required":
        // Authorization is CONFIRMED DEAD — the token lifecycle already
        // atomically deleted the PlatformToken and cleaned connectedPlatforms.
        // Treat as already revoked; no provider call needed.
        return "already_revoked";

      case "temporary_failure":
        // Transient error — cannot safely obtain a token to revoke.
        // Preserve local data so revoke can be retried.
        return "temporary_failure";

      case "configuration_error":
        // Missing or invalid credentials — cannot call the provider.
        return "configuration_error";
    }
  }

  // tokenResult.ok === true — we have a usable access token.
  // The token is kept inside this server-only module and is NEVER returned
  // to callers or logged anywhere in this file.

  // ── Step 2: Read client credentials (server-side only) ────────────────────
  const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    // Credentials missing at runtime — cannot call TikTok.
    return "configuration_error";
  }

  // ── Step 3: POST form-encoded revoke request ───────────────────────────────
  //
  // The token MUST be in the POST body only — NEVER in the URL or query string.
  // URLSearchParams provides correct application/x-www-form-urlencoded encoding.
  // Do NOT use tiktokFetch() — it is for Display API Bearer requests and has
  // different error/retry semantics.
  let res: Response;
  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      token: tokenResult.accessToken, // Body only — never logged
    });
    res = await fetch(TIKTOK_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    // Network failure — do not delete local data; allow retry.
    return "temporary_failure";
  }

  // ── Step 4: Classify the response ─────────────────────────────────────────
  //
  // TikTok V2 revoke returns an empty body on success.

  if (res.ok) {
    // 2xx — authorization revoked successfully.
    return "revoked";
  }

  // Non-2xx: attempt to parse error code for classification.
  // Never log the response body — it may contain token-bearing context.
  let errorCode: string | undefined;
  try {
    const json = (await res.json()) as TikTokRevokeErrorBody;
    // Read error code only — never read or log error_description.
    errorCode = json.error;
  } catch {
    // Unparseable body — errorCode stays undefined; classified below.
  }

  // HTTP 5xx: transient server-side failure.
  if (res.status >= 500) {
    return "temporary_failure";
  }

  // Known transient error codes from TikTok.
  if (errorCode === "server_error" || errorCode === "temporarily_unavailable") {
    return "temporary_failure";
  }

  // Credential/configuration failure.
  if (errorCode === "invalid_client") {
    return "configuration_error";
  }

  // Unknown or ambiguous error — be conservative.
  // Do NOT invent an "already_revoked" result from an undocumented error.
  // Preserve local data so the user can retry.
  return "temporary_failure";
}
