# YouTube Pass 3B-3 operations

This is an operator runbook, not deployment automation. Cron remains disabled.
No production operation is authorized by this document alone.

## One-shot runtime and health

Railway start command: `pnpm youtube:maintenance`.
The package command expands to
`node --conditions=react-server --import tsx scripts/youtube-maintenance.ts`.
Use the repository root, its supported Node runtime (currently Node 22), pnpm
10.26.2, generated Prisma client, and installed dependencies including `tsx`
and `dotenv` (declared as runtime dependencies). A production image must retain
these dependencies and the scripts/lib sources;
Next's standalone output alone does not contain this tooling. Generate Prisma
at image build time with `pnpm prisma generate`; no server needs to be running.
Do not use `pnpm start`, a request endpoint, or a persistent worker loop.

Required environment: `DATABASE_URL` (PostgreSQL database URL),
`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`. The dedicated YouTube client must
match the current connection lifecycle. No login `GOOGLE_CLIENT_*`, browser
`NEXT_PUBLIC_*`, Better Auth secret, redirect URL, API key, request or session is
required by this runner. Those remain application configuration requirements.
Environment loads before pool initialization; startup rejects missing/invalid
configuration and never prints its values. Inventory and backfill need only
`DATABASE_URL`. SSL behavior matches the existing shared pool; local disposable
tests use `sslmode=disable`. Use the deployment's intended verified DB target.

| Maintenance variable suffix (`YOUTUBE_MAINTENANCE_`) | Default | Allowed integers |
| --- | ---: | ---: |
| BATCH_SIZE | 50 | 1–100 |
| CONCURRENCY | 3 | 1–10 |
| ITEM_LIMIT | 200 | 1–10000 |
| RUN_LIMIT_MS | 300000 | 1–3600000 |
| LEASE_MS | 300000 | 1000–3600000 |
| QUOTA_BUDGET | 100 | 0–1000000 |

Parsing is centralized in `lib/youtube-maintenance-config.ts`. Empty, negative,
fractional, nonfinite, unsafe, exponent and hexadecimal strings fail startup.
Retries are persisted for a later invocation: temporary failures use 1–3 days,
quota exhaustion 2 days and item configuration failure 3 days, always capped at
the deletion deadline. There is no in-process retry loop or unbounded API
pagination. Each wave claims at most min(batch size, concurrency, remaining
item limit); each official sync fetches at most 50 recent and 200 curated videos.
The item limit is an attempt cap, including superseded/error attempts; a large
backlog is deliberately left for later runs.

The soft time limit stops further waves, then finishes in-flight work. Each HTTP
request has a 10-second timeout and write transactions have bounded wait/time.
The standalone process has a hard deadline at RUN_LIMIT_MS + 120000, including
initialization, final work and shutdown (7 minutes with defaults). Hard timeout
exits 1 immediately; no successful summary is promised on timeout. In-flight DB
transactions roll back on disconnect and abandoned leases recover at expiry.
Normal completion clears the timer and closes Prisma and its external pool.
Only one-shot operations own this shutdown; the Next.js server does not call it.

Exit 0 means the bounded batch completed, including an empty batch or persisted
item failures (provider, authorization loss, quota or item configuration).
Exit 1 means invalid startup config, initialization/DB/selection failure, fatal
orchestration, an item failure that could not be persisted, shutdown failure or
hard timeout. Do not interpret SUCCESS=0 alone as a failed invocation. An idle
pool error uses a fixed redacted message; operations errors never log exceptions.

The single completion JSON contains startedAt/finishedAt, selected/processed,
fixed outcome counts, quotaUsed/quotaBudget and itemErrors. Selected is the
number of claimed attempts, not unique creators; normal batches finish every
selected attempt. No tokens, secrets, identities or provider response bodies are
logged. Durable compliance rows are authoritative if the process dies before
logging. Use inventory to reconcile rather than inventing outcomes.

## Read-only inventory and monitoring

`pnpm youtube:inventory` emits aggregate counts, with counts encoded as decimal
strings to preserve PostgreSQL bigint precision. It uses a repeatable-read,
read-only transaction, per-statement timeout and rollback, and closes its own
pool. It reports token/stats/posts/curation counts, relevant imported/claimed
owners, lower-source totals and lower-source rows under blocked/PURGED owners.
Relevant ownership includes links, connected platforms and YouTube dataset,
token or curation evidence. It never selects tokens or provider payloads.

Before schema installation it reports `complianceTablePresent: false`, and
compliance/outcome data as null; missing compliance metrics are unknown, not zero.
After installation it reports ACTIVE/PURGED, ACTIVE-without-token,
token-without-state, due soon (next 24 hours), overdue (attempt or deadline),
deadline overdue, approaching deadline (next 3 days), leases, active/expired
leases and last-outcome distribution for attempts in the last 7 days. These
outcomes are each owner's latest persisted result, not a complete run history.
All lease counts include any status for diagnosing anomalous retained leases.
Overdue includes blocked ACTIVE rows for operational visibility even though
selection excludes them. Investigate growing overdue/deadline counts, expired
leases, missing-state rows, configuration failures and nonzero runner exits.
Use a read-only DB role for inventory when available.

## Exact production rollout order (manual, not executed by this pass)

1. Confirm production DB target in the intended Railway environment without
   printing credentials. Keep automatic deployments paused and Cron disabled
   until the relevant gates are satisfied; do not point tests at this target.
2. Confirm a current backup and a tested restore path, owner and restore window.
3. Run `pnpm youtube:inventory` READ ONLY from an operations checkout/image.
   This supports the pre-compliance schema without starting application code.
4. Run `pnpm prisma migrate status`; review pending migrations and schema drift.
   Do not resolve or deploy unrelated pending migrations without reviewing them.
5. Apply the approved schema migration using `pnpm prisma migrate deploy` BEFORE
   deploying application code that reads compliance state. The expected additive
   migration is `20261010000000_youtube_compliance_state`; Prisma deploy applies
   all pending migrations, so step 4 is a gate, not a formality.
6. Verify the table, enums and indexes against that migration. Read-only SQL:
   `SELECT to_regclass('"YouTubeComplianceState"');`
   `SELECT typname FROM pg_type WHERE typname IN ('YouTubeComplianceStatus', 'YouTubeMaintenanceOutcome', 'YouTubeRemovalReason');`
   `SELECT indexname FROM pg_indexes WHERE tablename = 'YouTubeComplianceState';`
   Verify the primary key and status/nextAttemptAt, status/deleteByAt and
   leaseExpiresAt indexes. Re-run migrate status to confirm no pending migration.
7. Deploy the application and operations code with Cron still disabled.
8. Run `pnpm youtube:backfill:plan` (DRY RUN). Direct invocation without a flag
   also defaults to plan. Unknown or conflicting flags fail closed.
9. Inspect aggregate KEEP/ACTIVE/PURGE/SKIP results. Existing state, including
   PURGED and current generation/revision, is always KEEP. Token-only rows with
   no official history are SKIP and require the existing reconnect flow.
10. Only after explicit operator approval, run `pnpm youtube:backfill:apply`.
    `--apply` must be the sole explicit flag. Apply uses owner locks; another
    apply/reconnect is rechecked before removal. Initialized rows are not reset,
    and PURGED is not reactivated. Repeat apply is idempotent through KEEP.
11. Re-run `pnpm youtube:inventory` and reconcile aggregates with the plan.
    Investigate token-without-state and ACTIVE-without-token counts; do not
    manufacture freshness to silence reconciliation gaps.
12. Run ONE bounded manual `pnpm youtube:maintenance`, with reviewed item/time
    and quota limits. For the first run a smaller item limit is appropriate.
13. Inspect exit code, aggregate outcomes, and post-run inventory/deadlines.
    Confirm project quota and capacity gates below.
14. Only then manually configure a separate Railway Cron service with the start
    command above and intended schedule `0 3 * * *` (once daily, 03:00 UTC).
    Set restart behavior so failed jobs do not immediately retry indefinitely.
15. Monitor the first scheduled runs and reconcile durable counts. Disable Cron
    if nonzero exits or deadline backlog persist; resolve capacity/config first.

Railway evaluates Cron schedules in UTC and expects the process to exit; it
skips a scheduled invocation if its previous execution is still running.
[Railway Cron documentation](https://docs.railway.com/cron-jobs).
Daily invocation selects only due/overdue ACTIVE rows, not every connection.
Two accidentally overlapping invocations remain safe through per-owner leases,
owner locks and generation/revision/credential fences. Deadline cleanup may
supersede an ordinary HTTP lease, but a live deadline cleanup lease cannot be
stolen. A stale worker cannot commit or repeat destructive work. No global
scheduler lock or new heartbeat table is needed. Budgets are per-process, so
allow headroom for accidental overlapping runs; quota is not globally pooled.

## Quota preflight before enabling Cron

Confirm the actual production Google project's YouTube Data API quota and other
traffic in Google Cloud Console; do not assume its allocation. Verify API
enablement, dedicated client config, and available quota after interactive sync.
The default maintenance budget is 100 units per invocation, not project quota.
Reserve up to 7 units for refresh-token owners, or 8 with an access-only probe:
channels.list (1) + playlistItems.list (1) + up to five videos.list calls (1 each).
OAuth refresh does not consume the Data API allowance. Reference costs:
[channels.list](https://developers.google.com/youtube/v3/docs/channels/list),
[playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list),
[videos.list](https://developers.google.com/youtube/v3/docs/videos/list).
Unused reservation is returned within the invocation. These are conservative
reservations, not a promise of daily creator throughput.

Confirm budget, item cap (200 by default), concurrency (3), time cap and daily
cadence can clear due rows before deleteByAt. Inspect approaching/overdue counts
and adjust reviewed limits if needed. Local budget shortage persists
QUOTA_EXHAUSTED without starting authorization/provider work; a provider quota
error stops new provider work for the rest of that invocation. Concurrent work
already in flight can finish within its reservations. Deadline purges use local
DB work and continue without API calls, even with budget 0. The owner/time cap
still bounds that cleanup. Large backlogs require planned capacity, not removal
of these limits. Do not silently raise the budget or enable Cron in code.

## Backup and rollback

Disable Cron immediately to stop future starts. Each invocation is one-shot;
disabling a schedule does not cancel a running invocation. Stop a current process
if required and expect its leases to recover. Application rollback can leave the
additive compliance table/enums/indexes in place; do not casually reverse the
schema migration or drop durable blocks. Choose a rollback version that honors
compliance blocks; an older version that ignores them can violate deletion rules.
PURGED data is intentionally destructive and must not be recreated by imports,
claims or other lower sources. Recovery from an accidental destructive rollout
requires an operator-controlled database backup/restore and compliance review,
not an automatic reverse migration or replay of lower sources. Preserve genuine
authorization-loss/deletion markers during any recovery decision. There is no
destructive rollback automation in this pass.
