const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => name === 'server-only' ? {} : name === 'node:crypto' ? require(name) :
    imports[name] ?? (() => { throw Error(`Missing dependency ${name}`); })(),
    URL, URLSearchParams, Buffer, Date, Error, AbortSignal, console,
    process: { env: { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://duolync.com',
      NEXT_PUBLIC_THREADS_APP_ID: 'test-app', THREADS_APP_SECRET: 'test-secret', BETTER_AUTH_SECRET: 'test-signing-secret' } }, ...globals });
  return exports;
}
function logic(db, fetch) {
  const locks = load('lib/threads-lock.ts');
  const auth = load('lib/threads-auth.ts', { '@/lib/db': { db }, '@/lib/threads-lock': locks });
  const token = load('lib/threads-token.ts', { '@/lib/db': { db }, '@/lib/threads-lock': locks, '@/lib/threads-auth': auth }, { fetch });
  const connection = load('lib/threads-connection.ts', { '@/lib/db': { db }, '@/lib/threads-lock': locks,
    '@/lib/threads-auth': auth, '@/lib/threads-token': token, '@/lib/creator-metrics': load('lib/creator-metrics.ts') });
  return { locks, auth, token, connection };
}
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
// Execute the production handler with browser/action dependencies injected.
function renewalUI(action, reload = async () => {}) {
  const source = ts.createSourceFile('PresencePage.tsx', fs.readFileSync('_pages/creator/PresencePage.tsx', 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleThreadsRenewal') handler = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!handler) throw Error('Production Threads renewal handler missing');
  const events = [], location = { href: '' }, exports = {};
  const code = ts.transpileModule(`exports.run = ${handler.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, window: { location }, threadsRefreshLock: { current: false },
    setThreadsRefreshing: busy => events.push(['busy', busy]), renewThreadsAuthorizationAction: action,
    toast: value => events.push(['toast', value]), reload: async () => { events.push(['reload']); await reload(); } });
  return { run: exports.run, events, location };
}
module.exports = { load, logic, response, renewalUI };
