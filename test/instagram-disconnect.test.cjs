const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: name => {
      if (name === 'server-only') return {};
    if (name === '@/lib/youtube-lock') return {};
    if (name === '@/lib/youtube-compliance' && !(name in imports)) return {};
    if (name === '@/lib/youtube-aggregates') return {};
    if (name === '@/lib/youtube-claim') return {};
      if (name === '@/lib/youtube-compliance') return load('lib/youtube-compliance.ts', {});
      if (!(name in imports)) throw Error(`Unexpected dependency ${name}`);
      return imports[name];
    }, console: { warn() {}, error() {} }, Date, Map, Set,
    fetch: () => { throw Error('Disconnect must not call a provider'); },
  }, { filename: file });
  return exports;
}
const metrics = load('lib/creator-metrics.ts', {});
const instagramAuth = load('lib/instagram-auth.ts', {});
const instagramLock = load('lib/instagram-lock.ts', {});

function fixture({ history = false, failAt, unauthorized = false, noProfile = false, markers = ["instagram", "youtube"], remaining = [0, null] } = {}) {
  const own = { userId: 'owner', platform: 'instagram' };
  const other = { userId: 'other', platform: 'instagram' };
  const post = { creatorProfileId: 'creator', platform: 'instagram', providerPostId: 'post', dataSource: 'OFFICIAL_API', insights: { views: 12 } };
  let state = {
    tokens: [{ ...own, accessToken: 'secret', expiresAt: new Date(Date.now() - 1000) }, other].filter(row => !history || row.userId !== 'owner'),
    stats: [{ ...own, followerCount: 123, dataSource: 'OFFICIAL_API', raw: { insights: { views: 12 } } }, other,
      ...remaining.map((followerCount, i) => ({ userId: 'owner', platform: `remaining${i}`, followerCount }))],
    posts: [post, { ...post, creatorProfileId: 'other-creator' }],
    curation: [{ creatorProfileId: 'creator', platform: 'instagram', providerPostId: 'post', featured: true, hidden: false }, { creatorProfileId: 'other-creator', platform: 'instagram' }, { creatorProfileId: 'creator', platform: 'youtube' }],
    profile: noProfile ? null : { id: 'creator', connectedPlatforms: markers, followerCount: 123, lastSyncedAt: 'old' },
  };
  let transactions = 0;
  const events = [], invalidated = [];
  const check = name => { events.push(name); if (name === failAt) throw Error('DB unavailable'); };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const db = { $transaction: async run => {
    transactions++;
    const draft = structuredClone(state);
    const tx = {};
    tx.verification = { deleteMany: async () => { check("threads.authority.invalidate"); return { count: 0 }; } };
    for (const [model, key] of [['platformToken', 'tokens'], ['platformStats', 'stats'], ['socialPost', 'posts'], ['creatorContentCuration', 'curation']]) {
      tx[model] = { deleteMany: async ({ where }) => {
        check(`${model}.deleteMany`);
        const before = draft[key].length;
        draft[key] = draft[key].filter(row => !matches(row, where));
        return { count: before - draft[key].length };
      } };
    }
    tx.platformStats.findMany = async ({ where }) => { check('stats.read'); return draft.stats.filter(row => matches(row, where)); };
    tx.creatorProfile = {
      findUnique: async ({ where }) => { assert.equal(where.userId, 'owner'); return draft.profile; },
      findUniqueOrThrow: async () => { check('profile.read'); if (!draft.profile) throw Error('missing'); return draft.profile; },
      update: async ({ where, data }) => { check('profile.update'); assert.equal(where.userId, 'owner'); for (const [key, value] of Object.entries(data)) if (value !== undefined) draft.profile[key] = value; },
    };
    tx.$executeRaw = async (sql, userId) => {
      check('marker.remove'); assert.equal(userId, 'owner');
      assert.match(sql.join(''), /array_remove\("connectedPlatforms", 'instagram'\)/);
      draft.profile.connectedPlatforms = draft.profile.connectedPlatforms.filter(p => p !== 'instagram');
    };
    tx.$queryRaw = async (sql, target) => {
      const query = sql.join('');
      assert.match(query, /FOR UPDATE/);
      if (query.includes('FROM "User"')) {
        check('owner.lock');
        assert.equal(target, 'owner');
        return [{ id: target }];
      }
      if (query.includes('FROM "CreatorProfile"')) {
        check('profile.lock');
        if (query.includes('WHERE "userId"')) {
          assert.equal(target, 'owner');
          return draft.profile ? [draft.profile] : [];
        }
        assert.equal(target, 'creator');
        return [{ id: 'creator' }];
      }
      check('token.lock');
      assert.equal(target, 'owner');
      return draft.tokens.filter(row => matches(row, own));
    };
    const result = await run(tx);
    state = draft;
    return result;
  } };
  db.creatorProfile = { findUnique: async ({ where }) => { assert.equal(where.userId, "owner"); return state.profile; } };
  db.platformToken = { findUnique: async () => state.tokens.find(row => matches(row, own)) ?? null };
  const imports = {
    '@/lib/db': { db }, '@/lib/auth': { auth: { api: { getSession: async () => unauthorized ? null : { user: { id: 'owner' } } } } },
    'next/headers': { headers: async () => ({}) }, 'next/cache': { revalidatePath: path => invalidated.push(path) },
    '@/lib/creator-metrics': metrics,
    '@/lib/instagram-lock': instagramLock,
  };
  imports['@/lib/youtube-removal'] = load('lib/youtube-removal.ts', {
    '@/lib/db': { db }, '@/lib/creator-metrics': metrics,
    '@/lib/youtube-lock': load('lib/youtube-lock.ts', {}),
  });
  imports['@/lib/threads-connection'] = load('lib/threads-connection.ts', {
    ...imports, '@/lib/threads-lock': load('lib/threads-lock.ts', {}),
    '@/lib/threads-auth': { threadsAuthorityId: id => `threads-test:${id}` },
    '@/lib/threads-token': {},
  });
  const action = load('app/actions/instagram-disconnect.ts', imports);
  const generic = load('app/actions/social-connections.ts', imports);
  const lifecycle = load('lib/instagram-token.ts', { '@/lib/db': { db }, '@/lib/instagram-auth': instagramAuth, '@/lib/instagram-lock': instagramLock });
  return { run: action.disconnectInstagramAction, generic: generic.removePlatformAction, lifecycle, state: () => structuredClone(state), events, invalidated, transactions: () => transactions };
}

for (const history of [false, true]) {
  test(`${history ? 'history-only' : 'active'} explicit removal clears only owner Instagram data and curation`, async () => {
    const f = fixture({ history });
    assert.equal((await f.run()).ok, true);
    const s = f.state();
    for (const key of ['tokens', 'stats']) assert.ok(!s[key].some(row => row.userId === 'owner' && row.platform === 'instagram'));
    for (const key of ['posts', 'curation']) assert.ok(!s[key].some(row => row.creatorProfileId === 'creator' && row.platform === 'instagram'));
    assert.equal(s.curation.length, 2); // Other creator and other provider untouched.
    assert.deepEqual(s.profile.connectedPlatforms, ['youtube']);
    assert.equal(s.profile.followerCount, 0);
    assert.equal(s.profile.lastSyncedAt, 'old');
    assert.equal(f.transactions(), 1);
    assert.ok(f.invalidated.includes('/creator/presence'));
    assert.ok(f.events.indexOf('token.lock') < f.events.indexOf('profile.lock'));
    assert.ok(f.events.indexOf('owner.lock') < f.events.indexOf('token.lock'));
    for (const model of ['platformToken', 'platformStats', 'socialPost', 'creatorContentCuration']) {
      assert.ok(f.events.indexOf('profile.lock') < f.events.indexOf(`${model}.deleteMany`));
    }
  });
}
for (const failAt of ['owner.lock', 'token.lock', 'profile.lock', 'platformToken.deleteMany', 'platformStats.deleteMany', 'socialPost.deleteMany', 'creatorContentCuration.deleteMany', 'marker.remove', 'profile.read', 'stats.read', 'profile.update']) {
  test(`database failure at ${failAt} rolls back all cleanup`, async () => {
    const f = fixture({ failAt }); const before = f.state();
    assert.equal((await f.run()).reason, 'temporary_failure');
    assert.deepEqual(f.state(), before);
    assert.equal(f.invalidated.length, 0);
  });
}
for (const remaining of [[], [null], [0], [25, null, 5]]) {
  test(`remaining follower counts ${JSON.stringify(remaining)} preserve null/zero semantics`, async () => {
    const f = fixture({ remaining }); assert.equal((await f.run()).ok, true);
    assert.equal(f.state().profile.followerCount, metrics.computeFollowerCache(remaining.map(followerCount => ({ followerCount }))));
  });
}
test('unauthenticated requests and missing profile never delete data', async () => {
  for (const options of [{ unauthorized: true }, { noProfile: true }]) {
    const f = fixture(options); const before = f.state();
    assert.equal((await f.run()).reason, options.unauthorized ? 'unauthorized' : 'profile_not_found');
    assert.deepEqual(f.state(), before);
    assert.deepEqual(f.events, options.unauthorized ? [] : ['owner.lock']);
  }
});
test('generic Instagram bypass rejects before touching DB; existing TikTok guard remains', async () => {
  const f = fixture();
  assert.equal((await f.generic('instagram')).error, 'use_instagram_disconnect');
  assert.match((await f.generic('tiktok')).error, /disconnectTikTokAction/);
  assert.equal(f.transactions(), 0);
});
for (const kind of ['190', 'expiry']) {
  test(`real dead-auth ${kind} removes token/marker and preserves stats/posts/insights/curation`, async () => {
    const f = fixture(); const before = f.state();
    const result = kind === '190'
      ? await f.lifecycle.handleInstagramGraphFailure('owner', { errorCode: 190, failedAccessToken: 'secret' })
      : await f.lifecycle.getInstagramAccessToken('owner');
    assert.equal(result.reason, 'reauth_required');
    const after = f.state();
    assert.ok(!after.tokens.some(row => row.userId === 'owner'));
    assert.deepEqual(after.profile.connectedPlatforms, ['youtube']);
    for (const key of ['stats', 'posts', 'curation']) assert.deepEqual(after[key], before[key]);
    assert.equal((await f.run()).ok, true); // History removal remains possible afterward.
    assert.ok(!f.state().curation.some(row => row.creatorProfileId === 'creator' && row.platform === 'instagram'));
  });
}
test('both UIs use dedicated removal and retain independent refresh/reconnect paths', () => {
  for (const file of ['_pages/creator/SocialAccounts.tsx', '_pages/creator/PresencePage.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /await disconnectInstagramAction\(\)/);
    assert.match(source, /await refreshInstagramDataAction\(\)/);
    assert.match(source, /instagram_history/);
    assert.match(source, /instagramRemoveLock.current\) return/);
    assert.match(source, /remove the app from your Instagram\/Meta connected-app settings/);
  }
  for (const file of ['lib/instagram-token.ts', 'lib/instagram-sync.ts']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /import.*(?:instagram-disconnect|social-connections)/);
  }
});

test('last connection removal clears freshness and repeated removal is safe', async () => {
  const f = fixture({ markers: ['instagram'], remaining: [] });
  assert.equal((await f.run()).ok, true);
  assert.equal(f.state().profile.lastSyncedAt, null);
  assert.equal(f.state().profile.followerCount, null);
  const after = f.state();
  assert.equal((await f.run()).ok, true);
  assert.deepEqual(f.state(), after);
});
test('Facebook cleanup and coordinated Threads cleanup remain available; YouTube requires dedicated disconnect', async () => {
  assert.equal((await fixture().generic('youtube')).error, 'use_youtube_disconnect');
  for (const platform of ['facebook_page', 'threads']) {
    const f = fixture();
    assert.equal((await f.generic(platform)).error, null);
    assert.equal(f.transactions(), 1);
    if (platform === 'threads') {
      assert.deepEqual(f.events.slice(0, 4), ['owner.lock', 'token.lock', 'profile.lock', 'threads.authority.invalidate']);
    }
    assert.ok(f.state().tokens.some(row => row.userId === 'owner' && row.platform === 'instagram'));
    assert.ok(f.state().curation.some(row => row.creatorProfileId === 'creator' && row.platform === 'instagram'));
  }
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Coordinate the real actions at their database boundaries. Only the profile
// row lock is serialized, not whole transactions; reads see committed cleanup
// after waiting. The fixture above separately exercises failure/rollback paths.
function concurrencyFixture({ history, firstActor }) {
  const paused = deferred(), resume = deferred(), secondWaiting = deferred();
  const events = [], lockTargets = [];
  const state = {
    tokens: history ? [] : [{ userId: 'owner', platform: 'instagram' }],
    stats: [{ userId: 'owner', platform: 'instagram', followerCount: 123 }],
    posts: [{ id: 'post-row', creatorProfileId: 'creator', platform: 'instagram', providerPostId: 'post' }],
    curation: [],
    profile: { id: 'creator', userId: 'owner', connectedPlatforms: ['instagram'], followerCount: 123 },
  };
  let profileTail = Promise.resolve(), transactionCount = 0;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const db = {
    creatorProfile: { findUnique: async () => state.profile },
    $transaction: async run => {
      const actor = transactionCount++ === 0 ? firstActor : firstActor === 'curation' ? 'disconnect' : 'curation';
      let releaseProfile;
      const tx = {
        $queryRaw: async (sql, target) => {
          const query = sql.join('');
          assert.match(query, /FOR UPDATE/);
          if (query.includes('FROM "User"')) {
            assert.equal(target, 'owner');
            events.push(`${actor}:owner.lock`);
            return [{ id: target }];
          }
          if (query.includes('FROM "PlatformToken"')) {
            assert.equal(target, 'owner');
            events.push(`${actor}:token.lock`);
            return state.tokens;
          }
          assert.match(query, /SELECT id FROM "CreatorProfile"\s+WHERE id =/);
          assert.equal(target, 'creator');
          lockTargets.push({ actor, target });
          const previous = profileTail, released = deferred();
          profileTail = released.promise;
          if (actor !== firstActor) secondWaiting.resolve();
          await previous;
          releaseProfile = released.resolve;
          events.push(`${actor}:profile.lock`);
          if (actor === 'disconnect' && firstActor === 'disconnect') {
            paused.resolve();
            await resume.promise;
          }
          return [{ id: target }];
        },
        $executeRaw: async (_sql, userId) => {
          assert.equal(userId, 'owner');
          assert.ok(releaseProfile, 'marker cleanup must hold the profile lock');
          state.profile.connectedPlatforms = [];
        },
        creatorProfile: {
          findUnique: async () => state.profile,
          findUniqueOrThrow: async () => state.profile,
          update: async ({ data }) => Object.assign(state.profile, data),
        },
      };
      for (const [model, key] of [['platformToken', 'tokens'], ['platformStats', 'stats'], ['socialPost', 'posts'], ['creatorContentCuration', 'curation']]) {
        tx[model] = { deleteMany: async ({ where }) => {
          assert.ok(releaseProfile, `${model} cleanup must hold the profile lock`);
          events.push(`${actor}:${model}.deleteMany`);
          state[key] = state[key].filter(row => !matches(row, where));
        } };
      }
      tx.platformStats.findMany = async ({ where }) => state.stats.filter(row => matches(row, where));
      tx.socialPost.findFirst = async ({ where }) => {
        assert.ok(releaseProfile, 'production curation must lock before post validation');
        const post = state.posts.find(row => matches(row, where)) ?? null;
        if (actor === 'curation' && firstActor === 'curation') {
          assert.ok(post, 'curation validated the pre-disconnect post');
          paused.resolve();
          await resume.promise;
        }
        return post;
      };
      Object.assign(tx.creatorContentCuration, {
        findMany: async ({ where }) => state.curation.filter(row => matches(row, where)),
        upsert: async ({ where, create, update }) => {
          const row = state.curation.find(row => matches(row, where.creatorProfileId_platform_providerPostId));
          if (row) Object.assign(row, update);
          else state.curation.push({ id: 'curation-row', ...create });
          events.push(`${actor}:curation.upsert`);
        },
        update: async ({ where, data }) => Object.assign(state.curation.find(row => matches(row, where)), data),
      });
      try { return await run(tx); }
      finally { if (releaseProfile) releaseProfile(); }
    },
  };
  const imports = {
    '@/lib/db': { db }, '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'owner' } }) } } },
    'next/headers': { headers: async () => ({}) }, 'next/cache': { revalidatePath() {} },
    '@/lib/creator-metrics': metrics,
    '@/lib/instagram-lock': instagramLock,
    '@/lib/content-curation': load('lib/content-curation.ts', {}),
  };
  return {
    disconnect: load('app/actions/instagram-disconnect.ts', imports).disconnectInstagramAction,
    curation: load('app/actions/content-curation.ts', imports),
    state, events, lockTargets, paused, resume, secondWaiting,
  };
}

for (const history of [false, true]) {
  for (const mutation of ['hide', 'feature']) {
    for (const firstActor of ['curation', 'disconnect']) {
      test(`${history ? 'history-only' : 'active'} disconnect serializes with production ${mutation}, ${firstActor} first`, { timeout: 5000 }, async () => {
        const f = concurrencyFixture({ history, firstActor });
        const curate = () => mutation === 'hide'
          ? f.curation.setContentHiddenAction({ platform: 'instagram', providerPostId: 'post', hidden: true })
          : f.curation.setContentFeaturedAction({ platform: 'instagram', providerPostId: 'post', featured: true });
        const first = firstActor === 'curation' ? curate() : f.disconnect();
        await f.paused.promise;
        const second = firstActor === 'curation' ? f.disconnect() : curate();
        try {
          await f.secondWaiting.promise;
          assert.equal(f.events.some(event => event.includes('.deleteMany') || event.includes('curation.upsert')), false);
          assert.deepEqual(f.lockTargets.map(lock => lock.target), ['creator', 'creator']);
        } finally {
          f.resume.resolve();
        }
        const [firstResult, secondResult] = await Promise.all([first, second]);
        const disconnectResult = firstActor === 'disconnect' ? firstResult : secondResult;
        const curationResult = firstActor === 'curation' ? firstResult : secondResult;
        assert.equal(disconnectResult.ok, true);
        if (firstActor === 'curation') {
          assert.equal(curationResult.ok, true);
          assert.ok(f.events.indexOf('curation:curation.upsert') < f.events.indexOf('disconnect:socialPost.deleteMany'));
        } else {
          assert.equal(curationResult.code, 'post_not_found');
          assert.ok(!f.events.includes('curation:curation.upsert'));
        }
        assert.equal(f.state.posts.length, 0);
        assert.equal(f.state.curation.length, 0);
        assert.equal(f.state.tokens.length, 0);
        assert.equal(f.state.stats.length, 0);
        assert.deepEqual(f.state.profile.connectedPlatforms, []);
        assert.equal(f.state.profile.followerCount, null);
      });
    }
  }
}
