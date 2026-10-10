const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../lib/generated/prisma');
const { assertDisposableYouTubeDatabase } = require('./youtube-postgres-target.cjs');
const fileApplication = fs.existsSync('.env') ? require('dotenv').parse(fs.readFileSync('.env', 'utf8')).DATABASE_URL : null;
const target = assertDisposableYouTubeDatabase(process.env.TEST_DATABASE_URL, [process.env.DATABASE_URL, fileApplication]);
const pools = [new Pool({ connectionString: target, max: 4, statement_timeout: 10000 }), new Pool({ connectionString: target, max: 4, statement_timeout: 10000 })];
const clients = pools.map(pool => new PrismaClient({ adapter: new PrismaPg(pool) }));
function load(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => name === 'server-only' ? {} : imports[name] ?? (() => { throw Error(`Missing ${name}`); })(),
      Date, URL, URLSearchParams, Set, Map, BigInt, Buffer, process: { env: { YOUTUBE_CLIENT_ID: '123-test.apps.googleusercontent.com', YOUTUBE_CLIENT_SECRET: 'fake-test-secret', GOOGLE_CLIENT_ID: '456-login.apps.googleusercontent.com' } }, console, AbortSignal, crypto: require("node:crypto"), ...globals });
  return exports;
}
const compliance = load('lib/youtube-compliance.ts');
const locks = load('lib/youtube-lock.ts');
const metrics = load('lib/creator-metrics.ts');
const aggregates = load('lib/youtube-aggregates.ts', { '@/lib/creator-metrics': metrics });
const claimLocks = load('lib/youtube-claim.ts', { '@/lib/youtube-lock': locks, '@/lib/youtube-compliance': compliance });
function logic(db, fetch = async () => { throw Error('No provider allowed'); }) {
  const imports = { 'node:crypto': require('node:crypto'), '@/lib/db': { db }, '@/lib/youtube-lock': locks, '@/lib/youtube-compliance': compliance, '@/lib/creator-metrics': metrics, '@/lib/youtube-aggregates': aggregates, '@/lib/youtube-claim': claimLocks,
    '@/lib/youtube-auth': { youtubeFetch: fetch } };
  const auth = load('lib/youtube-auth.ts', { '@/lib/db': { db }, 'node:crypto': require('node:crypto') });
  imports['@/lib/youtube-auth'] = { ...auth, youtubeFetch: fetch };
  const removal = load('lib/youtube-removal.ts', imports);
  const token = load('lib/youtube-token.ts', { ...imports, '@/lib/youtube-removal': removal });
  return { removal, token, sync: load('lib/youtube-sync.ts', { ...imports, '@/lib/youtube-token': token }),
    claim: load('lib/youtube-claim.ts', imports), revoke: load('lib/youtube-revoke.ts', { ...imports, '@/lib/youtube-token': token }) };
}
const ids = [];
async function fixture() {
  const id = randomUUID(); ids.push(id);
  await clients[0].user.create({ data: { id, email: `${id}@test.invalid`, creatorProfile: { create: {} } } });
  await logic(clients[0]).token.saveYouTubeAccessToken(id, { accessToken: 'fake', refreshToken: 'fake-refresh', platformUserId: 'CHANNEL', username: null, expiresAt: null, scopes: null });
  return id;
}
function barrier(deadAuth = false) {
  let release, arrived;
  const wait = new Promise(r => release = r), entered = new Promise(r => arrived = r);
  return { entered, release, fetch: async url => {
    if (String(url).includes('oauth2.googleapis.com/token')) return response({ error: 'invalid_grant' }, 400);
    if (new URL(url).pathname.endsWith('/channels')) { arrived(); await wait; if (deadAuth) return { ok: false, status: 401, json: async () => ({ error: { errors: [{ reason: 'authError' }] } }) }; return { ok: true, json: async () => ({ items: [{ id: 'CHANNEL', snippet: {}, statistics: { subscriberCount: '7', videoCount: '0' }, contentDetails: { relatedPlaylists: { uploads: 'UPLOADS' } } }] }) }; }
    return { ok: true, json: async () => ({ items: [] }) };
  } };
}
async function pendingSync(id, deadAuth = false) {
  const b = barrier(deadAuth);
  const credential = await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } });
  const pending = logic(clients[0], b.fetch).sync.syncYouTubeOfficialData(id, { credential });
  await b.entered;
  return { ...b, pending, credential };
}
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
before(async () => {
  execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: target, DOTENV_CONFIG_QUIET: 'true' }, stdio: 'pipe', timeout: 60000 });
  const [version] = await clients[0].$queryRaw`SELECT version() AS version`;
  console.log(`Disposable test database: ${version.version}`);
});
after(async () => {
  try {
    await clients[0].user.deleteMany({ where: { id: { in: ids } } });
    await clients[0].verification.deleteMany({ where: { id: { in: ids.map(id => `youtube-revoke:${createHash('sha256').update(id).digest('hex')}`) } } });
  }
  finally { await Promise.all(clients.map(c => c.$disconnect())); await Promise.all(pools.map(p => p.end())); }
});
const opts = { timeout: 30000 };
test('A old sync vs reconnect', opts, async () => {
  const id = await fixture(), p = await pendingSync(id);
  await logic(clients[1]).token.saveYouTubeAccessToken(id, { ...p.credential, accessToken: 'replacement', expiresAt: null, scopes: null, username: null });
  p.release(); assert.equal((await p.pending).reason, 'superseded');
});
test('B same credential reverse completion', opts, async () => {
  const id = await fixture(), a = await pendingSync(id), b = await pendingSync(id);
  b.release(); assert.equal((await b.pending).ok, true);
  a.release(); assert.equal((await a.pending).reason, 'superseded');
});
test('C stale dead auth vs reconnect', opts, async () => {
  const id = await fixture(), p = await pendingSync(id, true);
  await logic(clients[1]).token.saveYouTubeAccessToken(id, { ...p.credential, accessToken: 'replacement', expiresAt: null, scopes: null, username: null });
  p.release(); assert.equal((await p.pending).reason, 'superseded');
  assert.equal((await clients[1].youTubeComplianceState.findUnique({ where: { userId: id } })).status, 'ACTIVE');
});
test('D local disconnect vs sync prevents resurrection', opts, async () => {
  const id = await fixture(), p = await pendingSync(id);
  const other = logic(clients[1], async () => ({ status: 200 }));
  assert.equal((await actions(clients[1], { id, role: 'CREATOR' }, other).disconnect.disconnectYouTubeAction()).ok, true);
  p.release(); assert.equal((await p.pending).reason, 'superseded');
});
test('E owner deletion vs sync', opts, async () => {
  const id = await fixture(), p = await pendingSync(id);
  const other = logic(clients[1], async () => ({ status: 200 }));
  assert.equal((await actions(clients[1], { id, role: 'CREATOR' }, other).account.deleteAccount()).success, true);
  p.release(); assert.equal((await p.pending).ok, false);
  assert.equal(await clients[0].youTubeComplianceState.count({ where: { userId: id } }), 0);
  await assert.rejects(logic(clients[1]).token.saveYouTubeAccessToken(id, { ...p.credential, expiresAt: null, username: null, scopes: null }), /owner_missing/);
});
test('F RapidAPI provider starts before purge; authoritative transaction blocks', opts, async () => {
  const id = await fixture();
  // Remove official token so lower-source provenance gate alone would allow the write.
  await clients[0].platformToken.deleteMany({ where: { userId: id } });
  let arrived, release;
  const entered = new Promise(r => arrived = r), gate = new Promise(r => release = r);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/actions/stats.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => ({ '@/lib/db': { db: clients[0] }, '@/lib/youtube-lock': locks, '@/lib/youtube-compliance': compliance,
      '@/lib/creator-metrics': metrics, '@/lib/youtube-aggregates': aggregates, '@/lib/youtube-claim': claimLocks, '@/lib/platform-stats-policy': load('lib/platform-stats-policy.ts'),
      '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id } }) } } }, 'next/headers': { headers: async () => ({}) } })[name],
      fetch: async () => { arrived(); await gate; return { ok: true, json: async () => ({ stats: { subscribers: 99 } }) }; },
      process: { env: { RAPIDAPI_KEY: 'fake' } }, Date, URL });
  const pending = exports.fetchCreatorStatsAction('youtube', 'channel'); await entered;
  await logic(clients[1]).removal.removeYouTubeLocalData(id); release();
  assert.equal((await pending).data, null); assert.equal(await clients[0].platformStats.count({ where: { userId: id } }), 0);
});
test('G lease-only stolen worker cannot purge unchanged credential/generation/revision', opts, async () => {
  const id = await fixture();
  await clients[0].youTubeComplianceState.update({ where: { userId: id }, data: { leaseId: 'old-worker', leaseExpiresAt: new Date(Date.now() + 60000) } });
  const before = await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } });
  const credential = await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } });
  await clients[1].$transaction(async tx => { await locks.lockYouTubeOwner(tx, id); await tx.youTubeComplianceState.update({ where: { userId: id }, data: { leaseId: 'new-worker' } }); });
  const result = await logic(clients[0]).token.clearYouTubeDeadAuth(id, credential,
    { connectionGeneration: before.connectionGeneration, revision: before.revision, lease: { id: 'old-worker' } });
  assert.equal(result.reason, 'superseded');
  const current = await clients[1].youTubeComplianceState.findUnique({ where: { userId: id } });
  assert.equal(current.status, 'ACTIVE'); assert.equal(current.revision, before.revision); assert.equal(current.connectionGeneration, before.connectionGeneration);
  assert.equal(await clients[0].platformToken.count({ where: { userId: id } }), 1);
});
test('H injected purge failure rolls back data and lifecycle', opts, async () => {
  const id = await fixture();
  await clients[0].platformStats.create({ data: { userId: id, platform: 'youtube', followerCount: 8 } });
  await assert.rejects(logic(clients[1]).removal.removeYouTubeLocalData(id, undefined, async () => { throw Error('injected'); }));
  assert.equal(await clients[0].platformStats.count({ where: { userId: id } }), 1);
  assert.equal(await clients[0].platformToken.count({ where: { userId: id } }), 1);
  assert.equal((await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } })).status, 'ACTIVE');
});
test('I claim cannot bypass PURGED ownership block', opts, async () => {
  const source = await fixture(), destination = await fixture();
  await logic(clients[0]).removal.removeYouTubeLocalData(source);
  await assert.rejects(clients[1].$transaction(tx => logic(clients[1]).claim.guardYouTubeClaim(tx, source, destination)), /MANUAL_REVIEW/);
  assert.equal((await clients[0].youTubeComplianceState.findUnique({ where: { userId: source } })).status, 'PURGED');
});

function gate() {
  let resolve, entered;
  const ready = new Promise(r => entered = r), released = new Promise(r => resolve = r);
  return { ready, release: resolve, enter: entered, wait: () => released };
}
async function bounded(promise, label = 'barrier') {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label} timed out`)), 8000); })]); }
  finally { clearTimeout(timer); }
}
function instrument(db, hooks = {}) {
  let claimReads = 0, ownerLocks = 0;
  return new Proxy(db, { get(target, property) {
    if (property !== '$transaction') return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
    return (run, options) => target.$transaction(async tx => {
      return run(new Proxy(tx, { get(current, key) {
        if (key === 'profileClaim') return new Proxy(current.profileClaim, { get(delegate, method) {
          if (method !== 'findUnique') return typeof delegate[method] === 'function' ? delegate[method].bind(delegate) : delegate[method];
          return async args => { const value = await delegate.findUnique(args); if (++claimReads === 1 && hooks.afterClaimSnapshot) await hooks.afterClaimSnapshot(); return value; };
        } });
        if (key === '$queryRaw') return async (sql, ...params) => {
          const query = sql.join('');
          if (query.includes('FROM "User"') && query.includes('FOR UPDATE') && ++ownerLocks === 1 && hooks.beforeOwnerLock) await hooks.beforeOwnerLock();
          if (query.includes('FROM "ProfileClaim"') && query.includes('FOR UPDATE') && hooks.beforeClaimLock) await hooks.beforeClaimLock();
          return current.$queryRaw(sql, ...params);
        };
        return typeof current[key] === 'function' ? current[key].bind(current) : current[key];
      } }));
    }, options);
  } });
}
async function user({ profile = true, imported = false, admin = false } = {}) {
  const id = randomUUID(); ids.push(id);
  await clients[0].user.create({ data: { id, email: `${id}@test.invalid`, role: admin ? 'ADMIN' : 'CREATOR',
    emailVerified: !imported, isImported: imported,
    ...(profile ? { creatorProfile: { create: { profileOrigin: imported ? 'IMPORTED' : 'REGISTERED', claimStatus: imported ? 'UNCLAIMED' : 'NOT_APPLICABLE' } } } : {}) } });
  return { id, role: admin ? 'ADMIN' : 'CREATOR' };
}
async function claimFixture(merge = false) {
  const source = await user({ imported: true }), requester = await user({ profile: merge }), admin = await user({ profile: false, admin: true });
  const profile = await clients[0].creatorProfile.update({ where: { userId: source.id }, data: { claimStatus: 'CLAIM_PENDING' } });
  const claim = await clients[0].profileClaim.create({ data: { creatorProfileId: profile.id, requesterUserId: requester.id, requiresMerge: merge } });
  return { source, requester, admin, profile, claim };
}
function actions(db, session, modules = logic(db), options = {}) {
  const socialLinks = load('lib/social-links.ts');
  const importUtils = load('lib/import-utils.ts', { '@/lib/social-links': socialLinks });
  const roles = load('lib/roles.ts', { '@/lib/generated/prisma': require('../lib/generated/prisma') });
  const imports = { '@/lib/db': { db }, '@/lib/generated/prisma': require('../lib/generated/prisma'),
    '@/lib/auth': { auth: { api: { getSession: async () => ({ user: session }), signOut: async () => {} } } },
    '@/lib/youtube-lock': locks, '@/lib/youtube-compliance': compliance, '@/lib/youtube-claim': claimLocks,
    '@/lib/youtube-revoke': modules.revoke, '@/lib/youtube-removal': modules.removal,
    '@/lib/tiktok-revoke': { revokeTikTokAuthorization: async () => { if (options.afterPreparation) await options.afterPreparation(); return 'not_connected'; } },
    '@/lib/roles': roles, '@/lib/import-utils': importUtils, '@/lib/social-links': socialLinks,
    '@/lib/email': new Proxy({}, { get: () => async () => {} }), '@/lib/rate-limit': { rateLimit: async () => true },
    '@/lib/creator-metrics': metrics, '@/lib/creator-approval': load('lib/creator-approval.ts'),
    '@/lib/content-curation': load('lib/content-curation.ts'),
    'next/headers': { headers: async () => ({}) }, 'next/cache': { revalidatePath() {} } };
  const errors = [];
  const globals = { console: { error(...args) { errors.push(args.map(String).join(' ')); } } };
  return { claim: load('app/actions/claim.ts', imports, globals), account: load('app/actions/account.ts', imports, globals),
    admin: load('app/admin/actions.ts', imports, globals), disconnect: load('app/actions/youtube-disconnect.ts', imports, globals),
    profile: load('app/actions/profile.ts', imports, globals), discover: load('app/actions/discover.ts', imports, globals), errors };
}

test('J actual Scenario A approval cannot overwrite rejection committed after its snapshot', opts, async () => {
  const f = await claimFixture(), b = gate();
  const db = instrument(clients[0], { afterClaimSnapshot: async () => { b.enter(); await bounded(b.wait()); } });
  const approval = actions(db, f.admin).claim.approveProfileClaimAction(f.claim.id);
  await bounded(b.ready);
  assert.equal((await actions(clients[1], f.admin).claim.rejectProfileClaimAction(f.claim.id, 'reviewed')).success, true);
  b.release(); const result = await approval;
  assert.equal(result.success, false); assert.match(result.error, /no longer pending/);
  const current = await clients[1].profileClaim.findUnique({ where: { id: f.claim.id } });
  assert.equal(current.status, 'REJECTED');
  assert.equal((await clients[1].creatorProfile.findUnique({ where: { id: f.profile.id } })).userId, f.source.id);
});
test('K actual Scenario B merge holds owner/profile locks before concurrent rejection', opts, async () => {
  const f = await claimFixture(true), held = gate(), attempted = gate();
  const mergeDb = instrument(clients[0], { beforeClaimLock: async () => { held.enter(); await bounded(held.wait()); } });
  const merging = actions(mergeDb, f.admin).claim.mergeAndApproveClaimAction(f.claim.id);
  await bounded(held.ready);
  const rejectingDb = instrument(clients[1], { beforeOwnerLock: async () => attempted.enter() });
  const rejection = actions(rejectingDb, f.admin).claim.rejectProfileClaimAction(f.claim.id);
  await bounded(attempted.ready); held.release();
  const [merged, rejected] = await Promise.all([merging, rejection]);
  assert.equal(merged.success, true, JSON.stringify(merged));
  assert.equal(rejected.success, false); assert.match(rejected.error, /no longer pending/);
  assert.equal((await clients[0].creatorProfile.findUnique({ where: { id: f.profile.id } })).userId, f.requester.id);
  assert.equal((await clients[0].profileClaim.findUnique({ where: { id: f.claim.id } })).status, 'APPROVED');
});
test('L actual submission vs approval graph never holds profile before requester owner', opts, async () => {
  const source = await user({ imported: true }), first = await user({ profile: false }), second = await user({ profile: false }), admin = await user({ profile: false, admin: true });
  const profile = await clients[0].creatorProfile.findUnique({ where: { userId: source.id } });
  const b = gate();
  const firstDb = instrument(clients[0], { beforeOwnerLock: async () => { b.enter(); await bounded(b.wait()); } });
  const submission = actions(firstDb, first).claim.requestProfileClaimAction(profile.id);
  await bounded(b.ready);
  assert.equal((await actions(clients[1], second).claim.requestProfileClaimAction(profile.id)).success, true);
  const claim = await clients[1].profileClaim.findFirst({ where: { creatorProfileId: profile.id, status: 'PENDING' } });
  assert.equal((await actions(clients[1], admin).claim.approveProfileClaimAction(claim.id)).success, true);
  b.release(); assert.equal((await submission).success, false);
  assert.equal((await clients[0].creatorProfile.findUnique({ where: { id: profile.id } })).userId, second.id);
  assert.equal(await clients[0].profileClaim.count({ where: { creatorProfileId: profile.id, status: 'PENDING' } }), 0);
});
for (const mode of ['account', 'admin']) test(`M actual ${mode} deletion preparation rejects a reconnect before final cascade and fences old sync`, opts, async () => {
  const id = await fixture(), sync = await pendingSync(id), admin = await user({ profile: false, admin: true }), b = gate();
  const modules = logic(clients[0], async () => ({ status: 200 }));
  const action = actions(clients[0], mode === 'account' ? { id, role: 'CREATOR' } : admin, modules,
    { afterPreparation: async () => { b.enter(); await bounded(b.wait()); } });
  const deleting = mode === 'account' ? action.account.deleteAccount() : action.admin.deleteUser(id);
  await bounded(b.ready);
  await logic(clients[1]).token.saveYouTubeAccessToken(id, { ...sync.credential, accessToken: 'new-official', scopes: null, expiresAt: null, username: null });
  b.release(); const result = await deleting; assert.equal(result.success, false);
  assert.ok(await clients[0].user.findUnique({ where: { id } }));
  assert.equal((await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } })).accessToken, 'new-official');
  assert.equal((await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } })).status, 'ACTIVE');
  sync.release(); assert.equal((await sync.pending).reason, 'superseded');
});
test('N actual access 401 refresh invalid_grant purges token/stats/posts/curation/marker atomically', opts, async () => {
  const id = await fixture(), profile = await clients[0].creatorProfile.findUnique({ where: { userId: id } });
  await clients[0].platformStats.create({ data: { userId: id, platform: 'youtube', followerCount: 8, dataSource: 'OFFICIAL_API' } });
  await clients[0].socialPost.create({ data: { creatorProfileId: profile.id, platform: 'youtube', providerPostId: 'v', dataSource: 'OFFICIAL_API' } });
  await clients[0].creatorContentCuration.create({ data: { creatorProfileId: profile.id, platform: 'youtube', providerPostId: 'v' } });
  const credential = await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } });
  const entry = logic(clients[1], async url => String(url).includes('/token') ? response({ error: 'invalid_grant' }, 400) : response({ error: { errors: [{ reason: 'authError' }] } }, 401));
  assert.equal((await entry.sync.syncYouTubeOfficialData(id, { credential })).reason, 'reauth_required');
  for (const model of ['platformToken', 'platformStats']) assert.equal(await clients[0][model].count({ where: { userId: id } }), 0);
  for (const model of ['socialPost', 'creatorContentCuration']) assert.equal(await clients[0][model].count({ where: { creatorProfileId: profile.id } }), 0);
  assert.equal((await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } })).status, 'PURGED');
  assert.deepEqual((await clients[0].creatorProfile.findUnique({ where: { id: profile.id } })).connectedPlatforms, []);
});
test('O injected failure in actual 401-invalid_grant cleanup rolls back every purge row', opts, async () => {
  const id = await fixture(), profile = await clients[0].creatorProfile.findUnique({ where: { userId: id } });
  await clients[0].platformStats.create({ data: { userId: id, platform: 'youtube', followerCount: 8 } });
  await clients[0].socialPost.create({ data: { creatorProfileId: profile.id, platform: 'youtube', providerPostId: 'v' } });
  await clients[0].creatorContentCuration.create({ data: { creatorProfileId: profile.id, platform: 'youtube', providerPostId: 'v' } });
  const before = await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } });
  // Transaction proxy injects failure AFTER the real marker write, proving the
  // complete production cleanup and marker commit/rollback together.
  const failing = new Proxy(clients[1], { get(db, key) {
    if (key !== '$transaction') return typeof db[key] === 'function' ? db[key].bind(db) : db[key];
    return (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(real, model) {
      if (model === 'youTubeComplianceState') return new Proxy(real[model], { get(delegate, method) {
        if (method === 'upsert') return async args => { await delegate.upsert(args); throw Error('injected-after-marker'); };
        return typeof delegate[method] === 'function' ? delegate[method].bind(delegate) : delegate[method];
      } });
      return typeof real[model] === 'function' ? real[model].bind(real) : real[model];
    } })), options);
  } });
  const credential = await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } });
  const entry = logic(failing, async url => String(url).includes('/token') ? response({ error: 'invalid_grant' }, 400) : response({ error: { errors: [{ reason: 'authError' }] } }, 401));
  assert.equal((await entry.sync.syncYouTubeOfficialData(id, { credential })).reason, 'temporary_failure');
  for (const model of ['platformToken', 'platformStats']) assert.equal(await clients[0][model].count({ where: { userId: id } }), 1);
  for (const model of ['socialPost', 'creatorContentCuration']) assert.equal(await clients[0][model].count({ where: { creatorProfileId: profile.id } }), 1);
  assert.deepEqual(await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } }), before);
  assert.deepEqual((await clients[0].creatorProfile.findUnique({ where: { id: profile.id } })).connectedPlatforms, ['youtube']);
});
test('P actual admin edit allows identity but refuses blocked aggregate resurrection; readers preserve independent import data', opts, async () => {
  const creator = await user({ imported: true }), admin = await user({ profile: false, admin: true });
  const profile = await clients[0].creatorProfile.update({ where: { userId: creator.id }, data: { totalFollowers: 700, followerCount: 700,
    avgEngagementRate: 3, averageEngagement: 3, lastSyncedAt: new Date('2025-01-01'), primaryPlatform: 'youtube' } });
  await logic(clients[0]).removal.removeYouTubeLocalData(creator.id);
  const persisted = await clients[1].creatorProfile.findUnique({ where: { id: profile.id } });
  assert.equal(persisted.totalFollowers, 700); assert.equal(persisted.followerCount, 700); assert.equal(persisted.averageEngagement, 3);
  const action = actions(clients[1], admin);
  assert.equal((await action.admin.updateImportedCreatorAction(profile.id, { bio: 'edited identity' })).success, true);
  const blocked = await action.admin.updateImportedCreatorAction(profile.id, { totalFollowers: 999999, bio: 'should roll back' });
  assert.equal(blocked.success, false); assert.match(blocked.error, /Aggregate metrics/);
  const publicProfile = await action.profile.getProfileAction(creator.id);
  assert.ok(publicProfile); assert.equal(publicProfile.total_followers, 700); assert.equal(publicProfile.platformStats.some(s => s.platform === 'youtube'), false);
  const discovery = (await action.discover.getCreatorsAction()).find(row => row.id === creator.id);
  assert.equal(discovery.total_followers, 700); assert.equal(discovery.platforms.youtube, undefined);
  assert.equal((await clients[1].creatorProfile.findUnique({ where: { id: profile.id } })).bio, 'edited identity');
});
test('Q real access 401 refresh success retries safely and retains live generation', opts, async () => {
  const id = await fixture(); let channels = 0, refreshes = 0;
  const credential = await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } });
  const generation = (await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } })).connectionGeneration;
  const entry = logic(clients[1], async (url, init) => {
    if (String(url).endsWith('/token')) { refreshes++; return response({ access_token: 'refreshed', expires_in: 3600, token_type: 'Bearer' }); }
    if (new URL(url).pathname.endsWith('/channels')) {
      if (++channels === 1) return response({ error: { errors: [{ reason: 'authError' }] } }, 401);
      assert.equal(init.headers.Authorization, 'Bearer refreshed');
      return response({ items: [{ id: 'CHANNEL', snippet: {}, statistics: { subscriberCount: '7', videoCount: '0' }, contentDetails: { relatedPlaylists: { uploads: 'UPLOADS' } } }] });
    }
    return response({ items: [] });
  });
  assert.equal((await entry.sync.syncYouTubeOfficialData(id, { credential })).ok, true);
  const current = await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } });
  assert.equal(current.status, 'ACTIVE'); assert.equal(current.connectionGeneration, generation);
  assert.equal(current.removalReason, null); assert.equal(refreshes, 1); assert.equal(channels, 2);
  assert.equal((await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } })).accessToken, 'refreshed');
});
test('R real access 401 temporary refresh failure preserves stored credential and dataset', opts, async () => {
  const id = await fixture();
  await clients[0].platformStats.create({ data: { userId: id, platform: 'youtube', followerCount: 8 } });
  const credential = await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } });
  const before = await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } });
  const entry = logic(clients[1], async url => String(url).endsWith('/token') ? response({ error: 'invalid_grant' }, 503) : response({ error: { errors: [{ reason: 'authError' }] } }, 401));
  assert.equal((await entry.sync.syncYouTubeOfficialData(id, { credential })).reason, 'temporary_failure');
  assert.deepEqual(await clients[0].youTubeComplianceState.findUnique({ where: { userId: id } }), before);
  assert.deepEqual(await clients[0].platformToken.findUnique({ where: { userId_platform: { userId: id, platform: 'youtube' } } }), credential);
  assert.equal(await clients[0].platformStats.count({ where: { userId: id } }), 1);
});
test('S actual Scenario B observes rejection committed after its pre-lock snapshot', opts, async () => {
  const f = await claimFixture(true), b = gate();
  const db = instrument(clients[0], { afterClaimSnapshot: async () => { b.enter(); await bounded(b.wait()); } });
  const merging = actions(db, f.admin).claim.mergeAndApproveClaimAction(f.claim.id);
  await bounded(b.ready);
  assert.equal((await actions(clients[1], f.admin).claim.rejectProfileClaimAction(f.claim.id)).success, true);
  b.release(); const result = await merging;
  assert.equal(result.success, false); assert.equal(result.errorCode, 'CLAIM_NOT_PENDING');
  assert.equal((await clients[0].creatorProfile.findUnique({ where: { id: f.profile.id } })).userId, f.source.id);
  assert.ok(await clients[0].creatorProfile.findUnique({ where: { userId: f.requester.id } }));
});

async function observeLockWait(pid) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await clients[1].$queryRaw`SELECT "wait_event_type" FROM pg_stat_activity WHERE pid = ${pid}`;
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Expected a real PostgreSQL lock wait');
}

test('T actual Scenario A waits on TikTok cleanup owner before any token/profile lock; no deadlock or partial movement', opts, async () => {
  const f = await claimFixture(), heldToken = gate(), claimAttemptedOwner = gate();
  const instagram = await clients[0].platformToken.create({ data: { userId: f.source.id, platform: 'instagram', accessToken: 'fake-instagram' } });
  await clients[0].platformToken.create({ data: { userId: f.source.id, platform: 'tiktok', accessToken: 'fake-expired', refreshToken: null, expiresAt: new Date(0) } });
  await clients[0].creatorProfile.update({ where: { id: f.profile.id }, data: { connectedPlatforms: ['instagram', 'tiktok'] } });
  let providerPaused = false, claimPid, claimReachedToken = false, claimReachedProfile = false;
  const providerDb = new Proxy(clients[1], { get(db, key) {
    if (key !== '$transaction') return typeof db[key] === 'function' ? db[key].bind(db) : db[key];
    return (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(real, property) {
      if (property === '$queryRaw') return async (sql, ...params) => {
        const rows = await real.$queryRaw(sql, ...params);
        if (!providerPaused && sql.join('').includes('FROM "PlatformToken"')) {
          providerPaused = true; heldToken.enter(); await bounded(heldToken.wait());
        }
        return rows;
      };
      return typeof real[property] === 'function' ? real[property].bind(real) : real[property];
    } })), options);
  } });
  const tiktok = load('lib/tiktok-token.ts', { '@/lib/db': { db: providerDb }, '@/lib/youtube-lock': locks }, {
    process: { env: { NEXT_PUBLIC_TIKTOK_CLIENT_KEY: 'fake-test-client', TIKTOK_CLIENT_SECRET: 'fake-test-secret' } },
    fetch: async () => { throw Error('No live provider HTTP is permitted'); },
  });
  const cleaning = tiktok.getTikTokAccessToken(f.source.id);
  const claimDb = new Proxy(clients[0], { get(db, key) {
    if (key !== '$transaction') return typeof db[key] === 'function' ? db[key].bind(db) : db[key];
    return (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(real, property) {
      if (property === '$queryRaw') return async (sql, ...params) => {
        const query = sql.join('');
        if (query.includes('FROM "User"') && params[0] === f.source.id && !claimPid) {
          [ { pid: claimPid } ] = await real.$queryRaw`SELECT pg_backend_pid() AS pid`;
          claimAttemptedOwner.enter();
        }
        if (query.includes('FROM "PlatformToken"')) claimReachedToken = true;
        if (query.includes('FROM "CreatorProfile"') && query.includes('FOR UPDATE')) claimReachedProfile = true;
        return real.$queryRaw(sql, ...params);
      };
      return typeof real[property] === 'function' ? real[property].bind(real) : real[property];
    } })), options);
  } });
  let approving;
  try {
    await bounded(heldToken.ready);
    approving = actions(claimDb, f.admin).claim.approveProfileClaimAction(f.claim.id);
    await bounded(claimAttemptedOwner.ready);
    await observeLockWait(claimPid);
    assert.equal(claimReachedToken, false, 'claim must wait on the shared owner before any token');
    assert.equal(claimReachedProfile, false, 'claim must wait on the shared owner before any profile');
    // An independent real connection can still lock the profile while the claim
    // waits for TikTok's User lock: the previous profile/token cycle cannot form.
    await clients[1].$transaction(tx => tx.$queryRaw`SELECT "id" FROM "CreatorProfile" WHERE "id" = ${f.profile.id} FOR UPDATE NOWAIT`);
  } finally { heldToken.release(); }
  const [provider, approved] = await Promise.all([cleaning, approving]);
  assert.equal(provider.reason, 'reauth_required', JSON.stringify(provider));
  assert.equal(approved.success, true, JSON.stringify(approved));
  const profile = await clients[0].creatorProfile.findUnique({ where: { id: f.profile.id } });
  assert.equal(profile.userId, f.requester.id); assert.equal(profile.claimStatus, 'CLAIMED');
  assert.deepEqual(profile.connectedPlatforms, ['instagram']);
  assert.equal(await clients[0].platformToken.count({ where: { userId: { in: [f.source.id, f.requester.id] }, platform: 'tiktok' } }), 0);
  assert.equal((await clients[0].platformToken.findUnique({ where: { id: instagram.id } })).userId, f.requester.id);
  assert.equal(await clients[0].platformToken.count({ where: { userId: f.source.id } }), 0);
});

test('U all provider tokens on both claim owners are locked in user/platform/id order before profiles', opts, async () => {
  const source = await user(), destination = await user();
  const platforms = ['threads', 'tiktok', 'instagram', 'youtube', 'facebook', 'custom-provider'];
  for (const owner of [destination.id, source.id]) {
    for (const platform of platforms) await clients[0].platformToken.create({ data: { userId: owner, platform, accessToken: `fake-${platform}` } });
  }
  const expected = await clients[0].platformToken.findMany({ where: { userId: { in: [source.id, destination.id] } }, orderBy: [{ userId: 'asc' }, { platform: 'asc' }, { id: 'asc' }] });
  const seen = [], events = [], held = gate();
  const coordinated = clients[0].$transaction(async tx => {
    const observing = new Proxy(tx, { get(real, key) {
      if (key === '$queryRaw') return async (sql, ...params) => {
        const query = sql.join('');
        if (query.includes('FROM "CreatorProfile"')) events.push('profile');
        const rows = await real.$queryRaw(sql, ...params);
        if (query.includes('FROM "PlatformToken"')) { events.push('tokens'); seen.push(...rows.map(row => row.id)); }
        return rows;
      };
      return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
    } });
    await claimLocks.lockClaimOwners(observing, [destination.id, source.id, destination.id]);
    held.enter(); await bounded(held.wait());
  }, { timeout: 15000 });
  try {
    await bounded(held.ready);
    assert.deepEqual(seen, expected.map(row => row.id));
    assert.deepEqual(events, ['tokens', 'tokens', 'profile', 'profile']);
    // Verify actual row-lock coverage, not merely sorted query output. Every
    // provider row must reject a NOWAIT lock from the independent pool.
    for (const token of expected) {
      await assert.rejects(clients[1].$transaction(tx => tx.$queryRaw`SELECT "id" FROM "PlatformToken" WHERE "id" = ${token.id} FOR UPDATE NOWAIT`),
        error => /Raw query failed\. Code: `55P03`/.test(error.message) && /relation \"PlatformToken\"/.test(error.message));
    }
  } finally { held.release(); }
  await coordinated;
});

test('V exact TikTok sync stats-FK/claim reproduction waits on User before token and commits complete dataset without deadlock', opts, async () => {
  const source = await user(), destination = await user();
  const profile = await clients[0].creatorProfile.findUnique({ where: { userId: source.id } });
  const token = await clients[0].platformToken.create({ data: { userId: source.id, platform: 'tiktok', accessToken: 'fake-live',
    username: 'old-handle', platformUserId: 'TEST_OPEN_ID', scopes: 'user.info.basic,user.info.profile,user.info.stats,video.list' } });
  await clients[0].socialPost.create({ data: { creatorProfileId: profile.id, platform: 'tiktok', providerPostId: 'old-video' } });
  assert.equal(await clients[0].platformStats.count({ where: { userId: source.id, platform: 'tiktok' } }), 0);
  const ownerHeld = gate(), syncAttemptedOwner = gate();
  const events = [], transactionErrors = [];
  let syncPid, tokenTouched = false;
  const claiming = clients[0].$transaction(async tx => {
    await claimLocks.lockClaimOwners(new Proxy(tx, { get(real, key) {
      if (key === '$queryRaw') return async (sql, ...params) => {
        if (sql.join('').includes('FROM "PlatformToken"') && params[0] === source.id) {
          ownerHeld.enter(); await bounded(ownerHeld.wait());
        }
        return real.$queryRaw(sql, ...params);
      };
      return typeof real[key] === 'function' ? real[key].bind(real) : real[key];
    } }), [source.id, destination.id]);
  }, { timeout: 15000 });
  const syncDb = new Proxy(clients[1], { get(db, key) {
    if (key !== '$transaction') return typeof db[key] === 'function' ? db[key].bind(db) : db[key];
    return (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(real, property) {
      if (property === '$queryRaw') return async (sql, ...params) => {
        const query = sql.join('');
        if (query.includes('FROM "User"')) {
          [{ pid: syncPid }] = await real.$queryRaw`SELECT pg_backend_pid() AS pid`;
          syncAttemptedOwner.enter();
          const rows = await real.$queryRaw(sql, ...params); events.push('owner'); return rows;
        }
        if (query.includes('FROM "PlatformToken"')) { tokenTouched = true; events.push('token'); }
        if (query.includes('FROM "CreatorProfile"')) events.push('profile');
        return real.$queryRaw(sql, ...params);
      };
      if (property === 'platformToken' || property === 'platformStats') return new Proxy(real[property], { get(delegate, method) {
        if (property === 'platformToken' && method === 'update') return async args => { tokenTouched = true; events.push('token-update'); return delegate.update(args); };
        if (property === 'platformStats' && method === 'upsert') return async args => {
          // Fallback captures the old implementation's actual FK wait too, so
          // reverting owner-first code fails this exact reproduction.
          if (!syncPid) { [{ pid: syncPid }] = await real.$queryRaw`SELECT pg_backend_pid() AS pid`; syncAttemptedOwner.enter(); }
          events.push('stats-upsert'); return delegate.upsert(args);
        };
        return typeof delegate[method] === 'function' ? delegate[method].bind(delegate) : delegate[method];
      } });
      return typeof real[property] === 'function' ? real[property].bind(real) : real[property];
    } })), options).catch(error => { transactionErrors.push(String(error)); throw error; });
  } });
  const sync = load('lib/tiktok-sync.ts', { '@/lib/db': { db: syncDb }, '@/lib/youtube-lock': locks, '@/lib/creator-metrics': metrics,
    '@/lib/tiktok-token': { tiktokFetch: async (_id, url) => ({ ok: true, data: url.includes('/video/list/')
      ? { data: { videos: [{ id: 'fresh-video', create_time: 1700000000, title: 'fresh', like_count: 0, comment_count: 0, view_count: 12 }] } }
      : { data: { user: { open_id: 'TEST_OPEN_ID', username: 'fresh-handle', follower_count: 12, following_count: 0, video_count: 1 } } } }) } });
  let syncing;
  try {
    await bounded(ownerHeld.ready);
    syncing = sync.syncTikTokOfficialData(source.id);
    await bounded(syncAttemptedOwner.ready);
    await observeLockWait(syncPid);
    assert.equal(tokenTouched, false, 'TikTok must wait on User before locking/updating its token');
    assert.deepEqual(events, []);
    // The token is still available to an independent connection while the sync
    // waits for User. In the reported deadlock the sync already held this token.
    await clients[0].$transaction(tx => tx.$queryRaw`SELECT "id" FROM "PlatformToken" WHERE "id" = ${token.id} FOR UPDATE NOWAIT`);
  } finally { ownerHeld.release(); }
  const [synced] = await Promise.all([syncing, claiming]);
  assert.equal(synced.ok, true, JSON.stringify(synced));
  assert.deepEqual(transactionErrors, []);
  assert.deepEqual(events.slice(0, 5), ['owner', 'token', 'profile', 'token-update', 'stats-upsert']);
  const stats = await clients[0].platformStats.findUnique({ where: { userId_platform: { userId: source.id, platform: 'tiktok' } } });
  assert.equal(stats.followerCount, 12); assert.equal(stats.followingCount, 0); assert.equal(stats.postCount, 1);
  assert.equal(stats.dataSource, 'OFFICIAL_API'); assert.equal(stats.providerAccountId, 'TEST_OPEN_ID');
  const currentToken = await clients[0].platformToken.findUnique({ where: { id: token.id } });
  assert.equal(currentToken.userId, source.id); assert.equal(currentToken.username, 'fresh-handle');
  const currentProfile = await clients[0].creatorProfile.findUnique({ where: { id: profile.id } });
  assert.equal(currentProfile.userId, source.id); assert.equal(currentProfile.followerCount, 12); assert.deepEqual(currentProfile.connectedPlatforms, ['tiktok']);
  const posts = await clients[0].socialPost.findMany({ where: { creatorProfileId: profile.id, platform: 'tiktok' } });
  assert.equal(posts.length, 1); assert.equal(posts[0].providerPostId, 'fresh-video'); assert.equal(posts[0].likes, 0); assert.equal(posts[0].comments, 0); assert.equal(posts[0].views, 12);
  assert.equal(await clients[0].platformToken.count({ where: { userId: destination.id } }), 0);
  assert.equal(await clients[0].platformStats.count({ where: { userId: destination.id } }), 0);
});
