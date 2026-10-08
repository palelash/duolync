const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the production action. Any Instagram provider dependency or token
// lookup fails immediately; the existing TikTok boundary stays independent.
function fixture({ instagramToken, authorized = true, claimed = false } = {}) {
  const events = [];
  const forbidden = () => { throw Error('Account deletion must not inspect or revoke Instagram authorization'); };
  const db = {
    platformToken: { findUnique: forbidden, findMany: forbidden, deleteMany: forbidden },
    creatorProfile: { findFirst: async ({ where }) => {
      assert.equal(where.userId, 'owner');
      assert.equal(where.claimStatus, 'CLAIMED');
      return claimed ? { id: 'claimed-profile' } : null;
    } },
    $transaction: async run => run({
      profileClaim: { findMany: async ({ where }) => {
        assert.equal(where.requesterUserId, 'owner');
        return [];
      } },
      user: { delete: async ({ where }) => {
        assert.equal(where.id, 'owner');
        events.push('user.delete');
      } },
    }),
  };
  const imports = {
    '@/lib/db': { db },
    '@/lib/auth': { auth: { api: {
      getSession: async () => authorized ? { user: { id: 'owner' } } : null,
      signOut: async () => events.push('signOut'),
    } } },
    'next/headers': { headers: async () => ({}) },
    '@/lib/tiktok-revoke': { revokeTikTokAuthorization: async userId => {
      assert.equal(userId, 'owner');
      events.push('tiktok');
      return 'not_connected';
    } },
  };
  const source = ts.transpileModule(fs.readFileSync('app/actions/account.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: name => {
      assert.ok(name in imports, `Unexpected provider/dependency: ${name}`);
      return imports[name];
    }, fetch: forbidden, console: { error() {} },
  });
  return { run: exports.deleteAccount, events, instagramToken };
}

for (const [state, instagramToken] of Object.entries({
  live: { accessToken: 'live', expiresAt: new Date(Date.now() + 86400000) },
  expired: { accessToken: 'expired', expiresAt: new Date(0) },
  revoked: { accessToken: 'revoked' },
  invalid: { accessToken: '' },
  missing: null,
})) {
  test(`account deletion proceeds without reading ${state} Instagram authorization`, async () => {
    const f = fixture({ instagramToken });
    assert.equal((await f.run()).success, true);
    assert.deepEqual(f.events, ['tiktok', 'user.delete', 'signOut']);
  });
}

test('account deletion remains session-owned', async () => {
  const f = fixture({ authorized: false });
  assert.equal((await f.run()).error, 'Unauthorized');
  assert.deepEqual(f.events, []);
});

test('claimed-profile guard still prevents deletion and provider calls', async () => {
  const f = fixture({ claimed: true });
  assert.equal((await f.run()).success, false);
  assert.deepEqual(f.events, []);
});

test('schema guarantees cascading cleanup of Instagram data and profile caches', () => {
  // Verify the actual FK declarations; do not simulate database cascade behavior.
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
  for (const [model, ownerField, parent] of [
    ['PlatformToken', 'userId', 'User'],
    ['PlatformStats', 'userId', 'User'],
    ['CreatorProfile', 'userId', 'User'],
    ['SocialPost', 'creatorProfileId', 'CreatorProfile'],
    ['CreatorContentCuration', 'creatorProfileId', 'CreatorProfile'],
    ['Creator', 'userId', 'User'],
  ]) {
    const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1];
    assert.ok(body, model);
    assert.match(body, new RegExp(`${parent}\\s+@relation\\([^\\n]*fields: \\[${ownerField}\\], references: \\[id\\], onDelete: Cascade\\)`), model);
  }
});
