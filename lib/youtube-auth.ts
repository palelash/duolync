import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// New name avoids shadowing by the legacy browser-written, root-path cookie.
export const YOUTUBE_STATE_COOKIE = "__youtube_oauth_state";
// The browser cookie selects its most recent start. Earlier durable records
// remain independent and can still be consumed with their original cookie.
export const YOUTUBE_STATE_OPTIONS = {
  httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, path: "/api/auth", maxAge: 300,
};

export function youtubeAppUrl(): string {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (url.protocol !== "https:" && (process.env.NODE_ENV === "production" || url.protocol !== "http:")) {
    throw new Error("youtube_configuration_error");
  }
  return url.origin;
}

export function youtubeCallbackUri(): string {
  return `${youtubeAppUrl()}/api/auth/callback/youtube`;
}

function sign(value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("youtube_configuration_error");
  return createHmac("sha256", secret).update(`youtube-oauth:${value}`).digest("base64url");
}

export async function createYouTubeState(userId: string, sessionId: string, now = Date.now()) {
  const state = randomBytes(32).toString("base64url");
  const cookie = `${state}.${sign(state)}`;
  // A namespaced primary key isolates these records from Better Auth's records.
  // Binding stays server-side; no provider credentials are stored here.
  const identifier = `youtube-oauth-state:${state}`;
  await db.verification.create({ data: {
    id: identifier, identifier, value: JSON.stringify({ userId, sessionId }),
    createdAt: new Date(now), updatedAt: new Date(now), expiresAt: new Date(now + 300_000),
  } });
  return { state, cookie };
}

export async function consumeYouTubeState(cookie: string | undefined, state: string | null,
  userId: string | undefined, sessionId: string | undefined, now = Date.now()): Promise<boolean> {
  if (!cookie || !state || !userId || !sessionId) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return false;
  try {
    const parts = cookie.split(".");
    if (parts.length !== 2 || parts[0] !== state) return false;
    const expected = Buffer.from(sign(parts[0]));
    const signature = Buffer.from(parts[1]);
    if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) return false;
  } catch { return false; }
  // One SQL DELETE checks binding/expiry and consumes the record atomically.
  // The primary key guarantees at most one winner across independent workers.
  // Invalid bindings do not delete the legitimate owner's state.
  const identifier = `youtube-oauth-state:${state}`;
  const deleted = await db.verification.deleteMany({ where: {
    id: identifier, identifier, value: JSON.stringify({ userId, sessionId }),
    createdAt: { lte: new Date(now) }, expiresAt: { gt: new Date(now) },
  } });
  return deleted.count === 1;
}

export function buildYouTubeAuthUrl(state: string, needsRefreshToken: boolean): string {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  if (!clientId || !process.env.YOUTUBE_CLIENT_SECRET) throw new Error("youtube_configuration_error");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: youtubeCallbackUri(),
    scope: YOUTUBE_SCOPE, response_type: "code", access_type: "offline", state }).toString();
  // Google only returns refresh tokens on initial authorization or re-consent.
  // Request consent when no usable refresh token is stored (including dead auth),
  // or for an explicit recovery retry. Normal reconnects reuse same-channel grants.
  // https://developers.google.com/identity/protocols/oauth2/web-server
  if (needsRefreshToken) url.searchParams.set("prompt", "consent");
  return url.toString();
}

export interface YouTubeParsedToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
}

export function parseYouTubeTokenResponse(value: unknown, now = Date.now()): YouTubeParsedToken | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if ("error" in data || typeof data.access_token !== "string" || !data.access_token.trim()) return null;
  if ("refresh_token" in data && (typeof data.refresh_token !== "string" || !data.refresh_token.trim())) return null;
  if ("token_type" in data && (typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer")) return null;
  if ("scope" in data && (typeof data.scope !== "string" || !data.scope.trim() ||
    data.scope.trim().split(/\s+/).some(scope => !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(scope)))) return null;
  let expiresAt: Date | null = null;
  if ("expires_in" in data) {
    if (typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) return null;
    expiresAt = new Date(now + data.expires_in * 1000);
    if (!Number.isFinite(expiresAt.getTime())) return null;
  }
  return { accessToken: data.access_token, refreshToken: (data.refresh_token as string | undefined) ?? null,
    expiresAt, scopes: typeof data.scope === "string" ? [...new Set(data.scope.trim().split(/\s+/))].join(" ") : null };
}

/** Bound each touched provider call; never cache credentials or response payloads. */
export function youtubeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
}
