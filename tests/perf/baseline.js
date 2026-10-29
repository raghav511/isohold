// Speed baseline for Isohold. Measures only; it never changes the app.
//
//   cd tests && node perf/baseline.js                    # everything (about 25 min incl. the 10-minute memory loop)
//   node perf/baseline.js --only=bundle,load,actions,scale,ai,memory --runs=5 --mem-minutes=10 > out.json
//
// Prints one JSON object on stdout; progress goes to stderr.
// Profiles: "mid" = Chromium Pixel 7, CPU 4x, Fast 4G (150 ms, 1.6 Mbps down, 750 kbps up)
//           "budget" = Chromium Pixel 7, CPU 6x, Slow 3G (400 ms, 400 kbps both ways)
//           "iphone" = WebKit iPhone 13, no CPU or network shaping (Playwright WebKit can't do either)
// Ports 8910 (plain files) and 8911 (gzip, like GitHub Pages). Both send Cache-Control max-age=600 and an ETag,
// and answer If-None-Match with 304, like GitHub Pages.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { open, ROOT } = require('../lib');
const SEED = require('../fixtures/seed-week4.json');

const ARGS = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const RUNS = +ARGS.runs || 5, MEM_MIN = ARGS['mem-minutes'] !== undefined ? +ARGS['mem-minutes'] : 10;
const ONLY = ARGS.only ? String(ARGS.only).split(',') : ['bundle', 'load', 'actions', 'scale', 'ai', 'memory'];
const PROFILES = ARGS.profiles ? String(ARGS.profiles).split(',') : ['mid', 'budget', 'iphone'];
const log = (...a) => console.error('[perf]', ...a);
const PORT_RAW = 8910, PORT_GZ = 8911;

const PROFILE = {
  mid: { kind: 'android', cpu: 4, net: { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 } },
  budget: { kind: 'android', cpu: 6, net: { offline: false, latency: 400, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 } },
  iphone: { kind: 'iphone', cpu: 1, net: null }
};

// ---------- stats ----------
function q(xs, p) { const s = xs.filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(1); }
const stat = xs => ({ median: q(xs, 0.5), p90: q(xs, 0.9), n: xs.filter(x => typeof x === 'number' && isFinite(x)).length });
function statsOf(rows) { const keys = new Set(); rows.forEach(r => Object.keys(r).forEach(k => typeof r[k] === 'number' && keys.add(k))); const o = {}; keys.forEach(k => o[k] = stat(rows.map(r => r[k]))); return o; }

// ---------- server ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
function serve(port, gzip) {
  const cache = {}, stats = { reqs: [] };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || p.startsWith('/tests') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    if (!cache[f]) { const raw = fs.readFileSync(f); cache[f] = { raw, gz: zlib.gzipSync(raw, { level: 6 }), etag: '"' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 20) + '"', mtime: fs.statSync(f).mtime.toUTCString() }; }
    const c = cache[f], ext = path.extname(f), useGz = gzip && ext !== '.png' && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=600', 'ETag': c.etag, 'Last-Modified': c.mtime, 'Access-Control-Allow-Origin': '*' };
    if (gzip) h.Vary = 'Accept-Encoding';
    if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, h); res.end(); stats.reqs.push({ t: Date.now(), p, status: 304, bytes: 0 }); return; }
    const body = useGz ? c.gz : c.raw; if (useGz) h['Content-Encoding'] = 'gzip'; h['Content-Length'] = body.length;
    res.writeHead(200, h); res.end(body); stats.reqs.push({ t: Date.now(), p, status: 200, bytes: body.length });
  });
  return new Promise(r => srv.listen(port, () => r({ srv, stats, port, url: `http://localhost:${port}/index.html` })));
}

// ---------- page instrumentation (init script, runs before the app) ----------
// __perf: long tasks, LCP, event timing; __lat: input-to-next-paint (event timestamp -> rAF -> setTimeout after the app's handlers)
const INSTRUMENT = (cfg) => {
  if (window.__perf) return;
  const P = window.__perf = { lt: [], ev: [], lcp: null };
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.lt.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]))).observe({ type: 'longtask', buffered: true }); } catch (e) { }
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.lcp = e.startTime)).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { }
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.ev.push([e.name, e.startTime, e.duration]))).observe({ type: 'event', buffered: true, durationThreshold: 16 }); } catch (e) { }
  const L = window.__lat = { armed: null, res: null, lastDown: 0, lastKey: 0, arm(type) { L.armed = type; L.res = null; L.armAt = performance.now(); } };
  addEventListener('pointerdown', e => { L.lastDown = e.timeStamp; }, true);
  addEventListener('mousedown', e => { if (!L.lastDown || e.timeStamp - L.lastDown > 1000) L.lastDown = e.timeStamp; }, true);
  addEventListener('keydown', e => { L.lastKey = e.timeStamp; }, true);
  ['click', 'keydown', 'input'].forEach(type => addEventListener(type, e => {
    if (L.armed !== type) return; L.armed = null;
    const start = type === 'click' ? (L.lastDown && L.lastDown >= L.armAt - 5 ? L.lastDown : e.timeStamp) : type === 'input' ? (L.lastKey >= L.armAt - 5 ? L.lastKey : e.timeStamp) : e.timeStamp;
    requestAnimationFrame(() => setTimeout(() => { L.res = { start, paint: +(performance.now() - start).toFixed(1), end: performance.now() }; }, 0));
  }, true));
  // load probe: at the first free task after the app booted, tap the first tab (Today) and time until that tap is painted
  if (cfg && cfg.probe) {
    const poll = () => {
      const b = document.getElementById('tab-train');
      if (window.__isoholdReady && b) {
        const t0 = performance.now(); b.click();
        requestAnimationFrame(() => setTimeout(() => { P.usable = performance.now(); P.probeTap = P.usable - t0; P.probeOk = !document.getElementById('train').hidden; }, 0));
      } else setTimeout(poll, 10);
    };
    setTimeout(poll, 0);
  }
};

// state injection: localStorage like a real returning user; falls back to __ISOHOLD_STATE when the state is over the storage quota
const STATE_INIT = s => { try { if (!localStorage.getItem('isohold.v1')) localStorage.setItem('isohold.v1', s); } catch (e) { window.__perfQuota = String(e && e.name); window.__ISOHOLD_STATE = JSON.parse(s); } };

async function launch(profName, { state, sw = false, probe = false, extraInit, before } = {}) {
  const pf = PROFILE[profName];
  const o = await open(pf.kind, { sw, before: async ctx => { await ctx.addInitScript(INSTRUMENT, { probe }); if (state) await ctx.addInitScript(STATE_INIT, JSON.stringify(state)); if (extraInit) await ctx.addInitScript(extraInit); if (before) await before(ctx); } });
  o.pf = pf; o.prof = profName;
  return o;
}
async function shape(o, page) {
  if (o.pf.kind !== 'android') return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.pf.cpu });
  if (o.pf.net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', o.pf.net); }
  return cdp;
}
async function boot(o, url, page = o.page) { await page.goto(url, { timeout: 180e3 }); await page.waitForFunction(() => window.__isoholdReady, null, { timeout: 180e3, polling: 50 }); }

// ---------- trace summary (Chromium) ----------
function traceSummary(buf, port) {
  let ev; try { ev = JSON.parse(buf.toString()).traceEvents; } catch (e) { return null; }
  const evals = ev.filter(e => e.name === 'EvaluateScript' && e.ph === 'X' && JSON.stringify(e.args || {}).includes(':' + port));
  if (!evals.length) return null;
  const pid = evals[0].pid, tid = evals[0].tid;
  const main = ev.filter(e => e.pid === pid && e.tid === tid && e.ph === 'X' && typeof e.dur === 'number');
  const sum = n => +(main.filter(e => e.name === n).reduce((a, e) => a + e.dur, 0) / 1000).toFixed(1);
  const longest = n => +(Math.max(0, ...main.filter(e => e.name === n).map(e => e.dur)) / 1000).toFixed(1);
  const tasks = main.filter(e => e.name === 'RunTask' && e.dur > 50e3).map(e => +(e.dur / 1000).toFixed(1));
  const bg = ev.filter(e => e.pid === pid && e.tid !== tid && /^v8\.(parseOnBackground|compileOnBackground)|V8.*Background/i.test(e.name) && e.ph === 'X');
  return {
    evaluateScriptMs: sum('EvaluateScript'), longestEvaluateScriptMs: longest('EvaluateScript'),
    v8CompileMs: sum('v8.compile') || sum('V8.CompileCode'), v8CompileModuleMs: sum('v8.compileModule'),
    parseHtmlMs: sum('ParseHTML'), parseStylesheetMs: sum('ParseAuthorStyleSheet'), styleRecalcMs: sum('UpdateLayoutTree'), layoutMs: sum('Layout'), paintMs: sum('Paint'),
    bgParseCompileMs: +(bg.reduce((a, e) => a + (e.dur || 0), 0) / 1000).toFixed(1),
    longTasksTrace: tasks.length, longTasksTraceMs: +tasks.reduce((a, b) => a + b, 0).toFixed(1), longestTaskTraceMs: tasks.length ? Math.max(...tasks) : 0
  };
}

// ---------- 5. bundle ----------
function bundle() {
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), B = s => Buffer.byteLength(s);
  const gz = s => zlib.gzipSync(Buffer.from(s), { level: 6 }).length, br = s => zlib.brotliCompressSync(Buffer.from(s), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  const sz = s => ({ raw: B(s), gzip: gz(s), brotli: br(s) });
  const styles = [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]), scripts = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const css = styles.join('\n'), fontRx = /@font-face\{[^}]*\}/g, fonts = (css.match(fontRx) || []).join('\n'), cssNoFont = css.replace(fontRx, '');
  const fontBin = [...fonts.matchAll(/base64,([A-Za-z0-9+/=]+)/g)].reduce((a, m) => a + Buffer.from(m[1], 'base64').length, 0);
  const js = scripts.join('\n'), markup = h.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const markupSvg = (markup.match(/<svg[\s\S]*?<\/svg>/g) || []).join('');
  // JS: top-level declarations whose value is an object/array/string literal are "data"; the rest is code
  const main = scripts.reduce((a, b) => (b.length > a.length ? b : a), ''), lines = main.split('\n'), blocks = []; let cur = null;
  lines.forEach(l => { const m = /^ {0,2}(?:var|const|let|function) ([\w$]+)\s*(=\s*(.))?/.exec(l); if (m) { cur = { n: m[1], data: !!m[3] && /[{["'`]/.test(m[3]), txt: [] }; blocks.push(cur); } if (cur) cur.txt.push(l); });
  const dataBlocks = blocks.filter(b => b.data).map(b => ({ n: b.n, s: b.txt.join('\n') })).sort((a, b) => B(b.s) - B(a.s));
  const dataTxt = dataBlocks.map(b => b.s).join('\n');
  const svgInJs = (main.match(/<svg[\s\S]*?<\/svg>/g) || []).join('');
  const named = re => dataBlocks.filter(b => re.test(b.n)).map(b => b.s).join('\n');
  const files = ['sw.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'].map(f => { const s = fs.readFileSync(path.join(ROOT, f)); return { file: f, raw: s.length, gzip: /png$/.test(f) ? s.length : zlib.gzipSync(s).length }; });
  const swList = /F = \[([^\]]*)\]/.exec(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'))[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ''));
  const swCacheRaw = swList.reduce((a, f) => a + fs.statSync(path.join(ROOT, f === './' ? 'index.html' : f)).size, 0);
  return {
    indexHtml: sz(h),
    css: { all: sz(css), withoutFonts: sz(cssNoFont) },
    fonts: { asBase64InCss: sz(fonts), decodedWoff2Bytes: fontBin, faces: (fonts.match(/@font-face/g) || []).length },
    js: { all: sz(js), mainScript: sz(main), dataLiterals: sz(dataTxt), codeOnly: sz(lines.slice(0, blocks.length ? lines.indexOf(blocks[0].txt[0]) : lines.length).join('\n') + blocks.filter(b => !b.data).map(b => b.txt.join('\n')).join('\n')), svgStringsInJs: sz(svgInJs),
      exerciseData: sz(named(/^(EX|EQTX|EQTX_NEW|EQTX_GYM|EQV|GYM|GROW|PRE|EVID|REFS)$/)), foods: sz(named(/^(FOODS|ES|ES_LIFT|LIFTNAME)$/)),
      topDataBlocks: dataBlocks.slice(0, 15).map(b => ({ name: b.n, raw: B(b.s), gzip: gz(b.s) })) },
    markup: { all: sz(markup), inlineSvg: sz(markupSvg) },
    otherFiles: files,
    swPrecache: { entries: swList, rawBytes: swCacheRaw, note: './ and index.html are cached as two separate entries, so index.html is stored twice' }
  };
}

// ---------- 1. first load ----------
async function loadRun(profName, port, run) {
  const S = SERVERS[port], url = S.url, isCr = PROFILE[profName].kind === 'android';
  const o = await launch(profName, { state: SEED, sw: true, probe: true });
  const out = {};
  const one = async (page, label) => {
    const cdp = await shape(o, page);
    if (isCr) await o.b.startTracing(page, { categories: ['devtools.timeline', 'v8', 'disabled-by-default-devtools.timeline', 'loading'] });
    const r0 = S.stats.reqs.length, t0 = Date.now();
    await page.goto(url, { timeout: 240e3, waitUntil: 'commit' });
    await page.waitForFunction(() => window.__perf && window.__perf.usable, null, { timeout: 240e3, polling: 50 });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => { const nav = performance.getEntriesByType('navigation')[0] || {}, fcp = performance.getEntriesByName('first-contentful-paint')[0]; const P = window.__perf, lt = P.lt.filter(x => x[0] < P.usable + 500);
      return { fcp: fcp ? fcp.startTime : null, lcp: P.lcp, domContentLoaded: nav.domContentLoadedEventEnd || null, load: nav.loadEventEnd || null, ready: window.__isoholdReady, usable: P.usable, probeTap: P.probeTap, probeOk: P.probeOk,
        longTasks: lt.length, longTaskMs: lt.reduce((a, x) => a + x[1], 0), longestTask: lt.reduce((a, x) => Math.max(a, x[1]), 0), swControlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller), quota: window.__perfQuota || null }; });
    const usableWall = t0 + m.usable;
    // let the service worker finish installing so the precache downloads are counted (cold) or the background refresh (warm)
    await page.evaluate(() => navigator.serviceWorker && Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 60e3))])).catch(() => {});
    for (let i = 0; i < 240; i++) { const last = S.stats.reqs[S.stats.reqs.length - 1]; if (S.stats.reqs.length > r0 && Date.now() - last.t > 2500) break; if (Date.now() - t0 > 240e3) break; await page.waitForTimeout(500); }
    const reqs = S.stats.reqs.slice(r0);
    m.bytesUntilUsable = reqs.filter(r => r.t <= usableWall + 100).reduce((a, r) => a + r.bytes, 0);
    m.bytesTotal = reqs.reduce((a, r) => a + r.bytes, 0);
    m.requests = reqs.length; m.requests304 = reqs.filter(r => r.status === 304).length;
    m.indexHtmlDownloads = reqs.filter(r => (r.p === '/index.html') && r.status === 200).length;
    if (isCr) { const buf = await o.b.stopTracing(); Object.assign(m, traceSummary(buf, port) || {}); }
    if (run === 0 && label === 'warm') m.cacheStorage = await page.evaluate(async () => { let n = 0, bytes = 0; for (const k of await caches.keys()) { const c = await caches.open(k); for (const rq of await c.keys()) { const r = await c.match(rq); bytes += (await r.blob()).size; n++; } } const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : {}; return { entries: n, bytes, storageUsage: est.usage || null }; }).catch(e => ({ error: String(e) }));
    if (cdp) await cdp.detach().catch(() => {});
    return m;
  };
  try {
    out.cold = await one(o.page, 'cold');
    await o.page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready).catch(() => {});
    await o.page.close();
    const p2 = await o.ctx.newPage();
    out.warm = await one(p2, 'warm');
  } catch (e) { out.error = String(e).slice(0, 300); }
  out.errs = o.errs.slice(0, 5);
  await o.b.close();
  return out;
}
async function loads() {
  const res = {};
  for (const prof of PROFILES) for (const [enc, port] of [['gzip', PORT_GZ], ['raw', PORT_RAW]]) {
    const key = prof + '/' + enc, rows = [];
    for (let i = 0; i < RUNS; i++) { log('load', key, 'run', i + 1); rows.push(await loadRun(prof, port, i)); }
    res[key] = { cold: statsOf(rows.map(r => r.cold || {})), warm: statsOf(rows.map(r => r.warm || {})), cacheStorage: (rows[0].warm || {}).cacheStorage, swControlledWarm: rows.map(r => r.warm && r.warm.swControlled), probeOk: rows.map(r => r.cold && r.cold.probeOk), errors: rows.map(r => r.error).filter(Boolean), pageErrors: rows.flatMap(r => r.errs || []).slice(0, 5) };
  }
  return res;
}

// ---------- action helpers ----------
// Search & log and the Guide have no tab button (hidden); they open from Search / Help in the top bar of the tab you're on.
const SEARCH = 'section.view:not([hidden]) .view-head [data-tool="search"]', HELP = 'section.view:not([hidden]) .view-head [data-tool="help"]', PROFILE_BTN = 'section.view:not([hidden]) .view-head :is(#profBtn,[data-tool="profile"])';
async function measure(page, type, doIt, settle = 400) {
  await page.evaluate(t => window.__lat.arm(t), type);
  const armAt = await page.evaluate(() => window.__lat.armAt);
  await doIt();
  const r = await page.waitForFunction(() => window.__lat.res, null, { timeout: 20e3, polling: 20 }).then(h => h.jsonValue());
  await page.waitForTimeout(settle);
  const extra = await page.evaluate(([a, s]) => { const P = window.__perf, lt = P.lt.filter(x => x[0] >= a - 5 && x[0] <= s.end + 300), ev = P.ev.filter(x => x[1] >= a - 5); return { longTasks: lt.length, longTaskMs: +lt.reduce((x, y) => x + y[1], 0).toFixed(1), longestTask: lt.reduce((x, y) => Math.max(x, y[1]), 0), eventTiming: ev.length ? Math.max(...ev.map(x => x[2])) : null }; }, [armAt, r]);
  return { inp: r.paint, ...extra };
}
const tap = (page, sel) => measure(page, 'click', () => page.click(sel, { timeout: 30e3 }));
async function typeEach(page, sel, text) { await page.click(sel); const per = []; for (const ch of text) per.push(await measure(page, 'input', () => page.keyboard.type(ch), 60)); return per; }
async function enterText(page, text) { await page.fill('#cIn', text); return measure(page, 'keydown', () => page.keyboard.press('Enter'), 600); }

// ---------- 2. user actions ----------
async function actionsRun(prof, state) {
  const o = await launch(prof, { state }); const page = o.page; await shape(o, page);
  await boot(o, SERVERS[PORT_GZ].url); await page.waitForTimeout(1500);
  const A = {}, put = (k, v) => { A[k] = v; };
  const tryA = async (k, fn) => { const ts = Date.now(); try { const v = await fn(); if (ARGS.debug) log('  ', k, JSON.stringify(v), Date.now() - ts, 'ms'); if (v) put(k, v); } catch (e) { A[k] = { error: String(e).split('\n')[0].slice(0, 160) }; if (ARGS.debug) log('  ERR', k, A[k].error); } };
  await tryA('Open Exercises tab (first time)', () => tap(page, '#tab-exercises'));
  await tryA('Open exercise sheet (Goblet squat)', () => tap(page, '#lib [data-ex="goblet-squat"]'));
  await tryA('Close exercise sheet', () => tap(page, '#sheetClose'));
  await tryA('Open Search & log (top-bar Search)', () => tap(page, SEARCH));
  await tryA('Search typing (per key, "squat")', async () => { const per = await typeEach(page, '#cIn', 'squat'); A['Search typing, worst key of "squat"'] = per.reduce((a, b) => (b.inp > a.inp ? b : a)); return per[0]; });
  delete A['Search typing (per key, "squat")'];
  await page.fill('#cIn', ''); await page.waitForTimeout(200);
  await tryA('Log a set by text (Enter)', () => enterText(page, '3 sets of 10 goblet squats at 20 kg'));
  await tryA('Log a meal by text (Enter)', () => enterText(page, '2 eggs and a bowl of oatmeal'));
  await tryA('Open Progress tab (Strength graph)', () => tap(page, '#tab-progress'));
  await tryA('Progress: Muscles (coverage map)', () => tap(page, '#pt-muscles'));
  await tryA('Progress: Strength graph', () => tap(page, '#pt-strength'));
  await tryA('Progress: Body', () => tap(page, '#pt-body'));
  await tryA('Open Help (Guide)', () => tap(page, HELP));
  await page.click('#sheetClose', { timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300);
  await tryA('Open Today tab', () => tap(page, '#tab-train'));
  await tryA('Open Profile', () => tap(page, PROFILE_BTN));
  await tryA('Profile: Backup tab', () => tap(page, '#pfTab-backup'));
  await tryA('Restore a backup', async () => { await page.evaluate(() => { const c = document.getElementById('bkOut').value, i = document.getElementById('bkIn'); i.value = c; i.dispatchEvent(new Event('input', { bubbles: true })); }); return tap(page, '#bkRestore'); });
  await page.click('#sheetClose', { timeout: 2000 }).catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(300);
  await tryA('Open Today tab (after restore)', () => tap(page, '#tab-train'));
  await tryA('Start a session', () => tap(page, '#sessions [data-start]'));
  await tryA('Session: next step (1st)', () => tap(page, '#pSkip'));
  await tryA('Session: next step (2nd)', () => tap(page, '#pSkip'));
  await tryA('Session: next step (3rd)', () => tap(page, '#pSkip'));
  await tryA('End session (confirm)', async () => { await page.click('#pClose'); await page.waitForTimeout(200); return tap(page, '#pEndYes'); });
  A._errs = o.errs.slice(0, 5);
  await o.b.close();
  return A;
}
function agg(runs) {
  const keys = [...new Set(runs.flatMap(r => Object.keys(r)))].filter(k => k[0] !== '_'), out = {};
  keys.forEach(k => { const rows = runs.map(r => r[k]).filter(v => v && typeof v.inp === 'number'); const errs = runs.map(r => r[k] && r[k].error).filter(Boolean); out[k] = { inp: stat(rows.map(r => r.inp)), eventTiming: stat(rows.map(r => r.eventTiming)), longestTask: stat(rows.map(r => r.longestTask)), longTaskMs: stat(rows.map(r => r.longTaskMs)), errors: errs.slice(0, 2) }; });
  return out;
}
async function actions() {
  const runs = []; for (let i = 0; i < RUNS; i++) { log('actions mid run', i + 1); runs.push(await actionsRun('mid', SEED)); }
  const all = agg(runs), top5 = Object.entries(all).filter(([, v]) => v.inp.median != null).sort((a, b) => b[1].inp.median - a[1].inp.median).slice(0, 5).map(([k, v]) => ({ action: k, ...v }));
  return { profile: 'mid', all, top5, pageErrors: runs.flatMap(r => r._errs).slice(0, 5) };
}

// ---------- 3. data scaling ----------
const DAY = 864e5;
function oneX() {
  // seed-week4 has 654 logged sets, 3 notes, 4 weigh-ins and no meals; 1x adds four weeks of realistic meals and notes
  const s = JSON.parse(JSON.stringify(SEED)), end = Math.max(...s.log.map(l => l.t)), MEALS = [['Breakfast', [{ n: 'Oatmeal', q: 1, u: 'bowl', g: 250, p: 10, c: 54, f: 6, k: 300 }, { n: 'Egg', q: 2, u: '', g: 100, p: 13, c: 1, f: 10, k: 143 }]], ['Lunch', [{ n: 'Dal', q: 1, u: 'bowl', g: 200, p: 14, c: 30, f: 6, k: 230 }, { n: 'Rice', q: 1, u: 'cup', g: 150, p: 4, c: 42, f: 0.5, k: 195 }]], ['Dinner', [{ n: 'Chicken breast', q: 1, u: 'g', g: 150, p: 46, c: 0, f: 5, k: 250 }, { n: 'Salad', q: 1, u: 'bowl', g: 120, p: 2, c: 8, f: 4, k: 70 }]]];
  s.food = []; s.notes = s.notes || [];
  for (let d = 0; d < 28; d++) { const t = end - d * DAY; MEALS.forEach((m, i) => s.food.push({ t: t - (10 - i * 4) * 36e5, meal: m[0], items: m[1] })); if (d % 2 === 0) s.notes.push({ t: t - 2 * 36e5, k: 'cardio', m: 'Walking', min: 30 }); if (d % 3 === 0) s.notes.push({ t: t - 3 * 36e5, k: 'lift', name: 'Lat Pulldown', kg: 50, reps: 10, sets: 3 }); if (d % 7 === 0) s.body.push({ t: t - 13 * 36e5, kg: 70 + (d % 3) * 0.3 }); }
  s.food.sort((a, b) => a.t - b.t); s.notes.sort((a, b) => a.t - b.t); s.body.sort((a, b) => a.t - b.t);
  return s;
}
function scaled(n) {
  const b = oneX(), s = JSON.parse(JSON.stringify(b)), span = 28 * DAY;
  for (const k of ['log', 'food', 'notes', 'body']) { s[k] = []; for (let i = n - 1; i >= 0; i--) b[k].forEach(x => s[k].push(Object.assign({}, x, { t: x.t - i * span }, x.d ? { d: x.d - i * span } : {}))); }
  return s;
}
async function scaleRun(n, state) {
  const o = await launch('mid', { state }); const page = o.page; await shape(o, page);
  const t0 = Date.now(); await boot(o, SERVERS[PORT_GZ].url); const bootWall = Date.now() - t0;
  await page.waitForTimeout(1500);
  const R = { ready: await page.evaluate(() => window.__isoholdReady), bootWall };
  R.quota = await page.evaluate(() => window.__perfQuota || null);
  R.storeKB = await page.evaluate(() => Math.round(JSON.stringify(window.__isoTest.store()).length / 1024));
  R.covDone = await page.evaluate(() => { const xs = []; for (let i = 0; i < 5; i++) { const t = performance.now(); window.__isoTest.covDone(); xs.push(performance.now() - t); } xs.sort((a, b) => a - b); return +xs[2].toFixed(1); });
  R.dailyIdx = await page.evaluate(() => { const t = performance.now(); window.__isoTest.dailyIdx(); return +(performance.now() - t).toFixed(1); });
  const m = async (k, fn) => { try { const v = await fn(); R[k] = v.inp; R[k + ' longestTask'] = v.longestTask; } catch (e) { R[k + ' error'] = String(e).split('\n')[0].slice(0, 120); } };
  await m('open Search & log', () => tap(page, SEARCH));
  try { const per = await typeEach(page, '#cIn', 'squat'); R['search key worst'] = Math.max(...per.map(p => p.inp)); R['search key median'] = q(per.map(p => p.inp), 0.5); R['search key longestTask'] = Math.max(...per.map(p => p.longestTask)); } catch (e) { R['search error'] = String(e).slice(0, 120); }
  await page.fill('#cIn', ''); await page.waitForTimeout(300);
  await m('log text (Enter)', () => enterText(page, '3 sets of 10 goblet squats at 20 kg'));
  await m('tab Progress (Strength)', () => tap(page, '#tab-progress'));
  await m('Progress Muscles (coverage)', () => tap(page, '#pt-muscles'));
  await m('Progress Strength graph', () => tap(page, '#pt-strength'));
  await m('tab Today', () => tap(page, '#tab-train'));
  await m('open Profile', () => tap(page, PROFILE_BTN));
  await m('Profile Backup tab', () => tap(page, '#pfTab-backup'));
  R.backupCodeKB = await page.evaluate(() => Math.round(document.getElementById('bkOut').value.length / 1024));
  await m('restore backup', async () => { await page.evaluate(() => { const i = document.getElementById('bkIn'); i.value = document.getElementById('bkOut').value; i.dispatchEvent(new Event('input', { bubbles: true })); }); return tap(page, '#bkRestore'); });
  R.restoreMsg = await page.evaluate(() => (document.getElementById('bkMsg') || {}).textContent || '').then(s => s.slice(0, 120));
  R._errs = o.errs.slice(0, 3);
  await o.b.close();
  return R;
}
async function scale() {
  const out = {};
  for (const n of [1, 10, 100]) {
    const st = scaled(n), rows = [];
    for (let i = 0; i < RUNS; i++) { log('scale', n + 'x', 'run', i + 1); rows.push(await scaleRun(n, st)); }
    out[n + 'x'] = { data: { log: st.log.length, food: st.food.length, notes: st.notes.length, body: st.body.length, jsonKB: Math.round(JSON.stringify(st).length / 1024) }, quota: rows[0].quota, restoreMsg: rows[0].restoreMsg, metrics: statsOf(rows), errors: rows.flatMap(r => r._errs).slice(0, 3) };
  }
  return out;
}

// ---------- 4. AI streaming ----------
const AI_REPLY = 'Holds load the tendon steadily without the fast stretch-shorten cycle, so pain usually settles while the tendon still gets a strong signal to remodel. ' +
  'Think of it as heavy, slow, controlled work. **Five holds of 45 seconds** at a weight that feels like 7 out of 10 effort is a good start. ' +
  'Pain up to 3 out of 10 during the hold is fine if it settles by the next morning. If it climbs the next day, drop the weight a little, keep the time. ' +
  'Over 6 to 12 weeks most people can move from holds to slow heavy reps, then to faster, springier work. Keep going, and log how it feels after each session so the plan can adjust steadily.';
const AI_FETCH = (cfg) => {
  const words = cfg.reply.split(/(?<= )/), chunks = []; for (let i = 0; i < words.length; i += 8) chunks.push(words.slice(i, i + 8).join(''));
  const of = window.fetch;
  window.fetch = function (u, o) {
    const url = String(u && u.url || u);
    if (!/streamGenerateContent/.test(url)) return of.apply(this, arguments);
    const A = window.__ai = { call: performance.now(), chunks: [], n: chunks.length }, enc = new TextEncoder();
    return new Promise(resolve => setTimeout(() => {
      let i = 0;
      const stream = new ReadableStream({ start(c) { const push = () => { if (i >= chunks.length) { A.end = performance.now(); c.close(); return; } c.enqueue(enc.encode('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: chunks[i] }] } }] }) + '\r\n\r\n')); A.chunks.push(performance.now()); i++; setTimeout(push, cfg.gap); }; push(); } });
      A.firstByte = performance.now();
      resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    }, cfg.firstByte));
  };
  // watch the reply bubble: first word painted, whole reply painted
  const watch = () => { const box = document.getElementById('cMsgs'); if (!box) return setTimeout(watch, 50);
    new MutationObserver(() => { const A = window.__ai; if (!A) return; const t = box.textContent; if (!A.firstSeen && t.indexOf(cfg.first) > -1) { A.firstSeen = performance.now(); requestAnimationFrame(() => setTimeout(() => { A.firstPaint = performance.now(); }, 0)); } if (!A.lastSeen && t.indexOf(cfg.last) > -1) { A.lastSeen = performance.now(); requestAnimationFrame(() => setTimeout(() => { A.lastPaint = performance.now(); }, 0)); } }).observe(box, { subtree: true, childList: true, characterData: true }); };
  document.addEventListener('DOMContentLoaded', watch);
};
async function aiRun() {
  const { mockGemini } = require('../lib');
  const o = await launch('mid', { state: SEED, extraInit: null, before: async ctx => { await mockGemini(ctx, () => ({ reply: 'ok', actions: [] })); await ctx.addInitScript(AI_FETCH, { reply: AI_REPLY, firstByte: 600, gap: 60, first: 'Holds load the tendon', last: 'plan can adjust steadily' }); } });
  const page = o.page; await shape(o, page);
  await boot(o, SERVERS[PORT_GZ].url.replace('index.html', 'index.html#coach')); await page.waitForTimeout(1500);
  await page.fill('#cIn', 'why do holds help tendons?');
  await page.evaluate(() => window.__lat.arm('keydown'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ai && window.__ai.lastPaint, null, { timeout: 60e3, polling: 30 }).catch(() => {});
  const r = await page.evaluate(() => { const A = window.__ai || {}, L = window.__lat.res || {}, s = L.start; if (!A.call) return { called: false };
    const P = window.__perf, lt = P.lt.filter(x => x[0] >= s - 5 && x[0] <= (A.lastPaint || s + 1e4));
    return { called: true, sendPaint: L.paint, sendToFetch: A.call - s, sendToFirstByte: A.firstByte - s, firstByteToFirstPaint: A.firstPaint - A.firstByte, sendToFirstWordPainted: A.firstPaint - s, appOverheadFirstWord: (A.firstPaint - s) - 600, lastChunkToLastPaint: A.lastPaint - A.chunks[A.chunks.length - 1], sendToAllPainted: A.lastPaint - s, streamDuration: A.chunks[A.chunks.length - 1] - A.firstByte, chunks: A.chunks.length, longTasks: lt.length, longestTask: lt.reduce((a, x) => Math.max(a, x[1]), 0) }; });
  r._errs = o.errs.slice(0, 3);
  await o.b.close(); return r;
}
async function ai() { const rows = []; for (let i = 0; i < RUNS; i++) { log('ai run', i + 1); rows.push(await aiRun()); } return { profile: 'mid', firstByteDelayMs: 600, chunkGapMs: 60, streams: rows.every(r => r.called) && rows[0].chunks > 1, metrics: statsOf(rows), calledGemini: rows.map(r => r.called), errors: rows.flatMap(r => r._errs || []).slice(0, 3) }; }

// ---------- 6. memory over a realistic session ----------
async function memory() {
  const o = await launch('mid', { state: SEED }); const page = o.page, cdp = await shape(o, page);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
  await boot(o, SERVERS[PORT_GZ].url); await page.waitForTimeout(2000);
  await cdp.send('HeapProfiler.enable');
  const sample = async (gc) => { if (gc) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(300); } const h = await cdp.send('Runtime.getHeapUsage'), d = await cdp.send('Memory.getDOMCounters'), pm = await page.evaluate(() => [performance.memory ? performance.memory.usedJSHeapSize : null, document.getElementsByTagName('*').length, JSON.stringify(window.__isoTest.store()).length]);
    return { t: Math.round((Date.now() - T0) / 1000), heapUsedMB: +(h.usedSize / 1048576).toFixed(2), perfMemoryMB: pm[0] ? +(pm[0] / 1048576).toFixed(2) : null, domNodesInDoc: pm[1], domNodesAll: d.nodes, listeners: d.jsEventListeners, documents: d.documents, storeKB: Math.round(pm[2] / 1024) }; };
  let T0 = Date.now(); const start = await sample(true), samples = [start]; let loops = 0, errs = 0, nextS = 30;
  const c = async sel => { try { await page.click(sel, { timeout: 5000 }); await page.waitForTimeout(250); } catch (e) { errs++; await page.keyboard.press('Escape').catch(() => {}); } };
  while ((Date.now() - T0) / 60e3 < MEM_MIN) {
    loops++;
    await c('#tab-train'); await c('#tab-exercises'); await c('#lib [data-ex="goblet-squat"]'); await c('#sheetClose');
    await c('#tab-progress'); await c('#pt-muscles'); await c('#pt-strength'); await c('#pt-body');
    await c(SEARCH); try { await page.fill('#cIn', loops % 2 ? '2 eggs and toast' : '3 sets of 10 goblet squats at 20 kg'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); } catch (e) { errs++; }
    await c('#tab-train'); await c('#sessions [data-start]'); for (let k = 0; k < 6; k++) await c('#pSkip'); await page.waitForTimeout(1500); await c('#pClose'); await c('#pEndYes');
    if (loops % 3 === 0) { await c(PROFILE_BTN); await c('#pfTab-backup'); await c('#sheetClose'); }
    await c(HELP); await c('#sheetClose');
    if ((Date.now() - T0) / 1000 >= nextS) { samples.push(await sample(false)); nextS += 30; }
  }
  const endNoGc = await sample(false), endGc = await sample(true);
  await o.b.close();
  return { profile: 'mid', minutes: MEM_MIN, loops, clickErrors: errs, start, endBeforeGc: endNoGc, endAfterGc: endGc, samples, pageErrors: o.errs.slice(0, 3) };
}

// ---------- main ----------
const SERVERS = {};
(async () => {
  const out = { app: { version: (/isohold-v(\d+)/.exec(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')) || [])[1] }, runs: RUNS, when: new Date().toISOString(), node: process.version, profiles: PROFILE };
  SERVERS[PORT_RAW] = await serve(PORT_RAW, false); SERVERS[PORT_GZ] = await serve(PORT_GZ, true);
  try {
    if (ONLY.includes('bundle')) out.bundle = bundle();
    if (ONLY.includes('load')) out.load = await loads();
    if (ONLY.includes('actions')) out.actions = await actions();
    if (ONLY.includes('scale')) out.scale = await scale();
    if (ONLY.includes('ai')) out.ai = await ai();
    if (ONLY.includes('memory')) out.memory = await memory();
  } catch (e) { out.fatal = String(e && e.stack || e).slice(0, 800); }
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
  Object.values(SERVERS).forEach(s => s.srv.close());
})();
