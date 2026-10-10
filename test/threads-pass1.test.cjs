const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load, logic, response, renewalUI } = require('./threads-harness.cjs');
const token = logic({}).token;
for (const [name, value] of Object.entries({ missing: {}, empty: { access_token: '' }, whitespace: { access_token: ' ' },
  expiryString: { access_token: 'fake', expires_in: '3600' }, expiryZero: { access_token: 'fake', expires_in: 0 },
  expiryNegative: { access_token: 'fake', expires_in: -1 }, expiryInfinite: { access_token: 'fake', expires_in: Infinity },
  expiryHuge: { access_token: 'fake', expires_in: 1e10 }, invalidId: { access_token: 'fake', user_id: {} } })) {
  test(`token rejects ${name}`, () => assert.throws(() => token.parseThreadsToken(value)));
}
test('long-lived expiry is required', () => assert.throws(() => token.parseThreadsToken({ access_token: 'fake' }, true)));
test('provider ID runtime validation rejects unsafe IDs', () => {
  for (const id of ['', ' x', {}, -1, Number.MAX_SAFE_INTEGER + 1, 'abc', '0']) assert.throws(() => token.threadsProviderId(id));
  assert.equal(token.threadsProviderId('123'), '123');
});
test('canonical production callback and exact scope', () => {
  const auth = logic({}).auth;
  assert.equal(auth.threadsCallbackUri(), 'https://duolync.com/api/auth/callback/threads');
  const url = new URL(auth.buildThreadsAuthUrl('state'));
  assert.equal(url.searchParams.get('scope'), 'threads_basic');
  assert.equal(url.searchParams.get('state'), 'state');
  assert.ok(!url.toString().includes('test-secret'));
});
test('noncanonical origin fails closed', () => {
  const auth = load('lib/threads-auth.ts', { '@/lib/db': {}, '@/lib/threads-lock': {} },
    { process: { env: { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://attacker.invalid' } } });
  assert.throws(() => auth.threadsCallbackUri());
});
test('documented POST exchange and long-lived GET flow with validated identity', async () => {
  const calls = [];
  const api = logic({}, async (url, init) => {
    calls.push([String(url), init]);
    if (url.pathname === '/oauth/access_token') {
      assert.equal(init.method, 'POST');
      assert.ok(!url.searchParams.has('client_secret'));
      assert.equal(new URLSearchParams(init.body).get('grant_type'), 'authorization_code');
      return response({ access_token: 'short', user_id: '123' });
    }
    if (url.pathname === '/access_token') return response({ access_token: 'long', expires_in: 5184000, token_type: 'bearer' });
    return response({ id: '123', username: 'tester' });
  });
  const data = await api.token.exchangeThreadsCode('fake-code');
  assert.equal(data.accessToken, 'long'); assert.equal(data.platformUserId, '123');
  assert.equal(calls.length, 4);
  for (const [, init] of calls) { assert.equal(init.cache, 'no-store'); assert.ok(init.signal); }
});
test('token exchange ID mismatch fails before long-lived exchange', async () => {
  const api = logic({}, async url => response(url.pathname === '/oauth/access_token' ? { access_token: 'short', user_id: '123' } : { id: '456' }));
  await assert.rejects(api.token.exchangeThreadsCode('code'), /invalid_response/);
});
test('long-lived identity mismatch rejected', async () => {
  const api = logic({}, async (url, init) => response(url.pathname === '/oauth/access_token' ? { access_token: 'short', user_id: '123' } :
    url.pathname === '/access_token' ? { access_token: 'long', expires_in: 5184000 } :
    { id: init.headers.Authorization === 'Bearer short' ? '123' : '456' }));
  await assert.rejects(api.token.exchangeThreadsCode('code'), /invalid_response/);
});
test('invalid username rejected', async () => {
  const api = logic({}, async () => response({ id: '123', username: {} }));
  await assert.rejects(api.token.fetchThreadsIdentity('fake'), /invalid_response/);
});
test('provider errors are bounded and contain no raw payload', async () => {
  const api = logic({}, async () => response({ error: { code: 190, message: 'secret-payload' } }, 400));
  await assert.rejects(api.token.fetchThreadsIdentity('fake'), e => e.message === 'invalid_authorization');
});
test('network errors are bounded', async () => {
  const api = logic({}, async () => { throw Error('secret-url'); });
  await assert.rejects(api.token.fetchThreadsIdentity('fake'), e => e.message === 'temporary_failure');
});
const NextResponse = { redirect: url => ({ url: String(url), cookies: { set() {} }, headers: { set() {} } }) };
function route(session, helpers = {}) {
  let writes = 0;
  const auth = logic({}).auth;
  const callback = load('app/api/auth/callback/threads/route.ts', {
    'next/server': { NextResponse }, 'next/cache': { revalidatePath() {} },
    '@/lib/auth': { auth: { api: { getSession: async () => session } } },
    '@/lib/threads-auth': { ...auth, consumeThreadsState: async () => true, ...helpers },
    '@/lib/threads-token': { ...token, exchangeThreadsCode: async () => ({ username: 'tester' }) },
    '@/lib/threads-connection': { saveThreadsConnection: async () => { writes++; return true; } },
  });
  const req = { headers: {}, nextUrl: new URL('https://duolync.com/api/auth/callback/threads?state=fake&code=fake'), cookies: { get: () => ({ value: 'cookie' }) } };
  return { run: () => callback.GET(req), writes: () => writes };
}
test('logged-out callback fails safely at Presence without saving', async () => {
  const r = route(null); const result = await r.run();
  assert.equal(new URL(result.url).pathname, '/creator/presence'); assert.equal(r.writes(), 0);
});
test('invalid state saves nothing and errors at Presence', async () => {
  const r = route({ user: { id: 'u' }, session: { id: 's' } }, { consumeThreadsState: async () => false });
  assert.equal(new URL((await r.run()).url).searchParams.get('threads_error'), 'invalid_state'); assert.equal(r.writes(), 0);
});
test('success redirects directly to Presence', async () => {
  const r = route({ user: { id: 'u' }, session: { id: 's' } });
  const url = new URL((await r.run()).url); assert.equal(url.pathname, '/creator/presence'); assert.equal(url.searchParams.get('threads_connected'), 'tester');
});
test('start requires session and issues no state while logged out', async () => {
  let starts = 0;
  const api = load('app/api/auth/threads/start/route.ts', { 'next/server': { NextResponse },
    '@/lib/auth': { auth: { api: { getSession: async () => null } } },
    '@/lib/threads-auth': { ...logic({}).auth, createThreadsState: async () => { starts++; } } });
  assert.equal(new URL((await api.GET({ headers: {} })).url).pathname, '/auth'); assert.equal(starts, 0);
});
test('both UI paths route Threads through server start; malformed feedback is safe', () => {
  for (const file of ['_pages/creator/PresencePage.tsx', 'app/_components/meta/ConnectMetaPlatformButton.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /window.location.href = "\/api\/auth\/threads\/start"/);
    assert.ok(!source.includes('const threadsAppId'));
    assert.match(source, /=== "Threads"|=== "threads"/);
    assert.match(source, /Threads connection could not be completed/);
  }
});
test('simple approval and merge both enforce Threads credential guard under shared owner locks', () => {
  const source = fs.readFileSync('app/actions/claim.ts', 'utf8');
  assert.equal((source.match(/await guardThreadsClaim/g) ?? []).length, 2);
  assert.ok(source.indexOf('await guardYouTubeClaim') < source.indexOf('await guardThreadsClaim'));
});
test('late callback response cannot delete a newer OAuth cookie', () => {
  assert.ok(!fs.readFileSync('app/api/auth/callback/threads/route.ts', 'utf8').includes('response.cookies.set'));
});

function connections(tokens, stats = [], clock = Date) {
  return load('app/actions/social-connections.ts', {
    '@/lib/db': { db: { platformToken: { findMany: async () => tokens }, platformStats: { findMany: async () => stats } } },
    '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'owner' } }) } } },
    'next/headers': { headers: async () => ({}) }, 'next/cache': {}, '@/lib/creator-metrics': {},
  }, { Date: clock });
}
for (const scenario of ['future', 'boundary', 'expired', 'missing', 'invalid', 'malformed']) {
  test(`Threads connection readers agree at ${scenario} expiry and preserve other providers`, async () => {
    const now = 1700000000000;
    class ServerDate extends Date { static now() { return now; } }
    const expiry = { future: new ServerDate(now + 1), boundary: new ServerDate(now), expired: new ServerDate(now - 1),
      missing: null, invalid: new ServerDate(NaN), malformed: 'invalid-date' }[scenario];
    const tokens = ['threads', 'instagram', 'tiktok', 'youtube'].map(platform => ({ id: platform, platform,
      expiresAt: platform === 'threads' ? expiry : new ServerDate(0), updatedAt: new ServerDate(now) }));
    const reader = connections(tokens, [], ServerDate);
    const detailed = await reader.getConnectedAccountsAction();
    const list = await reader.getOAuthConnectedPlatformsAction();
    assert.equal(detailed.error, null); assert.equal(list.error, null);
    assert.equal(detailed.data[0].connectedVia, scenario === 'future' ? 'oauth' : 'unknown');
    assert.equal(detailed.data[0].reconnectRequired, scenario !== 'future');
    assert.deepEqual(Array.from(list.platforms), scenario === 'future' ? ['threads','instagram','tiktok','youtube'] : ['instagram','tiktok','youtube']);
    assert.equal(detailed.data.filter(a => a.connectedVia === 'oauth').length, list.platforms.length);
    assert.ok(detailed.data.slice(1).every(a => a.connectedVia === 'oauth'));
    assert.equal(tokens.length, 4); // Credential history is retained.
  });
}
function renewalAction(renewThreadsToken, session = { user: { id: 'owner' } }, cache = () => {}) {
  return load('app/actions/threads-renew.ts', {
    '@/lib/auth': { auth: { api: { getSession: async () => session } } },
    'next/headers': { headers: async () => ({}) }, 'next/cache': { revalidatePath: cache },
    '@/lib/threads-token': { renewThreadsToken },
  }).renewThreadsAuthorizationAction;
}
test('production renewal action requires a session and accepts no client owner', async () => {
  let called = 0;
  assert.equal((await renewalAction(async () => { called++; }, null)()).reason, 'unauthorized');
  assert.equal(called, 0);
  const action = renewalAction(async userId => { assert.equal(userId, 'owner'); called++; return { ok: true, reason: 'renewed' }; });
  assert.equal((await action('victim')).ok, true); assert.equal(called, 1);
});
for (const reason of ['missing_authorization', 'invalid_authorization', 'temporary_failure', 'superseded', 'invalid_response', 'not_due']) {
  test(`production renewal action bounds ${reason}`, async () => {
    const result = await renewalAction(async () => ({ ok: reason === 'not_due', reason }))();
    assert.equal(result.reason, ['missing_authorization','invalid_authorization'].includes(reason) ? 'reconnect_required' : reason);
    assert.equal(result.ok, reason === 'not_due');
  });
}
test('renewal action bounds thrown errors and preserves committed success on cache failure', async () => {
  assert.equal((await renewalAction(async () => { throw Error('secret-payload'); })()).reason, 'temporary_failure');
  assert.equal((await renewalAction(async () => ({ ok: true, reason: 'renewed' }), undefined, () => { throw Error('cache'); })()).ok, true);
});
test('Threads identity and renewal use bearer headers without token query parameters', async () => {
  let calls = 0;
  const api = logic({ platformToken: { findUnique: async () => ({ expiresAt: new Date(Date.now()+86400_000),
    updatedAt: new Date(Date.now()-2*86400_000), platformUserId: '123', accessToken: 'fake-existing' }) },
    $transaction: async run => run({ $queryRaw: async () => [{id:'owner'}], platformToken: { updateMany: async () => ({ count: 1 }) } }) },
    async (url, init) => {
      calls++; assert.equal(url.searchParams.has('access_token'), false);
      assert.equal(init.headers.Authorization, url.pathname === '/refresh_access_token' ? 'Bearer fake-existing' : 'Bearer fake-renewed');
      return response(url.pathname === '/refresh_access_token' ? { access_token:'fake-renewed',expires_in:5184000 } : {id:'123'});
    });
  assert.equal((await api.token.renewThreadsToken('owner')).reason, 'renewed'); assert.equal(calls, 2);
});
test('Presence wires connected Threads renewal and expired history reconnect to server OAuth', () => {
  const source = fs.readFileSync('_pages/creator/PresencePage.tsx', 'utf8');
  assert.match(source, /await renewThreadsAuthorizationAction\(\)/);
  assert.match(source, /isThreadsConnected \? handleThreadsRenewal/);
  assert.match(source, /a\.reconnectRequired/);
  assert.match(source, /result.reason === "reconnect_required"[\s\S]*?window.location.href = "\/api\/auth\/threads\/start"/);
});
for (const connected of [true, false]) {
  test(`Presence superseded renewal reloads ${connected ? 'reconnected' : 'disconnected'} state without OAuth`, async () => {
    let visibleConnection = null;
    const ui = renewalUI(renewalAction(async () => ({ ok: false, reason: 'superseded' })),
      async () => { visibleConnection = connected; });
    await ui.run();
    assert.equal(visibleConnection, connected);
    assert.equal(ui.location.href, '');
    assert.deepEqual(ui.events, [['busy', true], ['reload'], ['busy', false]]);
  });
}
test('Presence current authorization failure reloads then starts hardened OAuth once', async () => {
  const ui = renewalUI(renewalAction(async () => ({ ok: false, reason: 'invalid_authorization' })),
    async () => assert.equal(ui.location.href, ''));
  await ui.run();
  assert.equal(ui.location.href, '/api/auth/threads/start');
  assert.deepEqual(ui.events, [['busy', true], ['reload'], ['busy', false]]);
});
test('failed terminal-error authority check stays retryable and never starts OAuth', async () => {
  const api = logic({ platformToken: { findUnique: async () => ({ id: 'token', platformUserId: '123', accessToken: 'fake',
    expiresAt: new Date(Date.now() + 86400_000), updatedAt: new Date(Date.now() - 2 * 86400_000) }) },
    $transaction: async () => { throw Error('database unavailable'); } },
    async () => response({ error: { code: 190, message: 'fake-secret' } }, 400));
  const ui = renewalUI(renewalAction(api.token.renewThreadsToken));
  await ui.run();
  assert.equal(ui.location.href, '');
  assert.equal(ui.events.some(([kind]) => kind === 'reload'), false);
  assert.equal(ui.events.find(([kind]) => kind === 'toast')[1].title, 'Renewal failed');
});
