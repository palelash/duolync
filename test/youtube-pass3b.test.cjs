const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm'); const ts = require('typescript');
function load(file, imports = {}) {
 const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
 { exports, require: name => name === 'server-only' ? {} : imports[name], Date }); return exports;
}

const bootstrap = load('lib/youtube-bootstrap.ts');
const compliance = load('lib/youtube-compliance.ts');


const now = new Date('2026-10-10T00:00:00Z');
const base = { state: null, token: null, stats: null, officialPosts: false };

test('3B only ACTIVE identical generation/revision/lease is compatible', () => {
  const state = { status: 'ACTIVE', blockedAt: null, connectionGeneration: 2, revision: 3, leaseId: null };
  assert.equal(compliance.sameYouTubeFence(state, state), true);
  for (const change of [{ revision: 4 }, { connectionGeneration: 3 }, { leaseId: 'new' }, { status: 'PURGED' }, { blockedAt: new Date() }])
    assert.equal(compliance.sameYouTubeFence({ ...state, ...change }, state), false);
  assert.equal(compliance.sameYouTubeFence(null, null), false);
});

test('3B backfill classifications never infer validation or fabricate freshness', () => {
  const plan = bootstrap.planYouTubeBootstrap;
  assert.equal(plan(base, now).kind, 'SKIP');
  assert.equal(plan({ ...base, officialPosts: true }, now).kind, 'PURGE');
  assert.equal(plan({ ...base, stats: { dataSource: 'LEGACY_UNKNOWN' } }, now).kind, 'SKIP');
  assert.equal(plan({ ...base, token: { platformUserId: 'channel' } }, now).kind, 'SKIP');
  const unknown = plan({ ...base, officialPosts: true, token: { platformUserId: 'channel' } }, now);
  assert.equal(unknown.kind, 'ACTIVE'); assert.equal(unknown.refreshAt, null); assert.equal(unknown.deleteByAt, now);
  const age = new Date('2026-08-01T00:00:00Z');
  const evidence = { ...base, token: { platformUserId: 'channel' }, stats: { dataSource: 'OFFICIAL_API', providerAccountId: 'channel', fetchedAt: age } };
  const known = plan(evidence, now); assert.equal(known.refreshAt, age); assert.ok(known.deleteByAt < now);
  for (const stats of [{ ...evidence.stats, providerAccountId: 'wrong' }, { ...evidence.stats, fetchedAt: new Date('2030-01-01') }])
    assert.equal(plan({ ...evidence, stats }, now).refreshAt, null);
  assert.equal('lastSuccessfulAuthorizationValidationAt' in known, false);
});

test('3B existing lifecycle idempotently wins every backfill', () => {
  for (const status of ['ACTIVE', 'PURGED']) assert.equal(bootstrap.planYouTubeBootstrap({ ...base, state: { status, blockedAt: null }, officialPosts: true }, now).kind, 'KEEP');
});

test('3B claim checks both owners before rejecting existing lifecycle', async () => {
  const events = [];
  const claim = load('lib/youtube-claim.ts', { '@/lib/youtube-lock': { lockYouTubeOwner: async (_tx, id) => events.push(id) },
    '@/lib/youtube-compliance': { lockYouTubeCompliance: async () => ({ status: 'PURGED' }) } });
  await assert.rejects(claim.guardYouTubeClaim({ $queryRaw: async () => [], youTubeComplianceState: { findUnique: async () => ({ status: 'PURGED' }) } }, 'z', 'a'), /MANUAL_REVIEW/);
  assert.deepEqual(events, ['a', 'z']);
});

test('3B imported metadata preserves identity but cannot resurrect blocked aggregate metrics', () => {
  const imported = load('lib/youtube-import.ts');
  const data = { bio: 'identity', socialLinks: { youtube: 'user-link' }, totalFollowers: 100, followerCount: 100,
    averageEngagement: 4, avgEngagementRate: 4, lastStatsUpdate: now, lastSyncedAt: now };
  const safe = imported.youtubeSafeImportedProfile(data, true);
  assert.equal(safe.bio, data.bio); assert.deepEqual(safe.socialLinks, data.socialLinks);
  for (const key of ['totalFollowers', 'followerCount', 'averageEngagement', 'avgEngagementRate', 'lastStatsUpdate', 'lastSyncedAt']) assert.equal(key in safe, false);
  assert.deepEqual(imported.youtubeSafeImportedProfile(data, false), data);
});
test('3B bootstrap uses oldest applicable official data evidence', () => {
  const earlier = new Date('2026-07-01T00:00:00Z');
  const plan = bootstrap.planYouTubeBootstrap({ ...base, token: { platformUserId: 'channel' },
    stats: { dataSource: 'OFFICIAL_API', providerAccountId: 'channel', fetchedAt: new Date('2026-08-01') },
    officialPosts: true, oldestOfficialPostAt: earlier }, now);
  assert.equal(plan.refreshAt, earlier); assert.ok(plan.deleteByAt < now);
});
test('blocker cleanup preserves unrelated imported aggregates with no YouTube contribution', () => {
  const patch = load('lib/youtube-aggregates.ts', { '@/lib/creator-metrics': load('lib/creator-metrics.ts') });
  assert.deepEqual(Object.keys(patch.youtubeAggregateRemovalPatch('IMPORTED', false, false, [])), []);
  const canonical = patch.youtubeAggregateRemovalPatch('REGISTERED', true, true, [{ followerCount: 12, fetchedAt: now }, { followerCount: 0, fetchedAt: now }]);
  assert.equal(canonical.followerCount, 12); assert.equal(canonical.totalFollowers, 12); assert.equal(canonical.lastSyncedAt.getTime(), now.getTime());
  assert.equal(canonical.averageEngagement, null);
  const unknownLegacy = patch.youtubeAggregateRemovalPatch('IMPORTED', true, true, []);
  assert.equal(unknownLegacy.followerCount, null); assert.equal('totalFollowers' in unknownLegacy, false); assert.equal('avgEngagementRate' in unknownLegacy, false);
  const result = load('lib/creator-metrics.ts').getNormalizedCreatorMetrics({ platformStats: [], socialPosts: [], oauthPlatforms: [],
    creatorProfile: { followerCount: null, totalFollowers: 700, profileOrigin: 'IMPORTED', avgEngagementRate: 3, averageEngagement: 3, lastSyncedAt: now, lastStatsUpdate: now } });
  assert.equal(result.totalFollowers, 700); assert.equal(result.hasOfficialData, false); assert.equal(result.isImportedAggregate, true); assert.equal(result.platforms.length, 0);
});

test('blocker PostgreSQL target gate refuses application equality, aliases, production and missing markers', () => {
  const { assertDisposableYouTubeDatabase: gate } = require('./youtube-postgres-target.cjs');
  const target = 'postgresql://fake@127.0.0.1:55433/youtube_test_pass3b1';
  assert.equal(gate(target, []), target);
  for (const bad of [undefined, 'postgresql://fake@127.0.0.1:55433/application', 'postgresql://fake@prod.example/youtube_test_pass3b1',
    'postgresql://fake@127.0.0.1:55433/youtube_test_production', target + '?schema=application']) assert.throws(() => gate(bad, []));
  assert.throws(() => gate(target, [target]));
  assert.throws(() => gate(target, ['postgresql://fake@localhost:55433/youtube_test_pass3b1']));
});
test('final claim coordination covers every provider token in deterministic order before profiles', async () => {
  const events = [];
  const helper = load('lib/youtube-claim.ts', { '@/lib/youtube-lock': { lockYouTubeOwner: async (_tx, id) => events.push(`user:${id}`) },
    '@/lib/youtube-compliance': { lockYouTubeCompliance: async (_tx, id) => events.push(`compliance:${id}`) } });
  await helper.lockClaimOwners({ $queryRaw: async (sql, id) => {
    const query = sql.join('');
    if (query.includes('FROM "PlatformToken"')) {
      assert.doesNotMatch(query, /AND\s+"platform"\s*=/);
      assert.match(query, /ORDER BY "platform", "id" FOR UPDATE/);
      events.push(`all-tokens:${id}`);
    } else events.push(`profile:${id}`);
    return [];
  } }, ['z', 'a', 'z']);
  assert.deepEqual(events, ['user:a', 'user:z', 'all-tokens:a', 'all-tokens:z', 'profile:a', 'profile:z', 'compliance:a', 'compliance:z']);
});
