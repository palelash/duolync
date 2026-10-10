const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { if (name === 'server-only') return {}; assert.ok(name in imports, name); return imports[name]; },
      Date, URL, URLSearchParams, Set, Map, console: { warn() {}, error() {} }, ...globals });
  return exports;
}
const locks = load('lib/youtube-lock.ts');
const metrics = load('lib/creator-metrics.ts');
function fixture(options = {}) {
  const state = {
    token: { id: 'token', userId: 'owner', platform: 'tiktok', accessToken: 'old', refreshToken: 'refresh', expiresAt: new Date(0),
      platformUserId: 'OPEN', username: 'old-handle', scopes: options.scopes ?? 'user.info.basic,user.info.profile,user.info.stats,video.list' },
    stats: { followerCount: 40, followingCount: 5, postCount: 3, raw: { display_name: 'old-display', username: 'old-handle', likes_count: 99, video_count: 3, is_verified: true, unknown_key: 'keep' } },
    posts: [{ platform: 'tiktok', providerPostId: 'old' }, { platform: 'instagram', providerPostId: 'independent' }],
    curation: [{ platform: 'tiktok' }, { platform: 'instagram' }],
    profile: { id: 'profile', followerCount: 50, connectedPlatforms: ['instagram', 'tiktok'], lastSyncedAt: new Date(0) },
  };
  const events = [], calls = [];
  let active = false;
  const db = {
    platformToken: { findUnique: async () => structuredClone(state.token) },
    creatorProfile: { findUnique: async () => structuredClone(state.profile) },
    platformStats: { findUnique: async () => structuredClone(state.stats) },
    $transaction: async run => {
      const before = structuredClone(state); active = true;
      let owner = false, token = false, profile = false;
      const fail = stage => { if (options.failAt === stage) throw Error('injected'); };
      const tx = {
        $queryRaw: async (sql, id) => {
          const query = sql.join(''); assert.equal(id, 'owner');
          if (query.includes('FROM "User"')) { events.push('user'); owner = true; return options.missingOwner ? [] : [{ id }]; }
          assert.ok(owner, 'User is locked before token/profile');
          if (query.includes('FROM "PlatformToken"')) { token = true; events.push('token'); return state.token ? [structuredClone(state.token)] : []; }
          assert.ok(token); profile = true; events.push('profile'); return [{ id: 'profile' }];
        },
        platformToken: {
          update: async ({ data }) => { assert.ok(owner && token); events.push('token-update'); Object.assign(state.token, data); },
          delete: async () => { assert.ok(owner && token); events.push('token-delete'); state.token = null; },
          deleteMany: async () => { assert.ok(owner && token && profile); state.token = null; },
        },
        platformStats: {
          upsert: async ({ create, update }) => { assert.ok(owner && token && profile); events.push('stats'); fail('stats'); state.stats = state.stats ? { ...state.stats, ...update } : create; },
          deleteMany: async () => { assert.ok(owner && token && profile); state.stats = null; },
          findMany: async () => [...(state.stats ? [state.stats] : []), { followerCount: 10 }],
        },
        socialPost: {
          deleteMany: async ({ where }) => { assert.ok(owner && token && profile); state.posts = state.posts.filter(post => post.platform !== where.platform); },
          createMany: async ({ data }) => { fail('posts'); state.posts.push(...data); },
        },
        creatorContentCuration: { deleteMany: async ({ where }) => { state.curation = state.curation.filter(row => row.platform !== where.platform); } },
        $executeRaw: async sql => { assert.ok(owner && token); events.push('profile-write'); profile = true;
          if (sql.join('').includes('array_remove')) state.profile.connectedPlatforms = state.profile.connectedPlatforms.filter(platform => platform !== 'tiktok');
          else if (!state.profile.connectedPlatforms.includes('tiktok')) state.profile.connectedPlatforms.push('tiktok'); },
        creatorProfile: {
          findUnique: async () => structuredClone(state.profile),
          update: async ({ data }) => { assert.ok(owner && token && profile); fail('profile'); Object.assign(state.profile, data); },
        },
      };
      try { return await run(tx); } catch (error) { Object.assign(state, before); throw error; } finally { active = false; }
    },
  };
  const imports = { '@/lib/db': { db }, '@/lib/youtube-lock': locks, '@/lib/creator-metrics': metrics };
  const sync = load('lib/tiktok-sync.ts', { ...imports, '@/lib/tiktok-token': { tiktokFetch: async (id, url, init) => {
    assert.equal(active, false, 'sync provider reads still precede its write transaction'); assert.equal(id, 'owner'); calls.push({ url, init });
    if (options.providerFailure) return { ok: false, reason: 'temporary_failure' };
    return { ok: true, data: url.includes('/video/list/') ? { data: { videos: [{ id: 'fresh', create_time: 1700000000, title: 'caption', like_count: 0, comment_count: 0, view_count: 0 }] } }
      : { data: { user: options.userInfo ?? { open_id: 'OPEN', username: 'real-handle', display_name: 'display-only', follower_count: 0, following_count: 0, video_count: 1, likes_count: 0, is_verified: false } } } };
  } } });
  const lifecycle = load('lib/tiktok-token.ts', imports, { process: { env: { NEXT_PUBLIC_TIKTOK_CLIENT_KEY: 'fake', TIKTOK_CLIENT_SECRET: 'fake' } },
    fetch: async () => { assert.ok(active); events.push('refresh'); return { status: options.refreshStatus ?? 200, json: async () => options.refreshBody ?? { access_token: 'renewed', expires_in: 3600, open_id: 'OPEN' } }; } });
  const disconnect = load('app/actions/tiktok-disconnect.ts', { ...imports,
    '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'owner' } }) } } },
    '@/lib/tiktok-revoke': { revokeTikTokAuthorization: async () => options.revoke ?? 'revoked' },
    'next/headers': { headers: async () => ({}) }, 'next/cache': { revalidatePath() {} } });
  return { state, events, calls, sync, lifecycle, disconnect };
}
test('TikTok official mapping/zero counters and other-platform rows survive owner-first sync', async () => {
  const f = fixture(); assert.equal((await f.sync.syncTikTokOfficialData('owner')).ok, true);
  assert.deepEqual(f.events.slice(0, 5), ['user', 'token', 'profile', 'token-update', 'stats']);
  assert.equal(f.state.token.username, 'real-handle'); assert.equal(f.state.stats.followerCount, 0); assert.equal(f.state.stats.followingCount, 0);
  assert.equal(f.state.stats.raw.is_verified, false); assert.equal(f.state.stats.raw.unknown_key, 'keep'); assert.equal(f.state.stats.raw.likes_count, 0);
  assert.equal(f.state.stats.dataSource, 'OFFICIAL_API'); assert.equal(f.state.stats.providerAccountId, 'OPEN');
  assert.equal(f.state.profile.followerCount, 10); assert.equal(f.state.posts.find(post => post.platform === 'instagram').providerPostId, 'independent');
  const post = f.state.posts.find(post => post.platform === 'tiktok');
  assert.equal(post.providerPostId, 'fresh'); assert.equal(post.likes, 0); assert.equal(post.comments, 0); assert.equal(post.views, 0);
  assert.equal(post.postedAt.getTime(), 1700000000000); assert.equal(post.caption, 'caption');
});
test('TikTok stats-only sync still preserves omitted fields/posts and locks token when username is absent', async () => {
  const f = fixture({ scopes: 'user.info.basic,user.info.stats', userInfo: { open_id: 'OPEN' } });
  const posts = structuredClone(f.state.posts);
  assert.equal((await f.sync.syncTikTokOfficialData('owner')).ok, true);
  assert.deepEqual(f.events.slice(0, 4), ['user', 'token', 'profile', 'stats']);
  assert.equal(f.state.token.username, 'old-handle'); assert.equal(f.state.stats.followerCount, 40); assert.equal(f.state.stats.postCount, 3);
  assert.equal(f.state.stats.raw.is_verified, true); assert.equal(f.calls.length, 1); assert.deepEqual(f.state.posts, posts);
});
for (const failAt of ['stats', 'posts', 'profile']) test(`TikTok ${failAt} write failure still rolls back token/stats/posts/profile atomically`, async () => {
  const f = fixture({ failAt }); const before = structuredClone(f.state);
  assert.equal((await f.sync.syncTikTokOfficialData('owner')).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
});
for (const options of [{ missingOwner: true }, { providerFailure: true }]) test(`TikTok ${options.missingOwner ? 'missing owner' : 'provider failure'} writes no partial data`, async () => {
  const f = fixture(options); const before = structuredClone(f.state);
  assert.equal((await f.sync.syncTikTokOfficialData('owner')).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
});
test('TikTok successful refresh remains credential-only and now locks User before token', async () => {
  const f = fixture(); const before = structuredClone(f.state);
  assert.equal((await f.lifecycle.getTikTokAccessToken('owner')).accessToken, 'renewed');
  assert.deepEqual(f.events.slice(0, 3), ['user', 'token', 'refresh']);
  assert.equal(f.state.token.refreshToken, 'refresh'); assert.equal(f.state.token.platformUserId, 'OPEN');
  for (const key of ['stats', 'posts', 'profile', 'curation']) assert.deepEqual(f.state[key], before[key]);
});
test('TikTok invalid_grant cleanup keeps historical data/curation and removes only current token/marker', async () => {
  const f = fixture({ refreshStatus: 400, refreshBody: { error: 'invalid_grant' } }); const before = structuredClone(f.state);
  assert.equal((await f.lifecycle.getTikTokAccessToken('owner')).reason, 'reauth_required');
  assert.deepEqual(f.events, ['user', 'token', 'refresh', 'token-delete', 'profile-write']);
  assert.equal(f.state.token, null); assert.deepEqual(f.state.profile.connectedPlatforms, ['instagram']);
  for (const key of ['stats', 'posts', 'curation']) assert.deepEqual(f.state[key], before[key]);
});
test('TikTok temporary refresh errors still preserve current connection and history', async () => {
  const f = fixture({ refreshStatus: 503, refreshBody: { error: 'invalid_grant' } }); const before = structuredClone(f.state);
  assert.equal((await f.lifecycle.getTikTokAccessToken('owner')).reason, 'temporary_failure'); assert.deepEqual(f.state, before);
});
test('TikTok explicit disconnect still revokes, removes only TikTok dataset/curation, and preserves other platforms', async () => {
  const f = fixture(); assert.equal((await f.disconnect.disconnectTikTokAction()).ok, true);
  assert.deepEqual(f.events.slice(0, 3), ['user', 'token', 'profile']); assert.equal(f.state.token, null); assert.equal(f.state.stats, null);
  assert.deepEqual(f.state.profile.connectedPlatforms, ['instagram']); assert.equal(f.state.profile.followerCount, 10);
  assert.equal(f.state.posts.length, 1); assert.equal(f.state.posts[0].platform, 'instagram'); assert.equal(f.state.curation.length, 1); assert.equal(f.state.curation[0].platform, 'instagram');
});
test('TikTok revoke failure still aborts before transaction and preserves all local rows', async () => {
  const f = fixture({ revoke: 'temporary_failure' }); const before = structuredClone(f.state);
  assert.equal((await f.disconnect.disconnectTikTokAction()).reason, 'temporary_failure'); assert.deepEqual(f.state, before); assert.deepEqual(f.events, []);
});
