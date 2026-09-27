/**
 * Duolync Chrome Extension – Content Script
 *
 * Extracts creator handle, name, avatar, followers count, and posts count
 * from Instagram, TikTok, YouTube, and Threads profile pages.
 *
 * Every stat is resolved through an ordered list of strategies; the first one
 * that yields a number wins and its name is reported in `sources`:
 *
 *   A. Structured data – og:description / meta description, embedded JSON
 *      (TikTok rehydration state, YouTube ytInitialData). These are only
 *      trusted when they reference the handle in the current URL, because
 *      SPA navigation leaves them pointing at the previously loaded profile.
 *   B. DOM – platform selectors, aria-label/title attributes, and short
 *      elements whose full text reads "[count] [keyword]", scoped to the
 *      profile header where possible.
 *   C. MutationObserver – if stats are still missing, re-run A+B as the DOM
 *      changes until everything is found or the timeout elapses.
 *
 * Set DEBUG = false to silence logging (inspect via the page's DevTools console).
 */

(() => {
  "use strict";

  const DEBUG = true;

  // ─── Logging ──────────────────────────────────────────────────────────────

  const TAG = ["%c[Duolync]", "color:#a78bfa;font-weight:bold"];
  const log   = (...a) => { if (DEBUG) console.log(...TAG, ...a); };
  const warn  = (...a) => { if (DEBUG) console.warn(...TAG, ...a); };
  const group = (label) => { if (DEBUG) console.groupCollapsed(...TAG, label); };
  const groupEnd = () => { if (DEBUG) console.groupEnd(); };

  // ─── Platform Detection ───────────────────────────────────────────────────

  const P = {
    INSTAGRAM: "instagram",
    TIKTOK:    "tiktok",
    YOUTUBE:   "youtube",
    THREADS:   "threads",
  };

  function detectPlatform() {
    const h = window.location.hostname;
    if (h.endsWith("instagram.com"))                          return P.INSTAGRAM;
    if (h.endsWith("tiktok.com"))                             return P.TIKTOK;
    if (h.endsWith("youtube.com"))                            return P.YOUTUBE;
    if (h.endsWith("threads.net") || h.endsWith("threads.com")) return P.THREADS;
    return null;
  }

  // ─── Generic Helpers ──────────────────────────────────────────────────────

  function $(...sels) {
    for (const s of sels) {
      try { const el = document.querySelector(s); if (el) return el; } catch (_) {}
    }
    return null;
  }

  function $$(sel, root = document) {
    try { return [...root.querySelectorAll(sel)]; } catch (_) { return []; }
  }

  function txt(el)      { return el?.textContent?.trim() || null; }
  function attr(el, a)  { return el?.getAttribute(a)?.trim() || null; }
  function metaContent(sel) { return attr($(sel), "content") || ""; }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /**
   * Parse "12.3K", "148M", "1,234", "1.234.567", "1,2M", "148,123,456" → integer.
   * Returns null for anything that isn't a clean count. Zero is a valid count.
   */
  function parseCount(raw) {
    if (raw == null) return null;
    let s = String(raw).replace(/[\s\u00a0]/g, "");
    const suffix = (s.match(/[KkMmBb]$/) || [])[0]?.toLowerCase() ?? null;
    if (suffix) s = s.slice(0, -1);
    if (!/^\d[\d.,]*$/.test(s)) return null;

    let n;
    if (suffix) {
      // "1,2M" (comma decimal) → 1.2; "1,234K" → 1234
      n = parseFloat(s.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, ""));
    } else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
      // Grouped integer, either "1,234,567" or "1.234.567"
      n = parseInt(s.replace(/[.,]/g, ""), 10);
    } else {
      n = parseFloat(s.replace(/,/g, ""));
    }

    const mult = suffix === "b" ? 1e9 : suffix === "m" ? 1e6 : suffix === "k" ? 1e3 : 1;
    n *= mult;
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  // Count token followed by a keyword. The keyword may be glued to the suffix
  // because textContent concatenates sibling spans ("148Mfollowers").
  const NUM = "(\\d[\\d.,]*\\s?[KkMmBb]?)";

  function countBeforeKeyword(keywords, { anchored = false } = {}) {
    const kw = keywords.map(escapeRe).join("|");
    const body = `${NUM}\\s*(?:${kw})\\b`;
    return new RegExp(anchored ? `^\\s*${body}\\s*$` : body, "i");
  }

  function keywordBeforeCount(keywords) {
    const kw = keywords.map(escapeRe).join("|");
    return new RegExp(`^\\s*(?:${kw})\\s*:?\\s*${NUM}\\s*$`, "i");
  }

  function matchCount(text, re) {
    if (!text) return null;
    const m = text.match(re);
    return m ? parseCount(m[1]) : null;
  }

  function bareHandle(handle) {
    return (handle || "").replace(/^@/, "").toLowerCase();
  }

  // ─── Strategy runner ──────────────────────────────────────────────────────

  /**
   * Runs `attempts` in order and returns the first non-null value along with
   * the name of the strategy that produced it.
   */
  function resolveField(field, attempts) {
    for (const [name, fn] of attempts) {
      let v = null;
      try { v = fn(); }
      catch (err) { warn(`${field} ✗ ${name} threw`, err); continue; }
      log(`${field} ${v != null ? "✓" : "·"} ${name} →`, v);
      if (v != null) return { value: v, source: name };
    }
    return { value: null, source: null };
  }

  // ─── Strategy A: meta tags ────────────────────────────────────────────────

  function readMeta() {
    const meta = {
      ogDescription: metaContent('meta[property="og:description"]'),
      description:   metaContent('meta[name="description"]'),
      ogTitle:       metaContent('meta[property="og:title"]'),
      ogUrl:         metaContent('meta[property="og:url"]'),
      title:         document.title || "",
    };
    log("meta tags:", meta);
    return meta;
  }

  /**
   * Meta tags are rendered once by the server and are frequently NOT updated
   * on client-side navigation, so only trust them when they name this handle.
   */
  function metaIsForHandle(meta, handle) {
    const h = bareHandle(handle);
    if (!h) return false;
    const haystack = [meta.ogUrl, meta.ogTitle, meta.ogDescription, meta.description]
      .join(" ")
      .toLowerCase();
    const ok = haystack.includes(h);
    if (!ok) warn(`meta tags don't mention "${h}" – likely stale after SPA navigation, ignoring`);
    return ok;
  }

  function fromMeta(meta, trusted, keywords) {
    if (!trusted) return null;
    const re = countBeforeKeyword(keywords);
    return matchCount(meta.ogDescription, re) ?? matchCount(meta.description, re);
  }

  // ─── Strategy B: DOM ──────────────────────────────────────────────────────

  function findRoots(selectors) {
    const roots = [];
    for (const sel of selectors) {
      for (const el of $$(sel)) if (!roots.includes(el)) roots.push(el);
    }
    log("DOM roots:", selectors.map((s) => `${s} ×${$$(s).length}`).join(", ") || "(none)");
    return roots;
  }

  function isVisible(el) {
    return !!(el.offsetParent || el.getClientRects().length);
  }

  /** aria-label / title attributes like "12,345 followers". */
  function scanAttributes(roots, keywords) {
    const re = countBeforeKeyword(keywords);
    for (const root of roots) {
      for (const el of $$("[aria-label], [title]", root)) {
        for (const a of ["aria-label", "title"]) {
          const v = el.getAttribute(a);
          if (!v || v.length > 80) continue;
          const n = matchCount(v, re);
          if (n != null) { log(`  matched [${a}="${v}"]`, el); return n; }
        }
      }
    }
    return null;
  }

  /**
   * Short visible elements whose entire text is "[count] [keyword]" (or
   * "[keyword] [count]"). If a descendant carries the exact number in a
   * `title` attribute (Instagram does this for followers) and it agrees with
   * the abbreviated display value, prefer the exact number.
   */
  function scanText(roots, keywords) {
    const reA = countBeforeKeyword(keywords, { anchored: true });
    const reB = keywordBeforeCount(keywords);
    const sel = "a, button, li, span, div, strong, p, h2, h3, yt-formatted-string";
    for (const root of roots) {
      for (const el of $$(sel, root)) {
        const t = el.textContent;
        if (!t || t.length > 60) continue;
        const shown = matchCount(t, reA) ?? matchCount(t, reB);
        if (shown == null || !isVisible(el)) continue;

        const precise = $$("[title]", el)
          .map((e) => parseCount(e.getAttribute("title")))
          .find((n) => n != null && (shown === 0 || Math.abs(n - shown) / shown < 0.5));

        log(`  matched text "${t.trim()}"${precise != null ? ` (title=${precise})` : ""}`, el);
        return precise ?? shown;
      }
    }
    return null;
  }

  function fromSelector(selector) {
    const el = $(selector);
    log(`  querySelector(${selector}) →`, el ? `"${txt(el)}"` : null);
    return el ? parseCount(txt(el)) : null;
  }

  // ─── Instagram ────────────────────────────────────────────────────────────

  const IG_RESERVED = new Set([
    "explore", "reels", "reel", "p", "direct", "accounts", "stories", "tv",
    "about", "legal", "developer", "challenge", "emails", "session",
  ]);

  function extractInstagram() {
    const first = window.location.pathname.split("/").filter(Boolean)[0];
    if (!first || IG_RESERVED.has(first.toLowerCase())) {
      log(`not a profile path (${window.location.pathname})`);
      return null;
    }
    const handle = `@${first}`;
    const meta = readMeta();
    const trusted = metaIsForHandle(meta, handle);
    const roots = findRoots(["main header", "header"]);

    // og:title / document.title: "Name (@handle) • Instagram photos and videos"
    const nameFrom = (s) => s.match(/^(.+?)\s*\(@/)?.[1]?.trim() || null;
    const name =
      (trusted && nameFrom(meta.ogTitle)) ||
      nameFrom(meta.title) ||
      txt($("header h2", "header h1"));

    const avatar = attr($("header img[alt]", "header section img"), "src");

    // The followers link carries the exact count in span[title]; meta is rounded ("5.6M").
    const followers = resolveField("followersCount", [
      ["dom:followers-link", () => {
        const link = $(`a[href="/${first}/followers/"]`, 'header a[href$="/followers/"]');
        if (!link) return null;
        const exact = parseCount(attr(link.querySelector("[title]"), "title"));
        return exact ?? matchCount(txt(link), countBeforeKeyword(["followers", "follower"]));
      }],
      ["meta:description",   () => fromMeta(meta, trusted, ["followers", "follower"])],
      ["dom:attributes",     () => scanAttributes(roots, ["followers", "follower"])],
      ["dom:text",           () => scanText(roots, ["followers", "follower"])],
    ]);

    const posts = resolveField("postsCount", [
      ["meta:description", () => fromMeta(meta, trusted, ["posts", "post"])],
      ["dom:text",         () => scanText(roots, ["posts", "post"])],
    ]);

    return build(P.INSTAGRAM, handle, name, avatar, followers, posts);
  }

  // ─── TikTok ───────────────────────────────────────────────────────────────

  /** TikTok's server-rendered state; stale after SPA navigation, so validated. */
  function readTikTokState(handle) {
    const h = bareHandle(handle);
    try {
      const rehydration = $("script#__UNIVERSAL_DATA_FOR_REHYDRATION__");
      if (rehydration) {
        const json = JSON.parse(rehydration.textContent || "{}");
        const info = json?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
        const id = info?.user?.uniqueId?.toLowerCase();
        log("TikTok rehydration userInfo:", info ? { uniqueId: id, stats: info.stats } : null);
        if (info && id === h) return { user: info.user, stats: info.stats };
        if (info) warn(`TikTok state is for "${id}", not "${h}" – ignoring`);
      }
      const sigi = $("script#SIGI_STATE");
      if (sigi) {
        const json = JSON.parse(sigi.textContent || "{}");
        const user  = Object.values(json?.UserModule?.users ?? {}).find((u) => u?.uniqueId?.toLowerCase() === h);
        const stats = user ? json.UserModule.stats?.[user.uniqueId] : null;
        log("TikTok SIGI_STATE user:", user ? { uniqueId: user.uniqueId, stats } : null);
        if (user) return { user, stats };
      }
    } catch (err) {
      warn("TikTok state parse failed", err);
    }
    return null;
  }

  function extractTikTok() {
    const m = window.location.pathname.match(/^\/@([^/?#]+)/);
    if (!m) { log(`not a profile path (${window.location.pathname})`); return null; }
    const handle = `@${decodeURIComponent(m[1])}`;
    const state = readTikTokState(handle);
    const meta = readMeta();
    const trusted = metaIsForHandle(meta, handle);
    const roots = findRoots(['[data-e2e="user-page"]', "main"]);

    // user-subtitle is the display name; user-title is the @handle
    const name =
      state?.user?.nickname ||
      txt($('[data-e2e="user-subtitle"]', 'h1[data-e2e="user-title"]', "h1"));

    const avatar =
      attr($('img[data-e2e="user-avatar"]', '[data-e2e="user-avatar"] img', ".tiktok-avatar img"), "src") ||
      state?.user?.avatarLarger ||
      null;

    const followers = resolveField("followersCount", [
      ["json:stats.followerCount", () => state?.stats?.followerCount ?? null],
      ["dom:data-e2e",             () => fromSelector('[data-e2e="followers-count"]')],
      ["meta:description",         () => fromMeta(meta, trusted, ["followers", "follower", "fans"])],
      ["dom:text",                 () => scanText(roots, ["followers", "follower", "fans"])],
    ]);

    // TikTok doesn't render a video count in the DOM; only the embedded state has it.
    const posts = resolveField("postsCount", [
      ["json:stats.videoCount", () => state?.stats?.videoCount ?? null],
      ["dom:text",              () => scanText(roots, ["videos", "video"])],
    ]);

    return build(P.TIKTOK, handle, name, avatar, followers, posts);
  }

  // ─── YouTube ──────────────────────────────────────────────────────────────

  /**
   * ytInitialData from the initial page load. Validated against the channel in
   * the URL because YouTube is an SPA and never replaces this script.
   */
  function readYtInitialData(handle) {
    const script = $$("script").find((s) => s.textContent?.includes("var ytInitialData"));
    if (!script) { log("ytInitialData script not found"); return null; }
    const src = script.textContent;
    const vanity = src.match(/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/(@[^"]+)"/)?.[1];
    const external = src.match(/"externalId":"(UC[^"]+)"/)?.[1];
    const h = bareHandle(handle);
    const ok = [bareHandle(vanity), (external || "").toLowerCase()].includes(h);
    log("ytInitialData channel:", { vanity, external, matchesUrl: ok });
    return ok ? src : null;
  }

  function extractYouTube() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    let handle = null;
    if (parts[0]?.startsWith("@")) handle = decodeURIComponent(parts[0]);
    else if (["channel", "c", "user"].includes(parts[0])) handle = parts[1] ?? null;
    if (!handle) { log(`not a channel path (${window.location.pathname})`); return null; }

    // Previously visited pages stay in the DOM as hidden <ytd-browse> elements.
    const roots = findRoots([
      "ytd-browse:not([hidden]) yt-page-header-renderer",
      "ytd-browse:not([hidden]) #page-header",
      "ytd-browse:not([hidden]) ytd-c4-tabbed-header-renderer",
      "ytd-browse:not([hidden]) #channel-header",
    ]);
    const header = roots[0] ?? null;
    const initial = readYtInitialData(handle);

    const name =
      txt(header?.querySelector("h1, #channel-name yt-formatted-string, #channel-name")) ||
      txt($("ytd-browse:not([hidden]) #channel-name yt-formatted-string")) ||
      document.title.replace(/\s*-\s*YouTube\s*$/, "").trim() ||
      null;

    const avatar = attr(
      header?.querySelector("yt-avatar-shape img, #avatar img, yt-img-shadow img") ??
        $("ytd-browse:not([hidden]) #avatar img"),
      "src"
    );

    const fromInitial = (keywords) => {
      if (!initial) return null;
      const kw = keywords.map(escapeRe).join("|");
      const re = new RegExp(`"(?:content|simpleText|label)":"${NUM}\\s*(?:${kw})"`, "i");
      return matchCount(initial, re);
    };

    const followers = resolveField("followersCount", [
      ["dom:#subscriber-count", () => fromSelector("ytd-browse:not([hidden]) #subscriber-count")],
      ["dom:attributes",        () => scanAttributes(roots, ["subscribers", "subscriber"])],
      ["dom:text",              () => scanText(roots, ["subscribers", "subscriber"])],
      ["json:ytInitialData",    () => fromInitial(["subscribers", "subscriber"])],
    ]);

    const posts = resolveField("postsCount", [
      ["dom:#videos-count",  () => fromSelector("ytd-browse:not([hidden]) #videos-count")],
      ["dom:text",           () => scanText(roots, ["videos", "video"])],
      ["json:ytInitialData", () => fromInitial(["videos", "video"])],
    ]);

    return build(P.YOUTUBE, handle, name, avatar, followers, posts);
  }

  // ─── Threads ──────────────────────────────────────────────────────────────

  function extractThreads() {
    const m = window.location.pathname.match(/^\/@([^/?#]+)/);
    if (!m) { log(`not a profile path (${window.location.pathname})`); return null; }
    const handle = `@${decodeURIComponent(m[1])}`;
    const meta = readMeta();
    const trusted = metaIsForHandle(meta, handle);
    const roots = findRoots(["main", "body"]);

    // og:title: "Name (@handle) • Threads, Say more"
    const name =
      (trusted && meta.ogTitle.match(/^(.+?)\s*\(@/)?.[1]?.trim()) ||
      txt($('h1[data-pressable-container="true"]', "h1"));

    const avatar = attr($('img[data-testid="user-avatar"]', `img[alt*="${bareHandle(handle)}"]`, "header img"), "src");

    const followers = resolveField("followersCount", [
      ["meta:description", () => fromMeta(meta, trusted, ["followers", "follower"])],
      ["dom:attributes",   () => scanAttributes(roots, ["followers", "follower"])],
      ["dom:text",         () => scanText(roots, ["followers", "follower"])],
    ]);

    // Threads doesn't show a post count in the UI; the meta description sometimes does.
    const posts = resolveField("postsCount", [
      ["meta:description", () => fromMeta(meta, trusted, ["threads", "posts"])],
    ]);

    return build(P.THREADS, handle, name, avatar, followers, posts);
  }

  // ─── Result shape ─────────────────────────────────────────────────────────

  function build(platform, handle, name, avatar, followers, posts) {
    return {
      platform,
      handle,
      name: name || null,
      avatar: avatar || null,
      followersCount: followers.value,
      postsCount: posts.value,
      sources: { followersCount: followers.source, postsCount: posts.source },
    };
  }

  // ─── Entry Point ──────────────────────────────────────────────────────────

  let pass = 0;

  function extractCreatorData() {
    const platform = detectPlatform();
    if (!platform) return null;
    pass += 1;
    group(`extract pass #${pass} – ${platform} – ${window.location.href}`);
    try {
      switch (platform) {
        case P.INSTAGRAM: return extractInstagram();
        case P.TIKTOK:    return extractTikTok();
        case P.YOUTUBE:   return extractYouTube();
        case P.THREADS:   return extractThreads();
        default:          return null;
      }
    } catch (err) {
      console.error("[Duolync] extraction error:", err);
      return null;
    } finally {
      groupEnd();
    }
  }

  function merge(prev, next) {
    if (!prev) return next;
    if (!next || next.handle !== prev.handle) return next ?? prev;
    const out = { ...prev, sources: { ...prev.sources } };
    for (const k of ["name", "avatar"]) if (next[k] != null) out[k] = next[k];
    for (const k of ["followersCount", "postsCount"]) {
      if (next[k] != null) { out[k] = next[k]; out.sources[k] = next.sources[k]; }
    }
    return out;
  }

  // ─── Strategy C: wait for async-rendered stats ────────────────────────────

  /**
   * Resolves immediately if both stats are present. Otherwise watches the DOM
   * and re-extracts (throttled) until both are found. Once followers are found
   * but posts are still missing, waits at most `postsGraceMs` more, since some
   * platforms never expose a post count.
   */
  function extractWhenReady(timeoutMs = 5000, postsGraceMs = 1500) {
    return new Promise((resolve) => {
      const started = performance.now();
      let best = extractCreatorData();

      const complete = (d) => d && d.followersCount != null && d.postsCount != null;
      if (!best || !best.handle || complete(best)) {
        log("result (immediate):", best);
        resolve(best);
        return;
      }

      let done = false;
      let scheduled = false;
      let graceTimer = null;

      const finish = (reason) => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(deadline);
        clearTimeout(graceTimer);
        log(`result (${reason} after ${Math.round(performance.now() - started)}ms):`, best);
        resolve(best);
      };

      const startGraceIfFollowersKnown = () => {
        if (best?.followersCount != null && !graceTimer) {
          graceTimer = setTimeout(() => finish("posts grace elapsed"), postsGraceMs);
        }
      };

      const run = () => {
        scheduled = false;
        if (done) return;
        best = merge(best, extractCreatorData());
        if (complete(best)) finish("complete");
        else startGraceIfFollowersKnown();
      };

      // Throttle rather than debounce: YouTube/TikTok mutate continuously, so a
      // debounce might never fire.
      const observer = new MutationObserver(() => {
        if (!scheduled) { scheduled = true; setTimeout(run, 250); }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["title", "aria-label", "content"],
      });
      log(`stats incomplete – observing DOM for up to ${timeoutMs}ms`);

      const deadline = setTimeout(() => finish("timeout"), timeoutMs);
      startGraceIfFollowersKnown();
    });
  }

  // ─── Message Bridge ───────────────────────────────────────────────────────
  //
  // The popup re-injects this file via chrome.scripting.executeScript, so the
  // IIFE can run more than once in the same isolated world. Replace any earlier
  // listener instead of stacking duplicates.

  function onMessage(msg, _sender, respond) {
    if (msg?.type !== "DUOLYNC_GET_CREATOR") return false;
    extractWhenReady(msg.timeoutMs)
      .then((data) => respond({ success: true, data }))
      .catch((err) => {
        console.error("[Duolync] extraction failed:", err);
        respond({ success: false, error: String(err) });
      });
    return true;
  }

  try {
    if (window.__duolyncOnMessage) chrome.runtime.onMessage.removeListener(window.__duolyncOnMessage);
  } catch (_) {}
  window.__duolyncOnMessage = onMessage;
  chrome.runtime.onMessage.addListener(onMessage);
  log("content script ready on", window.location.hostname);
})();
