const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => imports[name] ?? {}, process: { env: {} }, Date, Error, URL, ...globals });
  return exports;
}
const config = load('lib/youtube-maintenance-config.ts');
const runner = load('lib/youtube-maintenance-runner.ts');
const inventory = load('lib/youtube-inventory.ts');
const startup = { DATABASE_URL: 'postgresql://test@127.0.0.1/youtube_test_ops', YOUTUBE_CLIENT_ID: 'fake-client', YOUTUBE_CLIENT_SECRET: 'fake-secret' };
test('all maintenance numeric environment values reject invalid, unsafe and out of range values', () => {
  const limits = { BATCH_SIZE: [1, 100], CONCURRENCY: [1, 10], ITEM_LIMIT: [1, 10000], RUN_LIMIT_MS: [1, 3600000], LEASE_MS: [1000, 3600000], QUOTA_BUDGET: [0, 1000000] };
  for (const [suffix, [min, max]] of Object.entries(limits)) {
    const key = `YOUTUBE_MAINTENANCE_${suffix}`;
    for (const raw of ['', ' ', 'NaN', 'Infinity', '-1', '1.5', '1e2', '0x10', '9007199254740992', String(max + 1)])
      assert.throws(() => config.validateYouTubeMaintenanceStartup({ ...startup, [key]: raw }), undefined, key + ':' + raw);
    if (min > 0) assert.throws(() => config.maintenanceConfig({}, { [key]: String(min - 1) }));
    assert.doesNotThrow(() => config.validateYouTubeMaintenanceStartup({ ...startup, [key]: String(min) }));
    assert.doesNotThrow(() => config.validateYouTubeMaintenanceStartup({ ...startup, [key]: String(max) }));
  }
});
test('startup requires PostgreSQL and dedicated OAuth, with no request/session dependencies', () => {
  assert.doesNotThrow(() => config.validateYouTubeMaintenanceStartup(startup));
  for (const key of Object.keys(startup)) assert.throws(() => config.validateYouTubeMaintenanceStartup({ ...startup, [key]: '' }));
  for (const url of ['https://example.invalid/db', 'postgresql://host', 'invalid'])
    assert.throws(() => config.validateYouTubeMaintenanceStartup({ ...startup, DATABASE_URL: url }));
});
async function execute(result, failure) {
  const logs = [], errors = []; let closed = 0;
  const code = await runner.executeYouTubeMaintenance({ log: x => logs.push(x), error: x => errors.push(x),
    initialize: async () => ({ run: async () => { if (failure) throw failure; return result; }, close: async () => { closed++; } }) });
  return { code, logs, errors, closed };
}
const healthy = { processed: 1, outcomes: { TEMPORARY_FAILURE: 1 }, quotaUsed: 0, quotaBudget: 100, itemErrors: 0 };
test('persisted item failures complete with exit zero and aggregate logs contain no secrets or identities', async () => {
  const sensitive = 'access refresh secret email@example.invalid @username CHANNEL creator-id provider-body';
  const run = await execute({ ...healthy, accessToken: sensitive, creator: sensitive, outcomes: { ...healthy.outcomes, [sensitive]: 1 } });
  assert.equal(run.code, 0); assert.equal(run.closed, 1); assert.equal(run.errors.length, 0);
  assert.ok(!run.logs.join('').includes(sensitive));
  const summary = JSON.parse(run.logs[0]);
  assert.equal(summary.outcomes.TEMPORARY_FAILURE, 1); assert.equal(summary.selected, 1);
  assert.ok(summary.startedAt); assert.ok(summary.finishedAt);
  assert.deepEqual(Object.keys(summary).sort(), ['startedAt', 'finishedAt', 'selected', 'processed', 'outcomes', 'quotaUsed', 'quotaBudget', 'itemErrors'].sort());
});
test('every persisted outcome including item configuration failure remains run-level healthy', async () => {
  for (const outcome of ['CONFIGURATION_FAILURE', 'AUTHORIZATION_LOST', 'DEADLINE_PURGED', 'SUPERSEDED', 'NOT_CONNECTED', 'QUOTA_EXHAUSTED', 'PROVIDER_FAILURE', 'IDENTITY_MISMATCH', 'SUCCESS'])
    assert.equal((await execute({ ...healthy, outcomes: { [outcome]: 1 } })).code, 0);
});
test('fatal orchestration and unpersisted failures exit nonzero and close resources', async () => {
  const fatal = await execute(null, Error('secret-provider-body'));
  assert.equal(fatal.code, 1); assert.equal(fatal.closed, 1); assert.ok(!fatal.errors.join('').includes('secret-provider-body'));
  const failedPersistence = await execute({ ...healthy, itemErrors: 1 });
  assert.equal(failedPersistence.code, 1); assert.equal(failedPersistence.closed, 1);
});
test('initialization/configuration and cleanup failures exit nonzero without logging raw errors', async () => {
  for (const initialize of [async () => { config.validateYouTubeMaintenanceStartup({}); },
    async () => { throw Error('credentials'); }, async () => ({ run: async () => healthy, close: async () => { throw Error('credentials'); } })]) {
    const logs = [];
    assert.equal(await runner.executeYouTubeMaintenance({ initialize, log: x => logs.push(x), error: x => logs.push(x) }), 1);
    assert.ok(!logs.join('').includes('credentials'));
  }
});
test('inventory is read-only, reports pre-migration absence and always rolls back', async () => {
  for (const present of [false, true]) {
    const queries = [];
    const result = await inventory.readYouTubeInventory({ query: async sql => {
      queries.push(sql);
      if (/to_regclass/.test(sql)) return { rows: [{ present }] };
      if (/GROUP BY/.test(sql)) return { rows: [{ outcome: 'SUCCESS', count: '2' }] };
      return { rows: [{ count: '2' }] };
    } });
    assert.equal(result.complianceTablePresent, present);
    assert.match(queries[0], /REPEATABLE READ READ ONLY/); assert.equal(queries.at(-1), 'ROLLBACK');
    assert.ok(queries.every(q => /^(BEGIN|SET LOCAL|SELECT|ROLLBACK)\b/.test(q)));
    if (!present) assert.equal(result.compliance, null);
    else { assert.equal(result.compliance.activeWithoutToken, '2'); assert.equal(result.compliance.expiredLeases, '2'); }
  }
  const queries = [];
  await assert.rejects(inventory.readYouTubeInventory({ query: async sql => { queries.push(sql); if (sql.startsWith('SELECT')) throw Error('unavailable'); return { rows: [] }; } }));
  assert.equal(queries.at(-1), 'ROLLBACK');
});
test('backfill defaults to dry-run and APPLY requires exactly one explicit flag', () => {
  assert.equal(config.youtubeBackfillMode([]), '--plan'); assert.equal(config.youtubeBackfillMode(['--plan']), '--plan');
  assert.equal(config.youtubeBackfillMode(['--apply']), '--apply');
  for (const args of [['apply'], ['--plan', '--apply'], ['--apply', '--unknown'], ['--unknown']]) assert.throws(() => config.youtubeBackfillMode(args));
});
test('bootstrap keeps initialized, purged and newer generation rows unchanged', () => {
  const bootstrap = load('lib/youtube-bootstrap.ts');
  for (const status of ['ACTIVE', 'PURGED']) {
    const state = { status, connectionGeneration: 9, revision: 42, blockedAt: new Date(0) };
    const before = JSON.stringify(state);
    assert.equal(bootstrap.planYouTubeBootstrap({ state, token: null, stats: null, officialPosts: true }, new Date()).kind, 'KEEP');
    assert.equal(JSON.stringify(state), before);
  }
});
test('runner watchdog hard deadline is finite, clears its timer and never starts a scheduler', () => {
  const source = fs.readFileSync('scripts/youtube-maintenance.ts', 'utf8');
  assert.match(source, /settings.runLimitMs \+ 120000/); assert.match(source, /process.exit\(1\)/); assert.match(source, /clearTimeout\(watchdog\)/);
  for (const file of ['scripts/youtube-maintenance.ts', 'lib/youtube-maintenance.ts', 'lib/youtube-maintenance-runner.ts'])
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /setInterval|node-cron|railway\s+(cron|up)|scheduleJob/);
});
test('normal app code does not invoke shared database shutdown', () => {
  const files = require('node:child_process').execFileSync('rg', ['-l', 'closeDatabase', 'app', 'lib'], { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(files, ['lib/db.ts']);
});

test('standalone hard watchdog exits nonzero on stalled work and normal completion clears it', async () => {
  const source = fs.readFileSync('scripts/youtube-maintenance.ts', 'utf8').replace('void main();', 'export const completion = main();');
  for (const stalled of [false, true]) {
    const exports = {}, exits = [], logs = [], cleared = []; let timeout, delay, resolveRun, closed = 0;
    const pending = new Promise(resolve => resolveRun = resolve);
    const process = { env: startup, exit: code => exits.push(code), exitCode: undefined };
    const imports = {
      dotenv: { config: () => {} },
      '../lib/youtube-maintenance-config': { validateYouTubeMaintenanceStartup: () => config.validateYouTubeMaintenanceStartup(startup) },
      '../lib/youtube-maintenance-runner': runner,
      '../lib/db': { closeDatabase: async () => { closed++; } },
      '../lib/youtube-maintenance': { runYouTubeMaintenance: () => stalled ? pending : Promise.resolve(healthy) },
    };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, require: name => imports[name], process, console: { log: x => logs.push(x), error: x => logs.push(x) },
        setTimeout: (fn, ms) => { timeout = fn; delay = ms; return 123; }, clearTimeout: id => cleared.push(id) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(delay, 420000);
    if (stalled) { timeout(); assert.deepEqual(exits, [1]); resolveRun(healthy); }
    await exports.completion;
    assert.equal(closed, 1); assert.deepEqual(cleared, [123]);
    if (!stalled) { assert.equal(process.exitCode, 0); assert.deepEqual(exits, []); }
  }
});

test('one-shot loader and dotenv are retained by production dependency installs', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const name of ['tsx', 'dotenv']) { assert.ok(pkg.dependencies[name]); assert.equal(pkg.devDependencies[name], undefined); }
  assert.equal(pkg.scripts['youtube:maintenance'], 'node --conditions=react-server --import tsx scripts/youtube-maintenance.ts');
});
