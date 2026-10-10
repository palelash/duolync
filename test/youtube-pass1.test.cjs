const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const env = { NODE_ENV: 'production', BETTER_AUTH_SECRET: 'test-state-signing-secret',
  NEXT_PUBLIC_APP_URL: 'https://app.example', YOUTUBE_CLIENT_ID: 'client', YOUTUBE_CLIENT_SECRET: 'secret' };
function load(file, imports = {}, fetch = async () => { throw Error('unexpected fetch'); }, overrides = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/youtube-aggregates') return load('lib/youtube-aggregates.ts', { '@/lib/creator-metrics': metrics });
    if (name === '@/lib/youtube-claim') return load('lib/youtube-claim.ts', { '@/lib/youtube-lock': locks });
    if (name === '@/lib/youtube-lock' && !(name in imports)) return load('lib/youtube-lock.ts');
    if (name === '@/lib/youtube-compliance') return load('lib/youtube-compliance.ts');
    if (name === '@/lib/youtube-removal' && !(name in imports)) return load('lib/youtube-removal.ts', { ...imports, '@/lib/creator-metrics': metrics });
    if (name === 'node:crypto') return require(name);
    assert.ok(name in imports, `Unexpected dependency ${name}`); return imports[name];
  }, fetch, URL, URLSearchParams, Buffer, Date, AbortSignal, process: { env: { ...env, ...overrides } }, console }, { filename: file });
  return exports;
}
const authLogic = load('lib/youtube-auth.ts', { '@/lib/db': { db: {} } });
const locks = load('lib/youtube-lock.ts');
const metrics = load('lib/creator-metrics.ts');
function deferred() { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; }
const data = (accessToken = 'NEW', platformUserId = 'CHANNEL_A', refreshToken = null) => ({
  accessToken, platformUserId, refreshToken, expiresAt: new Date(Date.now() + 3600000), scopes: 'actual_scope', username: 'same-title',
});
const token = () => ({ id: 'token1', userId: 'owner', platform: 'youtube', ...data('OLD', 'CHANNEL_A', 'OLD_REFRESH'), updatedAt: new Date(0) });
function fixture({ initial = token(), provider, missingOwner = false } = {}) {
  const state = { compliance: { status: 'ACTIVE', connectionGeneration: 1, revision: 1, blockedAt: null, leaseId: null }, token: initial, markers: ['youtube', 'instagram'], stats: [{ history: true }], posts: [{ history: true }], curation: [{ history: true }] };
  let tail = Promise.resolve(), txCount = 0, fetchCount = 0;
  const events = [];
  const pauses = new Map();
  const verifications = new Map();
  const db = {
    youTubeComplianceState: { findUnique: async () => structuredClone(state.compliance) },
    verification: {
      create: async ({ data }) => { assert.ok(!verifications.has(data.id)); verifications.set(data.id, structuredClone(data)); return data; },
      deleteMany: async ({ where }) => {
        const row = verifications.get(where.id);
        if (!row || row.identifier !== where.identifier || row.value !== where.value ||
          row.createdAt > where.createdAt.lte || row.expiresAt <= where.expiresAt.gt) return { count: 0 };
        verifications.delete(where.id); return { count: 1 };
      },
    },
    creatorContentCuration: { findMany: async () => [] },
    creatorProfile: { findUnique: async () => ({ id: 'creator' }) },
    platformToken: { findUnique: async () => state.token && structuredClone(state.token) },
    $transaction: async run => {
      const index = txCount++, release = deferred();
      let owner = false, tokenLock = false, profileLock = false, snapshot;
      const tx = {
        youTubeComplianceState: {
          findUnique: async () => structuredClone(state.compliance),
          upsert: async ({ create, update }) => { state.compliance = state.compliance ? { ...state.compliance, ...update,
            connectionGeneration: state.compliance.connectionGeneration + 1, revision: state.compliance.revision + 1 } : create; },
          update: async ({ data }) => { state.compliance = { ...state.compliance, ...data, revision: state.compliance.revision + 1 }; },
        },
        $queryRaw: async (sql) => {
          const query = sql.join('');
          if (query.includes('clock_timestamp() AS')) return [{ now: new Date() }];
          if (query.includes('FROM "YouTubeComplianceState"')) return state.compliance ? [structuredClone(state.compliance)] : [];
          assert.match(query, /FOR UPDATE/);
          if (query.includes('FROM "User"')) {
            if (missingOwner) return [];
            events.push(`waiting:${index}`);
            const previous = tail; tail = release.promise;
            await previous;
            owner = true;
            snapshot = structuredClone(state);
            events.push(`owner:${index}`);
            const pause = pauses.get(index); if (pause) { pause.entered.resolve(); await pause.resume.promise; }
            return [{ id: 'owner' }];
          }
          assert.ok(owner, 'stable owner lock precedes token/profile');
          if (query.includes('FROM "CreatorProfile"')) {
            assert.ok(tokenLock); profileLock = true; events.push(`profile:${index}`);
            return [{ id: 'creator', connectedPlatforms: [...state.markers], profileOrigin: 'REGISTERED' }];
          }
          assert.ok(query.includes('FROM "PlatformToken"')); tokenLock = true;
          events.push(`token:${index}`);
          return state.token ? [structuredClone(state.token)] : [];
        },
        platformToken: {
          upsert: async ({ create, update }) => { assert.ok(owner && tokenLock); state.token = state.token ? { ...state.token, ...update } : { id: 'token-new', ...create }; return structuredClone(state.token); },
          update: async ({ data }) => { assert.ok(owner && tokenLock); Object.assign(state.token, data); },
          deleteMany: async ({ where }) => {
            assert.ok(owner && tokenLock);
            if (!where.id) { assert.ok(profileLock); events.push(`delete-token:${index}`); }
            else assert.ok(where.accessToken && where.updatedAt);
            const match = state.token && Object.entries(where).every(([k,v]) => v instanceof Date
              ? new Date(state.token[k]).getTime() === v.getTime() : state.token[k] === v);
            if (match) state.token = null; return { count: match ? 1 : 0 };
          },
        },
        $executeRaw: async sql => {
          assert.ok(owner && tokenLock, 'profile follows owner and token');
          profileLock = true; events.push(`profile:${index}`);
          if (sql.join('').includes('array_remove')) state.markers = state.markers.filter(p => p !== 'youtube');
          else if (!state.markers.includes('youtube')) state.markers.push('youtube');
        },
        creatorProfile: { findUnique: async () => ({ id: 'creator' }), update: async ({ data }) => {
          assert.ok(profileLock); if (data.connectedPlatforms) state.markers = [...data.connectedPlatforms];
        } },
        platformStats: { upsert: async ({ create }) => { assert.ok(profileLock); state.stats = [create]; }, findMany: async () => [],
          deleteMany: async () => { assert.ok(profileLock); events.push(`delete-stats:${index}`); state.stats = []; } },
        socialPost: { count: async () => state.posts.length, deleteMany: async () => { assert.ok(profileLock); state.posts = []; }, createMany: async ({ data }) => { state.posts.push(...data); } },
        creatorContentCuration: { findMany: async () => [], deleteMany: async () => { assert.ok(profileLock); state.curation = []; } },
      };
      try { return await run(tx); }
      catch (e) { if (snapshot) Object.assign(state, snapshot); throw e; }
      finally { if (owner) release.resolve(); }
    },
  };
  const fetch = async (url, init) => { fetchCount++; assert.equal(init.cache, 'no-store'); assert.ok(init.signal); return provider(url, init); };
  const auth = load('lib/youtube-auth.ts', { '@/lib/db': { db } }, fetch);
  const imports = { '@/lib/db': { db }, '@/lib/youtube-lock': locks, '@/lib/youtube-auth': auth };
  const lifecycle = load('lib/youtube-token.ts', imports);
  return { state, db, lifecycle, auth, events, verifications, secondAuth: () => load('lib/youtube-auth.ts', { '@/lib/db': { db } }, fetch), get fetchCount() { return fetchCount; },
    secondLifecycle: () => load('lib/youtube-token.ts', imports),
    pause: index => { const p = { entered: deferred(), resume: deferred() }; pauses.set(index, p); return p; } };
}
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
class NextResponse {
  constructor(body, options = {}) { this.body = body; this.status = options.status ?? 200; this.headers = new Headers(); this.cookieWrites = [];
    this.cookies = { set: (...args) => this.cookieWrites.push(args) }; }
  static redirect(url) { const r = new NextResponse(null, { status: 307 }); r.location = String(url); return r; }
}
function routes(f, session = { user: { id: 'owner' }, session: { id: 'session1' } }) {
  const imports = { 'next/server': { NextResponse }, 'next/cache': { revalidatePath() {} },
    '@/lib/auth': { auth: { api: { getSession: async () => session } } }, '@/lib/db': { db: f.db },
    '@/lib/youtube-auth': f.auth, '@/lib/youtube-token': f.lifecycle, '@/lib/youtube-sync': load('lib/youtube-sync.ts', { '@/lib/db': { db: f.db }, '@/lib/youtube-lock': locks, '@/lib/youtube-token': f.lifecycle, '@/lib/youtube-auth': f.auth, '@/lib/creator-metrics': metrics }), '@/lib/creator-metrics': metrics };
  return { start: load('app/api/auth/youtube/start/route.ts', imports).GET,
    callback: load('app/api/auth/callback/youtube/route.ts', imports).GET };
}
function request(params = {}, cookie) {
  const url = new URL('https://app.example/api/auth/callback/youtube'); url.search = new URLSearchParams(params).toString();
  return { url: url.toString(), nextUrl: url, headers: new Headers(), cookies: { get: () => cookie ? { value: cookie } : undefined } };
}
function errorCode(r) { return new URL(r.location).searchParams.get('youtube_error'); }

function removal(f) {
  const helper = load('lib/youtube-removal.ts', {
    '@/lib/db': { db: f.db }, '@/lib/youtube-lock': locks, '@/lib/creator-metrics': metrics,
  });
  return () => helper.removeYouTubeLocalData("owner");
}

test('successful callback consumes durable state; cross-worker replay does not exchange or write', { timeout: 2000 }, async () => {
  const f = fixture({ provider: async url => String(url).includes('/token')
    ? response({ access_token: 'AUTH', expires_in: 3600 }) : String(url).includes('/playlistItems') ? response({ items: [] }) : response({ items: [{ id: 'CHANNEL_A', snippet: {}, statistics: {}, contentDetails: { relatedPlaylists: { uploads: 'UPLOADS' } } }] }) });
  const s = await f.auth.createYouTubeState('owner', 'session1');
  const params = { state: s.state, code: 'code' };
  assert.ok(new URL((await routes(f).callback(request(params, s.cookie))).location).searchParams.has('youtube_connected'));
  const before = structuredClone(f.state), count = f.fetchCount;
  assert.equal(f.verifications.size, 0);
  assert.equal(errorCode(await routes({ ...f, auth: f.secondAuth() }).callback(request(params, s.cookie))), 'invalid_state');
  assert.equal(f.fetchCount, count); assert.deepEqual(structuredClone(f.state), before);
});

test('provider denial consumes durable state and replay fails invalid_state', { timeout: 2000 }, async () => {
  const f = fixture(), s = await f.auth.createYouTubeState('owner', 'session1');
  const params = { state: s.state, error: 'access_denied', error_description: 'RAW' };
  const callback = routes(f).callback, before = structuredClone(f.state);
  assert.equal(errorCode(await callback(request(params, s.cookie))), 'access_denied');
  assert.equal(errorCode(await callback(request(params, s.cookie))), 'invalid_state');
  assert.equal(f.verifications.size, 0); assert.equal(f.fetchCount, 0); assert.deepEqual(f.state, before);
});

test('independent worker callbacks racing on one state have exactly one winner', { timeout: 2000 }, async () => {
  const f = fixture(), s = await f.auth.createYouTubeState('owner', 'session1');
  // Both workers reach the real conditional delete before either can continue.
  const ready = deferred(); let entrants = 0;
  const deleteMany = f.db.verification.deleteMany;
  f.db.verification.deleteMany = async args => {
    if (++entrants === 2) ready.resolve(); await ready.promise; return deleteMany(args);
  };
  const req = () => request({ state: s.state, error: 'access_denied' }, s.cookie);
  const results = await Promise.all([routes(f).callback(req()), routes({ ...f, auth: f.secondAuth() }).callback(req())]);
  assert.deepEqual(results.map(errorCode).sort(), ['access_denied', 'invalid_state']);
  assert.equal(f.verifications.size, 0); assert.equal(f.fetchCount, 0);
});

test('database expiry rejects a still correctly signed state on every attempt', { timeout: 2000 }, async () => {
  const f = fixture(), s = await f.auth.createYouTubeState('owner', 'session1');
  f.verifications.get(`youtube-oauth-state:${s.state}`).expiresAt = new Date(0);
  const before = structuredClone(f.state);
  for (let i = 0; i < 2; i++) assert.equal(errorCode(await routes(f).callback(request({ state: s.state, code: 'code' }, s.cookie))), 'invalid_state');
  assert.equal(f.fetchCount, 0); assert.deepEqual(f.state, before);
});

test('wrong session and malformed possession do not consume the owning session state', { timeout: 2000 }, async () => {
  const f = fixture(), s = await f.auth.createYouTubeState('owner', 'session1');
  const params = { state: s.state, error: 'access_denied' };
  assert.equal(errorCode(await routes(f, { user: { id: 'owner' }, session: { id: 'other' } }).callback(request(params, s.cookie))), 'invalid_state');
  assert.equal(errorCode(await routes(f).callback(request(params, s.cookie + 'x'))), 'invalid_state');
  assert.equal(f.verifications.size, 1);
  assert.equal(errorCode(await routes(f).callback(request(params, s.cookie))), 'access_denied');
});

test('new starts create independent namespaced records without exposing binding or touching auth records', { timeout: 2000 }, async () => {
  const f = fixture();
  f.verifications.set('better-auth-record', { id: 'better-auth-record', identifier: 'email-verification', value: 'other' });
  const one = await routes(f).start(request()), two = await routes(f).start(request());
  const state1 = new URL(one.location).searchParams.get('state'), state2 = new URL(two.location).searchParams.get('state');
  assert.notEqual(state1, state2); assert.equal(f.verifications.size, 3);
  for (const [r, state] of [[one, state1], [two, state2]]) {
    const cookie = r.cookieWrites[0][1]; assert.equal(cookie.split('.')[0], state);
    const row = f.verifications.get(`youtube-oauth-state:${state}`);
    assert.equal(row.expiresAt - row.createdAt, 300000);
    assert.deepEqual(JSON.parse(row.value), { userId: 'owner', sessionId: 'session1' });
    assert.equal(await f.auth.consumeYouTubeState(cookie, state, 'owner', 'session1'), true);
  }
  assert.equal(f.verifications.size, 1); assert.ok(f.verifications.has('better-auth-record'));
});

test('database state failure fails closed without provider exchange or credential writes', { timeout: 2000 }, async () => {
  const f = fixture(), s = await f.auth.createYouTubeState('owner', 'session1'), before = structuredClone(f.state);
  f.db.verification.deleteMany = async () => { throw Error('DB unavailable'); };
  assert.equal(errorCode(await routes(f).callback(request({ state: s.state, code: 'code' }, s.cookie))), 'temporary_failure');
  assert.equal(f.fetchCount, 0); assert.deepEqual(f.state, before); assert.equal(f.verifications.size, 1);
});

for (const [name, initial, firstActor] of [
  ['history-only removal wins', null, 'remove'],
  ['history-only reconnect wins', null, 'reconnect'],
  ['active removal wins', token(), 'remove'],
]) test(`removal/reconnect coordination: ${name}`, { timeout: 2000 }, async () => {
  const f = fixture({ initial }); if (!initial) f.state.markers = ['instagram'];
  const remove = removal(f), pause = f.pause(0);
  const reconnect = () => f.lifecycle.saveYouTubeAccessToken('owner', data('RECONNECTED'), async tx => {
    await tx.platformStats.upsert({ create: { fresh: true } });
    await tx.socialPost.createMany({ data: [{ fresh: true }] });
  });
  const first = firstActor === 'remove' ? remove('youtube') : reconnect();
  await pause.entered.promise;
  const second = firstActor === 'remove' ? reconnect() : remove('youtube');
  // A production transaction has started, but its owner lock is waiting.
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.events.includes('waiting:1')); assert.ok(!f.events.includes('owner:1'));
  pause.resume.resolve(); await Promise.all([first, second]);
  const removalIndex = firstActor === 'remove' ? 0 : 1;
  const order = ['owner', 'token', 'profile', 'delete-token', 'delete-stats'].map(e => f.events.indexOf(`${e}:${removalIndex}`));
  assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])));
  assert.equal(f.state.curation.length, 0);
  if (firstActor === 'remove') {
    assert.equal(f.state.token.accessToken, 'RECONNECTED'); assert.ok(f.state.markers.includes('youtube'));
    assert.deepEqual(f.state.stats, [{ fresh: true }]); assert.deepEqual(f.state.posts, [{ fresh: true }]);
  } else {
    assert.equal(f.state.token, null); assert.deepEqual(f.state.markers, ['instagram']);
    assert.deepEqual(f.state.stats, []); assert.deepEqual(f.state.posts, []);
  }
});

test('server start requires session before ownership/token reads or provider redirect', async () => {
  const f = fixture(); f.db.creatorProfile.findUnique = async () => { throw Error('must not read'); };
  const r = await routes(f, null).start(request()); assert.equal(r.location, 'https://app.example/auth'); assert.equal(f.fetchCount, 0);
});
test('start resolves creator ownership server-side', async () => {
  const f = fixture(); f.db.creatorProfile.findUnique = async () => null;
  assert.equal((await routes(f).start(request({ userId: 'attacker' }))).status, 403);
});
test('start uses minimum scope and signed HttpOnly Secure Lax five-minute cookie; normal reconnect avoids consent', async () => {
  const f = fixture(); const r = await routes(f).start(request()); const url = new URL(r.location);
  assert.equal(url.searchParams.get('scope'), authLogic.YOUTUBE_SCOPE); assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('response_type'), 'code'); assert.equal(url.searchParams.has('prompt'), false);
  assert.equal(url.searchParams.has('client_secret'), false);
  const [name, cookie, options] = r.cookieWrites[0]; assert.equal(name, '__youtube_oauth_state');
  assert.deepEqual({ ...options }, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth', maxAge: 300 });
  assert.equal(await f.auth.consumeYouTubeState(cookie, url.searchParams.get('state'), 'owner', 'session1'), true);
});
test('start requests consent for absent refresh token or explicit recovery', async () => {
  for (const [initial, params] of [[null, {}], [token(), { recovery: '1' }]]) {
    const r = await routes(fixture({ initial })).start(request(params)); assert.equal(new URL(r.location).searchParams.get('prompt'), 'consent');
  }
});
for (const [name, tweak] of [
  ['invalid state', (s) => ({ state: 'wrong', cookie: s.cookie })],
  ['missing state', s => ({ cookie: s.cookie })],
  ['expired state', async (_s, auth) => auth.createYouTubeState('owner', 'session1', Date.now() - 300001)],
  ['different user', async (_s, auth) => auth.createYouTubeState('someone-else', 'session1')],
  ['different session', async (_s, auth) => auth.createYouTubeState('owner', 'session2')],
  ['tampered signed cookie', s => ({ state: s.state, cookie: s.cookie + 'x' })],
]) test(`callback rejects ${name} before success AND provider error`, async () => {
  for (const params of [{ code: 'code' }, { error: 'access_denied', error_description: 'RAW SECRET' }]) {
    const f = fixture(); const original = structuredClone(f.state);
    const s = await tweak(await f.auth.createYouTubeState('owner', 'session1'), f.auth);
    const r = await routes(f).callback(request({ ...params, ...(s.state ? { state: s.state } : {}) }, s.cookie));
    assert.equal(errorCode(r), 'invalid_state'); assert.equal(f.fetchCount, 0); assert.deepEqual(f.state, original);
    assert.ok(r.cookieWrites.every(([, , options]) => options.maxAge === 0));
  }
});
test('valid provider denial is sanitized and state cookie cleared', async () => {
  const f = fixture(), s = await f.auth.createYouTubeState('owner', 'session1');
  const r = await routes(f).callback(request({ state: s.state, error: 'access_denied', error_description: 'RAW SECRET' }, s.cookie));
  assert.equal(errorCode(r), 'access_denied'); assert.equal(r.location.includes('RAW'), false); assert.equal(f.fetchCount, 0);
  assert.ok(r.cookieWrites.length);
});
for (const [name, body] of [
  ['empty access token', { access_token: '' }], ['whitespace access token', { access_token: ' ' }],
  ['missing access token', {}], ['negative expiry', { access_token: 'A', expires_in: -1 }],
  ['zero expiry', { access_token: 'A', expires_in: 0 }], ['NaN expiry', { access_token: 'A', expires_in: NaN }],
  ['string expiry', { access_token: 'A', expires_in: '3600' }], ['null expiry', { access_token: 'A', expires_in: null }],
  ['empty refresh token', { access_token: 'A', refresh_token: '' }], ['malformed token type', { access_token: 'A', token_type: {} }],
  ['unsupported token type', { access_token: 'A', token_type: 'MAC' }], ['malformed scope', { access_token: 'A', scope: [] }],
]) test(`strict parsing rejects ${name} without callback writes`, async () => {
  assert.equal(authLogic.parseYouTubeTokenResponse(body), null);
  const f = fixture({ provider: async () => response(body) }), original = structuredClone(f.state);
  const s = await f.auth.createYouTubeState('owner', 'session1');
  assert.equal(errorCode(await routes(f).callback(request({ state: s.state, code: 'code' }, s.cookie))), 'temporary_failure');
  assert.deepEqual(f.state, original); assert.equal(f.fetchCount, 1);
});
test('unknown expiry/scopes remain null and actual granted scopes are parsed', () => {
  assert.equal(authLogic.parseYouTubeTokenResponse({ access_token: 'A' }).expiresAt, null);
  assert.equal(authLogic.parseYouTubeTokenResponse({ access_token: 'A' }).scopes, null);
  assert.equal(authLogic.parseYouTubeTokenResponse({ access_token: 'A', scope: 'scope1  scope2 scope1', token_type: 'Bearer' }).scopes, 'scope1 scope2');
});
test('callback stores actual channel ID and granted scopes under coordination', async () => {
  const f = fixture({ provider: async url => String(url).includes('/token')
    ? response({ access_token: 'AUTH', expires_in: 3600, scope: 'real_scope', token_type: 'Bearer' })
    : String(url).includes('/playlistItems') ? response({ items: [] }) : response({ items: [{ id: 'CHANNEL_A', snippet: { title: 'not-an-id', customUrl: '@handle' }, contentDetails: { relatedPlaylists: { uploads: 'UPLOADS' } }, statistics: {} }] }) });
  const s = await f.auth.createYouTubeState('owner', 'session1');
  const r = await routes(f).callback(request({ state: s.state, code: 'code' }, s.cookie));
  assert.equal(errorCode(r), null); assert.equal(f.state.token.platformUserId, 'CHANNEL_A');
  assert.equal(f.state.token.scopes, 'real_scope'); assert.equal(f.state.token.refreshToken, 'OLD_REFRESH');
  assert.equal(f.state.stats[0].providerAccountId, 'CHANNEL_A'); assert.ok(f.events.includes('owner:0'));
});
for (const [name, channelResponse, expected] of [
  ['missing channel', response({ items: [] }), 'no_youtube_channel'],
  ['empty channel page without items', response({ pageInfo: { totalResults: 0 } }), 'no_youtube_channel'],
  ['channel server error', response({ error: { message: 'RAW' } }, 503), 'temporary_failure'],
  ['malformed channel identity', response({ items: [{ id: '' }] }), 'temporary_failure'],
  ['malformed channel payload', response({}), 'temporary_failure'],
]) test(name, async () => {
  const f = fixture({ provider: async url => String(url).includes('/token') ? response({ access_token: 'AUTH' }) : channelResponse });
  const before = structuredClone(f.state), s = await f.auth.createYouTubeState('owner', 'session1');
  assert.equal(errorCode(await routes(f).callback(request({ state: s.state, code: 'code' }, s.cookie))), expected);
  assert.deepEqual(f.state, before);
});
test('same-channel omitted refresh token preserves existing token; different channel never inherits it', async () => {
  const f = fixture(); await f.lifecycle.saveYouTubeAccessToken('owner', data()); assert.equal(f.state.token.refreshToken, 'OLD_REFRESH');
  await f.lifecycle.saveYouTubeAccessToken('owner', data('OTHER', 'CHANNEL_B')); assert.equal(f.state.token.refreshToken, null);
  await f.lifecycle.saveYouTubeAccessToken('owner', data('LATEST', 'CHANNEL_B', 'NEW_REFRESH')); assert.equal(f.state.token.refreshToken, 'NEW_REFRESH');
});
test('missing owner fails closed without saves, refreshes, or cleanup', async () => {
  const f = fixture({ missingOwner: true }), before = structuredClone(f.state);
  await assert.rejects(f.lifecycle.saveYouTubeAccessToken('owner', data()));
  assert.equal((await f.lifecycle.getYouTubeAccessToken('owner')).reason, 'temporary_failure');
  assert.equal((await f.lifecycle.clearYouTubeDeadAuth('owner', before.token)).reason, 'temporary_failure');
  assert.deepEqual(f.state, before); assert.equal(f.fetchCount, 0);
});
test('callback data failure rolls back credentials and marker', async () => {
  const f = fixture({ initial: null }); const before = structuredClone(f.state);
  await assert.rejects(f.lifecycle.saveYouTubeAccessToken('owner', data(), async () => { throw Error('data write failed'); }));
  assert.deepEqual(f.state, before);
});
test('active and unknown-expiry tokens reuse stored credentials', async () => {
  for (const expiresAt of [new Date(Date.now() + 3600000), null]) {
    const f = fixture({ initial: { ...token(), expiresAt } }); const result = await f.lifecycle.getYouTubeAccessToken('owner');
    assert.equal(result.accessToken, 'OLD'); assert.equal(f.fetchCount, 0);
  }
});
test('expired token refresh preserves omitted refresh token, scopes and channel identity', async () => {
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0) }, provider: async (_url, init) => {
    assert.equal(new URLSearchParams(init.body).get('refresh_token'), 'OLD_REFRESH');
    return response({ access_token: 'REFRESHED', expires_in: 3600 });
  } });
  const r = await f.lifecycle.getYouTubeAccessToken('owner'); assert.equal(r.accessToken, 'REFRESHED');
  assert.equal(f.state.token.refreshToken, 'OLD_REFRESH'); assert.equal(f.state.token.platformUserId, 'CHANNEL_A');
  assert.equal(f.state.token.scopes, 'actual_scope'); assert.ok(f.state.token.expiresAt > new Date());
});
test('refresh can legitimately replace refresh token and actual scopes', async () => {
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0) }, provider: async () => response({ access_token: 'R', refresh_token: 'ROTATED', expires_in: 3600, scope: 'new_scope' }) });
  assert.equal((await f.lifecycle.getYouTubeAccessToken('owner')).accessToken, 'R');
  assert.equal(f.state.token.refreshToken, 'ROTATED'); assert.equal(f.state.token.scopes, 'new_scope');
});
test('current invalid_grant atomically purges history and blocks repopulation', async () => {
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0) }, provider: async () => response({ error: 'invalid_grant' }, 400) });
  const before = structuredClone(f.state);
  assert.equal((await f.lifecycle.getYouTubeAccessToken('owner')).reason, 'reauth_required'); assert.equal(f.state.token, null);
  assert.deepEqual(f.state.markers, ['instagram']);
  for (const k of ['stats', 'posts', 'curation']) assert.equal(f.state[k].length, 0);
  assert.equal(f.state.compliance.status, 'PURGED');
});
test('expired token with no refresh token requires reauth and preserves history', async () => {
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0), refreshToken: null } });
  assert.equal((await f.lifecycle.getYouTubeAccessToken('owner')).reason, 'reauth_required'); assert.equal(f.fetchCount, 0);
  assert.equal(f.state.posts.length, 1);
});
for (const [name, provider] of [
  ['network', async () => { throw Error('network'); }], ['timeout', async () => { throw new DOMException('timeout', 'TimeoutError'); }],
  ['429', async () => response({ error: 'invalid_grant' }, 429)], ['503', async () => response({ error: 'invalid_grant' }, 503)],
  ['malformed JSON', async () => ({ ok: true, status: 200, json: async () => { throw Error('JSON'); } })],
  ['malformed success', async () => response({ access_token: '' })], ['missing refresh expiry', async () => response({ access_token: 'R' })],
  ['invalid_client', async () => response({ error: 'invalid_client' }, 400)],
]) test(`temporary refresh failure (${name}) preserves entire connection`, async () => {
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0) }, provider }), before = structuredClone(f.state);
  assert.equal((await f.lifecycle.getYouTubeAccessToken('owner')).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
});
test('stale permanent failure waits behind reconnect, then preserves newer token and marker', async () => {
  const f = fixture(), old = structuredClone(f.state.token), p = f.pause(0);
  const save = f.lifecycle.saveYouTubeAccessToken('owner', data('RECONNECTED', 'CHANNEL_B', 'B_REFRESH'));
  await p.entered.promise; const cleanup = f.lifecycle.clearYouTubeDeadAuth('owner', old); p.resume.resolve();
  await save; assert.equal((await cleanup).accessToken, 'RECONNECTED'); assert.equal(f.state.token.refreshToken, 'B_REFRESH');
  assert.ok(f.state.markers.includes('youtube'));
});
test('cleanup wins first, reconnect follows and restores new credential and marker', async () => {
  const f = fixture(), p = f.pause(0), old = structuredClone(f.state.token);
  const cleanup = f.lifecycle.clearYouTubeDeadAuth('owner', old); await p.entered.promise;
  const save = f.lifecycle.saveYouTubeAccessToken('owner', data('RECONNECTED', 'CHANNEL_B', 'B_REFRESH'));
  p.resume.resolve(); assert.equal((await cleanup).reason, 'reauth_required'); await save;
  assert.equal(f.state.token.accessToken, 'RECONNECTED'); assert.ok(f.state.markers.includes('youtube'));
});
test('stale Google invalid_grant after reconnect cannot remove newer credentials', async () => {
  const entered = deferred(), resume = deferred();
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0) }, provider: async () => { entered.resolve(); await resume.promise; return response({ error: 'invalid_grant' }, 400); } });
  const pending = f.lifecycle.getYouTubeAccessToken('owner'); await entered.promise;
  // Completing this save while provider waits also proves the DB lock is released across HTTP.
  await f.lifecycle.saveYouTubeAccessToken('owner', data('RECONNECTED', 'CHANNEL_B', 'B_REFRESH')); resume.resolve();
  assert.equal((await pending).accessToken, 'RECONNECTED'); assert.ok(f.state.markers.includes('youtube'));
});
test('concurrent local refresh calls share a single request', async () => {
  const entered = deferred(), resume = deferred();
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0) }, provider: async () => { entered.resolve(); await resume.promise; return response({ access_token: 'R', expires_in: 3600 }); } });
  const one = f.lifecycle.getYouTubeAccessToken('owner'); await entered.promise; const two = f.lifecycle.getYouTubeAccessToken('owner');
  resume.resolve(); assert.equal((await one).accessToken, 'R'); assert.equal((await two).accessToken, 'R'); assert.equal(f.fetchCount, 1);
});
test('independent workers cannot overwrite newer refresh/access tokens with a late result', async () => {
  const entered = deferred(), resume = deferred(); let count = 0;
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0) }, provider: async () => {
    if (++count === 1) { entered.resolve(); await resume.promise; return response({ access_token: 'LATE', refresh_token: 'LATE_REFRESH', expires_in: 3600 }); }
    return response({ access_token: 'WINNER', refresh_token: 'WINNER_REFRESH', expires_in: 3600 });
  } });
  const first = f.lifecycle.getYouTubeAccessToken('owner'); await entered.promise;
  assert.equal((await f.secondLifecycle().getYouTubeAccessToken('owner')).accessToken, 'WINNER'); resume.resolve();
  assert.equal((await first).accessToken, 'WINNER'); assert.equal(f.state.token.refreshToken, 'WINNER_REFRESH');
});
test('late refresh success cannot overwrite channel-changing reconnect', async () => {
  const entered = deferred(), resume = deferred();
  const f = fixture({ initial: { ...token(), expiresAt: new Date(0) }, provider: async () => { entered.resolve(); await resume.promise; return response({ access_token: 'LATE', expires_in: 3600 }); } });
  const pending = f.lifecycle.getYouTubeAccessToken('owner'); await entered.promise;
  await f.lifecycle.saveYouTubeAccessToken('owner', data('NEW_CHANNEL', 'CHANNEL_B', 'B_REFRESH')); resume.resolve();
  assert.equal((await pending).accessToken, 'NEW_CHANNEL'); assert.equal(f.state.token.platformUserId, 'CHANNEL_B');
});
test('simultaneous callback saves cannot mix channel credentials', async () => {
  const f = fixture(), p = f.pause(0);
  const first = f.lifecycle.saveYouTubeAccessToken('owner', data('A_NEW', 'CHANNEL_A', 'A_REFRESH')); await p.entered.promise;
  const second = f.lifecycle.saveYouTubeAccessToken('owner', data('B_NEW', 'CHANNEL_B')); p.resume.resolve(); await Promise.all([first, second]);
  assert.equal(f.state.token.platformUserId, 'CHANNEL_B'); assert.equal(f.state.token.accessToken, 'B_NEW'); assert.equal(f.state.token.refreshToken, null);
});
test('real NextResponse clears scoped state and legacy cookies independently', async () => {
  const f = fixture(), s = await f.auth.createYouTubeState('owner', 'session1');
  const actual = require('next/server');
  const callback = load('app/api/auth/callback/youtube/route.ts', {
    'next/server': actual, 'next/cache': { revalidatePath() {} },
    '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'owner' }, session: { id: 'session1' } }) } } },
    '@/lib/youtube-auth': f.auth, '@/lib/youtube-token': f.lifecycle, '@/lib/youtube-sync': load('lib/youtube-sync.ts', { '@/lib/db': { db: f.db }, '@/lib/youtube-lock': locks, '@/lib/youtube-token': f.lifecycle, '@/lib/youtube-auth': f.auth, '@/lib/creator-metrics': metrics }), '@/lib/creator-metrics': metrics,
  }).GET;
  const r = await callback(request({ state: s.state, error: 'access_denied' }, s.cookie));
  assert.equal(r.cookies.get('__youtube_oauth_state').path, '/api/auth');
  assert.equal(r.cookies.get('__youtube_oauth_state').maxAge, 0);
  assert.equal(r.cookies.get('__youtube_state').path, '/');
  assert.equal(r.cookies.get('__youtube_state').maxAge, 0);
});
test('callback without current session fails before exchange even with valid initiating state', async () => {
  const f = fixture(), s = await f.auth.createYouTubeState('owner', 'session1');
  const before = structuredClone(f.state);
  assert.equal(errorCode(await routes(f, null).callback(request({ state: s.state, code: 'code' }, s.cookie))), 'invalid_state');
  assert.equal(f.fetchCount, 0); assert.deepEqual(f.state, before);
});
test('same credential values saved by reconnect still get a new version and reject stale cleanup', async () => {
  const f = fixture(), before = structuredClone(f.state.token);
  await f.lifecycle.saveYouTubeAccessToken('owner', data('OLD', 'CHANNEL_A', 'OLD_REFRESH'));
  assert.ok(f.state.token.updatedAt > before.updatedAt);
  assert.equal((await f.lifecycle.clearYouTubeDeadAuth('owner', before)).accessToken, 'OLD');
  assert.ok(f.state.markers.includes('youtube'));
});
function syncWithLifecycle(f) {
  return load('lib/youtube-sync.ts', { '@/lib/db': { db: f.db }, '@/lib/youtube-lock': locks,
    '@/lib/youtube-token': f.lifecycle, '@/lib/youtube-auth': f.auth, '@/lib/creator-metrics': metrics });
}
function emptyOfficialChannel() {
  return response({ items: [{ id: 'CHANNEL_A', snippet: {}, statistics: { subscriberCount: '5', videoCount: '0' }, contentDetails: { relatedPlaylists: { uploads: 'UPLOADS' } } }] });
}
const accessRejected = () => response({ error: { errors: [{ reason: 'authError' }] } }, 401);
test('blocker 401 with live refresh grant updates current credential and retries once without purge', async () => {
  let channelReads = 0, refreshes = 0;
  const f = fixture({ provider: async (url, init) => {
    if (url.endsWith('/token')) { refreshes++; return response({ access_token: 'RECOVERED', expires_in: 3600, token_type: 'Bearer' }); }
    if (new URL(url).pathname.endsWith('/channels')) {
      if (++channelReads === 1) return accessRejected();
      assert.equal(init.headers.Authorization, 'Bearer RECOVERED'); return emptyOfficialChannel();
    }
    return response({ items: [] });
  } });
  assert.equal((await syncWithLifecycle(f).syncYouTubeOfficialData('owner', { credential: structuredClone(f.state.token) })).ok, true);
  assert.equal(refreshes, 1); assert.equal(channelReads, 2);
  assert.equal(f.state.token.accessToken, 'RECOVERED'); assert.equal(f.state.compliance.status, 'ACTIVE');
  assert.equal(f.state.compliance.removalReason, undefined);
});
test('blocker 401 only purges after exact-current refresh invalid_grant', async () => {
  const f = fixture({ provider: async url => url.endsWith('/token') ? response({ error: 'invalid_grant' }, 400) : accessRejected() });
  assert.equal((await syncWithLifecycle(f).syncYouTubeOfficialData('owner', { credential: structuredClone(f.state.token) })).reason, 'reauth_required');
  assert.equal(f.state.compliance.status, 'PURGED'); assert.equal(f.state.compliance.removalReason, 'AUTHORIZATION_LOST');
  assert.equal(f.state.token, null); for (const key of ['stats', 'posts', 'curation']) assert.equal(f.state[key].length, 0);
});
for (const failure of ['network', '429', '503', 'malformed']) test(`blocker 401 with ${failure} refresh preserves every local row`, async () => {
  const f = fixture({ provider: async url => {
    if (!url.endsWith('/token')) return accessRejected();
    if (failure === 'network') throw Error('network');
    return failure === 'malformed' ? response({}) : response({ error: 'invalid_grant' }, Number(failure));
  } });
  const before = structuredClone(f.state);
  assert.equal((await syncWithLifecycle(f).syncYouTubeOfficialData('owner', { credential: structuredClone(f.state.token) })).reason, 'temporary_failure');
  assert.deepEqual(f.state, before);
});
test('blocker stale access 401 does not refresh or purge the newer official connection', async () => {
  let f;
  f = fixture({ provider: async () => { await f.lifecycle.saveYouTubeAccessToken('owner', data('RECONNECTED', 'CHANNEL_B', 'NEW_REFRESH')); return accessRejected(); } });
  const failed = structuredClone(f.state.token);
  assert.equal((await syncWithLifecycle(f).syncYouTubeOfficialData('owner', { credential: failed })).reason, 'superseded');
  assert.equal(f.state.token.accessToken, 'RECONNECTED'); assert.equal(f.state.compliance.status, 'ACTIVE'); assert.equal(f.fetchCount, 1);
});
test('blocker access-only 401 preserves dataset and asks for authorization without grant-loss inference', async () => {
  const f = fixture({ initial: { ...token(), refreshToken: null }, provider: async () => accessRejected() });
  const before = structuredClone(f.state);
  assert.equal((await syncWithLifecycle(f).syncYouTubeOfficialData('owner', { credential: structuredClone(f.state.token) })).reason, 'reauth_required');
  assert.deepEqual(f.state, before);
});
for (const expired of [false, true]) test(`blocker lease ${expired ? 'expired' : 'stolen only'} cannot authorize destructive auth-loss cleanup`, async () => {
  const f = fixture(); const failed = structuredClone(f.state.token);
  f.state.compliance.leaseId = expired ? 'old-worker' : 'new-worker';
  f.state.compliance.leaseExpiresAt = new Date(Date.now() + (expired ? -1000 : 60000));
  const before = structuredClone(f.state);
  const result = await f.lifecycle.clearYouTubeDeadAuth('owner', failed, { connectionGeneration: 1, revision: 1, lease: { id: 'old-worker' } });
  assert.equal(result.reason, 'superseded'); assert.deepEqual(f.state, before);
});
