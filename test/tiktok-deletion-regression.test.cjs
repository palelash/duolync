const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: name => { if (name === 'server-only') return {}; assert.ok(name in imports, name); return imports[name]; }, URLSearchParams, console: { error() {} }, ...globals,
  }); return exports;
}
for (const mode of ['account', 'admin']) for (const status of ['revoked', 'already_revoked', 'not_connected', 'temporary_failure', 'configuration_error']) {
  test(`${mode} retains existing TikTok ${status} deletion semantics`, async () => {
    const events = [];
    const imports = {
      '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'owner', role: 'ADMIN' } }), signOut: async () => {} } } },
      '@/lib/db': { db: { creatorProfile: { findFirst: async () => null }, user: { findUnique: async () => ({ role: 'CREATOR' }) },
        platformToken: { deleteMany: async ({ where }) => { assert.equal(where.platform, 'tiktok'); events.push('delete-token'); } },
        $transaction: async run => run({ profileClaim: { findMany: async () => [] }, user: { delete: async () => events.push('delete-user') } }),
      } },
      '@/lib/youtube-revoke': { prepareYouTubeAccountDeletion: async () => ({ error: null, credential: null }), assertYouTubeAccountDeletion: async () => {}, isYouTubeRevokeConfirmationUnavailable: () => false },
      '@/lib/tiktok-revoke': { revokeTikTokAuthorization: async () => { events.push('revoke'); return status; } },
      'next/headers': { headers: async () => ({}) }, 'next/cache': { revalidatePath() {} }, '@/lib/roles': { isAdmin: role => role === 'ADMIN' },
      '@/lib/import-utils': {}, '@/lib/social-links': {},
    };
    const actions = load(mode === 'account' ? 'app/actions/account.ts' : 'app/admin/actions.ts', imports);
    const result = await (mode === 'account' ? actions.deleteAccount() : actions.deleteUser('target'));
    assert.equal(result.success, !['temporary_failure', 'configuration_error'].includes(status));
    assert.deepEqual(events, status === 'revoked' ? ['revoke', 'delete-token', 'delete-user'] : result.success ? ['revoke', 'delete-user'] : ['revoke']);
  });
}
for (const [reason, expected] of [['not_connected', 'not_connected'], ['reauth_required', 'already_revoked'], ['temporary_failure', 'temporary_failure'], ['configuration_error', 'configuration_error']]) {
  test(`production TikTok revoke retains ${reason} classification`, async () => {
    const helper = load('lib/tiktok-revoke.ts', { '@/lib/tiktok-token': { getTikTokAccessToken: async () => ({ ok: false, reason }) } }, {
      fetch: () => { throw Error('unexpected provider call'); }, process: { env: {} },
    }); assert.equal(await helper.revokeTikTokAuthorization('owner'), expected);
  });
}
test('production TikTok revoke still uses its own provider and token lifecycle', async () => {
  let called = false;
  const helper = load('lib/tiktok-revoke.ts', { '@/lib/tiktok-token': { getTikTokAccessToken: async id => { assert.equal(id, 'owner'); return { ok: true, accessToken: 'tt-token' }; } } }, {
    process: { env: { NEXT_PUBLIC_TIKTOK_CLIENT_KEY: 'tt-client', TIKTOK_CLIENT_SECRET: 'tt-secret' } },
    fetch: async (url, init) => { called = true; assert.equal(url, 'https://open.tiktokapis.com/v2/oauth/revoke/'); assert.equal(init.method, 'POST');
      assert.equal(new URLSearchParams(init.body).get('token'), 'tt-token'); return { ok: true }; },
  }); assert.equal(await helper.revokeTikTokAuthorization('owner'), 'revoked'); assert.equal(called, true);
});
