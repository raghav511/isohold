// Speed guard: a quick (about 3 min) check of every budget in perf/budgets.json on the Mid Android profile
// (Chromium Pixel 7, CPU 4x, Fast 4G). Timings are medians of 3 runs. Measurement code is taken from perf/baseline.js.
//   cd tests && node test-speed.js            # prints "FAIL ..." lines and one "speed: ..." summary line last
//   node test-speed.js --json                 # also prints every raw number as JSON to stderr
// Exit 1 if a byte budget is exceeded at all, or a time/memory budget by more than 10%.
// Before measuring it checks the machine's 1-minute load average and waits (up to 2 min) for it to drop;
// the summary says "UNDER LOAD" if it never did, and names other test suites that were running.
// Ports 9010 (gzip server). Memory: a short scripted loop stands in for the 10-minute session.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), os = require('os'), { execSync } = require('child_process');
const { chromium, devices } = require('playwright');
const { ROOT, mockGemini } = require('./lib');
const SEED = require('./fixtures/seed-week4.json');
const CFG = require('./perf/budgets.json'), BUD = CFG.metrics, MARGIN = CFG.margin;
const RUNS = 3, PORT = 9010, JSON_OUT = process.argv.includes('--json');
const log = (...a) => console.error('[speed]', ...a);
const NET = { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, CPU = 4;
const med = xs => { const s = xs.filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- machine load ----------
function otherSuites() {
  try { return execSync('ps -Ao pid,command', { encoding: 'utf8' }).split('\n').filter(l => /(^|\/)node\s+\S*test-(?!speed)[\w-]+\.js/.test(l.trim().replace(/^\d+\s+/, '')) && !l.includes(String(process.pid))).map(l => (/test-[\w-]+\.js/.exec(l) || [''])[0]); } catch (e) { return []; }
}
async function waitForQuiet() {
  const ncpu = os.cpus().length, limit = ncpu * 0.75, t0 = Date.now();
  let l = os.loadavg()[0];
  while (l > limit && !process.argv.includes("--no-wait") && Date.now() - t0 < 120e3) { log(`load average ${l.toFixed(1)} > ${limit} (${ncpu} CPUs), waiting…`); await sleep(15e3); l = os.loadavg()[0]; }
  return { load: +l.toFixed(1), limit, high: l > limit, others: otherSuites() };
}

// ---------- server (gzip like GitHub Pages, ETag + 304, counts response bytes) ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve(port) {
  const cache = {}, reqs = [];
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || p.startsWith('/tests') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    if (!cache[f]) { const raw = fs.readFileSync(f); cache[f] = { raw, gz: zlib.gzipSync(raw, { level: 6 }), etag: '"' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 20) + '"', mtime: fs.statSync(f).mtime.toUTCString() }; }
    const c = cache[f], ext = path.extname(f), useGz = ext !== '.png' && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: c.etag, 'Last-Modified': c.mtime, Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, h); res.end(); reqs.push({ t: Date.now(), p, bytes: 0 }); return; }
    const body = useGz ? c.gz : c.raw; if (useGz) h['Content-Encoding'] = 'gzip'; h['Content-Length'] = body.length;
    res.writeHead(200, h); res.end(body); reqs.push({ t: Date.now(), p, bytes: body.length });
  });
  return new Promise(r => srv.listen(port, () => r({ srv, reqs, url: `http://localhost:${port}/index.html` })));
}

// ---------- page instrumentation (same as perf/baseline.js) ----------
const INSTRUMENT = (cfg) => {
  if (window.__perf) return;
  const P = window.__perf = { lt: [], lcp: null };
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch (e) { }
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.lcp = e.startTime)).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { }
  const L = window.__lat = { armed: null, res: null, lastDown: 0, lastKey: 0, arm(type) { L.armed = type; L.res = null; L.armAt = performance.now(); } };
  addEventListener('pointerdown', e => { L.lastDown = e.timeStamp; }, true);
  addEventListener('mousedown', e => { if (!L.lastDown || e.timeStamp - L.lastDown > 1000) L.lastDown = e.timeStamp; }, true);
  addEventListener('keydown', e => { L.lastKey = e.timeStamp; }, true);
  ['click', 'keydown', 'input'].forEach(type => addEventListener(type, e => {
    if (L.armed !== type) return; L.armed = null;
    const start = type === 'click' ? (L.lastDown && L.lastDown >= L.armAt - 5 ? L.lastDown : e.timeStamp) : type === 'input' ? (L.lastKey >= L.armAt - 5 ? L.lastKey : e.timeStamp) : e.timeStamp;
    requestAnimationFrame(() => setTimeout(() => { L.res = { start, paint: performance.now() - start }; }, 0));
  }, true));
  if (cfg && cfg.probe) {
    const poll = () => {
      const b = document.getElementById('tab-train');
      if (window.__isoholdReady && b) { const t0 = performance.now(); b.click(); requestAnimationFrame(() => setTimeout(() => { P.usable = performance.now(); P.probeTap = P.usable - t0; }, 0)); }
      else setTimeout(poll, 10);
    };
    setTimeout(poll, 0);
  }
};
const STATE_INIT = s => { try { if (!localStorage.getItem('isohold.v1')) localStorage.setItem('isohold.v1', s); } catch (e) { window.__ISOHOLD_STATE = JSON.parse(s); } };

let B, S;
async function newCtx({ state, sw = false, probe = false, before } = {}) {
  const ctx = await B.newContext({ ...devices['Pixel 7'], serviceWorkers: sw ? 'allow' : 'block' });
  await ctx.addInitScript(INSTRUMENT, { probe });
  if (state) await ctx.addInitScript(STATE_INIT, state);
  if (before) await before(ctx);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  return { ctx, page, errs };
}
async function shape(page, net = true) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', NET); }
  return cdp;
}
async function boot(page, hash = '') { await page.goto(S.url + hash, { timeout: 120e3 }); await page.waitForFunction(() => window.__isoholdReady, null, { timeout: 120e3, polling: 50 }); await page.waitForTimeout(1500); }

// ---------- action timing (input -> next paint after the app's handlers) ----------
const SEARCH = 'section.view:not([hidden]) .view-head [data-tool="search"]', PROFILE_BTN = 'section.view:not([hidden]) .view-head :is(#profBtn,[data-tool="profile"])';
async function measure(page, type, doIt, settle = 400) {
  await page.evaluate(t => window.__lat.arm(t), type);
  await doIt();
  const r = await page.waitForFunction(() => window.__lat.res, null, { timeout: 30e3, polling: 20 }).then(h => h.jsonValue());
  await page.waitForTimeout(settle);
  return +r.paint.toFixed(1);
}
const tap = (page, sel, settle) => measure(page, 'click', () => page.click(sel, { timeout: 30e3 }), settle);
async function worstKey(page, text) { await page.click('#cIn'); let w = 0; for (const ch of text) w = Math.max(w, await measure(page, 'input', () => page.keyboard.type(ch), 60)); return w; }
const enter = async (page, text) => { await page.fill('#cIn', text); return measure(page, 'keydown', () => page.keyboard.press('Enter'), 600); };
const restore = async page => { await page.evaluate(() => { const i = document.getElementById('bkIn'); i.value = document.getElementById('bkOut').value; i.dispatchEvent(new Event('input', { bubbles: true })); }); return tap(page, '#bkRestore'); };
async function safe(R, k, fn) { try { R[k] = await fn(); } catch (e) { R[k] = null; R.errors = (R.errors || []).concat(k + ': ' + String(e).split('\n')[0].slice(0, 140)); } }

// ---------- loads ----------
async function quietFor(r0, gapMs, minWallMs, t0) { for (let i = 0; i < 120; i++) { const last = S.reqs[S.reqs.length - 1]; if (Date.now() - t0 >= minWallMs && S.reqs.length > r0 && Date.now() - last.t > gapMs) return; await sleep(250); } }
async function loadRun(run) {
  const o = await newCtx({ state: JSON.stringify(SEED), sw: true, probe: true }), R = {};
  const one = async (page, warm) => {
    const cdp = await shape(page), r0 = S.reqs.length, t0 = Date.now();
    await page.goto(S.url, { timeout: 120e3, waitUntil: 'commit' });
    await page.waitForFunction(() => window.__perf && window.__perf.usable, null, { timeout: 120e3, polling: 50 });
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => { const P = window.__perf, f = performance.getEntriesByName('first-contentful-paint')[0]; return { usable: P.usable, fcp: f ? f.startTime : null, lcp: P.lcp, task: P.lt.filter(x => x[0] < P.usable + 500).reduce((a, x) => Math.max(a, x[1]), 0), sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) }; });
    if (!warm) await page.evaluate(() => navigator.serviceWorker && Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 30e3))])).catch(() => {});
    // bytes are exact, so count them once (run 0); warm waits past the version check (4 s after launch)
    if (run === 0) { await quietFor(r0, 2000, warm ? 7000 : 0, t0); m.bytes = S.reqs.slice(r0).reduce((a, r) => a + r.bytes, 0); }
    else await quietFor(r0, 800, 0, t0);
    await cdp.detach().catch(() => {});
    return m;
  };
  try {
    R.cold = await one(o.page, false); await o.page.close();
    R.warm = await one(await o.ctx.newPage(), true);
    if (!R.warm.sw) R.errors = ['warm load was not served by the service worker'];
  } catch (e) { R.errors = [String(e).split('\n')[0].slice(0, 160)]; }
  await o.ctx.close();
  return R;
}

// ---------- actions on seed data ----------
async function actionsRun() {
  const o = await newCtx({ state: JSON.stringify(SEED) }), p = o.page, R = { simple: [] }; await shape(p); await boot(p);
  const simple = async (sel, settle) => { const v = await tap(p, sel, settle); R.simple.push(v); return v; };
  await safe(R, 'exercises', () => tap(p, '#tab-exercises'));
  await safe(R, 's1', () => simple('#lib [data-ex="goblet-squat"]'));
  await safe(R, 's2', () => simple('#sheetClose'));
  await safe(R, 's3', () => simple(SEARCH));
  await safe(R, 'meal', () => enter(p, '2 eggs and a bowl of oatmeal'));
  await safe(R, 'progress', () => tap(p, '#tab-progress'));
  await safe(R, 's4', () => simple('#pt-muscles'));
  await safe(R, 's5', () => simple('#tab-train'));
  await safe(R, 's6', () => simple(PROFILE_BTN));
  await safe(R, 's7', () => simple('#pfTab-backup'));
  await safe(R, 'restore', () => restore(p));
  await p.click('#sheetClose', { timeout: 2000 }).catch(() => p.keyboard.press('Escape')); await p.waitForTimeout(300);
  await p.click('#tab-train').catch(() => {}); await p.waitForTimeout(400);
  // the sound is made one frame after Start; headless Chromium has no sound device, so let that finish first
  await safe(R, 'session', () => tap(p, '#sessions [data-start]', 1500));
  await safe(R, 's8', () => simple('#pSkip'));
  await safe(R, 's9', () => simple('#pSkip'));
  R.tap = R.simple.length ? Math.max(...R.simple) : null; R.pageErrors = o.errs.slice(0, 3);
  await o.ctx.close();
  return R;
}

// ---------- data scaling (same generator as perf/baseline.js) ----------
const DAY = 864e5;
function scaled(n) {
  const s0 = JSON.parse(JSON.stringify(SEED)), end = Math.max(...s0.log.map(l => l.t)), MEALS = [['Breakfast', [{ n: 'Oatmeal', q: 1, u: 'bowl', g: 250, p: 10, c: 54, f: 6, k: 300 }, { n: 'Egg', q: 2, u: '', g: 100, p: 13, c: 1, f: 10, k: 143 }]], ['Lunch', [{ n: 'Dal', q: 1, u: 'bowl', g: 200, p: 14, c: 30, f: 6, k: 230 }, { n: 'Rice', q: 1, u: 'cup', g: 150, p: 4, c: 42, f: 0.5, k: 195 }]], ['Dinner', [{ n: 'Chicken breast', q: 1, u: 'g', g: 150, p: 46, c: 0, f: 5, k: 250 }, { n: 'Salad', q: 1, u: 'bowl', g: 120, p: 2, c: 8, f: 4, k: 70 }]]];
  s0.food = []; s0.notes = s0.notes || [];
  for (let d = 0; d < 28; d++) { const t = end - d * DAY; MEALS.forEach((m, i) => s0.food.push({ t: t - (10 - i * 4) * 36e5, meal: m[0], items: m[1] })); if (d % 2 === 0) s0.notes.push({ t: t - 2 * 36e5, k: 'cardio', m: 'Walking', min: 30 }); if (d % 3 === 0) s0.notes.push({ t: t - 3 * 36e5, k: 'lift', name: 'Lat Pulldown', kg: 50, reps: 10, sets: 3 }); if (d % 7 === 0) s0.body.push({ t: t - 13 * 36e5, kg: 70 + (d % 3) * 0.3 }); }
  ['food', 'notes', 'body'].forEach(k => s0[k].sort((a, b) => a.t - b.t));
  const s = JSON.parse(JSON.stringify(s0)), span = 28 * DAY;
  for (const k of ['log', 'food', 'notes', 'body']) { s[k] = []; for (let i = n - 1; i >= 0; i--) s0[k].forEach(x => s[k].push(Object.assign({}, x, { t: x.t - i * span }, x.d ? { d: x.d - i * span } : {}))); }
  return JSON.stringify(s);
}
async function x10Run(state) {
  const o = await newCtx({ state }), p = o.page, R = {}; await shape(p); await boot(p);
  await safe(R, 'progress10x', () => tap(p, '#tab-progress'));
  await p.click('#tab-train').catch(() => {}); await p.waitForTimeout(300);
  await p.click(PROFILE_BTN).catch(() => {}); await p.waitForTimeout(400);
  await safe(R, 'backup10x', () => tap(p, '#pfTab-backup'));
  await safe(R, 'restore10x', () => restore(p));
  await o.ctx.close(); return R;
}
async function x100Run(state) {
  const o = await newCtx({ state }), p = o.page, R = {}; await shape(p); await boot(p);
  await p.click(SEARCH); await p.waitForTimeout(400);
  await safe(R, 'search100x', () => worstKey(p, 'squat'));
  await p.fill('#cIn', ''); await p.waitForTimeout(200);
  await safe(R, 'progress100x', () => tap(p, '#tab-progress', 800));
  await o.ctx.close(); return R;
}

// ---------- AI (streamed mock Gemini, same as perf/baseline.js; the measured first-byte delay is subtracted) ----------
const AI_REPLY = 'Holds load the tendon steadily without the fast stretch-shorten cycle, so pain usually settles while the tendon still gets a strong signal to remodel. Think of it as heavy, slow, controlled work. Five holds of 45 seconds at a weight that feels like 7 out of 10 effort is a good start. Keep going, and log how it feels after each session so the plan can adjust steadily.';
const AI_FETCH = (cfg) => {
  const words = cfg.reply.split(/(?<= )/), chunks = []; for (let i = 0; i < words.length; i += 8) chunks.push(words.slice(i, i + 8).join(''));
  const of = window.fetch;
  window.fetch = function (u) {
    if (!/streamGenerateContent/.test(String(u && u.url || u))) return of.apply(this, arguments);
    const A = window.__ai = { call: performance.now(), chunks: 0 }, enc = new TextEncoder();
    return new Promise(resolve => setTimeout(() => {
      let i = 0;
      const stream = new ReadableStream({ start(c) { const push = () => { if (i >= chunks.length) { c.close(); return; } c.enqueue(enc.encode('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: chunks[i] }] } }] }) + '\r\n\r\n')); A.chunks++; i++; setTimeout(push, cfg.gap); }; push(); } });
      A.firstByte = performance.now();
      resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    }, cfg.firstByte));
  };
  const watch = () => { const box = document.getElementById('cMsgs'); if (!box) return setTimeout(watch, 50);
    new MutationObserver(() => { const A = window.__ai; if (!A || A.firstSeen) return; if (box.textContent.indexOf(cfg.first) > -1) { A.firstSeen = performance.now(); requestAnimationFrame(() => setTimeout(() => { A.firstPaint = performance.now(); }, 0)); } }).observe(box, { subtree: true, childList: true, characterData: true }); };
  document.addEventListener('DOMContentLoaded', watch);
};
async function aiRun() {
  const o = await newCtx({ state: JSON.stringify(SEED), before: async ctx => { await mockGemini(ctx, () => ({ reply: 'ok', actions: [] })); await ctx.addInitScript(AI_FETCH, { reply: AI_REPLY, firstByte: 600, gap: 60, first: 'Holds load the tendon' }); } });
  const p = o.page, R = {}; await shape(p); await boot(p, '#coach');
  try {
    await p.fill('#cIn', 'why do holds help tendons?');
    await p.evaluate(() => window.__lat.arm('keydown'));
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__ai && window.__ai.firstPaint && window.__lat.res, null, { timeout: 30e3, polling: 20 });
    // overhead = Enter -> first words painted, minus the time the mock actually held the first byte back (600 ms)
    Object.assign(R, await p.evaluate(() => { const A = window.__ai, s = window.__lat.res.start; return { overhead: +((A.firstPaint - s) - (A.firstByte - A.call)).toFixed(1), firstBytePaint: +(A.firstPaint - A.firstByte).toFixed(1), chunks: A.chunks }; }));
  } catch (e) { R.errors = [String(e).split('\n')[0].slice(0, 160)]; }
  await o.ctx.close(); return R;
}

// ---------- memory (short scripted loop; stand-in for the 10-minute session) ----------
const MEM_LOOPS = 8;
async function memoryRun() {
  const o = await newCtx({ state: JSON.stringify(SEED) }), p = o.page, cdp = await shape(p, false); await boot(p);
  await cdp.send('HeapProfiler.enable');
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await p.waitForTimeout(300); return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576; };
  const c = async sel => { try { await p.click(sel, { timeout: 5000 }); await p.waitForTimeout(150); } catch (e) { await p.keyboard.press('Escape').catch(() => {}); } };
  let afterWarmup = null;
  for (let loop = 1; loop <= MEM_LOOPS; loop++) {
    await c('#tab-train'); await c('#tab-exercises'); await c('#lib [data-ex="goblet-squat"]'); await c('#sheetClose');
    await c('#tab-progress'); await c('#pt-muscles'); await c('#pt-strength'); await c('#pt-body');
    await c(SEARCH); try { await p.fill('#cIn', loop % 2 ? '2 eggs and toast' : '3 sets of 10 goblet squats at 20 kg'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); } catch (e) { }
    await c('#tab-train'); await c('#sessions [data-start]'); for (let k = 0; k < 6; k++) await c('#pSkip'); await p.waitForTimeout(500); await c('#pClose'); await c('#pEndYes');
    if (loop % 3 === 0) { await c(PROFILE_BTN); await c('#pfTab-backup'); await c('#sheetClose'); }
    await c('section.view:not([hidden]) .view-head [data-tool="help"]'); await c('#sheetClose');
    if (loop === 2) afterWarmup = await heap();
  }
  const end = await heap(), dom = await p.evaluate(() => document.getElementsByTagName('*').length);
  await o.ctx.close();
  return { heap: +end.toFixed(1), heapGrowth: +(end - afterWarmup).toFixed(1), dom, loops: MEM_LOOPS };
}

// ---------- main ----------
(async () => {
  const T0 = Date.now(), env = await waitForQuiet();
  log(`load average ${env.load} (limit ${env.limit})${env.others.length ? ', other suites running: ' + [...new Set(env.others)].join(' ') : ''}`);
  S = await serve(PORT); B = await chromium.launch();
  const V = {}, raw = { loads: [], actions: [], x10: [], x100: [], ai: [] }, errors = [];
  try {
    V.gzip = zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'index.html')), { level: 6 }).length;
    for (let i = 0; i < RUNS; i++) { log('load', i + 1); raw.loads.push(await loadRun(i)); }
    const L = raw.loads;
    V.cold = med(L.map(r => r.cold && r.cold.usable)); V.coldFcp = med(L.map(r => r.cold && r.cold.fcp)); V.coldLcp = med(L.map(r => r.cold && r.cold.lcp));
    V.loadTask = med(L.map(r => r.cold && r.cold.task)); V.warm = med(L.map(r => r.warm && r.warm.usable));
    V.firstVisit = L[0].cold && L[0].cold.bytes; V.warmBg = L[0].warm && L[0].warm.bytes;
    for (let i = 0; i < RUNS; i++) { log('actions', i + 1); raw.actions.push(await actionsRun()); }
    for (const k of ['exercises', 'progress', 'session', 'restore', 'meal', 'tap']) V[k] = med(raw.actions.map(r => r[k]));
    const s10 = scaled(10); for (let i = 0; i < RUNS; i++) { log('10x', i + 1); raw.x10.push(await x10Run(s10)); }
    for (const k of ['progress10x', 'backup10x', 'restore10x']) V[k] = med(raw.x10.map(r => r[k]));
    const s100 = scaled(100); for (let i = 0; i < RUNS; i++) { log('100x', i + 1); raw.x100.push(await x100Run(s100)); }
    for (const k of ['search100x', 'progress100x']) V[k] = med(raw.x100.map(r => r[k]));
    for (let i = 0; i < RUNS; i++) { log('ai', i + 1); raw.ai.push(await aiRun()); }
    V.ai = med(raw.ai.map(r => r.overhead)); V.aiPaint = med(raw.ai.map(r => r.firstBytePaint));
    log('memory'); raw.memory = await memoryRun(); Object.assign(V, { heap: raw.memory.heap, heapGrowth: raw.memory.heapGrowth, dom: raw.memory.dom });
  } catch (e) { errors.push('fatal: ' + String(e && e.stack || e).slice(0, 400)); }
  await B.close().catch(() => {}); S.srv.close();
  for (const g of Object.values(raw)) (Array.isArray(g) ? g : [g]).forEach(r => r && r.errors && errors.push(...r.errors));
  if (JSON_OUT) console.error(JSON.stringify({ values: V, raw }, null, 1));

  // ---------- verdict ----------
  const fmt = (k, v) => { const b = BUD[k]; if (v == null) return 'n/a'; if (b.unit === 'B') return (v / 1024).toFixed(1) + 'KB'; if (b.unit === 'ms') return v >= 1000 ? (v / 1000).toFixed(2) + 's' : Math.round(v) + 'ms'; if (b.unit === 'MB') return v.toFixed(1) + 'MB'; return String(Math.round(v)); };
  const fmtB = k => { const b = BUD[k]; return b.unit === 'B' ? (b.budget / 1024) + 'KB' : b.unit === 'ms' && b.budget >= 1000 ? (b.budget / 1000) + 's' : b.budget + (b.unit === 'nodes' ? '' : b.unit); };
  const parts = [], fails = [];
  for (const k of Object.keys(BUD)) {
    const b = BUD[k], v = V[k], limit = b.kind === 'bytes' ? b.budget : b.budget * (1 + MARGIN);
    if (v == null) fails.push(`FAIL ${b.label}: not measured`);
    else if (v > limit) fails.push(`FAIL ${b.label}: ${fmt(k, v)} is over budget ${fmtB(k)}${b.kind === 'bytes' ? ' (exact)' : ` by ${Math.round((v / b.budget - 1) * 100)}% (limit +${MARGIN * 100}%)`} — ${b.how}`);
    parts.push(`${b.label} ${fmt(k, v)}/${fmtB(k)}`);
  }
  errors.forEach(e => console.log('WARN ' + e));
  fails.forEach(f => console.log(f));
  const n = Object.keys(BUD).length, ok = n - fails.length;
  const notes = [`memory = ${raw.memory ? raw.memory.loops : '?'}-loop stand-in for 10 min`];
  if (env.high) notes.push(`UNDER LOAD: 1-min load ${env.load} > ${env.limit}, timings may be inflated`);
  if (env.others.length) notes.push('other suites running: ' + [...new Set(env.others)].join(','));
  console.log(`speed: ${parts.join(' · ')} · ${ok}/${n} within budget (${Math.round((Date.now() - T0) / 1000)}s; ${notes.join('; ')})`);
  process.exit(fails.length ? 1 : 0);
})();
