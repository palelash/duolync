const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../lib/generated/prisma');
const { assertDisposableYouTubeDatabase } = require('./youtube-postgres-target.cjs');
const { logic, load, response, renewalUI } = require('./threads-harness.cjs');
const target = assertDisposableYouTubeDatabase(process.env.TEST_DATABASE_URL,
  [process.env.DATABASE_URL, require('dotenv').parse(fs.readFileSync('.env')).DATABASE_URL]);
const pools = [0,1].map(() => new Pool({ connectionString: target, max: 4, statement_timeout: 10000 }));
const clients = pools.map(p => new PrismaClient({ adapter: new PrismaPg(p) }));
const apis = clients.map(c => logic(c));
const ids = [], authorities = [];
async function fixture(profile = true) {
  const id = randomUUID(), sid = randomUUID(); ids.push(id); authorities.push(apis[0].auth.threadsAuthorityId(id));
  const user = await clients[0].user.create({ data: { id, email: `${id}@test.invalid`,
    ...(profile ? { creatorProfile: { create: {} } } : {}), sessions: { create: { id: sid, token: randomUUID(), expiresAt: new Date(Date.now()+3600_000) } } }, include: { creatorProfile: true } });
  return { id, sid, pid: user.creatorProfile?.id };
}
async function start(f, api = apis[0], now) { return api.auth.createThreadsState(f.id, f.sid, now); }
async function consume(f, s, api = apis[0], now) { return api.auth.consumeThreadsState(s.cookie, s.state, f.id, f.sid, now); }
const data = (id = '123') => ({ accessToken: `fake-${id}`, expiresAt: new Date(Date.now()+5184000_000), platformUserId: id, username: 'tester' });
async function save(f, s, id = '123', api = apis[0]) { return api.connection.saveThreadsConnection(f.id, f.sid, s.state, data(id)); }
async function connected(f) { const s = await start(f); assert.equal(await consume(f,s),true); assert.equal(await save(f,s),true); return s; }
after(async () => {
  try { await clients[0].user.deleteMany({ where: { id: { in: ids } } }); await clients[0].verification.deleteMany({ where: { identifier: { in: authorities } } }); }
  finally { await Promise.all(clients.map(c => c.$disconnect())); await Promise.all(pools.map(p => p.end())); }
});
const opts = { timeout: 20000 };
test('PG strong state, one-time consumption and replay across workers', opts, async () => {
  const f = await fixture(), s = await start(f);
  assert.match(s.state, /^[A-Za-z0-9_-]{43}$/);
  const results = await Promise.all([consume(f,s), consume(f,s,apis[1])]);
  assert.deepEqual(results.sort(), [false,true]); assert.equal(await consume(f,s),false);
});
test('PG state expiry', opts, async () => {
  const f = await fixture(), now = Date.now(), s = await start(f,apis[0],now);
  assert.equal(await consume(f,s,apis[1],now+300_001),false);
});
test('PG wrong user and changed session do not consume legitimate state', opts, async () => {
  const f = await fixture(), other = await fixture(), s = await start(f);
  assert.equal(await apis[0].auth.consumeThreadsState(s.cookie,s.state,other.id,other.sid),false);
  assert.equal(await apis[0].auth.consumeThreadsState(s.cookie,s.state,f.id,other.sid),false);
  assert.equal(await apis[0].auth.consumeThreadsState(s.cookie,s.state,undefined,undefined),false);
  assert.equal(await consume(f,s),true);
});
test('PG signed cookie tampering rejected', opts, async () => {
  const f = await fixture(), s = await start(f);
  assert.equal(await apis[0].auth.consumeThreadsState(s.cookie+'x',s.state,f.id,f.sid),false);
  assert.equal(await consume(f,s),true);
});
test('PG reconnect A consumed before B starts; B wins reverse completion', opts, async () => {
  const f = await fixture(), a = await start(f); assert.equal(await consume(f,a),true);
  const b = await start(f,apis[1]); assert.equal(await consume(f,b,apis[1]),true);
  assert.equal(await save(f,b,'456',apis[1]),true); assert.equal(await save(f,a,'123'),false);
  const t = await clients[0].platformToken.findUnique({ where: { userId_platform: { userId:f.id,platform:'threads' } } });
  const s = await clients[0].platformStats.findUnique({ where: { userId_platform: { userId:f.id,platform:'threads' } } });
  assert.equal(t.platformUserId,'456'); assert.equal(s.providerAccountId,'456');
});
test('PG later start invalidates unconsumed earlier state', opts, async () => {
  const f = await fixture(), a = await start(f), b = await start(f,apis[1]);
  assert.equal(await consume(f,a),false); assert.equal(await consume(f,b),true);
});
test('PG disconnect wins over consumed in-flight callback', opts, async () => {
  const f = await fixture(), a = await start(f); await consume(f,a);
  await apis[1].connection.disconnectThreads(f.id); assert.equal(await save(f,a),false);
  assert.equal(await clients[0].platformToken.count({ where: { userId:f.id } }),0);
});
test('PG identity switch removes stale posts/curation and resets lower-source metrics without relabeling', opts, async () => {
  const f = await fixture(); await connected(f);
  await clients[0].platformStats.update({ where: { userId_platform: { userId:f.id,platform:'threads' } },
    data: { dataSource:'APIFY',followerCount:99,followingCount:7,postCount:5,engagementRate:9 } });
  await clients[0].socialPost.create({ data: { creatorProfileId:f.pid,platform:'threads',likes:3 } });
  await clients[0].creatorContentCuration.create({ data: { creatorProfileId:f.pid,platform:'threads',providerPostId:'old' } });
  const s = await start(f); await consume(f,s); await save(f,s,'456');
  const row = await clients[0].platformStats.findUnique({ where: { userId_platform: { userId:f.id,platform:'threads' } } });
  for (const key of ['followerCount','followingCount','postCount','engagementRate']) assert.equal(row[key],null);
  assert.equal(row.providerAccountId,'456'); assert.equal(row.dataSource,'OFFICIAL_API');
  assert.equal(await clients[0].socialPost.count({ where:{ creatorProfileId:f.pid } }),0);
  assert.equal(await clients[0].creatorContentCuration.count({ where:{ creatorProfileId:f.pid } }),0);
});
test('PG populated disconnect idempotent and preserves unrelated providers', opts, async () => {
  const f = await fixture(); await connected(f);
  for (const platform of ['threads','instagram']) {
    await clients[0].socialPost.create({ data:{creatorProfileId:f.pid,platform} });
    await clients[0].creatorContentCuration.create({ data:{creatorProfileId:f.pid,platform,providerPostId:'post'} });
  }
  await clients[0].platformToken.create({ data:{userId:f.id,platform:'instagram',accessToken:'unrelated'} });
  await clients[0].platformStats.create({ data:{userId:f.id,platform:'instagram',followerCount:9} });
  await apis[0].connection.disconnectThreads(f.id); await apis[1].connection.disconnectThreads(f.id);
  assert.equal(await clients[0].platformToken.count({where:{userId:f.id,platform:'threads'}}),0);
  assert.equal(await clients[0].socialPost.count({where:{creatorProfileId:f.pid,platform:'threads'}}),0);
  assert.equal(await clients[0].creatorContentCuration.count({where:{creatorProfileId:f.pid,platform:'threads'}}),0);
  assert.equal(await clients[0].platformToken.count({where:{userId:f.id,platform:'instagram'}}),1);
  assert.equal(await clients[0].socialPost.count({where:{creatorProfileId:f.pid,platform:'instagram'}}),1);
  assert.equal((await clients[0].creatorProfile.findUnique({where:{userId:f.id}})).followerCount,9);
});
test('PG token-only disconnect without profile', opts, async () => {
  const f = await fixture(false); await clients[0].platformToken.create({data:{userId:f.id,platform:'threads',accessToken:'fake'}});
  await apis[0].connection.disconnectThreads(f.id); await apis[1].connection.disconnectThreads(f.id);
  assert.equal(await clients[0].platformToken.count({where:{userId:f.id}}),0);
});
test('PG injected persistence failure rolls back credentials, stats and cache', opts, async () => {
  const f = await fixture(); await connected(f); const s = await start(f); await consume(f,s);
  const bad = { $transaction: run => clients[1].$transaction(tx => run(new Proxy(tx, { get(target, key) {
    if (key === 'creatorProfile') return new Proxy(target.creatorProfile, { get(model, method) {
      return method === 'update' ? async () => { throw Error('injected'); } : model[method].bind(model);
    } });
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } }))) };
  await assert.rejects(save(f,s,'456',logic(bad)), /injected/);
  assert.equal((await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}})).platformUserId,'123');
  assert.equal((await clients[0].platformStats.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}})).providerAccountId,'123');
});
async function due(f) {
  await connected(f); await clients[0].platformToken.update({where:{userId_platform:{userId:f.id,platform:'threads'}},
    data:{updatedAt:new Date(Date.now()-2*86400_000),expiresAt:new Date(Date.now()+86400_000)}});
}
function pendingRenewal(f, fail = false) {
  let release, arrived;
  const entered = new Promise(r => arrived = r), gate = new Promise(r => release = r);
  const api = logic(clients[0], async url => {
    if (url.pathname === '/refresh_access_token') { arrived(); await gate; return fail ? response({error:{code:190}},400) : response({access_token:'renewed',expires_in:5184000}); }
    return response({id:'123',username:'tester'});
  });
  return { pending: api.token.renewThreadsToken(f.id), entered, release };
}
test('PG stale renewal cannot overwrite reconnect', opts, async () => {
  const f = await fixture(); await due(f); const p = pendingRenewal(f); await p.entered;
  const s = await start(f,apis[1]); await consume(f,s,apis[1]); await save(f,s,'456',apis[1]);
  p.release(); assert.equal((await p.pending).reason,'superseded');
  assert.equal((await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}})).platformUserId,'456');
});
test('PG failed old renewal preserves newer reconnect', opts, async () => {
  const f = await fixture(); await due(f); const p = pendingRenewal(f,true); await p.entered;
  const s = await start(f,apis[1]); await consume(f,s,apis[1]); await save(f,s,'456',apis[1]);
  p.release(); assert.equal((await p.pending).reason,'superseded');
  assert.equal((await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}})).platformUserId,'456');
});
test('PG temporary renewal failure preserves existing valid credentials', opts, async () => {
  const f = await fixture(); await due(f);
  const api = logic(clients[0], async () => {throw Error('network');});
  assert.equal((await api.token.renewThreadsToken(f.id)).reason,'temporary_failure');
  assert.equal((await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}})).accessToken,'fake-123');
});
test('PG renewal success preserves identity and never stores refresh_token', opts, async () => {
  const f = await fixture(); await due(f); const p = pendingRenewal(f); await p.entered; p.release(); assert.equal((await p.pending).reason,'renewed');
  const row = await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}});
  assert.equal(row.platformUserId,'123'); assert.equal(row.accessToken,'renewed'); assert.equal(row.refreshToken,null);
});
test('PG session removed during provider HTTP rejects persistence', opts, async () => {
  const f = await fixture(), s = await start(f); await consume(f,s); await clients[1].session.delete({where:{id:f.sid}});
  assert.equal(await save(f,s),false);
});
test('PG deleted owner cannot be restored by callback', opts, async () => {
  const f = await fixture(), s = await start(f); await consume(f,s); await clients[1].user.delete({where:{id:f.id}});
  await assert.rejects(save(f,s), /owner_missing/);
});
test('PG shared claim locks serialize Threads callback without deadlock', opts, async () => {
  const f = await fixture(), other = await fixture(), s = await start(f); await consume(f,s);
  const youtubeLock = load('lib/youtube-lock.ts'), compliance = load('lib/youtube-compliance.ts');
  const claim = load('lib/youtube-claim.ts', {'@/lib/youtube-lock':youtubeLock,'@/lib/youtube-compliance':compliance});
  let entered, release; const locked = new Promise(r=>entered=r), gate=new Promise(r=>release=r);
  const pending = clients[1].$transaction(async tx => {await claim.lockClaimOwners(tx,[f.id,other.id]);entered();await gate;});
  await locked; const write = save(f,s); release(); await pending; assert.equal(await write,true);
});
test('PG claim guard blocks placeholder credential transfer and token-only stats inheritance', opts, async () => {
  const source = await fixture(), dest = await fixture();
  await clients[0].platformToken.create({data:{userId:source.id,platform:'threads',accessToken:'anomalous'}});
  await clients[0].$transaction(async tx=>{await assert.rejects(apis[0].connection.guardThreadsClaim(tx,source.id,dest.id),/PLACEHOLDER_HAS_TOKEN/);});
  await clients[0].platformToken.deleteMany({where:{userId:source.id}});
  await clients[0].platformStats.create({data:{userId:source.id,platform:'threads',dataSource:'APIFY',followerCount:5}});
  await connected(dest);
  await clients[0].$transaction(async tx=>{await assert.rejects(apis[0].connection.guardThreadsClaim(tx,source.id,dest.id),/THREADS_IDENTITY/);});
  await apis[0].connection.disconnectThreads(dest.id);
  await clients[0].$transaction(tx=>apis[0].connection.guardThreadsClaim(tx,source.id,dest.id));
});
function claimAction(adminId) {
  const lock = load('lib/youtube-lock.ts'), compliance = load('lib/youtube-compliance.ts');
  const claims = load('lib/youtube-claim.ts', {'@/lib/youtube-lock':lock,'@/lib/youtube-compliance':compliance});
  return load('app/actions/claim.ts', {
    '@/lib/db':{db:clients[0]}, '@/lib/threads-connection':apis[0].connection, '@/lib/youtube-claim':claims,
    '@/lib/generated/prisma':require('../lib/generated/prisma'), 'next/headers':{headers:async()=>({})},
    '@/lib/auth':{auth:{api:{getSession:async()=>({user:{id:adminId,role:'ADMIN'}})}}},
    '@/lib/email':{sendClaimApprovedEmail:async()=>{}},
  }, {console:{error(){},warn(){}}});
}
async function claimFixture(anomalous) {
  const source = await fixture(), dest = await fixture(false), admin = await fixture(false);
  await clients[0].user.update({where:{id:source.id},data:{isImported:true}});
  await clients[0].creatorProfile.update({where:{id:source.pid},data:{profileOrigin:'IMPORTED',claimStatus:'CLAIM_PENDING'}});
  await clients[0].user.update({where:{id:dest.id},data:{emailVerified:true,role:'CREATOR'}});
  const claim = await clients[0].profileClaim.create({data:{creatorProfileId:source.pid,requesterUserId:dest.id}});
  if (anomalous) await clients[0].platformToken.create({data:{userId:source.id,platform:'threads',accessToken:'anomalous',platformUserId:'123'}});
  else await clients[0].platformStats.create({data:{userId:source.id,platform:'threads',dataSource:'APIFY',followerCount:9}});
  return {source,dest,admin,claim};
}
test('PG actual simple claim approval blocks anomalous Threads credentials with no ownership movement', opts, async()=>{
  const f = await claimFixture(true);
  const result = await claimAction(f.admin.id).approveProfileClaimAction(f.claim.id);
  assert.equal(result.success,false); assert.match(result.error,/cannot transfer Threads/);
  assert.equal((await clients[0].creatorProfile.findUnique({where:{id:f.source.pid}})).userId,f.source.id);
  assert.equal(await clients[0].platformToken.count({where:{userId:f.dest.id}}),0);
});
test('PG legitimate simple claim approval retains imported lower-source data behavior', opts, async()=>{
  const f = await claimFixture(false);
  const result = await claimAction(f.admin.id).approveProfileClaimAction(f.claim.id);
  assert.equal(result.success,true);
  const row = await clients[0].platformStats.findUnique({where:{userId_platform:{userId:f.dest.id,platform:'threads'}}});
  assert.equal(row.followerCount,9); assert.equal(row.dataSource,'APIFY');
  assert.equal((await clients[0].creatorProfile.findUnique({where:{id:f.source.pid}})).userId,f.dest.id);
});
test('PG curation-only imported Threads identity cannot attach to token-only requester', opts, async()=>{
  const source = await fixture(), dest = await fixture(); await connected(dest);
  await clients[0].creatorContentCuration.create({data:{creatorProfileId:source.pid,platform:'threads',providerPostId:'old'}});
  await clients[0].$transaction(async tx=>{await assert.rejects(apis[0].connection.guardThreadsClaim(tx,source.id,dest.id),/THREADS_IDENTITY/);});
});
test('PG imported owner cannot start Threads OAuth', opts, async()=>{
  const f = await fixture(); await clients[0].user.update({where:{id:f.id},data:{isImported:true}});
  await assert.rejects(start(f), /owner_invalid/);
  assert.equal(await clients[0].verification.count({where:{identifier:apis[0].auth.threadsAuthorityId(f.id)}}),0);
});
function pausedOwner(client) {
  let entered, release;
  const locked = new Promise(r=>entered=r), gate = new Promise(r=>release=r);
  const db = { $transaction: run => client.$transaction(tx => run(new Proxy(tx, {get(target,key) {
    if (key === '$queryRaw') return async (...args)=>{
      const rows = await target.$queryRaw(...args);
      if (args[0].join('').includes('FROM "User"')) {entered();await gate;}
      return rows;
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  }}))) };
  return { api:logic(db), locked, release };
}
test('PG actual lock contention: disconnect holds owner while old callback waits; no resurrection', opts, async()=>{
  const f = await fixture(), s = await start(f);await consume(f,s);
  const p = pausedOwner(clients[1]), disconnect = p.api.connection.disconnectThreads(f.id);
  await p.locked;
  const late = save(f,s); p.release(); await disconnect;
  assert.equal(await late,false);
  assert.equal(await clients[0].platformToken.count({where:{userId:f.id,platform:'threads'}}),0);
});
test('PG actual lock contention: B saves under owner while late A waits; token and stats remain B', opts, async()=>{
  const f = await fixture(), a = await start(f);await consume(f,a);
  const b = await start(f,apis[1]);await consume(f,b,apis[1]);
  const p = pausedOwner(clients[1]), newer = save(f,b,'456',p.api);await p.locked;
  const older = save(f,a,'123');p.release();assert.equal(await newer,true);assert.equal(await older,false);
  const row = await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}});
  const stats = await clients[0].platformStats.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}});
  assert.equal(row.platformUserId,'456');assert.equal(stats.providerAccountId,row.platformUserId);
});

function productionRenewal(api, userId) {
  return load('app/actions/threads-renew.ts', {
    '@/lib/auth': {auth:{api:{getSession:async()=>({user:{id:userId}})}}},
    'next/headers': {headers:async()=>({})}, 'next/cache': {revalidatePath(){}},
    '@/lib/threads-token': api.token,
  }).renewThreadsAuthorizationAction;
}
function actionRenewal(f, { failure = false, identity = '123', authorizationFailureAt } = {}) {
  let release, arrived;
  const entered = new Promise(r=>arrived=r), gate = new Promise(r=>release=r);
  const api = logic(clients[0], async (url,init)=>{
    assert.equal(url.searchParams.has('access_token'),false);
    assert.ok(init.headers.Authorization.startsWith('Bearer '));
    if (url.pathname === '/refresh_access_token') {
      if (authorizationFailureAt !== 'identity') { arrived();await gate; }
      if (authorizationFailureAt === 'refresh') return response({error:{code:190,message:'fake-secret-payload'}},400);
      return failure ? response({error:{code:2,message:'fake-secret-payload'}},503) : response({access_token:'action-renewed',expires_in:5184000});
    }
    if (authorizationFailureAt === 'identity') {
      arrived();await gate;
      return response({error:{code:190,message:'fake-secret-payload'}},400);
    }
    return response({id:identity});
  });
  return {pending:productionRenewal(api,f.id)(),entered,release,api};
}
test('PG production action persists renewal and repeated user action is safe', opts, async()=>{
  const f=await fixture();await due(f);const p=actionRenewal(f);await p.entered;p.release();
  assert.equal((await p.pending).reason,'renewed');
  const row=await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}});
  assert.equal(row.accessToken,'action-renewed');assert.ok(row.expiresAt.getTime()>Date.now()+50*86400_000);
  assert.equal((await productionRenewal(p.api,f.id)()).reason,'not_due');
});
for (const expiry of ['expired','boundary','missing']) {
  test(`PG production action requires reconnect for ${expiry} expiry without HTTP`,opts,async()=>{
    const f=await fixture();await connected(f);
    const now=Date.now();await clients[0].platformToken.update({where:{userId_platform:{userId:f.id,platform:'threads'}},data:{expiresAt:expiry==='missing'?null:new Date(now-(expiry==='expired'?1:0))}});
    const api=logic(clients[0],async()=>{assert.fail('unusable token must not call provider');});
    const result=await productionRenewal(api,f.id)();assert.equal(result.ok,false);assert.equal(result.reason,'reconnect_required');
    assert.equal(await clients[0].platformToken.count({where:{userId:f.id,platform:'threads'}}),1);
  });
}
test('PG production action temporary failure preserves valid credential',opts,async()=>{
  const f=await fixture();await due(f);const before=await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}});
  const p=actionRenewal(f,{failure:true});await p.entered;p.release();assert.equal((await p.pending).reason,'temporary_failure');
  const after=await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}});
  assert.equal(after.accessToken,before.accessToken);assert.equal(after.expiresAt.getTime(),before.expiresAt.getTime());
});
test('PG production action stale renewal cannot overwrite newer reconnect',opts,async()=>{
  const f=await fixture();await due(f);const p=actionRenewal(f);await p.entered;
  const s=await start(f,apis[1]);await consume(f,s,apis[1]);await save(f,s,'456',apis[1]);
  p.release();assert.equal((await p.pending).reason,'superseded');
  const row=await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}});
  assert.equal(row.platformUserId,'456');assert.equal(row.accessToken,'fake-456');
});
test('PG production action cannot renew a client-selected different user',opts,async()=>{
  const victim=await fixture(),caller=await fixture();await due(victim);
  const api=logic(clients[0],async()=>{assert.fail('caller without credential cannot reach provider');});
  assert.equal((await productionRenewal(api,caller.id)(victim.id)).reason,'reconnect_required');
  assert.equal((await clients[0].platformToken.findUnique({where:{userId_platform:{userId:victim.id,platform:'threads'}}})).accessToken,'fake-123');
});
test('PG production action rejects renewed provider identity mismatch',opts,async()=>{
  const f=await fixture();await due(f);const p=actionRenewal(f,{identity:'456'});await p.entered;p.release();
  assert.equal((await p.pending).reason,'invalid_response');
  const row=await clients[0].platformToken.findUnique({where:{userId_platform:{userId:f.id,platform:'threads'}}});
  assert.equal(row.accessToken,'fake-123');assert.equal(row.platformUserId,'123');
});
for (const authorizationFailureAt of ['refresh', 'identity']) {
  for (const scenario of ['current', 'reconnect', 'disconnect', 'same_identity']) {
    test(`PG terminal ${authorizationFailureAt} failure vs ${scenario} fences action and production UI`, opts, async () => {
      const f = await fixture(); await due(f);
      const where = { userId_platform: { userId: f.id, platform: 'threads' } };
      const p = actionRenewal(f, { authorizationFailureAt });
      await p.entered;
      let beforeToken, beforeStats;
      try {
        if (scenario === 'disconnect') await apis[1].connection.disconnectThreads(f.id);
        if (scenario === 'reconnect' || scenario === 'same_identity') {
          const s = await start(f, apis[1]);
          assert.equal(await consume(f, s, apis[1]), true);
          assert.equal(await apis[1].connection.saveThreadsConnection(f.id, f.sid, s.state,
            { ...data(scenario === 'same_identity' ? '123' : '456'), accessToken: 'fake-new-authority' }), true);
        }
        beforeToken = await clients[1].platformToken.findUnique({ where });
        beforeStats = await clients[1].platformStats.findUnique({ where });
      } finally { p.release(); }
      const result = await p.pending;
      assert.equal(result.ok, false);
      assert.equal(result.reason, scenario === 'current' ? 'reconnect_required' : 'superseded');
      assert.deepEqual(await clients[1].platformToken.findUnique({ where }), beforeToken);
      assert.deepEqual(await clients[1].platformStats.findUnique({ where }), beforeStats);
      if (scenario === 'disconnect') {
        assert.equal(beforeToken, null); assert.equal(beforeStats, null);
      } else if (scenario !== 'current') {
        assert.equal(beforeToken.accessToken, 'fake-new-authority');
        assert.equal(beforeToken.platformUserId, scenario === 'same_identity' ? '123' : '456');
        assert.equal(beforeStats.providerAccountId, beforeToken.platformUserId);
      }
      let reloadedToken;
      const ui = renewalUI(async () => result, async () => {
        reloadedToken = await clients[1].platformToken.findUnique({ where });
      });
      await ui.run();
      assert.deepEqual(reloadedToken, beforeToken);
      assert.equal(ui.location.href, scenario === 'current' ? '/api/auth/threads/start' : '');
      assert.deepEqual(ui.events, [['busy', true], ['reload'], ['busy', false]]);
    });
  }
}
