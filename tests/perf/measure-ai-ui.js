// Before/after numbers for AI replies, taps, layout shift, typing, animation and offline flows.
//
//   cd tests && node perf/measure-ai-ui.js --build=new  > perf/ai-ui-new.json
//   cd tests && node perf/measure-ai-ui.js --build=old  > perf/ai-ui-old.json     (old = git show origin/main:index.html)
//   --runs=5  --only=ai,taps,typing,cls,anim,offline
//
// Profiles as in baseline.js: "mid" = Chromium Pixel 7, CPU 4x, Fast 4G; "budget" = CPU 6x, Slow 3G.
// Ports 8985 (new) and 8986 (old). Gzip like GitHub Pages. Progress on stderr, JSON on stdout.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os'), { execSync } = require('child_process');
const { open, ROOT } = require('../lib');
const SEED = require('../fixtures/seed-week4.json');
const ARGS = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const BUILD = ARGS.build || 'new', RUNS = +ARGS.runs || 5, ONLY = (ARGS.only || 'ai,taps,typing,cls,anim,offline').split(',');
const log = (...a) => console.error('[m]', BUILD, ...a);
const PROFILE = { mid: { cpu: 4, net: { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 } }, budget: { cpu: 6, net: { offline: false, latency: 400, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 } } };
function q(xs, p) { const s = xs.filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(1); }
const stat = xs => ({ median: q(xs, 0.5), p90: q(xs, 0.9), max: q(xs, 1), n: xs.filter(x => typeof x === 'number' && isFinite(x)).length });

// ---------- the build under test ----------
let DIR = ROOT;
if (BUILD === 'old') {
  DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'isohold-old-'));
  for (const f of ['sw.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(ROOT, f), path.join(DIR, f));
  fs.writeFileSync(path.join(DIR, 'index.html'), execSync('git show origin/main:index.html', { cwd: ROOT, maxBuffer: 1 << 26 }));
}
const PORT = BUILD === 'old' ? 8986 : 8985, URL = `http://localhost:${PORT}/index.html`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
function serve() {
  const cache = {};
  return new Promise(r => { const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(DIR, p); if (!f.startsWith(DIR) || p.startsWith('/tests') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    if (!cache[f]) { const raw = fs.readFileSync(f); cache[f] = { raw, gz: zlib.gzipSync(raw, { level: 6 }) }; }
    const ext = path.extname(f), gz = ext !== '.png' && /gzip/.test(req.headers['accept-encoding'] || ''), body = gz ? cache[f].gz : cache[f].raw;
    const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': p === '/sw.js' ? 'no-cache' : 'max-age=600', 'Content-Length': body.length };
    if (gz) h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); res.end(body);
  }).listen(PORT, () => r(srv)); });
}

// ---------- page instrumentation ----------
const INSTRUMENT = () => {
  if (window.__perf) return;
  const P = window.__perf = { lt: [], ev: [], ls: [], frames: null };
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch (e) { }
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.ev.push([e.name, e.startTime, e.duration]))).observe({ type: 'event', buffered: true, durationThreshold: 16 }); } catch (e) { }
  try { new PerformanceObserver(l => l.getEntries().forEach(e => P.ls.push([e.startTime, e.value, e.hadRecentInput, (e.sources || []).map(s => s.node ? (s.node.id || s.node.className || s.node.nodeName) : '?').join(',').slice(0, 80)]))).observe({ type: 'layout-shift', buffered: true }); } catch (e) { }
  const L = window.__lat = { armed: null, res: null, lastDown: 0, lastKey: 0, arm(type) { L.armed = type; L.res = null; L.armAt = performance.now(); } };
  addEventListener('pointerdown', e => { L.lastDown = e.timeStamp; }, true);
  addEventListener('keydown', e => { L.lastKey = e.timeStamp; }, true);
  ['click', 'keydown', 'input'].forEach(type => addEventListener(type, e => {
    if (L.armed !== type) return; L.armed = null;
    const start = type === 'click' ? e.timeStamp : type === 'input' ? (L.lastKey >= L.armAt - 5 ? L.lastKey : e.timeStamp) : e.timeStamp;
    requestAnimationFrame(() => setTimeout(() => { L.res = { start, paint: +(performance.now() - start).toFixed(1), end: performance.now() }; }, 0));
  }, true));
  addEventListener('pointerdown', e => { const el = e.target.closest('button, [role="tab"], label') || e.target, look = () => { const c = getComputedStyle(el); return c.opacity + c.transform + c.backgroundColor + c.filter; }, l0 = look(), t0 = e.timeStamp; window.__fb = null;
    const f = n => requestAnimationFrame(() => { if (look() !== l0) window.__fb = +(performance.now() - t0).toFixed(1); else if (n < 30) f(n + 1); }); f(0); }, true);
  window.__frames = ms => new Promise(res => { const ts = []; const t0 = performance.now(); const f = t => { ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); });
};

async function launch(prof, o2 = {}) {
  const o = await open('android', Object.assign({ sw: !!o2.sw, before: async ctx => { await ctx.addInitScript(INSTRUMENT); await ctx.addInitScript(s => { try { if (!localStorage.getItem('isohold.v1')) localStorage.setItem('isohold.v1', s); } catch (e) { } }, JSON.stringify(o2.state || SEED)); if (o2.before) await o2.before(ctx); } }, o2.reduced ? {} : {}));
  if (o2.reduced) await o.page.emulateMedia({ reducedMotion: 'reduce' });
  o.cdp = await o.ctx.newCDPSession(o.page);
  await o.cdp.send('Emulation.setCPUThrottlingRate', { rate: PROFILE[prof].cpu });
  await o.cdp.send('Network.enable'); await o.cdp.send('Network.emulateNetworkConditions', PROFILE[prof].net);
  return o;
}
async function boot(o, hash = '') { await o.page.goto(URL + hash, { timeout: 120e3 }); await o.page.waitForFunction(() => window.__isoholdReady, null, { timeout: 120e3, polling: 50 }); }
async function measure(page, type, doIt, settle = 400) {
  await page.evaluate(t => window.__lat.arm(t), type); const armAt = await page.evaluate(() => window.__lat.armAt);
  await doIt();
  const r = await page.waitForFunction(() => window.__lat.res, null, { timeout: 30e3, polling: 20 }).then(h => h.jsonValue());
  await page.waitForTimeout(settle);
  const x = await page.evaluate(([a, s]) => { const P = window.__perf, lt = P.lt.filter(t => t[0] >= a - 5 && t[0] <= s.end + 300), ev = P.ev.filter(t => t[1] >= a - 5 && /click|pointer|key|input/.test(t[0])), ls = P.ls.filter(t => t[0] >= a - 5); return { longest: lt.reduce((m, t) => Math.max(m, t[1]), 0), et: ev.length ? Math.max(...ev.map(t => t[2])) : null, shiftAll: +ls.reduce((m, t) => m + t[1], 0).toFixed(4), shiftCls: +ls.filter(t => !t[2]).reduce((m, t) => m + t[1], 0).toFixed(4), shiftSrc: ls.filter(t => !t[2]).map(t => t[3]).join('|').slice(0, 120) }; }, [armAt, r]);
  return Object.assign({ inp: r.paint }, x);
}
// a real tap: the finger rests ~80 ms before lifting. fb = finger down -> first frame where the control looks pressed;
// inp = finger lift (click) -> the tap's result painted
const tap = async (page, sel, settle) => { const r = await measure(page, 'click', async () => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {}); const b = await l.boundingBox({ timeout: 5000 }).catch(() => null); if (!b) return page.click(sel, { timeout: 10e3 }); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); }, settle); r.fb = await page.evaluate(() => window.__fb); return r; };
const SEARCH = 'section.view:not([hidden]) .view-head [data-tool="search"]', PROFILE_BTN = 'section.view:not([hidden]) .view-head :is(#profBtn,[data-tool="profile"])';

// ---------- taps + CLS per tab/sheet ----------
async function tapsRun() {
  const o = await launch('mid'); const page = o.page; await boot(o); await page.waitForTimeout(3000);
  const loadCls = await page.evaluate(() => +window.__perf.ls.filter(t => !t[2]).reduce((m, t) => m + t[1], 0).toFixed(4));
  const loadSrc = await page.evaluate(() => window.__perf.ls.filter(t => !t[2]).map(t => t[3] + ':' + t[1].toFixed(3)).join(' | ').slice(0, 200));
  const R = { 'load CLS': { inp: null, shiftCls: loadCls, shiftAll: loadCls, shiftSrc: loadSrc } };
  const T = async (k, fn) => { try { R[k] = await fn(); } catch (e) { R[k] = { error: String(e).split('\n')[0].slice(0, 140) }; } };
  await T('Tab: Exercises (first)', () => tap(page, '#tab-exercises', 1200));
  await T('Sheet: open exercise', () => tap(page, '#lib [data-ex="goblet-squat"]', 1200));
  await T('Stepper +: exercise sheet weight', () => tap(page, '#sheetBody .stepper button[data-d="1"]'));
  await T('Sheet: close', () => tap(page, '#sheetClose'));
  await T('Tab: Progress', () => tap(page, '#tab-progress', 1200));
  await T('Chip: Progress Muscles', () => tap(page, '#pt-muscles', 1200));
  await T('Chip: Progress Strength', () => tap(page, '#pt-strength', 1200));
  await T('Chip: Progress Body', () => tap(page, '#pt-body', 1200));
  await T('Tab: Today', () => tap(page, '#tab-train', 1200));
  await T('Sheet: open Profile', () => tap(page, PROFILE_BTN, 1200));
  await T('Chip: profile goal', () => tap(page, '.pchips[data-set="goal"] button:not([aria-pressed="true"])'));
  await T('Checkbox: spoken cues', () => tap(page, '#pfCues'));
  await T('Sheet: close Profile', () => tap(page, '#sheetClose'));
  await T('Open Search & log', () => tap(page, SEARCH, 1200));
  await T('Chip: one-tap log suggestion', () => tap(page, '#cSugs button', 800));
  await T('Back from Search & log', () => tap(page, 'section.view:not([hidden]) [data-back]', 800));
  await T('Start a session', () => tap(page, '#sessions [data-start]', 1200));
  await T('Stepper +: session weight', () => tap(page, '#pWtPlus'));
  await T('Session: next step', () => tap(page, '#pSkip'));
  await T('Session: close', () => tap(page, '#pClose'));
  await T('Session: end (confirm)', () => tap(page, '#pEndYes', 800));
  R._errs = o.errs.slice(0, 3); await o.b.close(); return R;
}
async function taps() {
  const runs = []; for (let i = 0; i < RUNS; i++) { log('taps run', i + 1); runs.push(await tapsRun()); }
  const out = {}; Object.keys(runs[0]).filter(k => k[0] !== '_').forEach(k => { const rows = runs.map(r => r[k]).filter(v => v && !v.error); out[k] = { pressedLook: stat(rows.map(r => r.fb)), tapToPaint: stat(rows.map(r => r.inp)), eventTiming: stat(rows.map(r => r.et)), longestTask: stat(rows.map(r => r.longest)), cls: stat(rows.map(r => r.shiftCls)), shiftInclInput: stat(rows.map(r => r.shiftAll)), clsSources: rows.map(r => r.shiftSrc).filter(Boolean).slice(0, 2), errors: runs.map(r => r[k] && r[k].error).filter(Boolean).slice(0, 1) }; });
  return { profile: 'mid', all: out, pageErrors: runs.flatMap(r => r._errs).slice(0, 3) };
}

// ---------- typing ----------
async function typingRun() {
  const o = await launch('mid'); const page = o.page; await boot(o); await page.waitForTimeout(2000);
  await page.click(SEARCH); await page.waitForTimeout(800); await page.click('#cIn');
  const per = []; for (const ch of '2 eggs and a bowl of oatmeal') per.push((await measure(page, 'input', () => page.keyboard.type(ch), 40)).inp);
  await page.fill('#cIn', ''); await page.click('section.view:not([hidden]) [data-back]'); await page.waitForTimeout(500);
  await page.click('#tab-exercises'); await page.waitForTimeout(800); await page.click('#lib [data-ex="goblet-squat"]'); await page.waitForTimeout(800);
  const st = []; try { await page.click('#dWt', { clickCount: 3 }); for (const ch of '22.5') st.push((await measure(page, 'input', () => page.keyboard.type(ch), 40)).inp); } catch (e) { }
  await o.b.close(); return { search: per, stepper: st };
}
async function typing() { const s = [], st = []; for (let i = 0; i < RUNS; i++) { log('typing run', i + 1); const r = await typingRun(); s.push(...r.search); st.push(...r.stepper); } return { profile: 'mid', searchKey: stat(s), stepperInputKey: stat(st), keys: s.length }; }

// ---------- animation ----------
async function animRun(reduced) {
  const o = await launch('mid', { reduced }); const page = o.page; await boot(o); await page.waitForTimeout(2000);
  await page.click('#tab-exercises'); await page.waitForTimeout(800); await page.click('#lib [data-ex="goblet-squat"]'); await page.waitForTimeout(500);
  const a = await page.evaluate(async () => { const t0 = performance.now(), s0 = document.querySelector('#dFig svg') ? document.querySelector('#dFig svg').innerHTML : ''; const ts = await window.__frames(3000); const s1 = document.querySelector('#dFig svg') ? document.querySelector('#dFig svg').innerHTML : ''; const d = ts.slice(1).map((t, i) => t - ts[i]); const lt = window.__perf.lt.filter(x => x[0] >= t0); return { fps: +(d.length / ((ts[ts.length - 1] - ts[0]) / 1000)).toFixed(1), worstFrame: +Math.max(...d).toFixed(1), framesOver20: d.filter(x => x > 20).length, longTasks: lt.length, figMoved: s0 !== s1 }; });
  await page.click('#sheetClose'); await page.waitForTimeout(300); await page.click('#tab-train'); await page.waitForTimeout(500);
  await page.click('#sessions [data-start]'); await page.waitForTimeout(800);
  const b = await page.evaluate(async () => { const t0 = performance.now(); const ts = await window.__frames(3000); const d = ts.slice(1).map((t, i) => t - ts[i]); const lt = window.__perf.lt.filter(x => x[0] >= t0); return { fps: +(d.length / ((ts[ts.length - 1] - ts[0]) / 1000)).toFixed(1), worstFrame: +Math.max(...d).toFixed(1), framesOver20: d.filter(x => x > 20).length, longTasks: lt.length }; });
  const trans = await page.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return (parseFloat(s.transitionDuration) > 0 && s.transitionProperty !== 'none') || (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0); }); return els.length; });
  await o.b.close(); return { sheet: a, session: b, animatedOrTransitioningElements: trans };
}
async function anim() { const n = [], r = []; for (let i = 0; i < Math.min(RUNS, 3); i++) { log('anim run', i + 1); n.push(await animRun(false)); } r.push(await animRun(true)); return { profile: 'mid', normal: n, reducedMotion: r[0] }; }

// ---------- AI ----------
const AI_REPLY = 'Holds load the tendon steadily without the fast stretch-shorten cycle, so pain usually settles while the tendon still gets a strong signal to remodel. ' +
  'Think of it as heavy, slow, controlled work. **Five holds of 45 seconds** at a weight that feels like 7 out of 10 effort is a good start. ' +
  'Pain up to 3 out of 10 during the hold is fine if it settles by the next morning. If it climbs the next day, drop the weight a little, keep the time. ' +
  'Over 6 to 12 weeks most people can move from holds to slow heavy reps, then to faster, springier work. Keep going, and log how it feels after each session so the plan can adjust steadily.';
// a returning user's earlier chat: 12 questions and answers
const FEED = []; for (let i = 0; i < 12; i++) { FEED.push({ t: Date.now() - (30 - i) * 36e5, r: 'u', x: 'Earlier question number ' + i + ' about my knee and how much to hold?' }); FEED.push({ t: Date.now() - (30 - i) * 36e5 + 5000, r: 'm', x: AI_REPLY }); }
const AI_FETCH = (cfg) => {
  const words = cfg.reply.split(/(?<= )/), chunks = []; for (let i = 0; i < words.length; i += 8) chunks.push(words.slice(i, i + 8).join(''));
  const of = window.fetch; window.__aiCalls = [];
  window.fetch = function (u, o) {
    const url = String(u && u.url || u);
    if (/generateContent/.test(url) && !/streamGenerateContent/.test(url)) {
      const A = window.__aj = { call: performance.now(), body: o && o.body ? o.body.length : 0, url }; window.__aiCalls.push(['json', url, A.body]);
      return new Promise(res => setTimeout(() => { A.firstByte = performance.now(); res(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Logged.', actions: [{ type: 'log_food', meal_name: 'Snack', items: [{ name: 'Quinoa salad', grams: 250, protein_g: 9, carbs_g: 40, fat_g: 8, kcal: 280 }] }] }) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })); }, cfg.firstByte));
    }
    if (!/streamGenerateContent/.test(url)) return of.apply(this, arguments);
    let sys = 0, hist = 0, turns = 0; try { const b = JSON.parse(o.body); sys = JSON.stringify(b.systemInstruction).length; hist = JSON.stringify(b.contents).length; turns = b.contents.length; } catch (e) { }
    const A = window.__ai = { call: performance.now(), chunks: [], n: chunks.length, body: o && o.body ? o.body.length : 0, sys, hist, turns, url }, enc = new TextEncoder(); window.__aiCalls.push(['stream', url, A.body]);
    return new Promise(resolve => setTimeout(() => {
      let i = 0;
      const stream = new ReadableStream({ start(c) { const push = () => { if (i >= chunks.length) { A.end = performance.now(); c.close(); return; } c.enqueue(enc.encode('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: chunks[i] }] } }] }) + '\r\n\r\n')); A.chunks.push(performance.now()); i++; setTimeout(push, cfg.gap); }; push(); } });
      A.firstByte = performance.now(); resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    }, cfg.firstByte));
  };
  const watch = () => { const box = document.getElementById('cMsgs'); if (!box) return setTimeout(watch, 50);
    new MutationObserver(() => { const W = window.__w = window.__w || {}; const t = box.textContent;
      if (W.armed && !W.think && box.querySelector('.typing')) { W.think = performance.now(); requestAnimationFrame(() => { W.thinkPaint = performance.now(); }); }
      if (W.armed && !W.card && box.querySelector('.lgc')) { W.card = performance.now(); requestAnimationFrame(() => setTimeout(() => { W.cardPaint = performance.now(); }, 0)); }
      const A = window.__ai; if (!A || !W.armed) return;
      if (!A.firstSeen && t.indexOf(cfg.first) > -1 && t.lastIndexOf(cfg.first) > (W.prevLen || 0)) { A.firstSeen = performance.now(); requestAnimationFrame(() => setTimeout(() => { A.firstPaint = performance.now(); }, 0)); }
      if (!A.lastSeen && t.lastIndexOf(cfg.last) > (W.prevLen || 0)) { A.lastSeen = performance.now(); requestAnimationFrame(() => setTimeout(() => { A.lastPaint = performance.now(); }, 0)); } }).observe(box, { subtree: true, childList: true, characterData: true }); };
  document.addEventListener('DOMContentLoaded', watch);
};
async function aiRun() {
  const { mockGemini } = require('../lib');
  const o = await launch('mid', { before: async ctx => { await mockGemini(ctx, () => ({ reply: 'ok', actions: [] })); await ctx.addInitScript(f => { if (!localStorage.getItem('isohold.coach.feed')) localStorage.setItem('isohold.coach.feed', f); localStorage.setItem('isohold.coach.models', JSON.stringify([{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }, { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' }])); }, JSON.stringify(FEED)); await ctx.addInitScript(AI_FETCH, { reply: AI_REPLY, firstByte: 600, gap: 60, first: 'Holds load the tendon', last: 'plan can adjust steadily' }); } });
  const page = o.page; await boot(o, '#coach'); await page.waitForTimeout(2000);
  const one = async (text) => {
    // a person takes at least a moment between the last key and Enter (the same 300 ms pause for both builds)
    await page.fill('#cIn', text); await page.waitForTimeout(300); await page.evaluate(() => { window.__ai = null; window.__aj = null; window.__w = { armed: true, prevLen: document.getElementById('cMsgs').textContent.length }; window.__lat.arm('keydown'); });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (window.__ai && window.__ai.lastPaint) || (window.__w && window.__w.cardPaint), null, { timeout: 30e3, polling: 30 }).catch(() => {});
    await page.waitForFunction(() => { const A = window.__ai; return !A || A.lastPaint; }, null, { timeout: 30e3, polling: 30 }).catch(() => {});
    await page.waitForTimeout(300);
    return page.evaluate(() => { const A = window.__ai || {}, J = window.__aj || {}, W = window.__w || {}, L = window.__lat.res || {}, s = L.start; const lt = window.__perf.lt.filter(x => x[0] >= s - 5 && x[0] <= s + 5000);
      return { sendPaint: L.paint, thinkPaint: W.thinkPaint ? W.thinkPaint - s : null, called: !!A.call, jsonCalled: !!J.call, sendToFetch: A.call ? A.call - s : J.call ? J.call - s : null, firstWord: A.firstPaint ? A.firstPaint - s : null, overhead: A.firstPaint && A.firstByte ? A.firstPaint - s - (A.firstByte - A.call) : null, firstByteToPaint: A.firstPaint ? A.firstPaint - A.firstByte : null, allPainted: A.lastPaint ? A.lastPaint - s : null,
        cardPaint: W.cardPaint ? W.cardPaint - s : null, jsonOverhead: W.cardPaint && J.firstByte ? W.cardPaint - s - (J.firstByte - J.call) : null, body: A.body || J.body || 0, sys: A.sys, hist: A.hist, turns: A.turns, url: (A.url || J.url || '').replace(/^.*models\//, '').replace(/\?.*/, ''), longest: lt.reduce((m, x) => Math.max(m, x[1]), 0) }; });
  };
  const r = { ask: await one('why do holds help tendons?') };
  r.askAgain = await one('why do holds help tendons?');
  r.ask2 = await one('why do my forearms shake during the suitcase hold?');
  r.json = await one('a quinoa salad with feta');
  r._errs = o.errs.slice(0, 3); await o.b.close(); return r;
}
async function ai() {
  const rows = []; for (let i = 0; i < RUNS; i++) { log('ai run', i + 1); rows.push(await aiRun()); }
  const S = k => { const o = {}; Object.keys(rows[0][k]).forEach(m => { if (typeof rows[0][k][m] === 'number' || rows[0][k][m] === null) o[m] = stat(rows.map(r => r[k][m])); else o[m] = rows[0][k][m]; }); return o; };
  return { profile: 'mid', firstByteDelayMs: 600, open: S('ask'), repeat: S('askAgain'), open2: S('ask2'), log: S('json'), errors: rows.flatMap(r => r._errs).slice(0, 3) };
}

// ---------- offline ----------
async function offlineRun() {
  const { mockGemini } = require('../lib');
  const R = {};
  // Budget phone on Slow 3G, then the connection drops
  let o = await launch('budget', { sw: true, before: ctx => mockGemini(ctx, (b, k) => k === 'chat' ? 'Holds keep the tendon under steady load.' : { reply: 'ok', actions: [] }) }); let page = o.page;
  const t0 = Date.now(); await boot(o); R.bootSlow3G = Date.now() - t0;
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 120e3, polling: 200 }).catch(() => {});
  R.swControlling = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
  const ind = () => page.evaluate(() => { const v = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; return { pill: v(document.getElementById('netPill')), coachBanner: v(document.getElementById('cOff')), text: (document.getElementById('netPill') || {}).textContent || '' }; });
  R.indicatorOnline = await ind();
  await page.evaluate(() => { window.__offAt = 0; addEventListener('offline', () => { window.__offAt = performance.now(); requestAnimationFrame(() => setTimeout(() => { window.__offPaint = performance.now(); }, 0)); }); });
  await o.ctx.setOffline(true); await page.waitForTimeout(800);
  R.indicatorOffline = await ind(); R.offlineEventToPaint = await page.evaluate(() => window.__offPaint ? +(window.__offPaint - window.__offAt).toFixed(1) : null);
  await page.click(SEARCH); await page.waitForTimeout(800);
  await page.fill('#cIn', '2 eggs and toast'); let ts = Date.now(); await page.keyboard.press('Enter'); await page.waitForSelector('#cMsgs .lgc', { timeout: 20e3 }); R.typedLogOffline = Date.now() - ts;
  await page.fill('#cIn', 'why do holds help tendons?'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  R.questionWhileOffline = await page.evaluate(() => [...document.querySelectorAll('#cMsgs .msg')].slice(-1).map(m => m.textContent.trim().slice(0, 140))[0]);
  R.queued = await page.evaluate(() => window.__isoTest && window.__isoTest.aiQueue ? window.__isoTest.aiQueue().length : null);
  await o.ctx.setOffline(false); await page.waitForTimeout(1200);
  R.indicatorBackOnline = await ind();
  R.sendOffer = await page.evaluate(() => { const b = document.querySelector('[data-qsend]'); return b ? b.closest('.msg, .lgc, div').textContent.trim().slice(0, 160) : null; });
  if (R.sendOffer) { ts = Date.now(); await page.click('[data-qsend]'); await page.waitForFunction(() => !document.querySelector('[data-qsend]') && document.querySelector('#cMsgs .msg.m:last-child') && !document.querySelector('#cMsgs .typing'), null, { timeout: 30e3 }).catch(() => {}); R.sendQueuedMs = Date.now() - ts; R.afterSend = await page.evaluate(() => [...document.querySelectorAll('#cMsgs .msg')].slice(-1).map(m => m.textContent.trim().slice(0, 100))[0]); }
  // fully offline: service worker installed, network off, reload
  await o.ctx.setOffline(true); ts = Date.now();
  try { await page.reload({ timeout: 60e3 }); await page.waitForFunction(() => window.__isoholdReady, null, { timeout: 60e3 }); R.offlineReloadBoot = Date.now() - ts; await page.waitForTimeout(500); R.indicatorAfterOfflineReload = await ind(); } catch (e) { R.offlineReloadError = String(e).slice(0, 120); }
  try { if (!(await page.isVisible('#cIn'))) { await page.click(SEARCH); await page.waitForTimeout(500); } await page.fill('#cIn', 'I weigh 80 kg'); await page.keyboard.press('Enter'); await page.waitForSelector('#cMsgs .lgc', { timeout: 20e3 }); R.typedLogAfterOfflineReload = true; } catch (e) { R.typedLogAfterOfflineReload = false; }
  R._errs = o.errs.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|net::/.test(e)).slice(0, 3);
  await o.b.close(); return R;
}
async function offline() { const rows = []; for (let i = 0; i < Math.min(RUNS, 2); i++) { log('offline run', i + 1); rows.push(await offlineRun()); } return { profile: 'budget (6x CPU, Slow 3G), then offline', runs: rows }; }

(async () => {
  const srv = await serve(); const out = { build: BUILD, when: new Date().toISOString(), runs: RUNS };
  try {
    if (ONLY.includes('ai')) out.ai = await ai();
    if (ONLY.includes('taps') || ONLY.includes('cls')) out.taps = await taps();
    if (ONLY.includes('typing')) out.typing = await typing();
    if (ONLY.includes('anim')) out.anim = await anim();
    if (ONLY.includes('offline')) out.offline = await offline();
  } catch (e) { out.fatal = String(e && e.stack || e).slice(0, 800); }
  process.stdout.write(JSON.stringify(out, null, 1) + '\n'); srv.close();
  if (BUILD === 'old') fs.rmSync(DIR, { recursive: true, force: true });
})();
