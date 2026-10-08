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
 * Documented success body (Business Login, Mar 2026):
 *   { data: [{ access_token, user_id, permissions }] }
 * permissions is a comma-separated string. Older responses may be flat
 * ({ access_token, user_id, permissions }) and permissions may be a string[].
 *
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
 */
export const INSTAGRAM_TOKEN_ENDPOINT = "https://api.instagram.com/oauth/access_token";

/**
 * Short-lived → long-lived token exchange endpoint.
 * Accepts: GET with query params
 * Params:  grant_type=ig_exchange_token, client_secret, access_token
 * Returns: { access_token, token_type, expires_in }
 *
 * Long-lived tokens are valid for ~60 days (expires_in ≈ 5,184,000 seconds).
 * There is no separate refresh token. Renewal uses INSTAGRAM_REFRESH_ENDPOINT
 * with the current long-lived access token (see lib/instagram-token.ts).
 *
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
 */
export const INSTAGRAM_LONG_LIVED_ENDPOINT = "https://graph.instagram.com/access_token";

/**
 * Refresh a long-lived Instagram User access token for another ~60 days.
 * GET query: grant_type=ig_refresh_token&access_token=<current long-lived token>
 *
 * Meta requirements:
 *   - the token is at least 24 hours old
 *   - the token is not expired
 *   - instagram_business_basic was granted
 *
 * No client secret and no refresh token are sent. Do not log the request URL.
 */
export const INSTAGRAM_REFRESH_ENDPOINT = "https://graph.instagram.com/refresh_access_token";

/** Refresh when remaining lifetime is at most this long (and the row is old enough). */
export const INSTAGRAM_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Meta rejects ig_refresh_token until the long-lived token is at least 24 hours old.
 * Measured from PlatformToken.updatedAt (last time this token value was stored).
 */
export const INSTAGRAM_MIN_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Graph / OAuth error codes.
 * 10 and 200 are permission denials (insights may be missing).
 * 190 is an invalid OAuth access token — reauth, not a missing insights scope.
 */
export const INSTAGRAM_PERMISSION_ERROR_CODES = new Set([10, 200]);
export const INSTAGRAM_AUTH_INVALID_CODE = 190;

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

/**
 * Scopes we are willing to persist. Anything else in a provider permissions
 * payload is dropped. instagram_business_manage_insights is stored only when
 * the provider actually returned it — it is never added by us.
 */
export const INSTAGRAM_KNOWN_SCOPES = new Set([
  "instagram_business_basic",
  "instagram_business_manage_insights",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
  "instagram_business_content_publish",
]);

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

// ─── Token response parsing ──────────────────────────────────────────────────

export interface InstagramTokenPayload {
  /** Non-empty access token, or null when the body did not contain one. */
  accessToken: string | null;
  /**
   * Provider user id as a string, or null when the field is absent.
   * Numeric ids are preserved as their decimal text (no precision loss).
   */
  userId: string | null;
  /** Normalized permissions. Empty when the field is absent or unusable. */
  permissions: string[];
  /**
   * Positive finite expires_in seconds, or null when absent / not usable.
   * Callers must not invent a lifetime when this is null.
   */
  expiresIn: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function splitScopeList(value: string): string[] {
  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

/**
 * Normalizes a provider permissions field into a string list.
 * Accepts a comma-separated string, a string array, or absence.
 * Does not add scopes that were not in the payload.
 */
export function normalizeInstagramPermissions(raw: unknown): string[] {
  const parts: string[] = [];
  if (typeof raw === "string") {
    parts.push(...splitScopeList(raw));
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") parts.push(...splitScopeList(item));
    }
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const scope of parts) {
    if (seen.has(scope)) continue;
    seen.add(scope);
    normalized.push(scope);
  }
  return normalized;
}

function readAccessToken(record: Record<string, unknown>): string | null {
  const token = record["access_token"];
  return typeof token === "string" && token.length > 0 ? token : null;
}

function readUserId(record: Record<string, unknown>): string | null {
  const userId = record["user_id"];
  if (typeof userId === "string") {
    const trimmed = userId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  // Already-parsed JSON may have turned a safe integer into a number.
  // Oversized ids must be quoted before JSON.parse — see parseInstagramJson.
  if (typeof userId === "number" && Number.isFinite(userId)) {
    return String(userId);
  }
  return null;
}

function readExpiresIn(record: Record<string, unknown>): number | null {
  const expiresIn = record["expires_in"];
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) {
    return expiresIn;
  }
  return null;
}

/**
 * Quotes bare numeric user_id values so JSON.parse cannot round them.
 * Instagram ids are often larger than Number.MAX_SAFE_INTEGER.
 * Does not alter access tokens or already-string user ids.
 */
export function parseInstagramJson(text: string): unknown {
  // Quote bare id / user_id integers before JSON.parse. Instagram ids are
  // often larger than Number.MAX_SAFE_INTEGER, and rounding would make a
  // real identity mismatch look like a match (or the reverse).
  const quoted = text.replace(/("(?:user_id|id)"\s*:\s*)(\d+)/g, '$1"$2"');
  return JSON.parse(quoted);
}

/**
 * Reads a short-lived, long-lived, or refresh token body.
 *
 * Supports the documented nested shape:
 *   { data: [{ access_token, user_id, permissions }] }
 * and a flat shape if Meta still returns one:
 *   { access_token, user_id, permissions }
 *
 * Nested data[0] wins when it contains a non-empty access_token.
 * permissions are taken from the same object as the token.
 */
export function parseInstagramTokenResponse(body: unknown): InstagramTokenPayload {
  const empty: InstagramTokenPayload = {
    accessToken: null,
    userId: null,
    permissions: [],
    expiresIn: null,
  };
  const root = asRecord(body);
  if (!root) return empty;

  const nestedList = root["data"];
  if (Array.isArray(nestedList) && nestedList.length > 0) {
    const first = asRecord(nestedList[0]);
    if (first) {
      const nestedToken = readAccessToken(first);
      if (nestedToken) {
        return {
          accessToken: nestedToken,
          userId: readUserId(first),
          permissions: normalizeInstagramPermissions(first["permissions"]),
          expiresIn: readExpiresIn(first),
        };
      }
    }
  }

  return {
    accessToken: readAccessToken(root),
    userId: readUserId(root),
    permissions: normalizeInstagramPermissions(root["permissions"]),
    expiresIn: readExpiresIn(root),
  };
}

/**
 * The raw permissions value from the same object that held the access token.
 * undefined when that object omitted the field.
 */
export function instagramTokenPermissionsRaw(body: unknown): unknown {
  const root = asRecord(body);
  if (!root) return undefined;

  const nestedList = root["data"];
  if (Array.isArray(nestedList) && nestedList.length > 0) {
    const first = asRecord(nestedList[0]);
    if (first && readAccessToken(first)) {
      return Object.prototype.hasOwnProperty.call(first, "permissions")
        ? first["permissions"]
        : undefined;
    }
  }

  return Object.prototype.hasOwnProperty.call(root, "permissions")
    ? root["permissions"]
    : undefined;
}

/**
 * Scopes to store after a successful code exchange.
 *
 * Walks permission fields in preference order (long-lived, then short-lived).
 * The first field that is present and contains known scopes wins.
 * When every present field is empty or unknown, stores only
 * instagram_business_basic — proven by the exchange itself.
 * Never adds instagram_business_manage_insights unless the provider sent it.
 */
export function resolveInstagramGrantedScopes(permissionFields: unknown[]): string {
  for (const raw of permissionFields) {
    if (raw === undefined || raw === null) continue;
    const known = normalizeInstagramPermissions(raw)
      .filter((scope) => INSTAGRAM_KNOWN_SCOPES.has(scope))
      .sort();
    if (known.length > 0) return known.join(",");
  }
  return "instagram_business_basic";
}

export function instagramPermissionsFieldPresent(raw: unknown): boolean {
  return raw !== undefined && raw !== null;
}

/**
 * True when a token-response user id is absent (continue with /me.id)
 * or exactly equals the /me id. False on mismatch — caller must not write.
 */
export function instagramTokenUserMatchesProfile(
  tokenUserId: string | null,
  profileId: string,
): boolean {
  if (tokenUserId === null) return true;
  return tokenUserId === profileId;
}

// ─── Lifecycle decisions (pure) ──────────────────────────────────────────────

export type InstagramTokenAction = "return" | "refresh" | "expired";

/**
 * Decides what to do with a stored long-lived Instagram token.
 *
 *   expired     expiresAt <= now — do not call ig_refresh_token
 *   return      active (> 7 days), unknown expiry (null), or near expiry
 *               while the row is younger than 24 hours
 *   refresh     0 < remaining <= 7 days AND the row is at least 24 hours old
 *
 * A null expiresAt is returned as-is. This function never invents a date.
 */
export function decideInstagramTokenAction(
  row: { expiresAt: Date | null; updatedAt: Date | null },
  nowMs: number,
): InstagramTokenAction {
  if (row.expiresAt === null) return "return";
  const expiryMs = row.expiresAt.getTime();
  if (Number.isNaN(expiryMs)) return "return";

  const remaining = expiryMs - nowMs;
  if (remaining <= 0) return "expired";
  if (remaining > INSTAGRAM_REFRESH_WINDOW_MS) return "return";

  if (row.updatedAt === null) return "return";
  const updatedMs = row.updatedAt.getTime();
  if (Number.isNaN(updatedMs)) return "return";
  const age = nowMs - updatedMs;
  if (age < INSTAGRAM_MIN_TOKEN_AGE_MS) return "return";
  return "refresh";
}

export type InstagramGraphErrorClass =
  | "auth_invalid"
  | "permission_denied"
  | "temporary"
  | "other";

function finiteErrorCode(code: unknown): number | null {
  if (typeof code === "number" && Number.isFinite(code)) return code;
  if (typeof code === "string" && /^-?\d+$/.test(code)) {
    const parsed = Number(code);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Classifies a Meta Graph / OAuth failure.
 * Code 190 is auth-invalid even when the HTTP status is 429 or 5xx.
 * Network failures, 429, 5xx, and unparseable bodies without a confirmed
 * 190 are temporary and must not clear the connection.
 * Codes 10 and 200 are permission denials, not dead auth.
 */
export function classifyInstagramGraphFailure(input: {
  errorCode?: unknown;
  httpStatus?: number;
  networkError?: boolean;
  unparseable?: boolean;
}): InstagramGraphErrorClass {
  const code = finiteErrorCode(input.errorCode);
  if (code === INSTAGRAM_AUTH_INVALID_CODE) return "auth_invalid";
  if (input.networkError || input.unparseable) return "temporary";
  if (
    input.httpStatus === 429 ||
    (typeof input.httpStatus === "number" && input.httpStatus >= 500)
  ) {
    return "temporary";
  }
  if (code !== null && INSTAGRAM_PERMISSION_ERROR_CODES.has(code)) {
    return "permission_denied";
  }
  return "other";
}

/** Reads error.code from a Graph body `{ error: { code } }` or a flat `{ code }`. */
export function readInstagramGraphErrorCode(body: unknown): number | null {
  const root = asRecord(body);
  if (!root) return null;
  const nested = asRecord(root["error"]);
  if (nested) return finiteErrorCode(nested["code"]);
  return finiteErrorCode(root["code"]);
}
