const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const { redirect } = require('next/navigation');
const { getURLFromRedirectError, getRedirectStatusCodeFromError } = require('next/dist/client/components/redirect');

function load(file, imports, env = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: name => {
      assert.ok(name in imports, `Unexpected dependency ${name}`);
      return imports[name];
    }, URL, URLSearchParams, process: { env },
  }, { filename: file });
  return exports;
}

const page = load('app/creator/accounts/page.tsx', { 'next/navigation': { redirect } }).default;
for (const [name, query] of [
  ['no query', ''],
  ['YouTube success', 'youtube_connected=Example'],
  ['multiple parameters', 'youtube_connected=My%20Channel&next=content&empty='],
  ['repeated parameters', 'tag=one&tag=two&tag=&youtube_connected=Example'],
  ['encoded characters', 'youtube_connected=A%2BB%20%26%20%25%20%E1%83%90%20%F0%9F%8E%A5&path=%2F%3F%23%3D&literal=%2520'],
  ['OAuth errors', 'youtube_error=access_denied&error_description=Permission%20denied'],
  ['other provider feedback', 'instagram_connected=user&tiktok_error=invalid_state&meta_connected=1&threads_error=network_error&facebook_connected=My%20Page'],
]) {
  test(`legacy accounts server redirect preserves ${name}`, async () => {
    const original = new URLSearchParams(query);
    const params = Object.create(null);
    for (const key of new Set(original.keys())) {
      const values = original.getAll(key);
      params[key] = values.length === 1 ? values[0] : values;
    }
    // Next's real redirect throws before a component can render.
    await assert.rejects(page({ searchParams: Promise.resolve(params) }), error => {
      const destination = new URL(getURLFromRedirectError(error), 'https://app.example');
      assert.equal(getRedirectStatusCodeFromError(error), 307);
      assert.equal(destination.pathname, '/creator/presence');
      assert.deepEqual([...destination.searchParams], [...original]);
      return true;
    });
  });
}

test('presence route renders current UI without a redirect loop', () => {
  const source = fs.readFileSync('app/creator/presence/page.tsx', 'utf8');
  assert.match(source, /import PresencePage from/);
  assert.match(source, /<PresencePage\s*\/>/);
  assert.doesNotMatch(source, /SocialAccounts|redirect\(/);
});

function callbackFixture(overrides = {}, envOverrides = {}) {
  const calls = { saves: [], syncs: [], revalidated: [] };
  const auth = {
    GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
    YOUTUBE_STATE_COOKIE: '__youtube_oauth_state',
    YOUTUBE_STATE_OPTIONS: { path: '/api/auth', httpOnly: true, secure: true, sameSite: 'lax' },
    youtubeAppUrl: () => 'https://app.example',
    youtubeCallbackUri: () => 'https://app.example/api/auth/callback/youtube',
    consumeYouTubeState: async () => true,
    youtubeFetch: async () => ({ ok: true, json: async () => ({ access_token: 'TOKEN' }) }),
    parseYouTubeTokenResponse: () => ({ accessToken: 'TOKEN' }),
    ...overrides.auth,
  };
  const callback = load('app/api/auth/callback/youtube/route.ts', {
    'next/server': { NextResponse },
    'next/cache': { revalidatePath: path => calls.revalidated.push(path) },
    '@/lib/auth': { auth: { api: { getSession: overrides.getSession ?? (async () => ({ user: { id: 'owner' }, session: { id: 'session' } })) } } },
    '@/lib/youtube-auth': auth,
    '@/lib/youtube-token': { saveYouTubeAccessToken: async (...args) => {
      calls.saves.push(args);
      if (overrides.saveError) throw Error('save failed');
      return { accessToken: 'TOKEN', platformUserId: 'CHANNEL' };
    } },
    '@/lib/youtube-sync': {
      resolveYouTubeChannelIdentity: overrides.identity ?? (async () => ({ id: 'CHANNEL', username: '@example', title: 'My + Channel & 🎥' })),
      syncYouTubeOfficialData: async (...args) => {
        calls.syncs.push(args);
        if (overrides.syncError) throw Error('sync failed');
        return overrides.syncResult ?? { ok: true };
      },
    },
  }, { YOUTUBE_CLIENT_ID: 'client', YOUTUBE_CLIENT_SECRET: 'secret', ...envOverrides }).GET;
  return { calls, callback };
}

async function invoke(fixture, params = { state: 'state', code: 'code' }) {
  const request = new NextRequest(`https://app.example/api/auth/callback/youtube?${new URLSearchParams(params)}`, {
    headers: { cookie: '__youtube_oauth_state=signed-state' },
  });
  const response = await fixture.callback(request);
  const destination = new URL(response.headers.get('location'));
  assert.equal(response.status, 307);
  assert.equal(destination.origin, 'https://app.example');
  assert.equal(destination.pathname, '/creator/presence');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.cookies.get('__youtube_oauth_state').maxAge, 0);
  assert.equal(response.cookies.get('__youtube_oauth_state').path, '/api/auth');
  assert.equal(response.cookies.get('__youtube_state').maxAge, 0);
  assert.equal(response.cookies.get('__youtube_state').path, '/');
  return destination;
}

test('YouTube success redirects directly to Presence with the channel title', async () => {
  const f = callbackFixture();
  assert.deepEqual([...((await invoke(f)).searchParams)], [['youtube_connected', 'My + Channel & 🎥']]);
  assert.equal(f.calls.saves.length, 1);
  assert.equal(f.calls.syncs.length, 1);
  assert.equal(f.calls.saves[0][0], 'owner');
  assert.equal(f.calls.saves[0][1].platformUserId, 'CHANNEL');
  assert.equal(f.calls.syncs[0][1].credential.platformUserId, 'CHANNEL');
  assert.deepEqual(f.calls.revalidated, ['/creator/accounts', '/creator/presence', '/creator/dashboard', '/creator/analytics']);
});

test('YouTube success without a channel title preserves the 1 fallback', async () => {
  const f = callbackFixture({ identity: async () => ({ id: 'CHANNEL' }) });
  assert.equal((await invoke(f)).searchParams.get('youtube_connected'), '1');
});

for (const [name, overrides, params, expected, env] of [
  ['session failure', { getSession: async () => { throw Error('session'); } }, undefined, 'temporary_failure'],
  ['invalid state', { auth: { consumeYouTubeState: async () => false } }, undefined, 'invalid_state'],
  ['state validation failure', { auth: { consumeYouTubeState: async () => { throw Error('state'); } } }, undefined, 'temporary_failure'],
  ['access denied', {}, { state: 'state', error: 'access_denied', error_description: 'RAW' }, 'access_denied'],
  ['provider error', {}, { state: 'state', error: 'provider_error', error_description: 'RAW' }, 'temporary_failure'],
  ['missing code', {}, { state: 'state' }, 'missing_code'],
  ['missing configuration', {}, undefined, 'server_misconfiguration', { YOUTUBE_CLIENT_SECRET: '' }],
  ['token endpoint rejection', { auth: { youtubeFetch: async () => ({ ok: false, json: async () => ({}) }) } }, undefined, 'temporary_failure'],
  ['invalid token payload', { auth: { parseYouTubeTokenResponse: () => null } }, undefined, 'temporary_failure'],
  ['token network failure', { auth: { youtubeFetch: async () => { throw Error('network'); } } }, undefined, 'temporary_failure'],
  ['channel lookup failure', { identity: async () => { throw Error('identity'); } }, undefined, 'temporary_failure'],
  ['no channel', { identity: async () => null }, undefined, 'no_youtube_channel'],
  ['credential save failure', { saveError: true }, undefined, 'temporary_failure'],
  ['sync exception', { syncError: true }, undefined, 'temporary_failure'],
  ['sync superseded', { syncResult: { ok: false, reason: 'superseded' } }, undefined, 'temporary_failure'],
  ['sync authorization error', { syncResult: { ok: false, reason: 'reauth_required' } }, undefined, 'reauth_required'],
]) {
  test(`YouTube ${name} redirects directly to Presence with unchanged error semantics`, async () => {
    const f = callbackFixture(overrides, env);
    assert.deepEqual([...((await invoke(f, params)).searchParams)], [['youtube_error', expected]]);
    assert.equal(f.calls.revalidated.length, 0);
  });
}

// Execute the existing mount effect to verify feedback, cleanup, and one reload
// without mounting the full Presence UI or duplicating its OAuth logic.
const presenceFile = '_pages/creator/PresencePage.tsx';
const presenceSource = ts.createSourceFile(presenceFile, fs.readFileSync(presenceFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let feedbackEffect;
function findFeedback(node) {
  if (ts.isCallExpression(node) && node.expression.getText(presenceSource) === 'useEffect' &&
      node.arguments[0]?.getText(presenceSource).includes('youtube_connected')) {
    feedbackEffect = node.arguments[0].getText(presenceSource);
  }
  ts.forEachChild(node, findFeedback);
}
findFeedback(presenceSource);
for (const [query, title, description, destructive] of [
  ['youtube_connected=My%20Channel&tab=posts', 'My Channel connected! 🎉', undefined, false],
  ['youtube_error=access_denied&tab=posts', 'Could not connect YouTube', 'Access was denied. Please grant the required permissions.', true],
  ['youtube_error=temporary_failure&tab=posts', 'Could not connect YouTube', 'temporary failure', true],
]) {
  test(`existing Presence feedback handles ${query.split('&')[0]} and reloads once`, async () => {
    assert.ok(feedbackEffect);
    const events = [], exports = {};
    let href = `https://app.example/creator/presence?${query}`;
    vm.runInNewContext(ts.transpileModule(`export const run = ${feedbackEffect};`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports, URL, URLSearchParams, decodeURIComponent,
      clearBrokenPostImagesAction: async () => {},
      toast: value => events.push(value),
      reload: async () => {
        assert.equal(new URL(href).searchParams.has('youtube_connected'), false);
        assert.equal(new URL(href).searchParams.has('youtube_error'), false);
        events.push('reload');
      },
      setLoading: value => events.push(`loading:${value}`),
      window: {
        location: { href, search: new URL(href).search },
        history: { replaceState: (_state, _title, url) => { href = url; } },
        addEventListener() {}, removeEventListener() {},
      },
    });
    const cleanup = exports.run();
    await new Promise(resolve => setImmediate(resolve));
    cleanup();
    assert.equal(events.filter(event => event === 'reload').length, 1);
    assert.ok(events.includes('loading:false'));
    const toasts = events.filter(event => typeof event === 'object');
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].title, title);
    assert.equal(toasts[0].description, description);
    assert.equal(toasts[0].variant === 'destructive', destructive);
    assert.equal(new URL(href).search, '?tab=posts');
  });
}
