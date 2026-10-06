/**
 * lib/tiktok-token.ts
 *
 * Server-only module for TikTok token lifecycle management.
 *
 * This file accesses the database directly, uses TIKTOK_CLIENT_SECRET, and
 * stores/reads raw access and refresh tokens. It MUST NOT enter a client bundle.
 * The `import "server-only"` below makes Next.js throw a build-time error if
 * this module is ever imported from a client component or page.
 *
 * Public API:
 *   saveTikTokToken(userId, data)     — persist a token response with safe-preserve rules
 *   getTikTokAccessToken(userId)      — returns a usable token, refreshing proactively
 *   tiktokFetch(userId, url, init?)   — authenticated TikTok API helper with one-retry logic
 *
 * Cross-process serialization:
 *   All mutations to the TikTok PlatformToken row go through an interactive
 *   PostgreSQL transaction that acquires a SELECT … FOR UPDATE row-level lock.
 *   This prevents two Railway / Node instances from simultaneously racing on the
 *   same user's refresh token.  Within a single process, an in-memory Promise
 *   lock prevents duplicate in-flight provider requests.
 */

import "server-only";

import { db } from "@/lib/db";

// ── Constants ──────────────────────────────────────────────────────────────────

const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

/**
 * Proactive refresh window — refresh when the token expires within 10 minutes.
 * Also refreshes when expiresAt is null (expiry unknown).
 */
const REFRESH_WINDOW_MS = 10 * 60 * 1_000;

/**
 * Maximum time (ms) for the interactive transaction that serialises the TikTok
 * token refresh.  This budget covers:
 *   1. Waiting for any concurrent process to release the row lock.
 *   2. The TikTok HTTPS refresh call (~1–3 s typical, up to ~10 s under load).
 *   3. The subsequent DB write or atomic cleanup.
 *
 * If exceeded, Prisma rolls back; we return temporary_failure.
 * 30 s is deliberately generous to avoid spurious timeouts under load spikes
 * while still bounding worst-case lock hold time.
 */
const REFRESH_TX_TIMEOUT_MS = 30_000;

/**
 * Maximum time (ms) for the interactive transaction inside saveTikTokToken.
 * No external HTTP call occurs inside this transaction; 15 s is ample.
 */
const SAVE_TX_TIMEOUT_MS = 15_000;

// ── Public result types ────────────────────────────────────────────────────────

/**
 * Result of getTikTokAccessToken().
 *
 *  ok              — accessToken is usable
 *  not_connected   — no PlatformToken row exists for this user
 *  reauth_required — authorization is CONFIRMED DEAD: the PlatformToken was
 *                    atomically removed (invalid_grant returned for the locked
 *                    refresh token, OR refreshToken was null).  The user must
 *                    re-authorize.  NOT returned for open_id mismatch, failed
 *                    cleanup, or transient access_token_invalid.
 *  temporary_failure — transient error (network, 5xx, rate-limit, scope issue,
 *                    open_id mismatch, access_token_invalid after retry, DB
 *                    transaction error); PlatformToken is preserved in every case.
 *  configuration_error — missing env vars or invalid_client; token preserved
 */
export type TikTokTokenOutcome =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "not_connected" }
  | { ok: false; reason: "reauth_required" }
  | { ok: false; reason: "temporary_failure"; detail?: string }
  | { ok: false; reason: "configuration_error" };

/**
 * Result of tiktokFetch().
 *
 * Same reason codes as TikTokTokenOutcome plus typed response data on success.
 * Access tokens are never serialized into this return value.
 */
export type TikTokApiOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_connected" }
  | { ok: false; reason: "reauth_required" }
  | { ok: false; reason: "temporary_failure"; detail?: string }
  | { ok: false; reason: "configuration_error" };

// ── Internal types ─────────────────────────────────────────────────────────────

interface TikTokRefreshResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * Extended internal result for performTikTokRequest.
 * "_access_token_invalid" is a sentinel only used inside tiktokFetch — never returned externally.
 */
type RawRequestResult<T> =
  | TikTokApiOutcome<T>
  | { ok: false; reason: "_access_token_invalid" };

/**
 * Minimal columns selected by the SELECT … FOR UPDATE lock query.
 * Column names match the PlatformToken Prisma model (no @map directives on any field).
 * With PrismaPg, PostgreSQL TIMESTAMPTZ columns are returned as JavaScript Date objects.
 */
interface LockedTokenRow {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
  platformUserId: string | null;
}

// ── In-process promise lock ────────────────────────────────────────────────────

/**
 * Keyed by Duolync userId (NOT TikTok open_id).
 *
 * If two requests in the same Node.js process need to refresh the same user's
 * token simultaneously, exactly ONE provider refresh executes; the second caller
 * awaits the same Promise.  This avoids holding two concurrent DB transactions
 * open against the same row from within a single process.
 */
const refreshLock = new Map<string, Promise<TikTokTokenOutcome>>();

/**
 * Options passed to acquireRefreshLock / executeRefresh.
 *
 * Used only on the forced path triggered by tiktokFetch when TikTok explicitly
 * rejects the current access token with access_token_invalid.
 *
 *   force — bypass the expiresAt freshness shortcut; proceed with a provider
 *           refresh even when expiresAt is far in the future.
 *
 *   expectedFailedAccessToken — the access token that TikTok rejected.
 *           Compared to the locked DB row's accessToken inside the transaction:
 *           if they differ, another process/reconnect already stored a newer
 *           token and we return it directly without a duplicate provider call.
 *
 * Neither field is part of the public API; they are internal to this module.
 */
interface RefreshOptions {
  force?: boolean;
  expectedFailedAccessToken?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// saveTikTokToken
// ─────────────────────────────────────────────────────────────────────────────

export interface TikTokTokenSaveData {
  /** New access token returned by TikTok (required) */
  accessToken: string;
  /**
   * New refresh token from TikTok.
   * When null / undefined / empty: the existing stored value is preserved.
   */
  refreshToken?: string | null;
  /**
   * Seconds until the access token expires (used to compute expiresAt).
   * When null / undefined: expiresAt is stored as null.
   */
  expiresIn?: number | null;
  /**
   * Granted scopes string (comma-separated).
   * When null / undefined / empty: existing scopes are preserved.
   */
  scope?: string | null;
  /**
   * TikTok open_id for this user.
   * When null / undefined / empty: existing platformUserId is preserved.
   */
  openId?: string | null;
  /**
   * TikTok @handle.
   * Pass undefined to leave the stored value unchanged.
   * Pass null to explicitly clear it.
   */
  username?: string | null;
}

/**
 * Centralised TikTok token persistence with safe-preserve rules.
 *
 * Preserve rules:
 *  - accessToken  → always replaced with the new value
 *  - expiresAt    → calculated from expiresIn; stored as null when omitted
 *  - refreshToken → replaced only when a non-empty string is provided;
 *                   existing value preserved otherwise
 *  - scopes       → replaced only when a non-empty string is provided;
 *                   existing value preserved otherwise
 *  - platformUserId (open_id) → replaced only when a non-empty string is
 *                   provided; existing value preserved otherwise
 *
 * Cross-process serialization:
 *   Acquires a SELECT … FOR UPDATE row-level lock on the existing TikTok
 *   PlatformToken row (if any) before writing.  If a concurrent refresh
 *   transaction holds the lock, this function waits until that transaction
 *   commits before proceeding.  This prevents an OAuth reconnect from racing
 *   a concurrent refresh and vice-versa.
 *
 *   When no row exists (first connection), SELECT … FOR UPDATE returns [] and
 *   the subsequent upsert performs a clean INSERT without any lock contention.
 */
export async function saveTikTokToken(
  userId: string,
  data: TikTokTokenSaveData,
): Promise<void> {
  const expiresAt =
    typeof data.expiresIn === "number" && data.expiresIn > 0
      ? new Date(Date.now() + data.expiresIn * 1_000)
      : null;

  await db.$transaction(
    async (tx) => {
      // ── Row-level lock ───────────────────────────────────────────────────
      // Serialises against any concurrent refresh transaction on the same row.
      // If no row exists (first OAuth connect), returns [] — no lock contention.
      const rows = await tx.$queryRaw<LockedTokenRow[]>`
        SELECT "id", "accessToken", "refreshToken", "expiresAt", "scopes", "platformUserId"
        FROM "PlatformToken"
        WHERE "userId" = ${userId} AND "platform" = 'tiktok'
        FOR UPDATE
      `;
      const existing = rows[0] ?? null;

      // ── Apply preserve rules using the locked (current) row values ───────

      // refreshToken: replace when non-empty, preserve otherwise
      const effectiveRefreshToken =
        typeof data.refreshToken === "string" && data.refreshToken.length > 0
          ? data.refreshToken
          : (existing?.refreshToken ?? null);

      // scopes: replace when non-empty, preserve otherwise
      const effectiveScopes =
        typeof data.scope === "string" && data.scope.trim().length > 0
          ? data.scope
          : (existing?.scopes ?? null);

      // open_id: replace when non-empty, preserve otherwise
      const effectiveOpenId =
        typeof data.openId === "string" && data.openId.length > 0
          ? data.openId
          : (existing?.platformUserId ?? null);

      // ── Atomic upsert ────────────────────────────────────────────────────
      await tx.platformToken.upsert({
        where: { userId_platform: { userId, platform: "tiktok" } },
        create: {
          userId,
          platform: "tiktok",
          accessToken: data.accessToken,
          refreshToken: effectiveRefreshToken,
          expiresAt,
          scopes: effectiveScopes,
          platformUserId: effectiveOpenId,
          username: data.username ?? null,
        },
        update: {
          accessToken: data.accessToken,
          refreshToken: effectiveRefreshToken,
          expiresAt,
          scopes: effectiveScopes,
          platformUserId: effectiveOpenId,
          // Only update username when explicitly provided
          ...(data.username !== undefined ? { username: data.username } : {}),
          updatedAt: new Date(),
        },
      });
    },
    { maxWait: 5_000, timeout: SAVE_TX_TIMEOUT_MS },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// getTikTokAccessToken
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a usable TikTok access token for the given Duolync userId.
 *
 * Fast path:
 *   When expiresAt is set and at least REFRESH_WINDOW_MS remain, returns the
 *   stored access token immediately without any provider call or transaction.
 *
 * Refresh path:
 *   When expiresAt is null (unknown expiry) or within the 10-minute window,
 *   enters the cross-process-safe refresh flow:
 *
 *     1. In-process Promise lock — concurrent callers within the same Node.js
 *        process share a single in-flight refresh Promise.
 *     2. PostgreSQL row-level lock (SELECT … FOR UPDATE) — serialises across
 *        Railway / Node instances so only one process calls TikTok at a time.
 *     3. Re-evaluation inside the lock — if another process already refreshed
 *        while we waited, we return its result without a duplicate provider call.
 */
export async function getTikTokAccessToken(
  userId: string,
): Promise<TikTokTokenOutcome> {
  const stored = await db.platformToken.findUnique({
    where: { userId_platform: { userId, platform: "tiktok" } },
  });

  if (!stored) return { ok: false, reason: "not_connected" };

  const needsRefresh =
    !stored.expiresAt ||
    stored.expiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;

  if (!needsRefresh) {
    // Token is healthy — return immediately without any provider call or lock
    return { ok: true, accessToken: stored.accessToken };
  }

  return acquireRefreshLock(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// In-process lock management
// ─────────────────────────────────────────────────────────────────────────────

function acquireRefreshLock(
  userId: string,
  options: RefreshOptions = {},
): Promise<TikTokTokenOutcome> {
  const inflight = refreshLock.get(userId);

  if (!options.force) {
    // Normal path: share any existing in-flight refresh — do NOT fire a second
    // provider request from the same process.
    if (inflight) return inflight;

    const promise = executeRefresh(userId, {}).finally(() => {
      // Only delete our own entry — avoids a race where a new refresh starts
      // between the time our refresh completes and the finally() runs.
      if (refreshLock.get(userId) === promise) {
        refreshLock.delete(userId);
      }
    });
    refreshLock.set(userId, promise);
    return promise;
  }

  // ── Forced path (access_token_invalid recovery) ───────────────────────────
  //
  // We CANNOT simply join a non-forced in-flight promise: it may resolve with
  // the same rejected token (if executeRefresh saw stillNeedsRefresh=false and
  // returned the cached row without calling TikTok).
  //
  // Strategy:
  //  1. Capture any existing in-flight promise NOW (synchronously).
  //  2. Register our forced promise in refreshLock immediately, replacing the
  //     old entry.  The old promise's finally() guard will see the new entry
  //     and will NOT delete the lock prematurely.
  //  3. Inside the async body: await the old in-flight work (if any) to avoid
  //     two concurrent DB transactions on the same row.
  //  4. Call executeRefresh with force=true.  Inside the locked transaction,
  //     executeRefresh compares the stored accessToken to the failed token and
  //     either returns a newer token or performs a forced provider call.
  //
  // This keeps the per-user single-Promise invariant: any subsequent caller
  // (forced or normal) that arrives while our forced promise is running joins
  // it via the lock map.
  const forcedWork = (async (): Promise<TikTokTokenOutcome> => {
    if (inflight) {
      // Await the existing in-flight refresh before starting a new DB
      // transaction.  Ignore its result — the authoritative check is the
      // locked row comparison inside executeRefresh.
      try {
        await inflight;
      } catch {
        /* executeRefresh has its own try/catch and never rejects */
      }
    }
    return executeRefresh(userId, options);
  })();

  const promise = forcedWork.finally(() => {
    if (refreshLock.get(userId) === promise) {
      refreshLock.delete(userId);
    }
  });
  refreshLock.set(userId, promise);
  return promise;
}

// ─────────────────────────────────────────────────────────────────────────────
// executeRefresh  — cross-process-safe provider call inside a row-locked transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Performs the TikTok token refresh inside a PostgreSQL interactive transaction
 * that holds a SELECT … FOR UPDATE lock on the TikTok PlatformToken row.
 *
 * Cross-process safety proof:
 *
 *   Only the process holding the row lock can read the current refresh token,
 *   call TikTok with it, and write the result.  A second process (on another
 *   Railway instance) cannot acquire the lock until the first commits.  When
 *   the second process finally gets the lock it re-reads the row:
 *
 *   • First process wrote R2 → second sees fresh expiry → returns R2 without
 *     a duplicate provider call.
 *
 *   • First process confirmed invalid_grant and deleted R1 atomically with the
 *     connectedPlatforms cleanup → second sees no row → returns not_connected.
 *
 *   In neither case can the second process act on a stale R1 snapshot.
 *
 * Transaction failure handling:
 *   On timeout, deadlock, or DB error, Prisma rolls back.  The PlatformToken
 *   row is intact and we return temporary_failure.
 *
 * What is NEVER deleted:
 *   - PlatformStats rows  (historical OFFICIAL_API data)
 *   - SocialPost rows     (historical video data)
 *
 * Does NOT call the TikTok revoke endpoint.
 * Does NOT use removePlatformAction (it deletes historical data).
 */
async function executeRefresh(
  userId: string,
  options: RefreshOptions = {},
): Promise<TikTokTokenOutcome> {
  const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return { ok: false, reason: "configuration_error" };
  }

  try {
    return await db.$transaction(
      async (tx): Promise<TikTokTokenOutcome> => {
        // ── Step 1: Acquire row-level lock ─────────────────────────────────
        //
        // SELECT … FOR UPDATE blocks until any concurrent transaction on this
        // row commits or rolls back.  Once acquired, no other process can
        // mutate this row until we commit.
        const rows = await tx.$queryRaw<LockedTokenRow[]>`
          SELECT "id", "accessToken", "refreshToken", "expiresAt", "scopes", "platformUserId"
          FROM "PlatformToken"
          WHERE "userId" = ${userId} AND "platform" = 'tiktok'
          FOR UPDATE
        `;
        const row = rows[0] ?? null;

        if (!row) {
          // Row was deleted by a concurrent disconnect or cleanup path while
          // we were waiting for the lock.
          return { ok: false, reason: "not_connected" };
        }

        // ── Step 2: Decide whether to proceed with a provider call ─────────
        //
        // FORCED path (options.force === true):
        //   TikTok explicitly rejected the access token that was in use.
        //   Compare the locked row's accessToken to the token that failed:
        //
        //   • If they DIFFER → another process/reconnect already stored a
        //     newer token while we were waiting for the lock.  Return it
        //     directly without an additional provider call.
        //
        //   • If they are the SAME → the failed token is still current.
        //     Fall through and force the TikTok refresh, IGNORING the
        //     expiresAt window.  TikTok's explicit rejection is authoritative
        //     evidence that expiresAt alone is not reliable.
        //
        // NORMAL path (options.force !== true):
        //   Another process may have refreshed while we waited for the lock.
        //   Re-reading from the locked row gives the current ground truth.
        if (options.force && options.expectedFailedAccessToken !== undefined) {
          if (row.accessToken !== options.expectedFailedAccessToken) {
            // A newer token is already in the DB — return it without a
            // duplicate provider call.
            return { ok: true, accessToken: row.accessToken };
          }
          // Same token still stored → fall through and force the refresh.
          // The expiresAt freshness check is intentionally skipped here.
        } else {
          const stillNeedsRefresh =
            !row.expiresAt ||
            row.expiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;

          if (!stillNeedsRefresh) {
            // A concurrent process already refreshed — return its token directly
            // without making another provider call.
            return { ok: true, accessToken: row.accessToken };
          }
        }

        // ── Step 3: Handle missing refresh token (Scenario F) ─────────────
        //
        // A stored row with refreshToken=null cannot be refreshed.  Leaving it
        // in place would cause every subsequent call to reach this branch and
        // return reauth_required without cleanup.  Instead we atomically remove
        // the unusable connection while the lock is held.
        if (!row.refreshToken) {
          // Both statements in the same transaction — either both commit or
          // both roll back (Scenario E applies here too).
          await tx.platformToken.delete({
            where: { userId_platform: { userId, platform: "tiktok" } },
          });
          await tx.$executeRaw`
            UPDATE "CreatorProfile"
            SET    "connectedPlatforms" = array_remove("connectedPlatforms", 'tiktok')
            WHERE  "userId" = ${userId}
          `;
          // reauth_required is only returned after the cleanup transaction
          // commits.  If the transaction rolls back, the catch block returns
          // temporary_failure instead — never falsely reporting cleanup success.
          return { ok: false, reason: "reauth_required" };
        }

        // ── Step 4: Call TikTok refresh endpoint (lock is held) ───────────
        //
        // No other process can mutate this row while we await the HTTP response.
        // If the call throws (network error, parse error), we return without any
        // DB writes; the transaction commits as a no-op and the row is intact.
        let json: TikTokRefreshResponse;
        let httpStatus: number;

        try {
          const body = new URLSearchParams({
            grant_type: "refresh_token",
            client_key: clientKey,
            client_secret: clientSecret,
            refresh_token: row.refreshToken,
          });
          const res = await fetch(TIKTOK_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
          });
          httpStatus = res.status;
          // Never log the response body — it contains token values
          json = (await res.json()) as TikTokRefreshResponse;
        } catch {
          // Network / parse failure — preserve connection, no DB writes
          return {
            ok: false,
            reason: "temporary_failure",
            detail: "network_error",
          };
        }

        // ── Step 5: Handle provider-level errors ───────────────────────────

        if (json.error) {
          const err = json.error;

          // Temporary / server-side failures — MUST NOT delete the PlatformToken
          if (
            err === "server_error" ||
            err === "temporarily_unavailable" ||
            httpStatus === 429 ||
            httpStatus >= 500
          ) {
            return { ok: false, reason: "temporary_failure", detail: err };
          }

          // Configuration / credential failure — not the user's fault
          if (err === "invalid_client") {
            return { ok: false, reason: "configuration_error" };
          }

          // Scope issue — preserve connection
          if (err === "scope_not_authorized") {
            return {
              ok: false,
              reason: "temporary_failure",
              detail: "scope_not_authorized",
            };
          }

          // Confirmed dead authorization — atomic cleanup inside this transaction
          if (err === "invalid_grant") {
            // ── Step 5a: Atomic invalid_grant cleanup (Scenarios B, C, E) ──
            //
            // Both operations are inside the SAME transaction:
            //   1. Delete the TikTok PlatformToken
            //   2. Remove "tiktok" from CreatorProfile.connectedPlatforms via
            //      PostgreSQL array_remove (atomic, idempotent, user-scoped,
            //      parameterised — never touches other platforms)
            //
            // Either both succeed and commit together, or both roll back.
            // There is no state where the token is deleted but connectedPlatforms
            // still lists "tiktok", or vice-versa.
            //
            // The lock also guarantees Scenario B is impossible: A concurrent
            // process that called TikTok and received a successful R2 could not
            // have done so — it was waiting on this lock.  Only the process
            // holding the lock calls TikTok; it received invalid_grant for the
            // currently stored refresh token, so no valid R2 exists.
            await tx.platformToken.delete({
              where: { userId_platform: { userId, platform: "tiktok" } },
            });
            await tx.$executeRaw`
              UPDATE "CreatorProfile"
              SET    "connectedPlatforms" = array_remove("connectedPlatforms", 'tiktok')
              WHERE  "userId" = ${userId}
            `;
            return { ok: false, reason: "reauth_required" };
          }

          // Unknown error code — treat as temporary to be conservative
          return { ok: false, reason: "temporary_failure", detail: err };
        }

        // HTTP server errors with no JSON error field
        if (httpStatus >= 500 || httpStatus === 429) {
          return {
            ok: false,
            reason: "temporary_failure",
            detail: `http_${httpStatus}`,
          };
        }

        // Unexpected: no error but also no access_token
        if (!json.access_token) {
          return {
            ok: false,
            reason: "temporary_failure",
            detail: "no_access_token_in_response",
          };
        }

        // ── Step 6: open_id consistency check ─────────────────────────────
        if (
          json.open_id &&
          row.platformUserId &&
          json.open_id !== row.platformUserId
        ) {
          // Identity mismatch — do NOT save mismatched tokens; preserve existing.
          console.warn(
            "[tiktok-token] open_id mismatch during token refresh — discarding new tokens, preserving existing connection",
          );
          return {
            ok: false,
            reason: "temporary_failure",
            detail: "open_id_mismatch",
          };
        }

        const newAccessToken = json.access_token;

        // refreshToken: use new value when present and non-empty; preserve otherwise
        const newRefreshToken =
          typeof json.refresh_token === "string" && json.refresh_token.length > 0
            ? json.refresh_token
            : null;

        const newExpiresAt =
          typeof json.expires_in === "number" && json.expires_in > 0
            ? new Date(Date.now() + json.expires_in * 1_000)
            : null;

        // scopes: use new value when present; null means preserve
        const newScopes =
          typeof json.scope === "string" && json.scope.trim().length > 0
            ? json.scope
            : null;

        // ── Step 7: Persist successful refresh ────────────────────────────
        //
        // The row lock guarantees we are the sole writer at this moment.
        // A simple UPDATE (no refreshToken condition) is safe; the conditional
        // updateMany guard from the previous implementation is no longer needed
        // because the lock prevents any concurrent mutation.
        await tx.platformToken.update({
          where: { userId_platform: { userId, platform: "tiktok" } },
          data: {
            accessToken: newAccessToken,
            // Only write refreshToken when TikTok returned a new one.
            // When omitted, the existing value is preserved by NOT including it.
            ...(newRefreshToken !== null ? { refreshToken: newRefreshToken } : {}),
            expiresAt: newExpiresAt,
            // Preserve existing scopes when TikTok omits the scope field
            ...(newScopes !== null ? { scopes: newScopes } : {}),
            updatedAt: new Date(),
          },
        });

        return { ok: true, accessToken: newAccessToken };
      },
      { maxWait: 5_000, timeout: REFRESH_TX_TIMEOUT_MS },
    );
  } catch {
    // Transaction timed out, DB connection lost, or deadlock detected.
    // Prisma rolled back — the PlatformToken row is intact.
    console.warn(
      "[tiktok-token] refresh transaction failed (timeout or DB error)",
    );
    return {
      ok: false,
      reason: "temporary_failure",
      detail: "db_transaction_error",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// tiktokFetch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reusable authenticated TikTok API request helper.
 *
 * Behavior:
 *  1. Obtains a usable access token via getTikTokAccessToken() (with proactive refresh).
 *  2. Makes the API call with the Authorization header.
 *  3. On access_token_invalid: performs exactly ONE token refresh and retries ONCE.
 *  4. Never retries more than once — returns temporary_failure on a second invalid
 *     response (the connection is preserved; a subsequent caller may succeed once
 *     the token propagates on TikTok's side).
 *
 * Does NOT retry on scope_not_authorized.
 * Does NOT expose access tokens in its return value.
 *
 * NOTE — request body replay:
 *   init.body is replayed as-is on the single retry. This is safe for replayable
 *   bodies (e.g. JSON strings, URLSearchParams). Do NOT pass a one-shot ReadableStream
 *   as the body — it cannot be replayed and the retry will silently send an empty body.
 *
 * @param userId  Duolync user ID
 * @param url     Full TikTok API URL (with query params as needed)
 * @param init    Optional fetch RequestInit (method, body, headers, etc.)
 */
export async function tiktokFetch<T>(
  userId: string,
  url: string,
  init?: RequestInit,
): Promise<TikTokApiOutcome<T>> {
  const tokenResult = await getTikTokAccessToken(userId);
  if (!tokenResult.ok) return tokenResult;

  const { accessToken } = tokenResult;

  const firstResult = await performTikTokRequest<T>(accessToken, url, init);

  if (firstResult.ok) return firstResult;

  // On access_token_invalid: force a token refresh and retry exactly once.
  //
  // acquireRefreshLock({ force: true, expectedFailedAccessToken }) handles all
  // sub-cases safely under the existing per-user Promise lock and DB row lock:
  //
  //  • If another process or a concurrent same-process refresh already stored a
  //    newer token, the locked DB comparison returns it without a second TikTok
  //    call (Scenarios B, C, D).
  //  • If the failed token is still in the DB, the expiresAt window is bypassed
  //    and a forced provider refresh is performed (Scenario A).
  //  • Any existing in-flight normal refresh is awaited first to avoid two
  //    concurrent DB transactions on the same row (Scenario D).
  if (firstResult.reason === "_access_token_invalid") {
    const refreshResult = await acquireRefreshLock(userId, {
      force: true,
      expectedFailedAccessToken: accessToken,
    });
    if (!refreshResult.ok) return refreshResult;

    // Single retry — never retry again even if the response is still invalid.
    const retryResult = await performTikTokRequest<T>(
      refreshResult.accessToken,
      url,
      init,
    );
    if (retryResult.ok) return retryResult;
    if (retryResult.reason === "_access_token_invalid") {
      // Token still invalid after a fresh refresh.  The connection is NOT proven
      // dead (no invalid_grant was returned).  Return temporary_failure so the
      // PlatformToken is preserved and a future request may succeed once the
      // token propagates on TikTok's side.
      return {
        ok: false,
        reason: "temporary_failure",
        detail: "access_token_invalid",
      };
    }
    // Other failure on retry
    return retryResult;
  }

  // All other failures from the first attempt — return as-is
  return firstResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// performTikTokRequest  (internal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Low-level TikTok API request. Injects the Authorization header.
 * Returns a RawRequestResult that may include the internal "_access_token_invalid"
 * sentinel — callers must handle this before returning to external code.
 *
 * Never called directly by external code — use tiktokFetch instead.
 */
async function performTikTokRequest<T>(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<RawRequestResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return { ok: false, reason: "temporary_failure", detail: "network_error" };
  }

  // HTTP-level errors
  if (!res.ok) {
    if (res.status >= 500) {
      return {
        ok: false,
        reason: "temporary_failure",
        detail: `http_${res.status}`,
      };
    }

    // Parse the error body to detect known error codes
    let errorCode: string | undefined;
    try {
      type ErrorBody =
        | { error?: { code?: string } }
        | { error?: string };
      const body = (await res.json()) as ErrorBody;
      errorCode =
        (body as { error?: { code?: string } }).error?.code ??
        (body as { error?: string }).error;
    } catch {
      /* unparseable body — errorCode stays undefined */
    }

    if (errorCode === "access_token_invalid") {
      return { ok: false, reason: "_access_token_invalid" };
    }
    if (errorCode === "scope_not_authorized") {
      // Do NOT retry on scope issues
      return {
        ok: false,
        reason: "temporary_failure",
        detail: "scope_not_authorized",
      };
    }
    return {
      ok: false,
      reason: "temporary_failure",
      detail: errorCode ?? `http_${res.status}`,
    };
  }

  // Parse the successful (2xx) response body
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "temporary_failure", detail: "parse_error" };
  }

  // TikTok can signal errors inside a 2xx response
  const typed = body as {
    error?: { code?: string; message?: string };
  };
  const apiErrorCode = typed?.error?.code;

  if (apiErrorCode && apiErrorCode !== "ok") {
    if (apiErrorCode === "access_token_invalid") {
      return { ok: false, reason: "_access_token_invalid" };
    }
    if (apiErrorCode === "scope_not_authorized") {
      return {
        ok: false,
        reason: "temporary_failure",
        detail: "scope_not_authorized",
      };
    }
    return { ok: false, reason: "temporary_failure", detail: apiErrorCode };
  }

  return { ok: true, data: body as T };
}
