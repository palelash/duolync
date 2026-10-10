/** Pure fail-closed target gate. Call before constructing any database pools. */
function assertDisposableYouTubeDatabase(target, applications = []) {
  if (!target) throw Error('TEST_DATABASE_URL required; PostgreSQL tests NOT RUN');
  let url;
  try { url = new URL(target); } catch { throw Error('Invalid TEST_DATABASE_URL'); }
  const local = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !local(url.hostname) ||
      !/^\/youtube_test_[a-z0-9_]+$/.test(url.pathname) || /prod|railway|neon|supabase/i.test(target))
    throw Error('Refusing target: requires a dedicated local youtube_test_* database');
  if (url.searchParams.getAll('schema').some(schema => schema !== 'public')) throw Error('Requires public schema in a dedicated test database');
  for (const application of applications.filter(Boolean)) {
    let app;
    try { app = new URL(application); } catch { throw Error('Cannot verify application database target safely'); }
    if (url.href === app.href || (local(app.hostname) && app.pathname === url.pathname))
      throw Error('Refusing application database target (including local hostname aliases)');
  }
  return target;
}
module.exports = { assertDisposableYouTubeDatabase };
