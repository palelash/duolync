import "server-only";
import { db } from "@/lib/db";
import { threadsConfig } from "@/lib/threads-auth";
import { lockThreadsConnection } from "@/lib/threads-lock";

// Token contract: Meta Threads API collection (POST code; GET long-lived exchange/renewal).
// https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api
const GRAPH = "https://graph.threads.net";
export class ThreadsProviderError extends Error {
  constructor(public readonly kind: "invalid_authorization" | "temporary_failure" | "invalid_response") { super(kind); }
}
export function threadsProviderId(value: unknown): string {
  // Never round an unsafe numeric ID from JSON. Meta normally returns strings.
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof id !== "string" || !/^[1-9][0-9]{0,63}$/.test(id)) throw new ThreadsProviderError("invalid_response");
  return id;
}
export function parseThreadsToken(value: unknown, requireExpiry = false, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ThreadsProviderError("invalid_response");
  const data = value as Record<string, unknown>;
  if ("error" in data || typeof data.access_token !== "string" || !data.access_token.trim() ||
      data.access_token.length > 16384 || /\s/.test(data.access_token) ||
      ("token_type" in data && (typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer")))
    throw new ThreadsProviderError("invalid_response");
  let expiresAt: Date | null = null;
  if (requireExpiry || "expires_in" in data) {
    const expiry = data.expires_in;
    if (typeof expiry !== "number" || !Number.isFinite(expiry) || expiry <= 0 || expiry > 90 * 86400)
      throw new ThreadsProviderError("invalid_response");
    expiresAt = new Date(now + expiry * 1000);
  }
  return { accessToken: data.access_token, expiresAt,
    userId: "user_id" in data ? threadsProviderId(data.user_id) : null };
}
async function request(url: URL, init: RequestInit = {}): Promise<unknown> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const body = await res.json();
    if (!res.ok || body?.error) {
      // Only the documented invalid OAuth code is terminal; outages/rate limits remain retryable.
      throw new ThreadsProviderError(body?.error?.code === 190 ? "invalid_authorization" : "temporary_failure");
    }
    return body;
  } catch (error) {
    if (error instanceof ThreadsProviderError) throw error;
    throw new ThreadsProviderError("temporary_failure");
  }
}
export async function fetchThreadsIdentity(accessToken: string) {
  const url = new URL(`${GRAPH}/v1.0/me`);
  url.search = new URLSearchParams({ fields: "id,username" }).toString();
  const data = await request(url, { headers: { Authorization: `Bearer ${accessToken}` } }) as Record<string, unknown>;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ThreadsProviderError("invalid_response");
  const id = threadsProviderId(data.id);
  if ("username" in data && (typeof data.username !== "string" || !/^[A-Za-z0-9._]{1,64}$/.test(data.username)))
    throw new ThreadsProviderError("invalid_response");
  return { id, username: typeof data.username === "string" ? data.username : null };
}
export async function exchangeThreadsCode(code: string) {
  const { appId, secret, redirectUri } = threadsConfig();
  const short = parseThreadsToken(await request(new URL(`${GRAPH}/oauth/access_token`), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: redirectUri,
      grant_type: "authorization_code", code }).toString(),
  }));
  const identity = await fetchThreadsIdentity(short.accessToken);
  if (short.userId && short.userId !== identity.id) throw new ThreadsProviderError("invalid_response");
  const url = new URL(`${GRAPH}/access_token`);
  url.search = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: secret, access_token: short.accessToken }).toString();
  const long = parseThreadsToken(await request(url), true);
  const accepted = await fetchThreadsIdentity(long.accessToken);
  if (accepted.id !== identity.id || (long.userId && long.userId !== identity.id)) throw new ThreadsProviderError("invalid_response");
  return { accessToken: long.accessToken, expiresAt: long.expiresAt!, platformUserId: accepted.id, username: accepted.username };
}

/** On-demand renewal, once >=24h old and nearing expiry. No invented refresh token.
 * Terminal failures are classified for later lifecycle handling and never remove credentials. */
export async function renewThreadsToken(userId: string, now = Date.now()) {
  const old = await db.platformToken.findUnique({ where: { userId_platform: { userId, platform: "threads" } } });
  if (!(old?.expiresAt instanceof Date) || !Number.isFinite(old.expiresAt.getTime()) || !old.platformUserId) return { ok: false, reason: "missing_authorization" };
  if (old.expiresAt.getTime() <= now) return { ok: false, reason: "invalid_authorization" };
  if (old.expiresAt.getTime() - now > 7 * 86400_000 || now - old.updatedAt.getTime() < 86400_000)
    return { ok: true, reason: "not_due" };
  // The same exact-credential fence governs both persistence and terminal failures.
  const authority = { id: old.id, userId, platform: "threads",
    platformUserId: old.platformUserId, accessToken: old.accessToken, updatedAt: old.updatedAt };
  try {
    const url = new URL(`${GRAPH}/refresh_access_token`);
    url.search = new URLSearchParams({ grant_type: "th_refresh_token" }).toString();
    const renewed = parseThreadsToken(await request(url, { headers: { Authorization: `Bearer ${old.accessToken}` } }), true, now);
    const identity = await fetchThreadsIdentity(renewed.accessToken);
    if (identity.id !== old.platformUserId || (renewed.userId && renewed.userId !== identity.id))
      throw new ThreadsProviderError("invalid_response");
    return await db.$transaction(async tx => {
      await lockThreadsConnection(tx, userId);
      const result = await tx.platformToken.updateMany({ where: authority,
        data: { accessToken: renewed.accessToken, expiresAt: renewed.expiresAt, refreshToken: null } });
      return { ok: result.count === 1, reason: result.count === 1 ? "renewed" : "superseded" };
    });
  } catch (error) {
    if (error instanceof ThreadsProviderError && error.kind === "invalid_authorization") {
      try {
        return await db.$transaction(async tx => {
          await lockThreadsConnection(tx, userId);
          const current = await tx.platformToken.count({ where: authority });
          return { ok: false, reason: current === 1 ? "invalid_authorization" : "superseded" };
        });
      } catch {
        // If authority cannot be checked, do not launch OAuth based on an old result.
        return { ok: false, reason: "temporary_failure" };
      }
    }
    return { ok: false, reason: error instanceof ThreadsProviderError ? error.kind : "temporary_failure" };
  }
}
