const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports, fetch) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, require: name => {
      if (name === 'server-only') return {};
      assert.ok(name in imports, `Unexpected dependency ${name}`);
      return imports[name];
    }, fetch, URL, Date, AbortSignal, console: { warn() {}, error() {} },
  }, { filename: file });
  return exports;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const auth = load('lib/instagram-auth.ts', {});
const locks = load('lib/instagram-lock.ts', {});
const metrics = load('lib/creator-metrics.ts', {});
const saved = credential => ({ accessToken: credential, expiresAt: new Date(Date.now() + 30 * 86400000), scopes: 'instagram_business_basic', platformUserId: 'account', username: 'creator' });

// Model each DB row lock separately, including implicit mutation locks and the
// absence of a lock for an empty token SELECT. Execute production actions and
// lifecycle/save/sync functions; the fixture contains no auth cleanup logic.
function fixture({ history = false, pauseFirst = true, ownerMissing = false, providerCredentialChange = false, conditionalDeleteMiss = false, refreshInvalid = false } = {}) {
  const state = {
    token: history ? null : { id: 'token', ...saved('OLD'), updatedAt: new Date(0) },
    profile: { id: 'creator', connectedPlatforms: ['instagram', 'youtube'], followerCount: 12 },
    stats: [{ userId: 'owner', platform: 'instagram', followerCount: 12, raw: { insights: { history: true } }, providerAccountId: 'account', dataSource: 'OFFICIAL_API' }, { userId: 'owner', platform: 'youtube', followerCount: 0 }],
    posts: [{ creatorProfileId: 'creator', platform: 'instagram', providerPostId: 'old-post' }],
    curation: [{ creatorProfileId: 'creator', platform: 'instagram', providerPostId: 'old-post', isFeatured: true }],
  };
  const held = deferred(), resume = deferred(), waiting = deferred();
  const resources = new Map(), events = [], transactions = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const fetch = async url => {
    events.push(`provider:${url.pathname}`);
    if (url.pathname === '/refresh_access_token') {
      const body = refreshInvalid ? { error: { code: 190 } } : { access_token: 'REFRESHED', expires_in: 5184000 };
      return { ok: !refreshInvalid, status: refreshInvalid ? 400 : 200, text: async () => JSON.stringify(body) };
    }
    if (providerCredentialChange && url.pathname === '/me/media') await lifecycle.saveInstagramAccessToken('owner', saved('NEW'));
    const body = url.pathname === '/me'
      ? { id: 'account', username: 'creator', followers_count: 4, account_type: 'BUSINESS' }
      : { data: [{ id: 'new-post', media_type: 'IMAGE', media_product_type: 'FEED' }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const db = {
    platformToken: { findUnique: async () => state.token ? structuredClone(state.token) : null },
    $transaction: async run => {
      const index = transactions.length, owned = new Set(), releases = [];
      transactions.push(index);
      let highestRank = -1;
      const acquire = async (key, rank) => {
        if (owned.has(key)) return;
        assert.ok(rank >= highestRank, `tx${index} reverse lock order: ${key}`);
        // Also fail if a token/profile operation forgot the stable owner lock.
        if (rank > 0) assert.ok(owned.has('owner'), `tx${index} missing owner coordination before ${key}`);
        const previous = resources.get(key) ?? Promise.resolve(), released = deferred();
        resources.set(key, released.promise);
        events.push(`tx${index}:${key}.request`);
        if (index > 0 && key === 'owner') waiting.resolve();
        await previous;
        owned.add(key); highestRank = rank; releases.push(released.resolve);
        events.push(`tx${index}:${key}.lock`);
        if (index === 0 && key === 'owner' && pauseFirst) {
          held.resolve();
          await resume.promise;
        }
      };
      const snapshotAfterOwner = { value: null };
      const tx = {
        $queryRaw: async (sql, target) => {
          const query = sql.join('');
          assert.match(query, /FOR UPDATE/);
          if (query.includes('FROM "User"')) {
            assert.equal(target, 'owner');
            if (ownerMissing) return [];
            await acquire('owner', 0);
            snapshotAfterOwner.value = structuredClone(state);
            return [{ id: 'owner' }];
          }
          if (query.includes('FROM "PlatformToken"')) {
            assert.equal(target, 'owner');
            assert.ok(owned.has('owner'), 'empty token SELECT must still hold owner coordination');
            if (!state.token) { events.push(`tx${index}:token.absent`); return []; }
            await acquire('token', 1);
            return [structuredClone(state.token)];
          }
          assert.ok(query.includes('FROM "CreatorProfile"'));
          assert.equal(target, 'creator');
          await acquire('profile', 2);
          return [{ id: 'creator' }];
        },
        platformToken: {
          upsert: async ({ create, update }) => {
            await acquire('token', 1);
            state.token = state.token ? { ...state.token, ...update } : { id: 'token', updatedAt: new Date(), ...create };
            events.push(`tx${index}:token.save`);
          },
          deleteMany: async ({ where }) => {
            assert.ok(owned.has('owner'));
            // DELETE locks a matching row, not a nonexistent token slot.
            if (state.token) await acquire('token', 1);
            events.push(`tx${index}:token.delete`);
            if (conditionalDeleteMiss) return { count: 0 };
            const count = state.token && matches({ userId: 'owner', platform: 'instagram', ...state.token }, where) ? 1 : 0;
            if (count) state.token = null;
            return { count };
          },
          update: async ({ data }) => { await acquire('token', 1); Object.assign(state.token, data); },
        },
        creatorProfile: {
          findUnique: async () => ({ id: 'creator' }),
          findUniqueOrThrow: async () => structuredClone(state.profile),
          update: async ({ data }) => {
            await acquire('profile', 2);
            for (const [key, value] of Object.entries(data)) if (value !== undefined) state.profile[key] = value;
          },
        },
        platformStats: {
          findUnique: async () => state.stats.find(row => row.platform === 'instagram') ?? null,
          upsert: async ({ create, update }) => {
            assert.ok(owned.has('owner'));
            const existing = state.stats.find(row => row.platform === 'instagram');
            if (existing) Object.assign(existing, update); else state.stats.push(create);
          },
          findMany: async () => structuredClone(state.stats),
        },
        socialPost: { createMany: async ({ data }) => state.posts.push(...data) },
        creatorContentCuration: {},
        $executeRaw: async (sql, ...params) => {
          const query = sql.join('');
          if (query.includes('UPDATE "PlatformToken"')) {
            await acquire('token', 1); state.token.username = params[0];
          } else {
            await acquire('profile', 2);
            if (query.includes('array_remove')) state.profile.connectedPlatforms = state.profile.connectedPlatforms.filter(platform => platform !== 'instagram');
            else if (!state.profile.connectedPlatforms.includes('instagram')) state.profile.connectedPlatforms.push('instagram');
          }
        },
      };
      for (const [model, key] of [['platformStats', 'stats'], ['socialPost', 'posts'], ['creatorContentCuration', 'curation']]) {
        tx[model].deleteMany = async ({ where }) => {
          assert.ok(owned.has('profile'), `${model} deletion must hold profile lock`);
          state[key] = state[key].filter(row => !matches(row, where));
          return { count: 1 };
        };
      }
      try { return await run(tx); }
      catch (error) {
        if (snapshotAfterOwner.value) Object.assign(state, snapshotAfterOwner.value);
        throw error;
      } finally { events.push(`tx${index}:finish`); releases.reverse().forEach(release => release()); }
    },
  };
  const common = { '@/lib/db': { db }, '@/lib/instagram-lock': locks };
  const lifecycle = load('lib/instagram-token.ts', { ...common, '@/lib/instagram-auth': auth }, fetch);
  const insights = load('lib/instagram-insights.ts', { '@/lib/generated/prisma': {}, './instagram-auth': auth }, fetch);
  const sync = load('lib/instagram-sync.ts', { ...common, '@/lib/instagram-auth': auth, '@/lib/instagram-token': lifecycle, '@/lib/instagram-insights': insights, '@/lib/creator-metrics': metrics }, fetch);
  const disconnect = load('app/actions/instagram-disconnect.ts', {
    ...common, '@/lib/creator-metrics': metrics,
    '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'owner' } }) } } },
    'next/headers': { headers: async () => ({}) }, 'next/cache': { revalidatePath() {} },
  }).disconnectInstagramAction;
  return { state, events, held, resume, waiting, lifecycle, disconnect,
    save: () => lifecycle.saveInstagramAccessToken('owner', saved('NEW')),
    sync: () => sync.syncInstagramOfficialData('owner'),
    cleanup: () => lifecycle.handleInstagramGraphFailure('owner', { errorCode: 190, failedAccessToken: 'OLD' }),
  };
}

for (const firstActor of ['reconnect', 'cleanup']) {
  test(`stale 190 vs reconnect: ${firstActor} wins owner coordination`, { timeout: 5000 }, async () => {
    const f = fixture();
    const history = structuredClone({ stats: f.state.stats, posts: f.state.posts, curation: f.state.curation });
    const first = firstActor === 'reconnect' ? f.save() : f.cleanup();
    await f.held.promise;
    const second = firstActor === 'reconnect' ? f.cleanup() : f.save();
    try {
      await f.waiting.promise;
      assert.ok(!f.events.includes('tx1:owner.lock'), 'second actor must wait on owner');
      assert.ok(!f.events.includes('tx1:token.lock'));
    } finally { f.resume.resolve(); }
    const results = await Promise.all([first, second]);
    assert.equal(f.state.token.accessToken, 'NEW');
    assert.deepEqual({ stats: f.state.stats, posts: f.state.posts, curation: f.state.curation }, history);
    const cleanupResult = results[firstActor === 'cleanup' ? 0 : 1];
    if (firstActor === 'reconnect') {
      assert.equal(cleanupResult.ok, true);
      assert.ok(f.state.profile.connectedPlatforms.includes('instagram'));
      assert.ok(!f.events.some(event => event.endsWith('token.delete')));
    } else {
      assert.equal(cleanupResult.reason, 'reauth_required');
      assert.ok(!f.state.profile.connectedPlatforms.includes('instagram'));
    }
    assert.equal((await f.sync()).ok, true); // Real callback sequence: coordinated save -> shared sync.
    assert.equal(f.state.token.accessToken, 'NEW');
    assert.ok(f.state.profile.connectedPlatforms.includes('instagram'));
  });
}

test('direct stale credential guard preserves new token, marker and history', async () => {
  const f = fixture({ pauseFirst: false });
  await f.save();
  const before = structuredClone(f.state);
  assert.equal((await f.cleanup()).ok, true);
  assert.deepEqual(f.state, before);
});

for (const refreshInvalid of [false, true]) {
  test(`near-expiry lifecycle ${refreshInvalid ? '190 cleanup' : 'renewal'} coordinates before reconnect`, { timeout: 5000 }, async () => {
    const f = fixture({ refreshInvalid });
    f.state.token.expiresAt = new Date(Date.now() + 3 * 86400000);
    const history = structuredClone({ stats: f.state.stats, posts: f.state.posts, curation: f.state.curation });
    const first = f.lifecycle.getInstagramAccessToken('owner');
    await f.held.promise;
    const second = f.save();
    try {
      await f.waiting.promise;
      assert.ok(!f.events.includes('tx1:token.lock'));
      assert.ok(!f.events.includes('provider:/refresh_access_token'));
    } finally { f.resume.resolve(); }
    const [result] = await Promise.all([first, second]);
    if (refreshInvalid) assert.equal(result.reason, 'reauth_required');
    else assert.equal(result.accessToken, 'REFRESHED');
    assert.equal(f.state.token.accessToken, 'NEW');
    assert.deepEqual({ stats: f.state.stats, posts: f.state.posts, curation: f.state.curation }, history);
    assert.equal((await f.sync()).ok, true);
    assert.ok(f.state.profile.connectedPlatforms.includes('instagram'));
  });
}

for (const firstActor of ['disconnect', 'reconnect', 'sync']) {
  test(`history-only removal vs ${firstActor}: owner coordination prevents reverse lock cycle`, { timeout: 5000 }, async () => {
    const f = fixture({ history: firstActor !== 'sync' });
    const first = firstActor === 'disconnect' ? f.disconnect() : firstActor === 'sync' ? f.sync() : f.save();
    await f.held.promise;
    const second = firstActor === 'disconnect' ? f.save() : f.disconnect();
    try {
      await f.waiting.promise;
      assert.ok(!f.events.includes('tx1:owner.lock'));
      assert.ok(!f.events.includes('tx1:token.lock'));
      assert.ok(!f.events.includes('tx1:profile.lock'));
    } finally { f.resume.resolve(); }
    const results = await Promise.all([first, second]);
    const disconnectResult = results[firstActor === 'disconnect' ? 0 : 1];
    assert.equal(disconnectResult.ok, true);
    assert.equal(f.state.posts.length, 0);
    assert.equal(f.state.curation.length, 0);
    assert.ok(!f.state.stats.some(row => row.platform === 'instagram'));
    assert.equal(f.state.profile.followerCount, 0);
    assert.deepEqual(f.state.profile.connectedPlatforms, ['youtube']);
    if (firstActor === 'disconnect') {
      assert.equal(f.state.token.accessToken, 'NEW');
      assert.equal((await f.sync()).ok, true);
      assert.ok(f.state.profile.connectedPlatforms.includes('instagram'));
      assert.equal(f.state.curation.length, 0);
      assert.equal(f.state.posts[0].providerPostId, 'new-post');
    } else {
      assert.equal(f.state.token, null);
    }
  });
}

test('sync cannot commit old provider results after a same-account credential replacement', async () => {
  const f = fixture({ pauseFirst: false, providerCredentialChange: true });
  const before = structuredClone({ stats: f.state.stats, posts: f.state.posts, curation: f.state.curation });
  assert.equal((await f.sync()).reason, 'temporary_failure');
  assert.equal(f.state.token.accessToken, 'NEW');
  assert.deepEqual({ stats: f.state.stats, posts: f.state.posts, curation: f.state.curation }, before);
  assert.ok(f.state.profile.connectedPlatforms.includes('instagram'));
});

test('current confirmed 190 deletes only the rejected credential and preserves history', async () => {
  const f = fixture({ pauseFirst: false });
  const history = structuredClone({ stats: f.state.stats, posts: f.state.posts, curation: f.state.curation });
  assert.equal((await f.cleanup()).reason, 'reauth_required');
  assert.equal(f.state.token, null);
  assert.deepEqual(f.state.profile.connectedPlatforms, ['youtube']);
  assert.deepEqual({ stats: f.state.stats, posts: f.state.posts, curation: f.state.curation }, history);
});

test('missing token cleanup only clears stale marker and serializes with token creation', { timeout: 5000 }, async () => {
  const f = fixture({ history: true });
  const first = f.cleanup();
  await f.held.promise;
  const second = f.save();
  try { await f.waiting.promise; } finally { f.resume.resolve(); }
  await Promise.all([first, second]);
  assert.equal(f.state.token.accessToken, 'NEW');
  assert.ok(!f.events.some(event => event.endsWith('token.delete')));
  assert.equal((await f.sync()).ok, true);
  assert.ok(f.state.profile.connectedPlatforms.includes('instagram'));
});

test('failed conditional credential deletion never removes connected marker', async () => {
  const f = fixture({ pauseFirst: false, conditionalDeleteMiss: true });
  const before = structuredClone(f.state);
  assert.equal((await f.cleanup()).reason, 'temporary_failure');
  assert.deepEqual(f.state, before);
});

test('unidentified code 190 cannot remove the current stored credential', async () => {
  const f = fixture({ pauseFirst: false });
  const before = structuredClone(f.state);
  assert.equal((await f.lifecycle.handleInstagramGraphFailure('owner', { errorCode: 190 })).reason, 'temporary_failure');
  assert.deepEqual(f.state, before);
});

test('missing stable owner fails safely for save, lifecycle, sync and disconnect', async () => {
  const f = fixture({ pauseFirst: false, ownerMissing: true });
  const before = structuredClone(f.state);
  await assert.rejects(f.save(), /instagram_owner_missing/);
  assert.equal((await f.cleanup()).reason, 'temporary_failure');
  assert.equal((await f.sync()).reason, 'temporary_failure');
  assert.equal((await f.disconnect()).reason, 'temporary_failure');
  assert.deepEqual(f.state, before);
  assert.ok(!f.events.some(event => event.includes('token.lock') || event.includes('profile.lock')));
});
