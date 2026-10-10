const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => name === 'server-only' ? {} : imports[name] ?? {}, Date, Error, process: { env: {} }, ...globals });
  return exports;
}
const engine = load('lib/youtube-maintenance.ts');
test('maintenance quota estimate reserves bounded official list calls and access-only probe', () => {
  assert.equal(engine.estimateYouTubeMaintenanceQuota(false), 7);
  assert.equal(engine.estimateYouTubeMaintenanceQuota(true), 8);
});
test('maintenance config accepts zero quota, bounds batches/concurrency/run/items', () => {
  assert.equal(engine.maintenanceConfig({ quotaBudget: 0 }).quotaBudget, 0);
  assert.equal(engine.maintenanceConfig().batchSize, 50);
  assert.equal(engine.maintenanceConfig().concurrency, 3);
  for (const config of [{ batchSize: 0 }, { batchSize: 101 }, { concurrency: 11 }, { quotaBudget: -1 }, { quotaBudget: NaN }, { itemLimit: 0 }, { leaseMs: 999 }, { runLimitMs: Infinity }])
    assert.throws(() => engine.maintenanceConfig(config));
});
test('retry is deterministic, bounded and never passes the hard deadline', () => {
  const now = new Date('2026-10-10T00:00:00Z'), deadline = new Date('2026-10-14T00:00:00Z');
  assert.equal(engine.maintenanceRetryAt('TEMPORARY_FAILURE', 1, now, deadline).toISOString(), '2026-10-11T00:00:00.000Z');
  assert.equal(engine.maintenanceRetryAt('QUOTA_EXHAUSTED', 1, now, deadline).toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(engine.maintenanceRetryAt('CONFIGURATION_FAILURE', 1, now, deadline).toISOString(), '2026-10-13T00:00:00.000Z');
  assert.equal(engine.maintenanceRetryAt('TEMPORARY_FAILURE', 100, now, deadline).toISOString(), '2026-10-13T00:00:00.000Z');
  assert.equal(engine.maintenanceRetryAt('QUOTA_EXHAUSTED', 1, now, now).getTime(), now.getTime());
});
test('database shutdown closes external pool even when Prisma disconnect fails', async () => {
  const calls = [], pool = { end: async () => calls.push('pool') }, db = { $disconnect: async () => { calls.push('prisma'); throw Error('injected'); } };
  const database = load('lib/db.ts', {}, { globalThis: { prisma: db, prismaPool: pool } });
  await assert.rejects(database.closeDatabase(), /injected/);
  assert.deepEqual(calls, ['prisma', 'pool']);
});
test('database shutdown closes Prisma before the external pool on success', async () => {
  const calls = [], pool = { end: async () => calls.push('pool') }, db = { $disconnect: async () => calls.push('prisma') };
  await load('lib/db.ts', {}, { globalThis: { prisma: db, prismaPool: pool } }).closeDatabase();
  assert.deepEqual(calls, ['prisma', 'pool']);
});

test('hard deadline includes exact equality and missing evidence, uses supplied DB time', () => {
  const lifecycle = load('lib/youtube-compliance.ts'), now = new Date('2026-10-10T00:00:00Z');
  assert.equal(lifecycle.youtubeDeadlineReached({ deleteByAt: now }, now), true);
  assert.equal(lifecycle.youtubeDeadlineReached({ deleteByAt: new Date(now.getTime() - 1) }, now), true);
  assert.equal(lifecycle.youtubeDeadlineReached({ deleteByAt: new Date(now.getTime() + 1) }, now), false);
  assert.equal(lifecycle.youtubeDeadlineReached({ deleteByAt: null }, now), true);
});
test('deadline claims supersede ordinary leases at equality but exclude other live cleanup claims', () => {
  const imports = { '@/lib/youtube-compliance': load('lib/youtube-compliance.ts') };
  const maintenance = load('lib/youtube-maintenance.ts', imports), now = new Date('2026-10-10T00:00:00Z');
  const ordinary = { leaseId: 'ordinary-worker', leaseExpiresAt: new Date(now.getTime() + 60000), deleteByAt: new Date(now.getTime() + 1) };
  assert.equal(maintenance.maintenanceLeaseAvailable(ordinary, now), false);
  const overdue = { ...ordinary, deleteByAt: now };
  assert.equal(maintenance.maintenanceLeaseAvailable(overdue, now), true);
  assert.equal(maintenance.maintenanceLeaseAvailable({ ...overdue, deleteByAt: null }, now), true);
  assert.equal(maintenance.maintenanceLeaseAvailable({ ...overdue, leaseId: 'deadline:cleanup-worker' }, now), false);
  assert.equal(maintenance.maintenanceLeaseAvailable({ ...overdue, leaseId: 'deadline:cleanup-worker', leaseExpiresAt: now }, now), true);
});
