# YouTube Pass 3B-1 — TikTok owner/token FK deadlock correction and final review

Branch: `fix/youtube-hardening`. All work remains uncommitted. No Pass 3B-2 scheduler/cron/maintenance runner, Railway configuration, YouTube Analytics, extra scope, Privacy/Terms changes, production migration deployment, or production backfill apply.

## Authorization recovery

A Data API 401/authError now signals a rejected access credential, not permanent grant loss. The shared sync revalidates its exact credential, channel, profile, generation/revision and explicit lease context under owner coordination. If a refresh grant exists, the existing Google refresh flow runs outside the transaction even when the rejected access token has an unexpired local expiry.

Successful refresh safely updates the credential and retries the shared official operation once, carrying the original operation fence. A second rejected access response requests authorization without destructive cleanup. Network, throttling, server, malformed and configuration ambiguity preserve credentials and data. Only documented HTTP-400 refresh invalid_grant for the exact current credential can authorize the atomic auth-loss purge. A stale 401/invalid_grant cannot refresh, overwrite or purge a reconnect/new observation.

Access-only 401 requests reauthorization and preserves data. Access-only uncertain-revoke probes no longer fabricate permanent grant loss from that response. Existing confirmed provider-revoke receipts and refresh-invalid_grant recovery still authorize explicit cleanup; an ambiguous access-only recovery now fails closed rather than claiming revocation or deleting data.

## Admin edits and aggregate attribution

`updateImportedCreatorAction` locks the resolved owner, YouTube token, profile, and compliance row, then revalidates ownership/origin/claim state. PURGED/blocked profiles allow independent identity/presentation edits but reject follower/aggregate metric updates atomically with a clear admin-safe result. Unsupported engagement input does not write metrics. Neither admin editing nor imported updates clear the block.

Purge cleanup now uses the pre-deletion YouTube dataset evidence. With no YouTube token/stats/posts/marker contribution, unrelated imported follower, engagement and freshness fields are preserved. Canonical follower cache contributions are recomputed from remaining PlatformStats; canonical observation freshness is recomputed when YouTube dataset evidence exists. Registered historical aggregate caches are cleared/recomputed with that evidence. Unknown imported legacy total/engagement/freshness values are preserved; when remaining canonical followers exist the aggregate can be safely recomputed. Independent biography, niche, location, links, moderation and identity fields remain intact.

Actual public profile and discovery actions were exercised against PostgreSQL: preserved imported aggregates remain creator-wide values, while per-platform rows and discovery platform labels are built only from canonical platform data. No YouTube official follower/video metric is reconstructed from preserved imported aggregate values. Existing normalized metrics also identify import-only totals as imported rather than official API data.

## Lease fencing

Operation context explicitly carries generation, revision, optional profile identity and optional claimed lease ID. Interactive work does not invent a lease requirement. Claimed work verifies the current lease ID and database-clock expiry before refresh/destructive cleanup. Auth-loss cleanup also checks expiry after all deletion/marker writes and rolls the whole transaction back if the lease expires during cleanup. Credential version includes provider identity. Changed generation/revision/profile/credential or claimed lease is SUPERSEDED; no purge is committed.

The PostgreSQL lease-only test changes only leaseId, leaving generation/revision/credential unchanged, then invokes the production destructive guard. It proves the old worker cannot purge. Unit tests also cover expired leases.

## Claim protocol and deletion interaction

All participating claim mutations use one protocol:

**All referenced User rows, sorted by user ID → ALL PlatformToken rows (userId, platform, token id order) → CreatorProfile rows in that same deterministic owner order → YouTubeComplianceState rows → ProfileClaim row(s) → dataset writes.**

Reviewers are included in the sorted User set where a reviewedByUserId FK will be written. Claim submission and rejection coordinate without rejecting an established lifecycle; approval/merge additionally enforce the conservative YouTube conflict rejection policy. No claim transaction acquires a profile lock before a requester User lock.

Scenario A uses the initial claim only to resolve coordination targets. After owner/profile coordination and explicit claim-row locking it rereads claim status, profile ownership/origin/claim/moderation state and requester eligibility. It recomputes merge/conflict state from current data. Rejected/cancelled/processed claims cannot be overwritten. Scenario B follows the same owner-first and claim-row protocol and rereads authoritative state; both merge-wins and reject-wins races are tested through the actual production actions.

Account/admin final deletion guards discover pending claim owners without row locks, coordinate all those owners before profile/claim cancellation, revalidate ownership and claimed-profile restrictions, and consume the exact current revoke receipt inside the deletion transaction. This closes the pending-claim cancellation graph as well as preserving reconnect/receipt safety. Instagram/TikTok provider behavior is unchanged.

Automatic ownership movement involving established YouTube lifecycle/official connection/history remains conservatively rejected for manual review. ACTIVE compliance transfer is intentionally not implemented. No source/destination block or deadline is silently dropped.

## Disposable PostgreSQL execution

Existing local PostgreSQL was used; nothing was installed. A new cluster was initialized under `/tmp/nexly-youtube-pass3b1-db`, listening only on `127.0.0.1:55433`, with database `youtube_test_pass3b1` and test role `duolync_test`. The suite required explicit:

```sh
TEST_DATABASE_URL='postgresql://duolync_test@127.0.0.1:55433/youtube_test_pass3b1' pnpm test:youtube:postgres
```

The target gate runs before pool construction and rejects missing/non-PostgreSQL URLs, remote/obvious production targets, absent `youtube_test_*` marker, non-public schemas, DATABASE_URL equality, the .env application target, and equivalent local-host aliases with the same database name. The gate is unit-tested. The harness uses two independent Prisma/pg pools, fake test-only provider/auth/email dependencies, deterministic bounded barriers and statement/test timeouts. Actual production action/functions execute against real database rows; no production credentials/API calls are used.

Actual server version: **PostgreSQL 17.11 (Homebrew)**. The disposable server was stopped after validation; its test-only cluster files remain under /tmp for reproducibility.

The **full chain of 23 repository migrations** was applied to the freshly created disposable database using `prisma migrate deploy`, including the additive compliance migration. No migration was manually marked applied and no db push was used. Subsequent harness startup confirms the same chain is applied. No migration-history issue occurred.

**23 real PostgreSQL tests executed, 23 passed:**

1. Sync vs reconnect.
2. Same-token reverse completion.
3. Stale access/auth-loss response vs reconnect.
4. Actual explicit disconnect vs sync.
5. Actual account deletion vs sync and rejected reconnect after deletion.
6. Actual RapidAPI fetch starting before purge commits.
7. Lease-only stolen-worker destructive fence.
8. Injected local purge failure rollback.
9. Claim block ownership protection.
10. Actual Scenario A approval vs rejection after snapshot.
11. Actual Scenario B merge/rejection owner/profile/claim lock graph.
12. Actual submission vs approval with stale ownership revalidation.
13. Actual account deletion preparation/final guard vs reconnect and old sync.
14. Actual admin deletion preparation/final guard vs reconnect and old sync.
15. Full access-401 → refresh-invalid_grant → atomic purge entry point.
16. Failure injected after the real marker write in that entry point: token, stats, posts, curation, marker and compliance all roll back.
17. Actual blocked admin identity edit/metric rejection plus public/discovery readers and unrelated import preservation.
18. Real access-401 refresh-success bounded retry.
19. Real access-401 temporary refresh failure preservation.
20. Actual Scenario B post-snapshot rejection remains authoritative.
21. Actual Scenario A approval waits on production TikTok refresh cleanup at the shared User lock before taking any token/profile lock. A real PostgreSQL lock wait is observed; cleanup and claim ownership/token movement complete consistently.
22. Both claim owners have six provider tokens each (Instagram, TikTok, YouTube, Threads, Facebook, and a custom provider). Actual lock order matches userId/platform/id; all twelve rows reject an independent NOWAIT token lock before profile locks complete.
23. Exact supplemental TikTok sync/claim FK reproduction: claim coordination holds User before token locking; real TikTok sync waits on User while the token remains available to a NOWAIT probe. After claim coordination commits, the actual PlatformStats INSERT/UPSERT, token username update, SocialPost replacement and profile cache/marker writes commit completely; no deadlock or partial movement.

No deadlock or deadlock retry occurred in these tests. This validates the exercised lock graph; it is not a proof about arbitrary future writers outside the protocol.

## Generated output and validation

Prisma schema validate and generation passed. Regenerating `lib/generated/prisma/index.d.ts` was byte-identical. Full `git diff --check` flags trailing whitespace only in that tracked generated declaration file. Source-only diff check passes. Generated output was not hand-edited to hide the issue.

- YouTube unit/regression/claim/import/safety tests: **245/245 PASS**.
- Instagram/TikTok provider regressions: **159/159 PASS**.
- Real PostgreSQL suite: **23/23 PASS**.
- `pnpm exec tsc --noEmit --incremental false`: **PRE-EXISTING FAILURE only**, `test/example.test.ts` cannot resolve `vitest`.
- Clean production build: **PASS**.
- Live application/production schema drift: **UNVERIFIED**, intentionally not inspected during this fix.
- Production migration deployment: **NO**.
- Production backfill apply: **NO**.

Post-commit route invalidation remains bounded to current application routes. Already-open client/query-cache snapshots may remain stale until refetch/navigation; client-wide invalidation remains a Pass 3B-3 item. No new cache system or maintenance UI was introduced.

## Blocker-fix files

Changed production paths: `lib/youtube-token.ts`, `lib/youtube-sync.ts`, `lib/youtube-compliance.ts`, `lib/youtube-removal.ts`, `lib/youtube-revoke.ts`, `lib/youtube-claim.ts`, `app/actions/claim.ts`, `app/admin/actions.ts`.

Added attribution helper: `lib/youtube-aggregates.ts`.

Expanded tests: `test/youtube-pass1.test.cjs`, `test/youtube-pass2.test.cjs`, `test/youtube-pass3a.test.cjs`, `test/youtube-pass3b.test.cjs`, `test/youtube-postgres.test.cjs`; added target guard `test/youtube-postgres-target.cjs`. Provider test fixture dependency updates: `test/instagram-disconnect.test.cjs`, `test/tiktok-deletion-regression.test.cjs`.

Earlier Pass 3B-1 schema/migration, generated client, RapidAPI/import guards, backfill tooling and route invalidation changes remain in the uncommitted diff. This report supersedes the earlier Pass 3B-1 report.

## Required final report

| Item | Result |
|---|---|
| ACCESS 401 DIRECTLY PURGES | NO |
| 401 + REFRESH SUCCESS | Credential updated safely; one bounded retry; no purge |
| 401 + INVALID_GRANT | Exact-current guarded atomic purge only |
| 401 + TEMPORARY REFRESH FAILURE | Token/data preserved |
| ADMIN PURGED AGGREGATE GUARD | PASS |
| UNRELATED IMPORTED AGGREGATES PRESERVED | PASS |
| CANONICAL YOUTUBE AGGREGATE REMOVAL | PASS |
| LEGACY FALLBACK RESURRECTION | NONE in exercised canonical public/discovery reads |
| LEASE-ONLY FENCE | PASS |
| SCENARIO A POST-LOCK REVALIDATION | PASS |
| SCENARIO B POST-LOCK REVALIDATION | PASS |
| GLOBAL CLAIM LOCK ORDER | Sorted Users → tokens → profiles → compliance → claims → datasets |
| CLAIM DEADLOCK RISK | NONE observed in exercised PostgreSQL graph; protocol is acyclic for these writers |
| POSTGRES HARNESS | STRONG: production actions, independent pools, bounded deterministic barriers |
| DISPOSABLE POSTGRES USED | YES |
| POSTGRES VERSION | 17.11 |
| FULL MIGRATION REPLAY | PASS: 23 migrations, fresh disposable database |
| REAL POSTGRES TESTS | PASS |
| REAL POSTGRES TEST COUNT | 23 executed, 23 passed |
| REAL SCENARIO A TEST | PASS |
| REAL CLAIM LOCK GRAPH TEST | PASS |
| REAL ACCOUNT/ADMIN RACE | PASS |
| REAL AUTH-LOSS ENTRYPOINT | PASS |
| RAPIDAPI/PURGE RACE | PASS |
| PURGE ROLLBACK | PASS |
| GENERATED-ONLY DIFF CHECK ISSUE | YES: deterministic generated index.d.ts trailing whitespace; source check clean |
| MIGRATION DEPLOYED TO PRODUCTION | NO |
| BACKFILL APPLIED TO PRODUCTION | NO |
| LIVE SCHEMA DRIFT | UNVERIFIED |
| YOUTUBE TESTS | PASS |
| COUNT | 245 |
| PROVIDER REGRESSION | PASS: 159/159 |
| TYPECHECK | PRE-EXISTING FAILURE only: missing vitest |
| BUILD | PASS |
| PASS-3B-2 SCOPE CREEP | NONE |
| SAFE FOR FINAL PASS-3B-1 REVIEW | YES |
| BLOCKERS | NONE for this fix; pre-existing Vitest and generated-only whitespace conditions documented |

Stop after these fixes. No commits or pushes.


## Final targeted TikTok User/token correction

The supplied `/tmp/targeted-review-tiktok-fk-race.log` and PostgreSQL server log confirm an actual deadlock, not an inferred risk. Claim held User FOR UPDATE while waiting for TikTok's token. TikTok sync held that token (through its username update), then PlatformStats INSERT/UPSERT required an implicit User KEY SHARE lock and waited for the claim. The earlier token/profile-only cleanup race did not cover that FK edge.

Before: **TikTok token → PlatformStats (implicit User KEY SHARE) → profile**.

After: **User → TikTok token → CreatorProfile → PlatformStats/SocialPost/related dataset rows**.

`lib/tiktok-sync.ts` now acquires the existing stable owner lock before explicitly locking token/profile, including stats-only sync with no username update. `lib/tiktok-token.ts` uses that same owner lock before the refresh transaction's token lock because missing-refresh/invalid_grant cleanup later touches the profile. `app/actions/tiktok-disconnect.ts` acquires owner/token/profile before dependent deletion. The shared helper is imported under the local alias `lockTikTokOwner`; it is the same User FOR UPDATE protocol used by claims/YouTube, not a second protocol.

The short standalone `saveTikTokToken` transaction was left unchanged: it completes its token save before later callback profile/sync work. `lib/tiktok-revoke.ts` does not hold a database transaction spanning later profile writes. Standalone account/admin TikTok token deletion also commits before final owner/claim coordination. No other concrete token→User/profile cycle was found in the inspected participating TikTok transactions after these changes.

Token refresh predicates, invalid_grant cleanup scope, reconnect rules, provider HTTP placement, public stats/content mapping, scope handling, numeric preserve/zero rules, manual Refresh, revoke/disconnect results, provenance, caches and UI behavior remain the existing business behavior. The claim protocol remains byte-for-byte unchanged: sorted Users → all PlatformTokens ordered by owner/platform/token id → profiles → compliance → claims → datasets. Instagram, schema and all migration files also match this fix's starting hashes. No FK was removed, bypassed or weakened.

The official PostgreSQL suite now contains the exact FK reproduction. It checks actual pg_stat_activity lock wait, proves TikTok has not touched the token while waiting for User, probes the token with an independent NOWAIT connection, and verifies the later real stats insert/content/profile transaction completely commits with unchanged ownership. All 23 PostgreSQL cases pass on the disposable PostgreSQL 17.11 database. The updated cleanup/claim test now verifies the common owner-first order rather than the former token-first entry point.

Focused TikTok regressions execute production mapping, stats-only preservation, owner-first refresh, invalid_grant history preservation, temporary refresh preservation, transaction rollback, and disconnect behavior. TikTok tests: 27/27 PASS. YouTube/claim tests: 245/245 PASS. Combined Instagram/TikTok provider regressions: 159/159 PASS. Typecheck reports only the pre-existing missing-vitest baseline. The clean production build passed for this correction. The disposable test server was stopped after validation.

Production changes in this correction: `lib/tiktok-sync.ts`, `lib/tiktok-token.ts`, `app/actions/tiktok-disconnect.ts`. Added `test/tiktok-coordination.test.cjs`; updated `test/youtube-postgres.test.cjs` and this report. No production migration/backfill, commit, push, or Pass 3B-2 work.

### Required targeted final report

| Item | Result |
|---|---|
| ROOT DEADLOCK | CONFIRMED in supplied PostgreSQL FK deadlock trace |
| TIKTOK WRITE ORDER BEFORE | Token → PlatformStats User FK KEY SHARE → profile |
| TIKTOK WRITE ORDER AFTER | User → TikTok token → profile → datasets |
| USER LOCK BEFORE TOKEN | YES |
| PLATFORMSTATS FK CYCLE | RESOLVED in exact production-path PostgreSQL reproduction |
| TIKTOK BUSINESS BEHAVIOR CHANGED | NO; coordination only |
| CLAIM ORDER CHANGED | NO; byte-identical claim coordination/action files |
| OTHER TIKTOK TOKEN→USER/PROFILE CYCLES | NONE remaining in inspected participating transactions; short standalone token save unchanged |
| REAL TIKTOK SYNC/CLAIM POSTGRES TEST | PASS |
| DEADLOCK OBSERVED AFTER FIX | NO |
| REAL POSTGRES TESTS / COUNT | PASS: 23/23 |
| TIKTOK REGRESSION | PASS: 27/27 |
| YOUTUBE TESTS / COUNT | PASS: 245/245 |
| PROVIDER REGRESSION | PASS: 159/159 |
| TYPECHECK | PRE-EXISTING FAILURE only: missing vitest in test/example.test.ts |
| BUILD | PASS |
| SCHEMA CHANGED | NO in this fix; all schema/migration hashes unchanged |
| PASS-3B-2 SCOPE CREEP | NONE |
| SAFE FOR TARGETED FINAL REVIEW | YES |
| BLOCKERS | NONE for this targeted fix |

Earlier Pass 3B-1 edits remain in the uncommitted diff. This section supersedes the earlier cross-provider-only review conclusions; it includes the newly confirmed User FK edge and its fix.
