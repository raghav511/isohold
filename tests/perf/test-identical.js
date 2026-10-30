// Same data in, same numbers and text out: the old build (origin/main, or --old=<git ref>) and this build are loaded with the
// same saved states, the same fixed clock and the same random numbers, and every derived result is compared as JSON:
// strengthData, dailyIdx, strChange, curMax for every exercise/kind/equipment and every other lift, covDone, covPlan,
// bodyWeek, buildQueue for every day, part and phase, parseText for 200+ typed lines (test-parse inputs, every food, the
// Spanish food lines), and the rendered text of Today, Exercises and Progress (each Progress tab, then with every
// "details" opened, so lazily built lists are compared too).
//
//   cd tests && node perf/test-identical.js [--old=origin/main] [--states=seed,10x] [--100x]
// Ports 8952 (old) and 8953 (new).
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { execSync } = require('child_process');
const { open, ROOT } = require('../lib');
const ARGS = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const OLD_REF = ARGS.old || 'origin/main', P_OLD = 8952, P_NEW = 8953;
const FIX = path.join(ROOT, 'tests', 'fixtures'), SEED = require(path.join(FIX, 'seed-week4.json'));

// ---------- data: the same 1x / 10x generator as perf/baseline.js ----------
const DAY = 864e5;
function oneX() {
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
const STATES = [['seed-week4', SEED], ['1x (seed + meals, notes)', oneX()]]
  .concat(fs.readdirSync(FIX).filter(f => /^[a-z]+-r\d+\.json$/.test(f)).sort().map(f => [f.replace('.json', ''), JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'))]))
  .concat([['10x', scaled(10)]]).concat(ARGS['100x'] ? [['100x', scaled(100)]] : []) // --100x adds 8 years of data (slow on the old build)
  .filter(x => !ARGS.states || String(ARGS.states).split(',').some(w => x[0].indexOf(w) > -1)); // --states=seed,10x to run a few

// ---------- typed lines: test-parse inputs, every food, the Spanish food lines from test-foods ----------
function lines() {
  const out = [], src = f => fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8');
  for (const m of src('test-parse.js').matchAll(/^\s*\[\s*(['"])((?:\\.|(?!\1).)*)\1\s*,/gm)) out.push(m[2].replace(/\\'/g, "'"));
  for (const m of src('test-foods.js').matchAll(/\['([a-záéíóúñ ]+)', '[A-Z][^']*'\]/g)) out.push('2 ' + m[1], m[1] + ' 200', 'comí ' + m[1] + ' con arroz');
  return out; // plus one line per food, built in the page from FOODS (below)
}
const FOOD_LINES = () => window.__isoTest.foods.map((f, i) => { const al = f[1].split('|')[0].replace(/\(\?:[^)]*\)\??/g, '').replace(/[?+*]/g, '').replace(/\[[^\]]*\]\+?/g, 'chicken'); return (i % 3 === 0 ? '2 ' : i % 3 === 1 ? '150 g ' : 'a bowl of ') + al + (i % 4 === 0 ? ' and 100g rice' : ''); });

// ---------- servers: old build from git, new build from the work tree ----------
function serveDir(dir, port) {
  return new Promise(res => { const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(dir, p); if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'Content-Type': /\.html$/.test(f) ? 'text/html; charset=utf-8' : /\.json$/.test(f) ? 'application/json' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(port, () => res(srv)); });
}

// fixed clock and seeded random numbers, so both builds see the same "now"
const NOW = Math.floor(Date.now() / 36e5) * 36e5;
const DETERMINISM = () => { let x = 123456789; Math.random = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e9) / 1e9; }; };
const STATE_INIT = s => { try { if (!localStorage.getItem('isohold.v1')) localStorage.setItem('isohold.v1', s); } catch (e) { window.__ISOHOLD_STATE = JSON.parse(s); } };

async function collect(port, state, typed) {
  const o = await open('android', { before: async ctx => { await ctx.clock.setFixedTime(NOW); await ctx.addInitScript(DETERMINISM); await ctx.addInitScript(STATE_INIT, JSON.stringify(state)); } });
  const page = o.page; page.setDefaultTimeout(180e3);
  try {
    await page.goto(`http://localhost:${port}/index.html`, { timeout: 120e3 }); await page.waitForFunction(() => window.__isoholdReady, null, { timeout: 120e3 });
    await page.waitForTimeout(300);
    // rendered text first (so the new build's step-by-step path for a long log is what gets drawn), then the numbers
    const TX = {};
    // a very long log is worked through in steps: wait until no card still says "Working out"
    const text = async sel => { await page.waitForFunction(s => !/Working out your/.test(document.querySelector(s).innerText), sel, { timeout: 120e3 }); return page.evaluate(s => document.querySelector(s).innerText, sel); };
    await page.click('#tab-train'); await page.waitForTimeout(150); TX['text Today'] = await text('#train');
    await page.click('#tab-exercises'); await page.waitForTimeout(150); TX['text Exercises'] = await text('#exercises');
    await page.click('#tab-progress'); await page.waitForTimeout(250);
    for (const pt of ['muscles', 'strength', 'body']) { await page.click('#pt-' + pt).catch(() => {}); await page.waitForTimeout(250); TX['text Progress ' + pt] = await text('#progress'); }
    await page.evaluate(() => document.querySelectorAll('#progress details').forEach(d => { d.open = true; }));
    await page.waitForTimeout(300);
    for (const pt of ['muscles', 'strength', 'body']) { await page.click('#pt-' + pt).catch(() => {}); await page.waitForTimeout(250); await page.evaluate(() => document.querySelectorAll('#progress details').forEach(d => { d.open = true; })); await page.waitForTimeout(200); TX['text Progress ' + pt + ' (all open)'] = await text('#progress'); }
    const data = await page.evaluate(([typed, foodLines]) => {
      const T = window.__isoTest, st = T.store();
      // JSON that survives cycles and functions (exercise objects in a queue point at shared data)
      const J = v => { const stack = []; return JSON.stringify(v, function (k, x) { if (typeof x === 'function') return '[fn]'; if (x && typeof x === 'object') { while (stack.length && stack[stack.length - 1] !== this) stack.pop(); if (stack.indexOf(x) > -1) return '[cycle]'; stack.push(x); } return x; }); };
      const R = {};
      const put = (k, f) => { try { R[k] = J(f()); } catch (e) { R[k] = 'THREW ' + e.message; } };
      put('strengthData', () => T.strengthData());
      put('dailyIdx', () => T.dailyIdx());
      put('strChange', () => T.strChange());
      put('covDone', () => T.covDone());
      put('covPlan', () => T.covPlan());
      put('bodyWeek', () => T.bodyWeek());
      const keys = {}; st.log.forEach(l => { keys[l.id + '|' + l.k + '|' + l.eq] = [l.id, l.k, l.eq]; });
      const cm = {}; Object.keys(keys).sort().forEach(k => { const [id, kk, eq] = keys[k]; cm[k] = [T.curMaxEx(id, kk, eq), T.curMaxEx(id, kk)]; });
      (st.notes || []).forEach(n => { if (n.k === 'lift' && n.name) cm['lift|' + n.name] = T.curMaxLift(n.name); });
      put('curMax', () => cm);
      const phases = []; for (let w = 1; w <= 12; w++) { const p = T.phaseOf(w); if (phases.indexOf(p) < 0) phases.push(p); }
      const bq = {}; T.allDays().forEach((d, di) => ['am', 'pm', 'all', 'short-am', 'short-pm', 'short-all'].forEach(part => phases.forEach((ph, pi) => { try { bq[di + '|' + part + '|' + pi] = T.buildQueue(d, part, ph); } catch (e) { bq[di + '|' + part + '|' + pi] = 'THREW ' + e.message; } })));
      put('buildQueue', () => bq);
      const all = typed.concat(eval(foodLines)());
      const pr = all.map(t => { try { return [t, T.parseText(t)]; } catch (e) { return [t, 'THREW ' + e.message]; } });
      put('parseText', () => pr);
      R._nLines = all.length;
      return R;
    }, [typed, '(' + FOOD_LINES.toString() + ')']);
    Object.assign(data, TX);
    data._errs = o.errs.slice(0, 3);
    return data;
  } finally { await o.b.close(); }
}
function firstDiff(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; }

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isohold-old-'));
  fs.writeFileSync(path.join(tmp, 'index.html'), execSync(`git show ${OLD_REF}:index.html`, { cwd: ROOT, maxBuffer: 64 << 20 }));
  const sOld = await serveDir(tmp, P_OLD), sNew = await serveDir(ROOT, P_NEW);
  const typed = lines();
  let fail = 0, checks = 0;
  try {
    for (const [name, st] of STATES) {
      const a = await collect(P_OLD, st, typed), b = await collect(P_NEW, st, typed);
      const keys = Object.keys(a).filter(k => k[0] !== '_');
      for (const k of keys) {
        checks++;
        if (a[k] === b[k]) continue;
        fail++; const i = firstDiff(String(a[k]), String(b[k]));
        console.log(`FAIL ${name} | ${k} differs at ${i}:\n  old …${String(a[k]).slice(Math.max(0, i - 80), i + 120)}\n  new …${String(b[k]).slice(Math.max(0, i - 80), i + 120)}`);
      }
      const errs = a._errs.concat(b._errs); if (b._errs.length) { fail++; console.log('FAIL ' + name + ' page errors (new build): ' + b._errs.join(' | ')); }
      console.log(`${name}: ${keys.length} outputs compared (${b._nLines} typed lines, ${Math.round(keys.reduce((t, k) => t + String(b[k]).length, 0) / 1024)} KB of JSON and text)` + (errs.length ? ' errors: ' + errs.join(' | ') : ''));
    }
  } finally { sOld.close(); sNew.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(fail ? `test-identical: ${fail} of ${checks} outputs differ from ${OLD_REF}` : `test-identical: all ${checks} outputs identical to ${OLD_REF}`);
  process.exit(fail ? 1 : 0);
})();
