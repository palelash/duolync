/**
 * lib/instagram-token.ts
 *
 * Server-only Instagram User access-token lifecycle (Instagram Login).
 *
 * Instagram Login does not issue a refresh token. Long-lived tokens are
 * renewed with the current access token:
 *   GET graph.instagram.com/refresh_access_token
 *       ?grant_type=ig_refresh_token
 *       &access_token=<current long-lived token>
 *
 * PlatformToken.refreshToken stays null. Official historical rows
 * (PlatformStats, SocialPost, stored insights, CreatorContentCuration)
 * are never deleted here. Do not call removePlatformAction.
 *
 * Do not log access tokens or request URLs that contain them.
 */

import "server-only";

import type { Prisma } from "@/lib/generated/prisma";
import { db } from "@/lib/db";
import { lockInstagramOwner } from "@/lib/instagram-lock";
import {
  INSTAGRAM_KNOWN_SCOPES,
  INSTAGRAM_REFRESH_ENDPOINT,
  classifyInstagramGraphFailure,
  decideInstagramTokenAction,
  parseInstagramJson,
  parseInstagramTokenResponse,
  readInstagramGraphErrorCode,
  type InstagramGraphErrorClass,
} from "@/lib/instagram-auth";

const REFRESH_TX_TIMEOUT_MS = 30_000;
const SAVE_TX_TIMEOUT_MS = 15_000;

/**
 * Result of getInstagramAccessToken() and dead-auth helpers.
 *
 *  ok                    — accessToken is usable
 *  not_connected         — no Instagram PlatformToken row
 *  reauth_required       — confirmed dead auth; token row and the
 *                          "instagram" connection marker were removed
 *  temporary_failure     — retryable; connection state was preserved
 *  configuration_error   — required app configuration is missing;
 *                          connection state was preserved
 */
export type InstagramTokenOutcome =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "not_connected" }
  | { ok: false; reason: "reauth_required" }
  | { ok: false; reason: "temporary_failure"; detail?: string }
  | { ok: false; reason: "configuration_error" };

export interface InstagramTokenSaveData {
  accessToken: string;
  /** null when the provider omitted a usable expires_in. Do not invent one. */
  expiresAt: Date | null;
  scopes: string;
  platformUserId: string;
  username: string | null;
}

export interface InstagramGraphFailureInput {
  errorCode?: unknown;
  httpStatus?: number;
  networkError?: boolean;
  unparseable?: boolean;
  /**
   * Access token that Meta rejected. When set, a newer stored token is
   * kept and returned instead of being deleted.
   */
  failedAccessToken?: string;
}

interface LockedInstagramTokenRow {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | string | null;
  scopes: string | null;
  platformUserId: string | null;
  updatedAt: Date | string | null;
}

const lifecycleLock = new Map<string, Promise<InstagramTokenOutcome>>();

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function scopesFromPermissions(permissions: string[]): string | null {
  const known = [
    ...new Set(permissions.filter((scope) => INSTAGRAM_KNOWN_SCOPES.has(scope))),
  ].sort();
  return known.length > 0 ? known.join(",") : null;
}

function failureDetail(kind: InstagramGraphErrorClass, httpStatus?: number): string {
  if (kind === "permission_denied") return "permission_denied";
  if (httpStatus === 429) return "rate_limited";
  if (typeof httpStatus === "number" && httpStatus >= 500) return `http_${httpStatus}`;
  if (kind === "temporary") return "temporary";
  return "provider_error";
}

async function lockInstagramToken(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<LockedInstagramTokenRow | null> {
  const rows = await tx.$queryRaw<LockedInstagramTokenRow[]>`
    SELECT "id", "accessToken", "refreshToken", "expiresAt", "scopes", "platformUserId", "updatedAt"
    FROM "PlatformToken"
    WHERE "userId" = ${userId} AND "platform" = 'instagram'
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Removes only the current Instagram credential and connection marker.
 * Keeps PlatformStats, SocialPost, insights JSON, and CreatorContentCuration.
 */
async function clearInstagramConnection(
  tx: Prisma.TransactionClient,
  userId: string,
  currentAccessToken?: string,
): Promise<void> {
  // Caller holds User then token locks. Still predicate the delete on the
  // rejected/current credential; an absent row needs only marker cleanup.
  if (currentAccessToken !== undefined) {
    const deleted = await tx.platformToken.deleteMany({
      where: { userId, platform: "instagram", accessToken: currentAccessToken },
    });
    if (deleted.count === 0) throw new Error("instagram_credential_changed");
  }
  await tx.$executeRaw`
    UPDATE "CreatorProfile"
    SET "connectedPlatforms" = array_remove("connectedPlatforms", 'instagram')
    WHERE "userId" = ${userId}
  `;
}

/**
 * Persists a long-lived Instagram token from the OAuth callback.
 * refreshToken is always null. The stable owner lock serializes this write
 * against cleanup, disconnect and refresh even when the token row is absent.
 */
export async function saveInstagramAccessToken(
  userId: string,
  data: InstagramTokenSaveData,
): Promise<void> {
  if (data.accessToken.length === 0) {
    throw new Error("instagram_access_token_missing");
  }

  await db.$transaction(
    async (tx) => {
      await lockInstagramOwner(tx, userId);
      await lockInstagramToken(tx, userId);
      await tx.platformToken.upsert({
        where: { userId_platform: { userId, platform: "instagram" } },
        create: {
          userId,
          platform: "instagram",
          accessToken: data.accessToken,
          refreshToken: null,
          expiresAt: data.expiresAt,
          scopes: data.scopes,
          platformUserId: data.platformUserId,
          username: data.username,
        },
        update: {
          accessToken: data.accessToken,
          refreshToken: null,
          expiresAt: data.expiresAt,
          scopes: data.scopes,
          platformUserId: data.platformUserId,
          username: data.username,
          updatedAt: new Date(),
        },
      });
    },
    { maxWait: 5_000, timeout: SAVE_TX_TIMEOUT_MS },
  );
}

/**
 * Returns a usable Instagram access token.
 *
 * Active tokens (more than 7 days left) and tokens with unknown expiry
 * are returned immediately. Near-expiry tokens are refreshed only when
 * the row is at least 24 hours old. Expired tokens are not sent to
 * ig_refresh_token; the connection is cleared and reauth_required is returned.
 */
export async function getInstagramAccessToken(
  userId: string,
): Promise<InstagramTokenOutcome> {
  let stored: {
    accessToken: string;
    expiresAt: Date | null;
    updatedAt: Date;
  } | null;
  try {
    stored = await db.platformToken.findUnique({
      where: { userId_platform: { userId, platform: "instagram" } },
      select: { accessToken: true, expiresAt: true, updatedAt: true },
    });
  } catch {
    console.warn("[instagram-token] failed to read the Instagram token row");
    return { ok: false, reason: "temporary_failure", detail: "db_read_error" };
  }
  if (!stored) return { ok: false, reason: "not_connected" };

  const action = decideInstagramTokenAction(
    { expiresAt: stored.expiresAt, updatedAt: stored.updatedAt },
    Date.now(),
  );
  if (action === "return") {
    return { ok: true, accessToken: stored.accessToken };
  }

  return acquireMaintainLock(userId);
}

/**
 * Classifies a Graph failure and applies dead-auth cleanup only for code 190.
 * Permission denials (10 / 200), HTTP 429, 5xx, network errors, and
 * unparseable bodies do not delete the token or the connection marker.
 */
export async function handleInstagramGraphFailure(
  userId: string,
  failure: InstagramGraphFailureInput,
): Promise<InstagramTokenOutcome> {
  const kind = classifyInstagramGraphFailure(failure);
  if (kind !== "auth_invalid") {
    return {
      ok: false,
      reason: "temporary_failure",
      detail: failure.networkError
        ? "network_error"
        : failure.unparseable
          ? "unparseable_response"
          : failureDetail(kind, failure.httpStatus),
    };
  }

  return acquireAuthInvalidLock(userId, failure.failedAccessToken);
}

function acquireMaintainLock(userId: string): Promise<InstagramTokenOutcome> {
  const inflight = lifecycleLock.get(userId);
  if (inflight) return inflight;

  const promise = executeMaintain(userId).finally(() => {
    if (lifecycleLock.get(userId) === promise) {
      lifecycleLock.delete(userId);
    }
  });
  lifecycleLock.set(userId, promise);
  return promise;
}

function acquireAuthInvalidLock(
  userId: string,
  failedAccessToken: string | undefined,
): Promise<InstagramTokenOutcome> {
  const inflight = lifecycleLock.get(userId);
  const run = (async (): Promise<InstagramTokenOutcome> => {
    if (inflight) {
      try {
        await inflight;
      } catch {
        /* executeMaintain / executeAuthInvalid do not reject */
      }
    }
    return executeAuthInvalid(userId, failedAccessToken);
  })();

  const promise = run.finally(() => {
    if (lifecycleLock.get(userId) === promise) {
      lifecycleLock.delete(userId);
    }
  });
  lifecycleLock.set(userId, promise);
  return promise;
}

async function executeMaintain(userId: string): Promise<InstagramTokenOutcome> {
  try {
    return await db.$transaction(
      async (tx): Promise<InstagramTokenOutcome> => {
        await lockInstagramOwner(tx, userId);
        const locked = await lockInstagramToken(tx, userId);
        if (!locked) return { ok: false, reason: "not_connected" };

        const action = decideInstagramTokenAction(
          {
            expiresAt: toDate(locked.expiresAt),
            updatedAt: toDate(locked.updatedAt),
          },
          Date.now(),
        );

        if (action === "return") {
          return { ok: true, accessToken: locked.accessToken };
        }

        if (action === "expired") {
          await clearInstagramConnection(tx, userId, locked.accessToken);
          return { ok: false, reason: "reauth_required" };
        }

        return refreshLockedToken(tx, userId, locked.accessToken);
      },
      { maxWait: 5_000, timeout: REFRESH_TX_TIMEOUT_MS },
    );
  } catch {
    console.warn("[instagram-token] lifecycle transaction failed");
    return { ok: false, reason: "temporary_failure", detail: "db_transaction_error" };
  }
}

async function executeAuthInvalid(
  userId: string,
  failedAccessToken: string | undefined,
): Promise<InstagramTokenOutcome> {
  try {
    return await db.$transaction(
      async (tx): Promise<InstagramTokenOutcome> => {
        await lockInstagramOwner(tx, userId);
        const locked = await lockInstagramToken(tx, userId);
        if (!locked) {
          await clearInstagramConnection(tx, userId);
          return { ok: false, reason: "reauth_required" };
        }

        if (typeof failedAccessToken !== "string" || failedAccessToken.length === 0) {
          return { ok: false, reason: "temporary_failure", detail: "failed_access_token_missing" };
        }
        if (locked.accessToken !== failedAccessToken) {
          return { ok: true, accessToken: locked.accessToken };
        }

        await clearInstagramConnection(tx, userId, failedAccessToken);
        return { ok: false, reason: "reauth_required" };
      },
      { maxWait: 5_000, timeout: REFRESH_TX_TIMEOUT_MS },
    );
  } catch {
    console.warn("[instagram-token] dead-auth transaction failed");
    return { ok: false, reason: "temporary_failure", detail: "db_transaction_error" };
  }
}

async function refreshLockedToken(
  tx: Prisma.TransactionClient,
  userId: string,
  accessToken: string,
): Promise<InstagramTokenOutcome> {
  const url = new URL(INSTAGRAM_REFRESH_ENDPOINT);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  let httpStatus: number;
  let body: unknown;

  try {
    // no-store: the URL contains the access token and must not enter the Next.js fetch cache.
    const res = await fetch(url, { cache: "no-store" });
    httpStatus = res.status;
    const text = await res.text();
    try {
      body = text.length > 0 ? parseInstagramJson(text) : null;
    } catch {
      return {
        ok: false,
        reason: "temporary_failure",
        detail: "unparseable_response",
      };
    }
  } catch {
    return { ok: false, reason: "temporary_failure", detail: "network_error" };
  }

  const errorCode = readInstagramGraphErrorCode(body);
  const kind = classifyInstagramGraphFailure({ errorCode, httpStatus });

  if (kind === "auth_invalid") {
    await clearInstagramConnection(tx, userId, accessToken);
    return { ok: false, reason: "reauth_required" };
  }

  if (kind === "temporary" || kind === "permission_denied" || !body) {
    return {
      ok: false,
      reason: "temporary_failure",
      detail: failureDetail(kind === "other" ? "temporary" : kind, httpStatus),
    };
  }

  const parsed = parseInstagramTokenResponse(body);
  // Success requires a new token and a positive expires_in. An incomplete body
  // must not be stored, and must not wipe a known expiresAt to null.
  if (
    httpStatus < 200 ||
    httpStatus >= 300 ||
    !parsed.accessToken ||
    parsed.expiresIn === null
  ) {
    return {
      ok: false,
      reason: "temporary_failure",
      detail: !parsed.accessToken
        ? "no_access_token_in_response"
        : parsed.expiresIn === null
          ? "invalid_expires_in"
          : `http_${httpStatus}`,
    };
  }

  const expiresAt = new Date(Date.now() + parsed.expiresIn * 1_000);
  if (Number.isNaN(expiresAt.getTime())) {
    return {
      ok: false,
      reason: "temporary_failure",
      detail: "invalid_expires_in",
    };
  }
  const nextScopes = scopesFromPermissions(parsed.permissions);

  await tx.platformToken.update({
    where: { userId_platform: { userId, platform: "instagram" } },
    data: {
      accessToken: parsed.accessToken,
      refreshToken: null,
      expiresAt,
      ...(nextScopes !== null ? { scopes: nextScopes } : {}),
      updatedAt: new Date(),
    },
  });

  return { ok: true, accessToken: parsed.accessToken };
}
