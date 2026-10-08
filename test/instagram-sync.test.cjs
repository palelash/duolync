const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real TypeScript modules with isolated provider/DB boundaries.
// No database, credentials, live Graph calls, or Vitest dependency required.
function load(file, imports, fetch) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: name => {
      if (name === 'server-only') return {};
      if (!(name in imports)) throw Error(`Unexpected dependency ${name}`);
      return imports[name];
    }, fetch, URL, Date, AbortSignal, console,
  }, { filename: file });
  return exports;
}
const auth = load('lib/instagram-auth.ts', {}, undefined);
const instagramLock = load('lib/instagram-lock.ts', {}, undefined);
function fixture({ scope = true, lifecycle, identity = 'account', failure, empty = false, mutateToken = false, realLifecycle = false, dbFailure = false, insightData = {}, mediaType = "VIDEO", productType = "REELS", priorMediaInsights = true, mediaItems } = {}) {
  let state = { raw: { instagram_id: 'account', insights: { account: { profileViews: 55, fetchedAt: 'old' }, media: { post: { views: 42, fetchedAt: 'old' } } } }, posts: [{ providerPostId: 'post', id: 'old', dataSource: 'APIFY' }], curation: { post: { featured: true, hidden: false } } };
  if (!priorMediaInsights) state.raw.insights.media = {};
  let token = { accessToken: 'secret', platformUserId: 'account', scopes: scope ? 'instagram_business_manage_insights' : 'instagram_business_basic' };
  if (realLifecycle) { token.expiresAt = new Date(Date.now() + 3 * 86400000); token.updatedAt = new Date(Date.now() - 2 * 86400000); }
  let lifecycleCalls = 0, cleanups = 0, writes = 0;
  const calls = [];
  const fetch = async url => {
    const path = url.pathname;
    calls.push({ path, metric: url.searchParams.get('metric') });
    if (Object.prototype.hasOwnProperty.call(insightData, path)) {
      const body = { data: insightData[path] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
    }
    if (failure?.path === path) {
      if (failure.network) throw Error('network');
      if (failure.malformed) return { ok: true, status: 200, text: async () => '{', json: async () => { throw Error('json'); } };
      const body = failure.badMetric ? { data: [{ name: 'views', total_value: { value: 'invalid' } }] } : failure.code ? { error: { code: failure.code } } : {};
      if (failure.badMetric) return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
      return { ok: false, status: failure.status ?? 400, text: async () => JSON.stringify(body), json: async () => body };
    }
    let body;
    if (path === '/refresh_access_token') body = { access_token: 'renewed', expires_in: 5184000 };
    else if (path === '/me') body = { id: identity, username: 'creator', followers_count: 0, follows_count: null, media_count: empty ? 0 : 1, account_type: 'BUSINESS' };
    else if (path === '/me/media') body = { data: empty ? [] : mediaItems ?? [{ id: 'post', media_type: mediaType, media_product_type: productType, timestamp: '2026-09-01T12:00:00Z', like_count: 0 }] };
    else body = { data: (url.searchParams.get('metric') ?? '').split(',').map(name => ({ name, total_value: { value: 0 } })) };
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
  };
  const insights = load('lib/instagram-insights.ts', { '@/lib/generated/prisma': {}, './instagram-auth': auth }, fetch);
  const db = {
    platformToken: { findUnique: async () => token },
    $transaction: async run => {
      const draft = structuredClone(state);
      const draftToken = structuredClone(token);
      const tx = {
        platformToken: { update: async ({ data }) => { Object.assign(draftToken, data); } },
        $queryRaw: async sql => {
          const query = sql.join('');
          if (query.includes('FROM "User"')) return [{ id: 'user' }];
          if (query.includes('FROM "CreatorProfile"')) return [{ id: 'creator' }];
          return mutateToken ? [{ ...token, platformUserId: 'other' }] : token ? [token] : [];
        },
        platformStats: {
          findUnique: async () => ({ raw: draft.raw, providerAccountId: 'account', dataSource: 'OFFICIAL_API' }),
          upsert: async ({ update }) => { writes++; draft.raw = update.raw; draft.stats = update; },
          findMany: async () => [{ followerCount: draft.stats.followerCount }],
        },
        creatorProfile: { findUnique: async () => ({ id: 'creator' }), update: async ({ data }) => { writes++; draft.profile = data; } },
        socialPost: { deleteMany: async () => { writes++; draft.posts = []; }, createMany: async ({ data }) => { writes++; if (dbFailure) throw Error('database unavailable'); draft.posts = data.map((p,i) => ({ ...p, id: `new-${i}` })); } },
        $executeRaw: async (sql, ...params) => { writes++; if (sql.join("").includes('UPDATE "PlatformToken"')) draftToken.username = params[0]; },
      };
      const result = await run(tx);
      state = draft;
      token = draftToken;
      return result;
    },
  };
  const reviewedLifecycle = realLifecycle ? load('lib/instagram-token.ts', { '@/lib/db': { db }, '@/lib/instagram-auth': auth, '@/lib/instagram-lock': instagramLock }, fetch) : null;
  const sync = load('lib/instagram-sync.ts', {
    '@/lib/db': { db }, '@/lib/creator-metrics': { computeFollowerCache: stats => stats.reduce((n,s) => n + (s.followerCount ?? 0), 0) },
    '@/lib/instagram-lock': instagramLock,
    '@/lib/instagram-auth': auth, '@/lib/instagram-insights': insights,
    '@/lib/instagram-token': {
      getInstagramAccessToken: async () => { lifecycleCalls++; if (reviewedLifecycle) return reviewedLifecycle.getInstagramAccessToken('user'); return lifecycle ?? { ok: true, accessToken: token.accessToken }; },
      handleInstagramGraphFailure: async (_id, input) => { assert.equal(input.errorCode, 190); assert.equal(input.failedAccessToken, 'secret'); cleanups++; token = null; return { ok: false, reason: 'reauth_required' }; },
    },
  }, fetch);
  return { run: () => sync.syncInstagramOfficialData('user'), state: () => state, calls, insights, counts: () => ({ writes, cleanups, lifecycleCalls }), token: () => token };
}

test('active sync preserves real zero/null, official ids, freshness, and curation', async () => {
  const f = fixture(); const result = await f.run();
  assert.equal(result.ok, true); assert.equal(result.insightsUnavailable, false);
  assert.equal(f.token().username, 'creator');
  assert.equal(f.state().stats.followerCount, 0); assert.equal(f.state().stats.followingCount, null);
  assert.equal(f.state().posts[0].views, 0); assert.equal(f.state().posts[0].providerPostId, 'post');
  assert.equal(f.state().posts[0].dataSource, 'OFFICIAL_API'); assert.equal(f.state().posts[0].id, 'new-0');
  assert.equal(f.state().raw.insights.account.profileViews, null); assert.notEqual(f.state().raw.insights.account.fetchedAt, 'old');
  assert.equal(f.state().curation.post.featured, true);
  assert.equal(f.counts().lifecycleCalls, 1);
  assert.equal(f.calls.find(c => c.path === '/post/insights').metric, 'views,reach,shares,saved');
  assert.ok(f.calls.every(c => !/apify/i.test(c.path)));
});
for (const path of ['/me', '/me/media', '/account/insights', '/post/insights']) {
  test(`190 at ${path}: cleanup with no partial dataset writes`, async () => {
    const f = fixture({ failure: { path, code: 190 } }); const before = structuredClone(f.state());
    assert.equal((await f.run()).reason, 'reauth_required');
    assert.deepEqual(f.state(), before); assert.equal(f.counts().writes, 0); assert.equal(f.counts().cleanups, 1); assert.equal(f.token(), null);
  });
}
for (const code of [10, 200]) {
  for (const path of ['/account/insights', '/post/insights']) {
    test(`${code} at ${path}: base commits and valid denied snapshot survives`, async () => {
      const f = fixture({ failure: { path, code } }); const result = await f.run();
      assert.equal(result.ok, true); assert.equal(result.insightsUnavailable, true); assert.ok(f.token());
      assert.equal(f.state().posts[0].dataSource, 'OFFICIAL_API'); assert.equal(f.counts().cleanups, 0);
      if (path === '/account/insights') assert.equal(f.state().raw.insights.account.fetchedAt, 'old');
      else assert.equal(f.state().raw.insights.media.post.fetchedAt, 'old');
    });
  }
}
for (const path of ['/me', '/me/media', '/account/insights', '/post/insights']) {
  for (const kind of [{ status: 429 }, { status: 503 }, { network: true }, { malformed: true }]) {
    test(`temporary ${JSON.stringify(kind)} at ${path}: old dataset preserved`, async () => {
      const f = fixture({ failure: { path, ...kind } }); const before = structuredClone(f.state());
      assert.equal((await f.run()).reason, 'temporary_failure'); assert.deepEqual(f.state(), before);
      assert.equal(f.counts().writes, 0); assert.ok(f.token());
    });
  }
}
test('identity mismatch performs zero data writes and stops before media', async () => {
  const f = fixture({ identity: 'other' }); assert.equal((await f.run()).reason, 'identity_mismatch');
  assert.equal(f.counts().writes, 0); assert.equal(f.calls.length, 1);
});
test('concurrent account switch is rejected inside transaction', async () => {
  const f = fixture({ mutateToken: true }); assert.equal((await f.run()).reason, 'identity_mismatch'); assert.equal(f.counts().writes, 0);
});
test('authoritative empty list clears old posts, retains curation, replaces media insights', async () => {
  const f = fixture({ empty: true }); assert.equal((await f.run()).ok, true);
  assert.equal(f.state().posts.length, 0); assert.equal(Object.keys(f.state().raw.insights.media).length, 0);
  assert.equal(f.state().curation.post.featured, true);
});
test('ungranted scope skips insights but commits base and preserves historical snapshot', async () => {
  const f = fixture({ scope: false }); assert.equal((await f.run()).insightsUnavailable, true);
  assert.equal(f.calls.length, 2); assert.equal(f.state().raw.insights.account.fetchedAt, 'old');
});
for (const reason of ['temporary_failure', 'not_connected', 'reauth_required', 'configuration_error']) {
  test(`lifecycle ${reason} stops all provider work`, async () => {
    const f = fixture({ lifecycle: { ok: false, reason } });
    assert.equal((await f.run()).reason, reason === 'configuration_error' ? 'configuration_failure' : reason);
    assert.equal(f.calls.length, 0); assert.equal(f.counts().writes, 0);
  });
}
test('documented media sets exclude incompatible metrics and unknown products', () => {
  const { instagramMediaInsightMetrics: metrics } = fixture().insights;
  assert.equal(metrics('IMAGE', 'FEED').join(','), 'views,reach,shares,saved,profile_visits');
  assert.equal(metrics('VIDEO', 'REELS').join(','), 'views,reach,shares,saved');
  assert.equal(metrics('IMAGE', 'STORY').join(','), 'views,reach,shares,profile_visits');
  assert.equal(metrics('IMAGE', null).length, 0);
});
test('callback/action reuse shared sync; manual action owns session identity', () => {
  const callback = fs.readFileSync('app/api/auth/callback/instagram/route.ts', 'utf8');
  const action = fs.readFileSync('app/actions/instagram-sync.ts', 'utf8');
  assert.match(callback, /syncInstagramOfficialData\(userId\)/);
  assert.doesNotMatch(callback, /socialPost\.|platformStats\.|fetchMediaInsights|fetchAccountInsights/);
  assert.match(action, /refreshInstagramDataAction\(\)/); assert.match(action, /syncInstagramOfficialData\(session.user.id\)/);
});

test('near-expiry token uses real Pass 1 refresh and continues with renewed token', async () => {
  const f = fixture({ realLifecycle: true });
  const result = await f.run();
  assert.equal(result.ok, true, JSON.stringify({ result, calls: f.calls, counts: f.counts() }));
  assert.equal(f.calls[0].path, '/refresh_access_token');
  assert.equal(f.token().accessToken, 'renewed');
  assert.equal(f.calls.filter(c => c.path === '/refresh_access_token').length, 1);
});
test('database failure rolls back stats/posts/cache as one dataset', async () => {
  const f = fixture({ dbFailure: true }); const before = structuredClone(f.state());
  assert.equal((await f.run()).reason, 'temporary_failure');
  assert.deepEqual(f.state(), before); assert.ok(f.token());
});

for (const path of ['/account/insights', '/post/insights']) {
  test(`malformed numeric metric at ${path} is not committed as unavailable`, async () => {
    const f = fixture({ failure: { path, badMetric: true } }); const before = structuredClone(f.state());
    assert.equal((await f.run()).reason, 'temporary_failure');
    assert.deepEqual(f.state(), before); assert.equal(f.counts().writes, 0);
  });
}

test('successful token renewal survives a later failed data sync', async () => {
  const f = fixture({ realLifecycle: true, failure: { path: '/me/media', status: 503 } });
  const before = structuredClone(f.state());
  assert.equal((await f.run()).reason, 'temporary_failure');
  assert.equal(f.token().accessToken, 'renewed');
  assert.deepEqual(f.state(), before); assert.equal(f.counts().writes, 0);
});

// Present metric objects must be valid; only absent metrics may become unavailable.
const malformedInsightEntries = [
  ['empty total_value', { name: 'views', total_value: {} }],
  ['undefined total value', { name: 'views', total_value: { value: undefined } }],
  ['null total value', { name: 'views', total_value: { value: null } }],
  ['NaN total value', { name: 'views', total_value: { value: NaN } }],
  ['array total_value', { name: 'views', total_value: [] }],
  ['null total_value', { name: 'views', total_value: null }],
  ['undefined total_value', { name: 'views', total_value: undefined }],
  ['metric without value structure', { name: 'views' }],
  ['missing lifetime value', { name: 'views', values: [{}] }],
  ['empty lifetime values', { name: 'views', values: [] }],
  ['invalid lifetime container', { name: 'views', values: {} }],
  ['undefined lifetime value', { name: 'views', values: [{ value: undefined }] }],
  ['NaN lifetime value', { name: 'views', values: [{ value: NaN }] }],
  ['malformed total despite valid lifetime value', { name: 'views', total_value: {}, values: [{ value: 0 }] }],
];
for (const path of ['/account/insights', '/post/insights']) {
  for (const [description, entry] of malformedInsightEntries) {
    test(`${path} rejects ${description} before all dataset writes`, async () => {
      const f = fixture({ insightData: { [path]: [entry] } });
      const before = structuredClone(f.state());
      const tokenBefore = structuredClone(f.token());
      const result = await f.run();
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'temporary_failure');
      assert.deepEqual(f.state(), before); // Includes original insights and fetchedAt.
      assert.deepEqual(f.token(), tokenBefore);
      assert.equal(f.counts().writes, 0);
      assert.equal(f.counts().cleanups, 0);
    });
  }
}
for (const priorMediaInsights of [true, false]) {
  for (const [mediaType, productType] of [['UNKNOWN', 'FEED'], ['VIDEO', 'UNKNOWN'], ['VIDEO', null]]) {
    test(`unknown ${mediaType}/${productType}, prior=${priorMediaInsights}: no request or fabricated freshness`, async () => {
      const f = fixture({ mediaType, productType, priorMediaInsights });
      const previous = structuredClone(f.state().raw.insights.media);
      const result = await f.run();
      assert.equal(result.ok, true);
      assert.equal(result.insightsUnavailable, true);
      assert.equal(f.calls.filter(c => c.path === '/post/insights').length, 0);
      assert.deepEqual(structuredClone(f.state().raw.insights.media), previous);
      if (priorMediaInsights) assert.equal(f.state().raw.insights.media.post.fetchedAt, 'old');
      else assert.equal(Object.hasOwn(f.state().raw.insights.media, 'post'), false);
      assert.equal(f.state().posts[0].dataSource, 'OFFICIAL_API');
      assert.equal(f.state().posts[0].views, null);
      assert.notEqual(f.state().raw.insights.account.fetchedAt, 'old');
    });
  }
}
test('skipped media keeps its old snapshot while known media receives real fresh insights', async () => {
  const f = fixture({ mediaItems: [
    { id: 'post', media_type: 'VIDEO', media_product_type: 'UNKNOWN' },
    { id: 'known', media_type: 'VIDEO', media_product_type: 'REELS' },
  ] });
  const previous = structuredClone(f.state().raw.insights.media.post);
  assert.equal((await f.run()).ok, true);
  assert.equal(f.calls.filter(c => c.path === '/post/insights').length, 0);
  assert.equal(f.calls.filter(c => c.path === '/known/insights').length, 1);
  assert.deepEqual(f.state().raw.insights.media.post, previous);
  assert.equal(f.state().raw.insights.media.known.views, 0);
  assert.ok(f.state().raw.insights.media.known.fetchedAt);
});
test('real exported fetchMediaInsights skips unknown types with no metrics payload', async () => {
  const f = fixture();
  const result = await f.insights.fetchMediaInsights('post', 'secret', 'VIDEO', 'UNKNOWN');
  assert.equal(result.available, false);
  assert.equal(result.metrics, null);
  assert.equal(f.calls.length, 0);
});
test('valid zero survives total-value account and lifetime media parsing; absent metrics stay null', async () => {
  const f = fixture({ insightData: {
    '/account/insights': [{ name: 'reach', total_value: { value: 0 } }],
    '/post/insights': [{ name: 'views', values: [{ value: 0 }] }],
  } });
  assert.equal((await f.run()).ok, true);
  assert.equal(f.state().raw.insights.account.reach, 0);
  assert.equal(f.state().raw.insights.account.views, null);
  assert.equal(f.state().raw.insights.media.post.views, 0);
  assert.equal(f.state().raw.insights.media.post.reach, null);
  assert.equal(f.state().posts[0].views, 0);
  assert.notEqual(f.state().raw.insights.account.fetchedAt, 'old');
  assert.notEqual(f.state().raw.insights.media.post.fetchedAt, 'old');
});
test('valid empty provider data is unavailable but genuinely freshly fetched', async () => {
  const f = fixture({ insightData: { '/account/insights': [], '/post/insights': [] } });
  assert.equal((await f.run()).ok, true);
  assert.equal(f.state().raw.insights.account.views, null);
  assert.equal(f.state().raw.insights.media.post.views, null);
  assert.notEqual(f.state().raw.insights.account.fetchedAt, 'old');
  assert.notEqual(f.state().raw.insights.media.post.fetchedAt, 'old');
  assert.equal(f.calls.filter(c => c.path === '/post/insights').length, 1);
});
