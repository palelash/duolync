const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const env = { YOUTUBE_CLIENT_ID: '123-youtube.apps.googleusercontent.com', GOOGLE_CLIENT_ID: '456-login.apps.googleusercontent.com', YOUTUBE_CLIENT_SECRET: 'test-secret' };
function load(file, imports = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/youtube-aggregates') return load('lib/youtube-aggregates.ts', { '@/lib/creator-metrics': metrics });
    if (name === '@/lib/youtube-claim') return load('lib/youtube-claim.ts', { '@/lib/youtube-lock': locks });
    if (name === '@/lib/youtube-lock' && !(name in imports)) return load('lib/youtube-lock.ts');
    if (name === '@/lib/youtube-compliance') return load('lib/youtube-compliance.ts');
    if (name === '@/lib/youtube-removal' && !(name in imports)) return load('lib/youtube-removal.ts', { ...imports, '@/lib/creator-metrics': metrics });
    if (name === 'node:crypto') return require(name);
    assert.ok(name in imports, `Unexpected dependency ${name}`); return imports[name];
  }, Date, URL, URLSearchParams, AbortSignal, process: { env }, console: { error(...args) {
    assert.doesNotMatch(args.map(String).join(' '), /private-access|private-refresh|new-access|new-refresh/);
  } }, ...extra });
  return exports;
}
const locks = load('lib/youtube-lock.ts');
const metrics = load('lib/creator-metrics.ts');
const authHelpers = load('lib/youtube-auth.ts', { '@/lib/db': { db: {} } }, { Buffer });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const credential = () => ({ id: 'token', userId: 'owner', platform: 'youtube', accessToken: 'private-access', refreshToken: 'private-refresh',
  updatedAt: new Date(1000), platformUserId: 'channel', expiresAt: new Date(0), scopes: 'youtube.readonly', username: 'channel' });
function fixture({ initial = credential(), status = 200, provider, configured = env, authorized = true, claimed = false,
  adminRole = 'ADMIN', targetRole = 'CREATOR', deleteFails = false, cleanupFails = false } = {}) {
  const state = { compliance: { status: 'ACTIVE', connectionGeneration: 1, revision: 1, blockedAt: null, leaseId: null }, token: initial, markers: ['youtube', 'instagram'], stats: [{ platform: 'youtube', followerCount: 100 }, { platform: 'instagram', followerCount: 10 }],
    posts: [{ platform: 'youtube', providerPostId: 'video' }, { platform: 'instagram' }], curation: [{ platform: 'youtube', providerPostId: 'video', status: 'HIDDEN' }], followers: 110, deleted: false };
  const storage = { rows: [] };
  const failures = { cleanup: cleanupFails ? Infinity : 0, deletion: deleteFails ? Infinity : 0, tokenDelete: 0, confirmation: 0, receiptDelete: 0 };
  const hooks = {};
  let tail = Promise.resolve(), active = 0; const calls = [], invalidated = [], events = [];
  const db = {
    youTubeComplianceState: { findUnique: async () => structuredClone(state.compliance) }, verification: { deleteMany: async ({ where }) => {
    assert.equal(active, 0, 'cross-owner expiry pruning must run outside coordinated transactions');
    assert.equal(where.identifier.startsWith, 'youtube-revoke:');
    const expired = row => row.identifier.startsWith(where.identifier.startsWith) && row.expiresAt <= where.expiresAt.lte;
    const count = storage.rows.filter(expired).length; storage.rows = storage.rows.filter(row => !expired(row)); return { count };
  } }, creatorProfile: { findFirst: async () => claimed ? { id: 'profile' } : null },
    user: { findUnique: async () => ({ role: targetRole }) },
    platformToken: { deleteMany: async () => { throw Error('Unexpected non-YouTube token delete'); } },
    $transaction: async run => {
      const previous = tail, release = deferred(); tail = release.promise; await previous;
      active++; const before = structuredClone(state), beforeStorage = structuredClone(storage); let owner = false, tokenLock = false, profileLock = false; const externallyPruned = new Set();
      const tx = {
        youTubeComplianceState: {
          findUnique: async () => structuredClone(state.compliance),
          update: async ({ data }) => Object.assign(state.token, data),
          upsert: async ({ create, update }) => { state.compliance = state.compliance ? { ...state.compliance, ...update,
            connectionGeneration: state.compliance.connectionGeneration + 1, revision: state.compliance.revision + 1 } : create; },
          update: async ({ data }) => { state.compliance = { ...state.compliance, ...data, revision: state.compliance.revision + 1 }; },
        },
        verification: {
          findUnique: async ({ where }) => { assert.ok(owner && tokenLock); return structuredClone(storage.rows.find(r => r.id === where.id) ?? null); },
          upsert: async ({ where, create, update }) => {
            assert.ok(owner && tokenLock);
            const current = storage.rows.find(r => r.id === where.id);
            if (current) Object.assign(current, update);
            else storage.rows.push({ ...create, createdAt: new Date(), updatedAt: new Date() });
            if (JSON.parse((current ?? create).value).state === 'CONFIRMED' && failures.confirmation > 0) {
              failures.confirmation--; throw Error('confirmation-db-failed');
            }
          },
          deleteMany: async ({ where }) => {
            assert.ok(owner && tokenLock);
            if (where.expiresAt?.gt) {
              assert.ok(profileLock, 'consumption must follow owner/token/profile coordination');
              if (hooks.beforeReceiptConsume) {
                await hooks.beforeReceiptConsume({ prune: () => {
                  externallyPruned.add(where.id);
                  storage.rows = storage.rows.filter(row => row.id !== where.id);
                  events.push('prune-won');
                }, expire: () => {
                  const row = storage.rows.find(row => row.id === where.id);
                  if (row) row.expiresAt = new Date(0);
                  const original = beforeStorage.rows.find(row => row.id === where.id);
                  if (original) original.expiresAt = new Date(0);
                } });
              }
            }
            if (where.id && failures.receiptDelete > 0) { failures.receiptDelete--; throw Error('receipt-delete-failed'); }
            const matches = row => (!where.id || row.id === where.id) && (!where.value || row.value === where.value) &&
              (!where.identifier || (typeof where.identifier === 'string' ? row.identifier === where.identifier : row.identifier.startsWith(where.identifier.startsWith))) &&
              (!where.expiresAt?.lte || row.expiresAt <= where.expiresAt.lte) &&
              (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt);
            const count = storage.rows.filter(matches).length; storage.rows = storage.rows.filter(row => !matches(row));
            if (where.expiresAt?.gt && count) events.push('receipt-consumed');
            if (where.expiresAt?.gt && count && hooks.afterReceiptConsume) await hooks.afterReceiptConsume();
            return { count };
          },
        },
        $queryRaw: async (sql, ...params) => {
          const query = sql.join('');
          if (query.includes('clock_timestamp() AS')) return [{ now: new Date() }];
          if (query.includes('FROM "YouTubeComplianceState"')) return state.compliance ? [structuredClone(state.compliance)] : [];
          if (query.includes('DELETE FROM "Verification"')) {
            assert.match(query, /"expiresAt" > clock_timestamp\(\)/);
            assert.match(query, /RETURNING "id"/);
            const consumed = await tx.verification.deleteMany({ where: {
              id: params[0], identifier: params[1], value: params[2], expiresAt: { gt: new Date() },
            } });
            return consumed.count ? [{ id: params[0] }] : [];
          }
          assert.match(query, /FOR UPDATE/);
          if (query.includes('FROM "User"')) { owner = true; events.push('owner'); return [{ id: 'owner' }]; }
          assert.ok(owner);
          if (query.includes('FROM "PlatformToken"')) { tokenLock = true; events.push('token'); return state.token ? [structuredClone(state.token)] : []; }
          assert.ok(tokenLock); profileLock = true; events.push('profile'); return [{ id: 'profile', connectedPlatforms: [...state.markers], profileOrigin: 'REGISTERED' }];
        },
        $executeRaw: async sql => { assert.ok(owner && tokenLock); profileLock = true;
          if (sql.join('').includes('array_remove')) state.markers = state.markers.filter(p => p !== 'youtube');
          else if (!state.markers.includes('youtube')) state.markers.push('youtube'); },
        platformToken: {
          deleteMany: async () => { assert.ok(owner && tokenLock); if (failures.tokenDelete > 0) { failures.tokenDelete--; throw Error('token-delete-failed'); } state.token = null; return { count: 1 }; },
          update: async ({ data }) => Object.assign(state.token, data),
          upsert: async ({ create, update }) => { assert.ok(owner && tokenLock); state.token = state.token ? { ...state.token, ...update } : { id: 'new-token', ...create }; return structuredClone(state.token); },
        },
        platformStats: { deleteMany: async () => { assert.ok(profileLock); state.stats = state.stats.filter(p => p.platform !== 'youtube'); },
          findMany: async ({ where }) => where?.platform ? state.stats.filter(stat => stat.platform === where.platform) : state.stats, upsert: async () => { state.stats = [{ platform: 'youtube', followerCount: 200 }, { platform: 'instagram', followerCount: 10 }]; } },
        socialPost: { count: async () => state.posts.length, deleteMany: async () => { state.posts = state.posts.filter(p => p.platform !== 'youtube'); }, createMany: async () => { state.posts.push({ platform: 'youtube', providerPostId: 'new-video' }); } },
        creatorContentCuration: { deleteMany: async () => { if (failures.cleanup > 0) { failures.cleanup--; throw Error('rollback'); } state.curation = []; } },
        creatorProfile: { findUnique: async () => ({ id: 'profile', claimStatus: 'NOT_APPLICABLE' }), update: async ({ data }) => { state.markers = [...data.connectedPlatforms]; state.followers = data.followerCount; state.profileData = data; } },
        profileClaim: { findMany: async () => [] },
        user: { delete: async () => { assert.ok(owner && tokenLock && profileLock); assert.ok(!storage.rows.some(row => row.identifier.startsWith('youtube-revoke:'))); if (failures.deletion > 0) { failures.deletion--; throw Error('delete-failed'); }
          events.push('cascade'); state.deleted = true; state.token = null; state.markers = []; state.stats = []; state.posts = []; state.curation = []; state.followers = null; } },
      };
      try { return await run(tx); } catch (e) { Object.assign(state, before); Object.assign(storage, beforeStorage); storage.rows = storage.rows.filter(row => !externallyPruned.has(row.id)); events.push('rollback'); throw e; }
      finally { active--; release.resolve(); }
    },
  };
  const youtubeFetch = async (url, init) => {
    assert.equal(active, 0, 'provider HTTP must be outside DB transaction'); calls.push({ url, init });
    return provider ? provider(url, init) : String(url).includes('/revoke') ? { status } : { ok: true, status: 200, json: async () => ({ access_token: 'probe-access', items: [] }) };
  };
  const lifecycle = load('lib/youtube-token.ts', { '@/lib/db': { db }, '@/lib/youtube-lock': locks, '@/lib/youtube-auth': { ...authHelpers, youtubeFetch } }, { process: { env: configured } });
  const revoke = load('lib/youtube-revoke.ts', { '@/lib/db': { db }, '@/lib/youtube-lock': locks, '@/lib/youtube-token': lifecycle,
    '@/lib/youtube-auth': { ...authHelpers, youtubeFetch } }, { process: { env: configured } });
  const removal = load('lib/youtube-removal.ts', { '@/lib/db': { db }, '@/lib/youtube-lock': locks, '@/lib/creator-metrics': metrics });
  const imports = { '@/lib/auth': { auth: { api: { getSession: async () => authorized ? { user: { id: 'owner', role: adminRole } } : null,
    signOut: async () => events.push('signOut') } } }, 'next/headers': { headers: async () => ({}) },
    'next/cache': { revalidatePath: p => invalidated.push(p) }, '@/lib/db': { db }, '@/lib/youtube-revoke': revoke,
    '@/lib/youtube-removal': removal, '@/lib/creator-metrics': metrics,
    '@/lib/tiktok-revoke': { revokeTikTokAuthorization: async () => { events.push('tiktok'); if (hooks.afterYouTubePrepared) await hooks.afterYouTubePrepared(); return 'not_connected'; } },
    '@/lib/roles': { isAdmin: role => role === 'ADMIN' }, '@/lib/import-utils': {}, '@/lib/social-links': {},
  };
  return { state, storage, failures, hooks, db, lifecycle, revoke, removal, calls, events, invalidated,
    // A conditional DELETE holds its receipt row lock until transaction release.
    // Model an outside pruner waiting for that lock without blocking its owner.
    pruneAfterTransaction: () => tail.then(() => db.verification.deleteMany({ where: {
      identifier: { startsWith: 'youtube-revoke:' }, expiresAt: { lte: new Date() },
    } })),
    newWorker: () => {
      const token = load('lib/youtube-token.ts', { '@/lib/db': { db }, '@/lib/youtube-lock': locks,
        '@/lib/youtube-auth': { ...authHelpers, youtubeFetch } }, { process: { env: configured } });
      const workerRevoke = load('lib/youtube-revoke.ts', { '@/lib/db': { db }, '@/lib/youtube-lock': locks,
        '@/lib/youtube-token': token, '@/lib/youtube-auth': { ...authHelpers, youtubeFetch } }, { process: { env: configured } });
      const workerImports = { ...imports, '@/lib/youtube-revoke': workerRevoke };
      return { revoke: workerRevoke,
        disconnect: load('app/actions/youtube-disconnect.ts', workerImports).disconnectYouTubeAction,
        account: load('app/actions/account.ts', workerImports).deleteAccount,
        admin: load('app/admin/actions.ts', workerImports).deleteUser };
    },
    disconnect: load('app/actions/youtube-disconnect.ts', imports).disconnectYouTubeAction,
    generic: load('app/actions/social-connections.ts', imports).removePlatformAction,
    account: load('app/actions/account.ts', imports).deleteAccount,
    admin: load('app/admin/actions.ts', imports).deleteUser,
    reconnect: () => lifecycle.saveYouTubeAccessToken('owner', { accessToken: 'new-access', refreshToken: 'new-refresh',
      platformUserId: 'channel', username: 'channel', expiresAt: new Date(Date.now() + 3600000), scopes: 'youtube.readonly' }, async tx => {
      await tx.platformStats.upsert({}); await tx.socialPost.createMany({});
    }),
  };
}
function cleaned(f) {
  assert.equal(f.state.token, null); assert.deepEqual(f.state.markers, ['instagram']);
  assert.deepEqual(f.state.stats, [{ platform: 'instagram', followerCount: 10 }]);
  assert.deepEqual(f.state.posts, [{ platform: 'instagram' }]); assert.deepEqual(f.state.curation, []); assert.equal(f.state.followers, 10);
}
test('revoke uses documented POST body, prefers expired connection refresh token, exposes no credentials', async () => {
  const f = fixture(); const result = await f.disconnect(); assert.equal(result.ok, true); assert.equal(result.authorizationRevoked, true); cleaned(f);
  const { url, init } = f.calls[0]; assert.equal(url, 'https://oauth2.googleapis.com/revoke'); assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded'); assert.equal(new URLSearchParams(init.body).get('token'), 'private-refresh');
  assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(f.calls.length, 1);
});
test('access token is used only when refresh token is unavailable', async () => {
  const token = credential(); token.refreshToken = null; const f = fixture({ initial: token }); assert.equal((await f.disconnect()).ok, true);
  assert.equal(new URLSearchParams(f.calls[0].init.body).get('token'), 'private-access');
});
for (const status of [429, 500, 503]) test(`HTTP ${status} preserves connection and all data with retryable failure`, async () => {
  const f = fixture({ status }); const before = structuredClone(f.state); assert.equal((await f.disconnect()).reason, 'temporary_failure');
  assert.deepEqual(f.state, before); assert.deepEqual(f.invalidated, []);
});
for (const kind of ['network', 'timeout']) test(`${kind} preserves all data`, async () => {
  const f = fixture({ provider: async () => { throw Error(kind); } }); const before = structuredClone(f.state);
  assert.equal((await f.disconnect()).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
});
for (const status of [400, 401, 403, 204]) test(`HTTP ${status} cannot be treated as established revocation`, async () => {
  const f = fixture({ status }); const before = structuredClone(f.state);
  assert.equal((await f.disconnect()).reason, 'provider_failure'); assert.deepEqual(f.state, before);
});
for (const configured of [{ ...env, GOOGLE_CLIENT_ID: env.YOUTUBE_CLIENT_ID }, { ...env, GOOGLE_CLIENT_ID: '123-other.apps.googleusercontent.com' }, {}]) {
  test(`unsafe or unknown project isolation fails closed: ${JSON.stringify(configured)}`, async () => {
    const f = fixture({ configured }); const before = structuredClone(f.state);
    assert.equal((await f.disconnect()).reason, 'configuration_failure'); assert.deepEqual(f.state, before); assert.equal(f.calls.length, 0);
  });
}
test('missing credential is not falsely claimed as provider revocation; history removed', async () => {
  const f = fixture({ initial: null }); assert.equal((await f.disconnect()).authorizationRevoked, false); assert.equal(f.calls.length, 0); cleaned(f);
});
test('confirmed current dead auth atomically purges history before explicit removal', async () => {
  const f = fixture({ provider: async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }) });
  assert.equal((await f.lifecycle.getYouTubeAccessToken('owner')).reason, 'reauth_required');
  assert.equal(f.state.compliance.status, 'PURGED');
  assert.equal(f.state.compliance.removalReason, 'AUTHORIZATION_LOST');
  assert.equal(f.state.curation.length, 0);
  assert.equal(f.state.posts.some(p => p.platform === 'youtube'), false);
});

test('stale revoke response cannot remove newer same-channel reconnect', async () => {
  const started = deferred(), response = deferred(); const f = fixture({ provider: async () => { started.resolve(); return response.promise; } });
  const pending = f.disconnect(); await started.promise; await f.reconnect(); const fresh = structuredClone(f.state);
  response.resolve({ status: 200 }); assert.equal((await pending).reason, 'connection_changed'); assert.deepEqual(f.state, fresh);
});
test('disconnect commits first, then reconnect does not restore old curation', async () => {
  const f = fixture(); assert.equal((await f.disconnect()).ok, true); cleaned(f); await f.reconnect();
  assert.equal(f.state.token.accessToken, 'new-access'); assert.ok(f.state.markers.includes('youtube')); assert.deepEqual(f.state.curation, []);
});
test('history-only snapshot cannot delete a reconnect before phase C', async () => {
  const f = fixture({ initial: null }); const snapshot = await f.revoke.revokeYouTubeAuthorization('owner'); await f.reconnect(); const fresh = structuredClone(f.state);
  assert.equal((await f.removal.removeYouTubeLocalData('owner', current => f.revoke.matchesRevokedYouTubeCredential(current, snapshot.credential))).error, 'connection_changed');
  assert.deepEqual(f.state, fresh);
});
test('explicit local cleanup rolls back dataset and credential atomically', async () => {
  const f = fixture({ cleanupFails: true }); const before = structuredClone(f.state);
  assert.equal((await f.disconnect()).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
});
test('generic YouTube removal is guarded for active and history-only accounts', async () => {
  for (const initial of [credential(), null]) { const f = fixture({ initial }); const before = structuredClone(f.state);
    assert.equal((await f.generic('youtube')).error, 'use_youtube_disconnect'); assert.deepEqual(f.state, before); assert.equal(f.calls.length, 0); }
});
test('dedicated disconnect requires session and ignores client-supplied owner/platform', async () => {
  const denied = fixture({ authorized: false }); assert.equal((await denied.disconnect()).reason, 'unauthorized'); assert.equal(denied.calls.length, 0);
  const f = fixture(); assert.equal((await f.disconnect('other-user', 'instagram')).ok, true); cleaned(f);
});
for (const mode of ['account', 'admin']) {
  test(`${mode} deletion revokes active YouTube before cascaded deletion`, async () => {
    const f = fixture(); assert.equal((await f[mode]('target')).success, true); assert.equal(f.calls.length, 1); assert.equal(f.state.deleted, true);
    assert.equal(f.state.token, null); assert.deepEqual(f.state.curation, [], 'existing cascade removes data; actual FKs tested separately');
    assert.ok(f.events.indexOf('tiktok') < f.events.indexOf('cascade'));
  });
  test(`${mode} deletion with Pass-1 dead auth does not revoke or refresh`, async () => {
    const f = fixture({ initial: null }); assert.equal((await f[mode]('target')).success, true); assert.equal(f.calls.length, 0);
  });
  test(`${mode} temporary failure retains account, tokens and data for retry`, async () => {
    const f = fixture({ status: 503 }); const before = structuredClone(f.state); const result = await f[mode]('target');
    assert.equal(result.success, false); assert.match(result.error, /try again/); assert.deepEqual(f.state, before); assert.ok(!f.events.includes('tiktok'));
  });
  test(`${mode} provider failure retains account and authorization`, async () => {
    const f = fixture({ status: 400 }); const before = structuredClone(f.state); assert.equal((await f[mode]('target')).success, false); assert.deepEqual(f.state, before);
  });
  test(`${mode} claimed profile prevents provider revoke`, async () => {
    const f = fixture({ claimed: true }); assert.equal((await f[mode]('target')).success, false); assert.equal(f.calls.length, 0);
  });
  test(`${mode} stale provider response blocks deleting newer connection`, async () => {
    const started = deferred(), response = deferred(); const f = fixture({ provider: async () => { started.resolve(); return response.promise; } });
    const pending = f[mode]('target'); await started.promise; await f.reconnect(); const fresh = structuredClone(f.state);
    response.resolve({ status: 200 }); assert.equal((await pending).success, false); assert.deepEqual(f.state, fresh);
  });
}
test('account cascade failure can retry without revoking the same dead credential again', async () => {
  const f = fixture({ deleteFails: true }); assert.equal((await f.account()).success, false); assert.ok(f.state.token); assert.equal(receipt(f).state, 'CONFIRMED');
  assert.equal((await f.account()).success, false); assert.equal(f.calls.length, 1); assert.equal(f.state.deleted, false);
});
test('final account deletion guard blocks reconnect after provider cleanup', async () => {
  const f = fixture(); const prepared = await f.revoke.prepareYouTubeAccountDeletion('owner'); assert.equal(prepared.error, null); await f.reconnect();
  await assert.rejects(f.db.$transaction(tx => f.revoke.assertYouTubeAccountDeletion(tx, 'owner', prepared.credential)), /reconnected/); assert.equal(f.state.deleted, false);
});
test('admin role and self/target-admin guards remain enforced before provider calls', async () => {
  for (const [options, target] of [[{ adminRole: 'CREATOR' }, 'target'], [{}, 'owner'], [{ targetRole: 'ADMIN' }, 'target'], [{ authorized: false }, 'target']]) {
    const f = fixture(options); assert.equal((await f.admin(target)).success, false); assert.equal(f.calls.length, 0);
  }
});
test('YouTube data cascades are declared in the actual schema', () => {
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
  for (const [model, field, parent] of [['PlatformToken', 'userId', 'User'], ['PlatformStats', 'userId', 'User'], ['CreatorProfile', 'userId', 'User'],
    ['SocialPost', 'creatorProfileId', 'CreatorProfile'], ['CreatorContentCuration', 'creatorProfileId', 'CreatorProfile']]) {
    const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))[1];
    assert.match(body, new RegExp(`${parent}\\s+@relation\\([^\\n]*fields: \\[${field}\\], references: \\[id\\], onDelete: Cascade\\)`));
  }
});
test('production fetch wrapper adds ten-second timeout and no-store', async () => {
  let request;
  const auth = load('lib/youtube-auth.ts', { '@/lib/db': { db: {} }, 'node:crypto': require('node:crypto') }, {
    fetch: async (url, init) => { request = { url, init }; return { status: 200 }; }, Buffer,
    AbortSignal: { timeout: ms => { assert.equal(ms, 10000); return 'timeout-signal'; } },
  });
  await auth.youtubeFetch('https://oauth2.googleapis.com/revoke', { method: 'POST' }); assert.equal(request.init.signal, 'timeout-signal'); assert.equal(request.init.cache, 'no-store');
});

test('every credential version field prevents stale deletion, including identical-token reconnect', async () => {
  const f = fixture(); const old = structuredClone(f.state.token);
  for (const field of ['id', 'accessToken', 'refreshToken', 'platformUserId', 'updatedAt']) {
    const newer = { ...old, [field]: field === 'updatedAt' ? new Date(1001) : `different-${field}` };
    assert.equal(f.revoke.matchesRevokedYouTubeCredential(newer, old), false, field);
  }
  assert.equal(f.revoke.matchesRevokedYouTubeCredential(null, old), false, 'absence after active snapshot requires a fresh remove');
  assert.equal(f.revoke.matchesRevokedYouTubeCredential(null, null), true);
});
test('ambiguous invalid_token body is never logged, parsed, or treated as authorization gone', async () => {
  const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: 400, json: async () => { throw Error('must not parse revoke body'); } } : providerResponse(200, { access_token: 'probe-valid' }) });
  const before = structuredClone(f.state); assert.equal((await f.disconnect()).reason, 'provider_failure'); assert.deepEqual(f.state, before);
});
test('provider temporary failure can retry the retained credential successfully', async () => {
  let count = 0; const f = fixture({ provider: async url => String(url).includes('/revoke') ? { status: ++count === 1 ? 503 : 200 } : { ok: true, status: 200, json: async () => ({ access_token: 'probe-access' }) } });
  assert.equal((await f.disconnect()).reason, 'temporary_failure'); assert.equal((await f.disconnect()).ok, true); cleaned(f); assert.equal(f.calls.filter(c => c.url.includes('/revoke')).length, 2);
});
for (const file of ['_pages/creator/SocialAccounts.tsx', '_pages/creator/PresencePage.tsx']) {
  for (const outcome of ['active', 'history', 'failure']) test(`${file} production handler handles ${outcome} without OAuth or generic bypass`, async () => {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let initializer;
    function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleRemoveConfirm') initializer = node.initializer.getText(source); ts.forEachChild(node, visit); }
    visit(source); assert.ok(initializer);
    const pending = deferred(), events = [], lock = { current: false }; let calls = 0;
    const exports = {};
    vm.runInNewContext(ts.transpileModule(`export const run = ${initializer};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, confirmRemove: outcome === 'history' ? 'youtube_history' : 'youtube', removeTarget: outcome === 'history' ? 'youtube_history' : 'youtube', youtubeRemoveLock: lock,
      setRemoving: v => events.push(`loading:${v}`), disconnectYouTubeAction: async () => { calls++; return pending.promise; },
      toast: value => events.push(value), setConfirmRemove: v => events.push(`target:${v}`), setRemoveTarget: v => events.push(`target:${v}`),
      loadAccounts: async () => events.push('reload'), reload: async () => events.push('reload'),
      removePlatformAction: () => { throw Error('generic bypass'); },
    });
    const first = exports.run(); await exports.run(); assert.equal(calls, 1, 'duplicate submission blocked synchronously');
    pending.resolve(outcome === 'failure' ? { ok: false, reason: 'temporary_failure', error: 'Please try again.' } : { ok: true, authorizationRevoked: outcome === 'active' });
    await first; assert.equal(lock.current, false); assert.ok(events.includes('loading:false'));
    if (outcome === 'failure') { assert.ok(!events.includes('reload')); assert.ok(!events.includes('target:null')); assert.ok(events.some(e => e.variant === 'destructive')); }
    else { assert.ok(events.includes('reload')); assert.ok(events.includes('target:null')); assert.ok(events.some(e => e.description?.includes(outcome === 'active' ? 'authorization was revoked' : 'Stored YouTube data was removed'))); }
  });
}

const revokeCalls = f => f.calls.filter(call => call.url.endsWith('/revoke'));
const receipt = f => f.storage.rows[0] && JSON.parse(f.storage.rows[0].value);
const providerResponse = (status, body) => ({ status, ok: status === 200, json: async () => body });
async function withCredentialLocks(f, run) {
  return f.db.$transaction(async tx => {
    await locks.lockYouTubeOwner(tx, 'owner');
    await tx.$queryRaw`SELECT * FROM "PlatformToken" WHERE "userId" = 'owner' AND "platform" = 'youtube' FOR UPDATE`;
    return run(tx);
  });
}

test('confirmed revoke survives failed disconnect cleanup and recovers across workers without another revoke', async () => {
  const f = fixture({ provider: async () => { assert.equal(revokeCalls(f).length, 1, 'second revoke would return ambiguous 400'); return { status: 200 }; } });
  f.failures.cleanup = 1; const before = structuredClone(f.state);
  assert.equal((await f.disconnect()).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
  assert.equal(receipt(f).state, 'CONFIRMED'); assert.equal(receipt(f).proof, 'provider_revoked');
  assert.equal((await f.newWorker().disconnect()).authorizationRevoked, true); cleaned(f);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.storage.rows, []);
});
for (const mode of ['account', 'admin']) {
  test(`${mode}: confirmation survives failed final receipt consumption and a new worker completes deletion`, async () => {
    const f = fixture(); f.failures.receiptDelete = 1; const before = structuredClone(f.state);
    assert.equal((await f[mode]('target')).success, false); assert.deepEqual(f.state, before);
    assert.equal(receipt(f).state, 'CONFIRMED');
    assert.equal((await f.newWorker()[mode]('target')).success, true);
    assert.equal(f.state.deleted, true); assert.equal(f.calls.length, 1); assert.deepEqual(f.storage.rows, []);
  });
  test(`${mode}: final deletion rollback retries successfully without another revoke`, async () => {
    const f = fixture(); f.failures.deletion = 1; const before = structuredClone(f.state);
    assert.equal((await f[mode]('target')).success, false); assert.deepEqual(f.state, before);
    assert.equal(receipt(f).state, 'CONFIRMED');
    assert.equal((await f.newWorker()[mode]('target')).success, true); assert.equal(f.calls.length, 1);
  });
}

test('stale confirmed receipt cannot authorize cleanup of a newer reconnect', async () => {
  const f = fixture(); f.failures.cleanup = 1; await f.disconnect();
  assert.equal(receipt(f).state, 'CONFIRMED'); await f.reconnect(); const fresh = structuredClone(f.state);
  assert.equal((await f.newWorker().disconnect()).reason, 'connection_changed');
  assert.deepEqual(f.state, fresh); assert.equal(f.calls.length, 1); assert.deepEqual(f.storage.rows, []);
});

test('receipt binds owner and each credential comparison field, including identical-token newer versions', async () => {
  for (const field of ['id', 'platformUserId', 'updatedAt', 'accessToken', 'refreshToken']) {
    const f = fixture(); await f.revoke.revokeYouTubeAuthorization('owner');
    assert.equal(await withCredentialLocks(f, tx => f.revoke.hasConfirmedYouTubeRevoke(tx, 'other', f.state.token)), false);
    f.state.token[field] = field === 'updatedAt' ? new Date(1001) : `other-${field}`;
    const fresh = structuredClone(f.state);
    assert.equal((await f.disconnect()).reason, 'connection_changed', field);
    assert.deepEqual(f.state, fresh); assert.equal(f.calls.length, 1);
  }
});

test('receipt contains only fingerprints/state/proof, no raw tokens, and expires in 30 days', async () => {
  const f = fixture(); const started = Date.now(); await f.revoke.revokeYouTubeAuthorization('owner');
  const row = f.storage.rows[0]; assert.match(row.id, /^youtube-revoke:[a-f0-9]{64}$/);
  assert.match(receipt(f).version, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(row), /private-access|private-refresh|test-secret/);
  assert.ok(row.expiresAt.getTime() >= started + 30 * 86400000);
  assert.ok(row.expiresAt.getTime() <= Date.now() + 30 * 86400000);
});

test('PENDING is durable before provider HTTP and never sufficient to authorize cleanup', async () => {
  const f = fixture({ provider: async () => {
    assert.equal(receipt(f).state, 'PENDING');
    return { status: 503 };
  } });
  const before = structuredClone(f.state); assert.equal((await f.disconnect()).reason, 'temporary_failure');
  assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'PENDING');
  assert.equal(await withCredentialLocks(f, tx => f.revoke.hasConfirmedYouTubeRevoke(tx, 'owner', f.state.token)), false);
});

test('arbitrary revoke 400 does not create a confirmed receipt', async () => {
  const f = fixture({ status: 400 }); const before = structuredClone(f.state);
  assert.equal((await f.disconnect()).reason, 'provider_failure');
  assert.equal(receipt(f).state, 'PENDING'); assert.deepEqual(f.state, before);
});

for (const mode of ['disconnect', 'account', 'admin']) {
  test(`${mode}: lost confirmation recovers PENDING using exact refresh invalid_grant, without another revoke`, async () => {
    const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: 200 } : providerResponse(400, { error: 'invalid_grant' }) });
    f.failures.confirmation = 1; const before = structuredClone(f.state);
    const first = await f[mode]('target'); assert.equal(mode === 'disconnect' ? first.ok : first.success, false);
    assert.equal(receipt(f).state, 'PENDING'); assert.deepEqual(f.state, before);
    const retry = await f.newWorker()[mode]('target'); assert.equal(mode === 'disconnect' ? retry.ok : retry.success, true);
    if (mode === 'disconnect') { assert.equal(retry.authorizationRevoked, false); cleaned(f); }
    else assert.equal(f.state.deleted, true);
    assert.equal(revokeCalls(f).length, 1); assert.equal(f.calls.length, 2); assert.deepEqual(f.storage.rows, []);
  });
}

test('PENDING access-only 401 preserves data without permanent grant-loss proof', async () => {
  const initial = credential(); initial.refreshToken = null;
  const f = fixture({ initial, provider: async url => url.endsWith('/revoke') ? { status: 200 } : providerResponse(401, { error: { errors: [{ reason: 'authError' }] } }) });
  f.failures.confirmation = 1; await f.disconnect();
  const result = await f.newWorker().disconnect(); assert.equal(result.ok, false); assert.equal(result.reason, 'provider_failure');
  assert.ok(f.state.token); assert.equal(f.state.curation.length, 1); assert.equal(revokeCalls(f).length, 1); assert.match(f.calls[1].url, /youtube\/v3\/channels/);
});

for (const [status, body, expected] of [[503, { error: 'invalid_grant' }, 'temporary_failure'],
  [429, { error: 'invalid_grant' }, 'temporary_failure'], [400, { error: 'invalid_token' }, 'provider_failure'],
  [400, { error: 'invalid_client' }, 'provider_failure'], [200, {}, 'provider_failure']]) {
  test(`uncertain recovery ${status}/${JSON.stringify(body)} preserves data and PENDING`, async () => {
    const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: 200 } : providerResponse(status, body) });
    f.failures.confirmation = 1; await f.disconnect(); const before = structuredClone(f.state);
    assert.equal((await f.newWorker().disconnect()).reason, expected);
    assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'PENDING'); assert.equal(revokeCalls(f).length, 1);
  });
}

test('PENDING with still-valid authorization requires a new successful provider revoke', async () => {
  let attempts = 0;
  const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: ++attempts === 1 ? 503 : 200 } : providerResponse(200, { access_token: 'probe-valid' }) });
  await f.disconnect(); assert.equal(receipt(f).state, 'PENDING');
  assert.equal((await f.newWorker().disconnect()).authorizationRevoked, true); cleaned(f);
  assert.equal(revokeCalls(f).length, 2); assert.equal(f.calls.length, 3);
});

test('expired confirmation cannot authorize cleanup until auth is safely re-established', async () => {
  const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: 200 } : providerResponse(503, { error: 'invalid_grant' }) });
  await f.revoke.revokeYouTubeAuthorization('owner'); f.storage.rows[0].expiresAt = new Date(0);
  assert.equal(await withCredentialLocks(f, tx => f.revoke.hasConfirmedYouTubeRevoke(tx, 'owner', f.state.token)), false);
  const before = structuredClone(f.state); assert.equal((await f.newWorker().disconnect()).reason, 'temporary_failure');
  assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'PENDING'); assert.equal(revokeCalls(f).length, 1);
});

test('expired operations in the revoke namespace are pruned without touching OAuth or Better Auth state', async () => {
  const f = fixture();
  for (const id of ['youtube-revoke:expired-other', 'youtube-oauth-state:keep', 'better-auth-keep']) {
    f.storage.rows.push({ id, identifier: id, value: 'unrelated', expiresAt: new Date(0) });
  }
  await f.revoke.revokeYouTubeAuthorization('owner');
  assert.equal(f.storage.rows.some(row => row.id === 'youtube-revoke:expired-other'), false);
  assert.equal(f.storage.rows.some(row => row.id === 'youtube-oauth-state:keep'), true);
  assert.equal(f.storage.rows.some(row => row.id === 'better-auth-keep'), true);
});

test('receipt deletion failure rolls back all local cleanup and keeps confirmation for retry', async () => {
  const f = fixture(); f.failures.receiptDelete = 1; const before = structuredClone(f.state);
  assert.equal((await f.disconnect()).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
  assert.equal(receipt(f).state, 'CONFIRMED');
  assert.equal((await f.newWorker().disconnect()).ok, true); cleaned(f);
  assert.deepEqual(f.storage.rows, []); assert.equal(f.calls.length, 1);
});

test('late provider confirmation cannot overwrite a newer operation or authorize newer data cleanup', async () => {
  const started = deferred(), response = deferred(); let count = 0;
  const f = fixture({ provider: async () => ++count === 1 ? (started.resolve(), response.promise) : { status: 503 } });
  const old = f.disconnect(); await started.promise; await f.reconnect();
  assert.equal((await f.newWorker().disconnect()).reason, 'connection_changed');
  assert.equal((await f.newWorker().disconnect()).reason, 'temporary_failure');
  const newerReceipt = structuredClone(f.storage.rows), fresh = structuredClone(f.state);
  response.resolve({ status: 200 }); assert.equal((await old).reason, 'connection_changed');
  assert.deepEqual(f.state, fresh); assert.deepEqual(f.storage.rows, newerReceipt);
});

test('ambiguous access-only recovery 401 is not confirmed dead authorization', async () => {
  const initial = credential(); initial.refreshToken = null;
  const f = fixture({ initial, provider: async url => url.endsWith('/revoke') ? { status: 200 } : providerResponse(401, { error: { errors: [{ reason: 'unknown' }] } }) });
  f.failures.confirmation = 1; await f.disconnect(); const before = structuredClone(f.state);
  assert.equal((await f.newWorker().disconnect()).reason, 'provider_failure'); assert.deepEqual(f.state, before);
  assert.equal(receipt(f).state, 'PENDING'); assert.equal(revokeCalls(f).length, 1);
});

test('network failure during PENDING recovery keeps all data and cannot confirm authorization gone', async () => {
  const f = fixture({ provider: async url => { if (url.endsWith('/revoke')) return { status: 200 }; throw Error('network'); } });
  f.failures.confirmation = 1; await f.disconnect(); const before = structuredClone(f.state);
  assert.equal((await f.newWorker().disconnect()).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
  assert.equal(receipt(f).state, 'PENDING'); assert.equal(revokeCalls(f).length, 1);
});

test('expired confirmed proof can recover using current definitive dead auth, without claiming a new revoke', async () => {
  const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: 200 } : providerResponse(400, { error: 'invalid_grant' }) });
  await f.revoke.revokeYouTubeAuthorization('owner'); f.storage.rows[0].expiresAt = new Date(0);
  const result = await f.newWorker().disconnect(); assert.equal(result.ok, true); assert.equal(result.authorizationRevoked, false);
  cleaned(f); assert.deepEqual(f.storage.rows, []); assert.equal(revokeCalls(f).length, 1);
});

test('valid recovery revokes a replacement refresh credential returned by Google', async () => {
  let attempts = 0;
  const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: ++attempts === 1 ? 503 : 200 }
    : providerResponse(200, { access_token: 'probe-access', refresh_token: 'probe-new-refresh' }) });
  await f.disconnect(); assert.equal((await f.newWorker().disconnect()).ok, true);
  assert.equal(new URLSearchParams(revokeCalls(f)[1].init.body).get('token'), 'probe-new-refresh');
  cleaned(f); assert.deepEqual(f.storage.rows, []);
});

test('reconnect during a PENDING dead-auth probe survives both confirmation and destructive cleanup', async () => {
  const started = deferred(), response = deferred();
  const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: 200 } : (started.resolve(), response.promise) });
  f.failures.confirmation = 1; await f.disconnect();
  const retry = f.newWorker().disconnect(); await started.promise; await f.reconnect(); const fresh = structuredClone(f.state);
  response.resolve(providerResponse(400, { error: 'invalid_grant' }));
  assert.equal((await retry).reason, 'connection_changed'); assert.deepEqual(f.state, fresh); assert.equal(revokeCalls(f).length, 1);
});

for (const mode of ['disconnect', 'account', 'admin']) {
  for (const accessOnly of [false, true]) {
    test(`${mode}: pruned confirmation recovers revoke 400 with exact ${accessOnly ? 'access' : 'refresh'} dead-auth probe`, { timeout: 10000 }, async () => {
      const initial = credential(); if (accessOnly) initial.refreshToken = null;
      let revokes = 0;
      const f = fixture({ initial, provider: async (url, init) => {
        if (url.endsWith('/revoke')) return { status: ++revokes === 1 ? 200 : 400 };
        if (accessOnly) {
          assert.match(url, /youtube\/v3\/channels\?part=id&mine=true/);
          assert.equal(init.headers.Authorization, 'Bearer private-access');
          return providerResponse(401, { error: { errors: [{ reason: 'authError' }] } });
        }
        assert.equal(new URLSearchParams(init.body).get('refresh_token'), 'private-refresh');
        return providerResponse(400, { error: 'invalid_grant' });
      } });
      if (mode === 'disconnect') f.failures.cleanup = 1; else f.failures.deletion = 1;
      const before = structuredClone(f.state);
      const first = await f[mode]('target'); assert.equal(mode === 'disconnect' ? first.ok : first.success, false);
      assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'CONFIRMED');
      f.storage.rows[0].expiresAt = new Date(0);
      await f.db.verification.deleteMany({ where: { identifier: { startsWith: 'youtube-revoke:' }, expiresAt: { lte: new Date() } } });
      assert.deepEqual(f.storage.rows, []);
      f.hooks.beforeReceiptConsume = () => {
        assert.equal(receipt(f).state, 'CONFIRMED'); assert.equal(receipt(f).proof, 'dead_auth');
        assert.ok(f.storage.rows[0].expiresAt > new Date());
      };
      const retry = await f.newWorker()[mode]('target');
      if (accessOnly) {
        assert.equal(mode === 'disconnect' ? retry.ok : retry.success, false);
        assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'PENDING');
        assert.equal(revokes, 2); return;
      }
      assert.equal(mode === 'disconnect' ? retry.ok : retry.success, true);
      if (mode === 'disconnect') { assert.equal(retry.authorizationRevoked, false); cleaned(f); }
      else { assert.equal(f.state.deleted, true); assert.equal(f.state.token, null); assert.deepEqual(f.state.stats, []); }
      assert.equal(revokes, 2); assert.equal(f.calls.length, 3); assert.deepEqual(f.storage.rows, []);
    });
  }
  for (const [label, status, body, expected] of [
    ['live', 200, { access_token: 'probe-live' }, 'provider_failure'],
    ['server', 503, { error: 'invalid_grant' }, 'temporary_failure'],
    ['throttled', 429, { error: 'invalid_grant' }, 'temporary_failure'],
    ['ambiguous', 400, { error: 'invalid_client' }, 'provider_failure'],
  ]) {
    test(`${mode}: pruned receipt and revoke 400 with ${label} probe blocks destructive cleanup`, { timeout: 10000 }, async () => {
      let revokes = 0;
      const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: ++revokes === 1 ? 200 : 400 } : providerResponse(status, body) });
      if (mode === 'disconnect') f.failures.cleanup = 1; else f.failures.deletion = 1;
      await f[mode]('target'); f.storage.rows = []; const before = structuredClone(f.state);
      const result = await f.newWorker()[mode]('target');
      assert.equal(mode === 'disconnect' ? result.ok : result.success, false);
      if (mode === 'disconnect') assert.equal(result.reason, expected);
      else assert.match(result.error, /try again/);
      assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'PENDING');
      assert.equal(revokes, 2); assert.equal(f.calls.length, 3);
    });
  }
  test(`${mode}: pruning wins between receipt read and conditional consumption, aborting before data writes`, { timeout: 10000 }, async () => {
    let revokes = 0;
    const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: ++revokes === 1 ? 200 : 400 } : providerResponse(503, { error: 'invalid_grant' }) });
    f.hooks.beforeReceiptConsume = ({ expire, prune }) => { expire(); prune(); f.hooks.beforeReceiptConsume = null; };
    const before = structuredClone(f.state);
    const result = await f[mode]('target'); assert.equal(mode === 'disconnect' ? result.ok : result.success, false);
    assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'PENDING');
    assert.ok(f.events.includes('prune-won')); assert.ok(f.events.includes('rollback'));
    assert.ok(!f.events.includes('receipt-consumed')); assert.ok(!f.events.includes('cascade'));
  });
  test(`${mode}: receipt consumption wins pruning boundary and commits with cleanup`, { timeout: 10000 }, async () => {
    const f = fixture(); let pruning;
    f.hooks.afterReceiptConsume = () => {
      assert.deepEqual(f.storage.rows, []); f.events.push('pruner-waits');
      pruning = f.pruneAfterTransaction();
    };
    const result = await f[mode]('target'); assert.equal(mode === 'disconnect' ? result.ok : result.success, true);
    assert.equal((await pruning).count, 0, 'pruner observes committed consumption after row lock release');
    assert.ok(f.events.indexOf('receipt-consumed') < f.events.indexOf('pruner-waits'));
    if (mode === 'disconnect') cleaned(f); else assert.equal(f.state.deleted, true);
    assert.deepEqual(f.storage.rows, []); assert.equal(f.calls.length, 1);
  });
  test(`${mode}: pruning boundary re-establishes proof outside rollback and completes in one bounded retry`, { timeout: 10000 }, async () => {
    let revokes = 0;
    const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: ++revokes === 1 ? 200 : 400 } : providerResponse(400, { error: 'invalid_grant' }) });
    f.hooks.beforeReceiptConsume = ({ expire, prune }) => { expire(); prune(); f.hooks.beforeReceiptConsume = null; };
    const result = await f[mode]('target'); assert.equal(mode === 'disconnect' ? result.ok : result.success, true);
    assert.ok(f.events.indexOf('rollback') < f.events.indexOf('receipt-consumed'));
    if (mode === 'disconnect') cleaned(f); else assert.equal(f.state.deleted, true);
    assert.equal(revokes, 2); assert.equal(f.calls.length, 3); assert.deepEqual(f.storage.rows, []);
  });
  test(`${mode}: expiry at conditional consumption cannot authorize cleanup without a fresh probe`, { timeout: 10000 }, async () => {
    const f = fixture({ provider: async url => url.endsWith('/revoke') ? { status: 200 } : providerResponse(503, { error: 'invalid_grant' }) });
    f.hooks.beforeReceiptConsume = ({ expire }) => { expire(); f.hooks.beforeReceiptConsume = null; };
    const before = structuredClone(f.state);
    const result = await f[mode]('target'); assert.equal(mode === 'disconnect' ? result.ok : result.success, false);
    assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'PENDING'); assert.equal(revokeCalls(f).length, 1);
    assert.ok(!f.events.includes('receipt-consumed'));
  });
}

for (const mode of ['account', 'admin']) {
  test(`${mode}: reconnect after confirmed preparation blocks final deletion until B is revoked separately`, { timeout: 10000 }, async () => {
    const f = fixture(); let fresh;
    f.hooks.afterYouTubePrepared = async () => { await f.reconnect(); fresh = structuredClone(f.state); f.hooks.afterYouTubePrepared = null; };
    assert.equal((await f[mode]('target')).success, false); assert.deepEqual(f.state, fresh);
    assert.equal(receipt(f).state, 'CONFIRMED'); assert.equal(f.calls.length, 1);
    assert.equal((await f.newWorker()[mode]('target')).success, false, 'stale A receipt must not confirm B');
    assert.deepEqual(f.state, fresh); assert.equal(f.calls.length, 1);
    assert.equal((await f.newWorker()[mode]('target')).success, true);
    assert.equal(new URLSearchParams(revokeCalls(f)[1].init.body).get('token'), 'new-refresh');
    assert.equal(f.state.deleted, true); assert.equal(revokeCalls(f).length, 2); assert.deepEqual(f.storage.rows, []);
  });
  test(`${mode}: provider preparation leaves every local row and confirmed receipt intact`, async () => {
    const f = fixture(); const before = structuredClone(f.state);
    const prepared = await f.revoke.prepareYouTubeAccountDeletion('owner');
    assert.equal(prepared.error, null); assert.deepEqual(prepared.credential, before.token);
    assert.deepEqual(f.state, before); assert.equal(receipt(f).state, 'CONFIRMED');
    assert.ok(!f.events.includes('receipt-consumed'));
  });
}

module.exports = { fixture, load };

test('3B reconnect rotates generation, clears PURGED, records validation only', async () => {
  const f = fixture({ initial: null });
  await f.removal.removeYouTubeLocalData('owner');
  const generation = f.state.compliance.connectionGeneration;
  await f.lifecycle.saveYouTubeAccessToken('owner', { accessToken: 'accepted', refreshToken: null, expiresAt: null, scopes: null, platformUserId: 'official-channel', username: null });
  assert.equal(f.state.compliance.status, 'ACTIVE');
  assert.equal(f.state.compliance.connectionGeneration, generation + 1);
  assert.equal(f.state.compliance.blockedAt, null);
  assert.equal(f.state.compliance.lastSuccessfulDataRefreshAt, null);
  assert.ok(f.state.compliance.lastSuccessfulAuthorizationValidationAt);
  assert.equal(f.state.curation.length, 0);
});

test('3B history purge persists markers, clears curation and legacy fallbacks', async () => {
  const f = fixture({ initial: null }); await f.removal.removeYouTubeLocalData('owner');
  assert.equal(f.state.compliance.removalReason, 'TOKENLESS_HISTORY');
  assert.ok(f.state.compliance.blockedAt); assert.ok(f.state.compliance.purgedAt);
  assert.equal(f.state.profileData.totalFollowers, 10); assert.equal(f.state.profileData.averageEngagement, null);
  assert.equal(f.state.profileData.avgEngagementRate, 0); assert.equal(f.state.profileData.lastStatsUpdate, null);
  assert.equal(f.state.curation.length, 0);
});

test('3B purge failure rolls back token, curation and compliance together', async () => {
  const f = fixture({ cleanupFails: true }); const before = structuredClone(f.state);
  await assert.rejects(f.removal.removeYouTubeLocalData('owner'));
  assert.deepEqual(f.state, before);
});

test('3B stale same-credential auth failure cannot purge accepted dataset revision', async () => {
  const f = fixture(); const old = structuredClone(f.state.token);
  f.state.compliance.revision++;
  assert.equal((await f.lifecycle.clearYouTubeDeadAuth('owner', old, { connectionGeneration: 1, revision: 1 })).reason, 'superseded');
  assert.equal(f.state.compliance.status, 'ACTIVE'); assert.ok(f.state.token);
});

test('3B authenticated authError reaches real atomic purge production path', async () => {
  const f = fixture({ provider: async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }) });
  f.db.creatorProfile = { findUnique: async () => ({ id: 'profile' }) };
  f.db.creatorContentCuration = { findMany: async () => [] };
  const sync = load('lib/youtube-sync.ts', { '@/lib/db': { db: f.db }, '@/lib/youtube-lock': locks,
    '@/lib/youtube-token': f.lifecycle, '@/lib/creator-metrics': metrics,
    '@/lib/youtube-auth': { youtubeFetch: async () => ({ ok: false, status: 401, json: async () => ({ error: { errors: [{ reason: 'authError' }] } }) }) } });
  assert.equal((await sync.syncYouTubeOfficialData('owner', { credential: structuredClone(f.state.token) })).reason, 'reauth_required');
  assert.equal(f.state.compliance.status, 'PURGED'); assert.equal(f.state.compliance.removalReason, 'AUTHORIZATION_LOST');
  assert.equal(f.state.token, null); assert.equal(f.state.curation.length, 0);
});
test('3B canonical profile/discovery metrics cannot fall back to purged YouTube aggregates', async () => {
  const f = fixture({ initial: null });
  f.state.stats = [{ platform: 'youtube', followerCount: 100 }];
  f.state.posts = [{ platform: 'youtube', views: 2000, likes: 100, comments: 3 }];
  await f.removal.removeYouTubeLocalData('owner');
  const result = metrics.getNormalizedCreatorMetrics({ platformStats: f.state.stats, socialPosts: f.state.posts,
    creatorProfile: { ...f.state.profileData, profileOrigin: 'IMPORTED' }, oauthPlatforms: [] });
  assert.equal(result.totalFollowers, null); assert.equal(result.avgViewsPerPost, null);
  assert.equal(result.averageEngagementRate, null); assert.equal(result.platforms.length, 0);
  assert.equal(f.state.profileData.totalFollowers, 0);
});
