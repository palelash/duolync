const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    if (name === 'server-only') return {};
    assert.ok(name in imports, `Unexpected dependency ${name}`); return imports[name];
  }, URL, URLSearchParams, Date, BigInt, Set, Map, process: { env: {} }, console, ...globals });
  return exports;
}
const locks = load('lib/youtube-lock.ts');
const metrics = load('lib/creator-metrics.ts');
const tokenHelpers = load('lib/youtube-token.ts', { '@/lib/db': { db: {} }, '@/lib/youtube-lock': locks, '@/lib/youtube-auth': {} });
const video = (id = 'recent', privacyStatus = 'public', statistics = { viewCount: '0', likeCount: '0', commentCount: '0' }) => ({
  id, status: { privacyStatus }, snippet: { title: id, channelId: 'CHANNEL', publishedAt: '2020-01-02T03:04:05Z' }, statistics,
});
function fixture(options = {}) {
  const state = { token: { id: 'token', accessToken: 'ACCESS', refreshToken: 'REFRESH', platformUserId: 'CHANNEL', updatedAt: new Date(0) },
    stats: [{ old: true }], posts: [{ old: true }], curation: (options.curated ?? []).map(providerPostId => ({ providerPostId })), markers: ['youtube'], profile: {} };
  const before = structuredClone(state), requests = [], events = [];
  let writes = 0, lifecycleCalls = 0, deadAuthCalls = 0;
  const db = {
    platformToken: { findUnique: async () => structuredClone(state.token) },
    creatorProfile: { findUnique: async () => ({ id: 'profile' }) },
    creatorContentCuration: { findMany: async () => structuredClone(state.curation) },
    $transaction: async run => {
      const snapshot = structuredClone(state);
      let owner = false, token = false, profile = false;
      const tx = {
        $queryRaw: async sql => {
          const query = sql.join('');
          if (query.includes('FROM "User"')) { owner = true; events.push('owner'); return [{ id: 'owner' }]; }
          assert.ok(owner);
          if (query.includes('FROM "PlatformToken"')) { token = true; events.push('token'); return state.token ? [structuredClone(state.token)] : []; }
          assert.ok(token); profile = true; events.push('profile'); return [{ id: 'profile', connectedPlatforms: state.markers }];
        },
        creatorContentCuration: db.creatorContentCuration,
        platformStats: { upsert: async ({ create }) => { assert.ok(profile); writes++; state.stats = [create]; }, findMany: async () => state.stats },
        socialPost: { deleteMany: async ({ where }) => { assert.ok(profile); assert.equal(where.platform, 'youtube'); assert.equal(where.dataSource, undefined); writes++; state.posts = []; },
          createMany: async ({ data }) => { if (options.failTransaction) throw Error('db failure'); state.posts = data; } },
        creatorProfile: { update: async ({ data }) => { state.profile = data; } },
      };
      try { return await run(tx); } catch (e) { Object.assign(state, snapshot); throw e; }
    },
  };
  const lifecycle = { ...tokenHelpers,
    getYouTubeAccessToken: async userId => { assert.equal(userId, 'owner'); lifecycleCalls++; return options.tokenOutcome ?? { ok: true, accessToken: 'ACCESS' }; },
    clearYouTubeDeadAuth: async (userId, failed) => {
      deadAuthCalls++;
      if (tokenHelpers.sameYouTubeCredentialVersion(state.token, failed)) { state.token = null; state.markers = []; return { ok: false, reason: 'reauth_required' }; }
      return { ok: true, accessToken: state.token.accessToken };
    },
  };
  const auth = { youtubeFetch: async url => {
    // Provider reads must not occur inside a dataset transaction.
    assert.equal(events.length, 0); requests.push(new URL(url));
    const resource = new URL(url).pathname.split('/').pop();
    if (options.onRead) options.onRead(resource, state);
    let body;
    if (options.errorResource === resource) return { ok: false, status: options.status ?? 503, json: async () => ({ error: { errors: [{ reason: options.reason ?? 'backendError' }] } }) };
    if (resource === 'channels') body = { items: [{ id: options.channelId ?? 'CHANNEL', snippet: { title: 'Channel' }, contentDetails: { relatedPlaylists: { uploads: 'UPLOADS' } }, statistics: options.channelStats ?? { subscriberCount: '0', viewCount: '0', videoCount: '0' } }] };
    if (resource === 'playlistItems') body = { items: (options.recent ?? ['recent']).map(videoId => ({ contentDetails: { videoId }, snippet: { publishedAt: '1999-01-01T00:00:00Z' } })) };
    if (resource === 'videos') {
      assert.equal(new URL(url).searchParams.get('part'), 'snippet,status,statistics');
      const ids = new URL(url).searchParams.get('id').split(','); assert.ok(ids.length <= 50);
      body = { items: (options.videos ?? [video()]).filter(v => ids.includes(v.id)) };
    }
    return { ok: true, status: 200, json: async () => options.malformed === resource ? {} : body };
  } };
  const sync = load('lib/youtube-sync.ts', { '@/lib/db': { db }, '@/lib/youtube-lock': locks,
    '@/lib/youtube-token': lifecycle, '@/lib/youtube-auth': auth, '@/lib/creator-metrics': metrics });
  return { state, before, requests, events, sync, lifecycle, db, auth, get writes() { return writes; }, get lifecycleCalls() { return lifecycleCalls; }, get deadAuthCalls() { return deadAuthCalls; } };
}
function preserved(f) { assert.deepEqual(f.state.stats, f.before.stats); assert.deepEqual(f.state.posts, f.before.posts); assert.deepEqual(f.state.curation, f.before.curation); }
test('manual and callback credential options execute identical official mapping', async () => {
  for (const callback of [false, true]) {
    const f = fixture(); const result = await f.sync.syncYouTubeOfficialData('owner', callback ? { credential: f.state.token } : undefined);
    assert.equal(result.ok, true); assert.equal(f.lifecycleCalls, callback ? 0 : 1);
    assert.equal(f.state.stats[0].providerAccountId, 'CHANNEL'); assert.equal(f.state.posts[0].dataSource, 'OFFICIAL_API');
    assert.deepEqual(f.events, ['owner', 'token', 'profile']);
    assert.equal(f.state.stats[0].followingCount, null); assert.equal(f.state.stats[0].engagementRate, null);
    assert.equal(f.state.profile.followerCount, 0);
  }
});
test('channel and video real zero preserved; publication comes from video', async () => {
  const f = fixture(); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).ok, true);
  const s = f.state.stats[0], p = f.state.posts[0];
  assert.equal(s.followerCount, 0); assert.equal(s.postCount, 0); assert.equal(s.raw.total_views, 0);
  for (const key of ['views', 'likes', 'comments']) assert.equal(p[key], 0);
  assert.equal(p.postedAt.toISOString(), '2020-01-02T03:04:05.000Z'); assert.equal(p.fetchedAt.getTime(), s.fetchedAt.getTime());
});
test('missing statistics remain null and clear stale cache', async () => {
  const f = fixture({ channelStats: {}, videos: [video('recent', 'public', {})] }); await f.sync.syncYouTubeOfficialData('owner');
  assert.equal(f.state.stats[0].followerCount, null); assert.equal(f.state.stats[0].postCount, null); assert.equal(f.state.stats[0].raw.total_views, null);
  for (const key of ['views', 'likes', 'comments']) assert.equal(f.state.posts[0][key], null);
  assert.equal(f.state.profile.followerCount, null);
});
for (const bad of ['12garbage', '-1', '1.2', '', null, 0, '2147483648', '18446744073709551615']) test(`rejects unsafe counter ${bad}`, async () => {
  const f = fixture({ videos: [video('recent', 'public', { viewCount: bad })] });
  assert.equal((await f.sync.syncYouTubeOfficialData('owner')).ok, false); assert.equal(f.writes, 0); preserved(f);
});
for (const privacy of ['private', 'unlisted', undefined]) test(`excludes ${privacy} and clears stale posts without curation deletion`, async () => {
  const v = video('recent', privacy); if (privacy === undefined) delete v.status.privacyStatus;
  const f = fixture({ videos: [v], curated: ['recent'] }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).ok, true);
  assert.equal(f.state.posts.length, 0); assert.deepEqual(f.state.curation, f.before.curation);
});
test('successful empty discovery clears all stale sources', async () => {
  const f = fixture({ recent: [], videos: [] }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).ok, true); assert.equal(f.state.posts.length, 0);
});
test('curated older public survives; private and deleted curated items remain only in curation', async () => {
  const f = fixture({ curated: ['older', 'private', 'deleted'], videos: [video(), video('older'), video('private', 'private')] });
  await f.sync.syncYouTubeOfficialData('owner'); assert.deepEqual(Array.from(f.state.posts, p => p.providerPostId), ['recent', 'older']);
  assert.deepEqual(f.state.curation, f.before.curation);
});
test('batches bounded curated candidates by 50', async () => {
  const curated = Array.from({ length: 200 }, (_, i) => `older${i}`);
  const f = fixture({ curated, videos: [video(), ...curated.map(id => video(id))] });
  assert.equal((await f.sync.syncYouTubeOfficialData('owner')).ok, true); assert.equal(f.requests.filter(r => r.pathname.endsWith('/videos')).length, 5);
  assert.equal(f.requests.find(r => r.pathname.endsWith('/playlistItems')).searchParams.get('maxResults'), '50');
});
test('curation over bound fails without partial replacement', async () => {
  const f = fixture({ curated: Array.from({ length: 201 }, (_, i) => String(i)) }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).ok, false); preserved(f); assert.equal(f.requests.length, 0);
});
test('identity mismatch writes nothing', async () => {
  const f = fixture({ channelId: 'OTHER' }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).reason, 'identity_mismatch'); assert.equal(f.writes, 0); preserved(f);
});
for (const mutation of ['reconnect', 'replacement', 'disconnect', 'curation']) test(`superseded by ${mutation} writes nothing`, async () => {
  const f = fixture({ onRead(resource, state) { if (resource !== 'videos') return;
    if (mutation === 'disconnect') state.token = null;
    else if (mutation === 'curation') state.curation.push({ providerPostId: 'added' });
    else state.token = { ...state.token, updatedAt: new Date(1), ...(mutation === 'reconnect' ? { platformUserId: 'NEW' } : {}) };
  } }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).reason, 'superseded'); assert.equal(f.writes, 0);
  assert.deepEqual(f.state.posts, f.before.posts); assert.deepEqual(f.state.stats, f.before.stats);
});
for (const resource of ['channels', 'playlistItems', 'videos']) test(`${resource} temporary failure preserves dataset and auth`, async () => {
  const f = fixture({ errorResource: resource }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).reason, 'temporary_failure'); preserved(f); assert.ok(f.state.token); assert.equal(f.writes, 0);
});
test('malformed successful response does not stamp freshness', async () => {
  const f = fixture({ malformed: 'videos' }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).reason, 'provider_failure'); preserved(f);
});
test('transaction failure rolls back stats, deletion, and cache', async () => {
  const f = fixture({ failTransaction: true }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).reason, 'temporary_failure'); preserved(f);
});
for (const [status, reason, expected] of [[401, 'authError', 'reauth_required'], [401, 'youtubeSignupRequired', 'configuration_failure'], [403, 'insufficientPermissions', 'configuration_failure'], [403, 'quotaExceeded', 'temporary_failure'], [401, 'unknown', 'provider_failure']]) test(`classification ${status}/${reason}`, async () => {
  const f = fixture({ errorResource: 'videos', status, reason }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).reason, expected); preserved(f);
  assert.equal(f.deadAuthCalls, expected === 'reauth_required' ? 1 : 0); assert.equal(!!f.state.token, expected !== 'reauth_required');
});
test('stale auth failure cannot remove newer reconnect', async () => {
  const f = fixture({ errorResource: 'videos', status: 401, reason: 'authError', onRead(resource, state) { if (resource === 'videos') state.token.updatedAt = new Date(2); } });
  assert.equal((await f.sync.syncYouTubeOfficialData('owner')).reason, 'superseded'); assert.ok(f.state.token); preserved(f);
});
test('manual action owns session and returns only client safe states', async () => {
  let calls = [], session = null, reason = null;
  const action = load('app/actions/youtube-sync.ts', { 'next/headers': { headers: async () => ({}) }, 'next/cache': { revalidatePath() {} },
    '@/lib/auth': { auth: { api: { getSession: async () => session } } },
    '@/lib/youtube-sync': { syncYouTubeOfficialData: async userId => { calls.push(userId); return reason ? { ok: false, reason } : { ok: true }; } } });
  assert.equal((await action.refreshYouTubeDataAction('attacker')).reason, 'unauthorized'); assert.equal(calls.length, 0);
  session = { user: { id: 'owner' } }; assert.equal((await action.refreshYouTubeDataAction('attacker')).ok, true); assert.deepEqual(calls, ['owner']);
  reason = 'superseded'; assert.equal((await action.refreshYouTubeDataAction()).reason, 'temporary_failure');
  reason = 'counter_range'; assert.equal((await action.refreshYouTubeDataAction()).reason, 'configuration_failure');
});
test('token lifecycle failures stop before provider reads and no fallbacks are imported', async () => {
  for (const reason of ['not_connected', 'reauth_required', 'temporary_failure', 'configuration_error']) {
    const f = fixture({ tokenOutcome: { ok: false, reason } }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).ok, false); assert.equal(f.requests.length, 0); preserved(f);
  }
});
test('OAuth callback saves exact credential then uses real shared official video mapping', async () => {
  const f = fixture();
  const auth = { ...f.auth, GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
    consumeYouTubeState: async () => true, youtubeCallbackUri: () => 'https://app.example/callback', youtubeAppUrl: () => 'https://app.example',
    YOUTUBE_STATE_COOKIE: 'state', YOUTUBE_STATE_OPTIONS: {},
    parseYouTubeTokenResponse: () => ({ accessToken: 'ACCESS', refreshToken: null, expiresAt: null, scopes: null }),
    youtubeFetch: async (url, init) => String(url).includes('/token') ? { ok: true, json: async () => ({ access_token: 'ACCESS' }) } : f.auth.youtubeFetch(url, init),
  };
  class NextResponse {
    constructor() { this.cookies = { set() {} }; this.headers = { set() {} }; }
    static redirect(url) { const r = new NextResponse(); r.location = String(url); return r; }
  }
  let saved;
  const callback = load('app/api/auth/callback/youtube/route.ts', { 'next/server': { NextResponse }, 'next/cache': { revalidatePath() {} },
    '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'owner' }, session: { id: 'session' } }) } } },
    '@/lib/youtube-auth': auth, '@/lib/youtube-sync': f.sync,
    '@/lib/youtube-token': { saveYouTubeAccessToken: async (userId, data) => { assert.equal(userId, 'owner'); saved = data; return structuredClone(f.state.token); } },
  }, { process: { env: { YOUTUBE_CLIENT_ID: 'client', YOUTUBE_CLIENT_SECRET: 'secret' } } }).GET;
  const result = await callback({ url: 'https://app.example/callback?state=state&code=code', headers: {}, cookies: { get: () => ({ value: 'state' }) } });
  assert.ok(new URL(result.location).searchParams.has('youtube_connected')); assert.equal(saved.platformUserId, 'CHANNEL');
  assert.equal(f.state.posts[0].providerPostId, 'recent'); assert.equal(f.state.posts[0].views, 0); assert.equal(f.lifecycleCalls, 0);
});
test('malformed publication date and wrong video owner cannot enter public posts', async () => {
  const malformed = video(); malformed.snippet.publishedAt = '2020-02-30T00:00:00Z';
  const f = fixture({ videos: [malformed] }); assert.equal((await f.sync.syncYouTubeOfficialData('owner')).ok, false); preserved(f);
  const other = video(); other.snippet.channelId = 'OTHER';
  const g = fixture({ videos: [other] }); assert.equal((await g.sync.syncYouTubeOfficialData('owner')).ok, true); assert.equal(g.state.posts.length, 0);
});
test('YouTube RapidAPI writer rechecks both existing provenance gates under coordination', async () => {
  const policy = load('lib/platform-stats-policy.ts');
  for (const [connected, source, accepted] of [[true, 'LEGACY_UNKNOWN', false], [false, 'OFFICIAL_API', false], [false, 'APIFY', true]]) {
    const events = []; let writes = 0;
    const cached = { platform: 'youtube', dataSource: source, followerCount: 10, followingCount: null, postCount: 1, engagementRate: null, fetchedAt: new Date(0) };
    const db = { platformStats: { findFirst: async () => cached }, $transaction: async run => run({
      $queryRaw: async sql => {
        const query = sql.join('');
        if (query.includes('FROM "User"')) { events.push('owner'); return [{ id: 'owner' }]; }
        if (query.includes('FROM "PlatformToken"')) { assert.deepEqual(events, ['owner']); events.push('token'); return connected ? [{ id: 'token' }] : []; }
        assert.deepEqual(events, ['owner', 'token']); events.push('profile'); return [{ id: 'profile' }];
      }, platformStats: { findFirst: async () => { assert.deepEqual(events, ['owner', 'token', 'profile']); return cached; },
        upsert: async () => { writes++; }, findMany: async () => [{ followerCount: 10 }] }, creatorProfile: { updateMany: async () => {} },
    }) };
    const action = load('app/actions/stats.ts', { '@/lib/db': { db }, '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'owner' } }) } } },
      'next/headers': { headers: async () => ({}) }, '@/lib/platform-stats-policy': policy, '@/lib/creator-metrics': metrics, '@/lib/youtube-lock': locks,
    }, { process: { env: { RAPIDAPI_KEY: 'test' } }, fetch: async () => ({ ok: true, json: async () => ({}) }) });
    await action.fetchCreatorStatsAction('youtube', 'channel'); assert.equal(writes, accepted ? 1 : 0);
  }
});
