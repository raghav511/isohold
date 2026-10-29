// Security: a backup code or file is untrusted input (stored XSS), plus the service worker install, cross-tab sync
// and "today" fixes from code review. Numbered as in REDTEAM.md (#27-#30).
const { serve, open, ROOT } = require('./lib'); const http = require('http'), fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8890, SWPORT = 8891, URL = `http://localhost:${PORT}/index.html`;
const BASE = { profile: { units: 'kg', bw: 80, cm: 175, age: 40, sex: 'm', diet: 'any' }, eq: ['k', 'd'] };
const IMG = '<img src=x onerror="window.__pwned=1">', ATTR = '"><img src=x onerror="window.__pwned=1">';
const T = (page, f, a) => page.evaluate(f, a);
async function boot(kind, opts = {}) { const o = await open(kind, Object.assign({ state: BASE }, opts)); await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o; }
const enc = o => 'ISOHOLD1:' + Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
async function backupTab(page) { await page.evaluate(() => document.getElementById('profBtn').click()); await page.waitForTimeout(150); await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(x => /backup/i.test(x.textContent)).click()); await page.waitForTimeout(100); }
async function pasteRestore(page, code) { await backupTab(page); await page.fill('#bkIn', code); await page.click('#bkRestore'); await page.waitForTimeout(300); return T(page, () => document.getElementById('bkMsg').textContent); }
async function fileRestore(page, code) { await backupTab(page); await page.setInputFiles('#bkFileIn', { name: 'isohold-backup.txt', mimeType: 'text/plain', buffer: Buffer.from(code) }); await page.waitForTimeout(400); return T(page, () => document.getElementById('bkMsg').textContent); }
// show every screen a restored value can reach: Today, Progress (all three panels), the profile sheet
async function visitAll(page) {
  await T(page, () => { const c = document.getElementById('sheetClose') || document.querySelector('#sheetWrap [aria-label=Close]'); if (c) c.click(); });
  for (const t of ['tab-progress', 'tab-train']) { await T(page, id => { const e = document.getElementById(id); if (e) e.click(); }, t); await page.waitForTimeout(150); }
  await T(page, () => document.getElementById('tab-progress').click());
  for (const pt of ['strength', 'muscles', 'body']) { await T(page, pt => { const b = document.querySelector('#progress [data-ptab="' + pt + '"]'); if (b) b.click(); }, pt); await page.waitForTimeout(80); }
  await T(page, () => document.getElementById('profBtn').click()); await page.waitForTimeout(150);
  await T(page, () => [...document.querySelectorAll('[role=tab]')].forEach(x => x.click())); await page.waitForTimeout(150);
}
const pwned = page => T(page, () => window.__pwned !== undefined || !!document.querySelector('img[src="x"]') || [...document.querySelectorAll('*')].some(e => e.getAttribute && e.getAttribute('onerror')));

(async () => {
  const srv = await serve(PORT);
  const now = Date.now(), H = 3600e3;
  // the red team's payload, and one per sink, each next to valid data that must still restore
  const valid = { week: 3, done: {}, tests: {}, log: [], fd: [{ t: now - H, meal: 'Lunch', items: [{ n: 'Chicken breast', q: 1, u: 'g', g: 150, p: 46, c: 0, f: 5, k: 240 }], src: 'text' }], bw: [{ t: now - 2 * H, kg: 81 }],
    nt: [{ t: now - 3 * H, k: 'bp', sys: 128, dia: 82, pulse: 64 }, { t: now - 4 * H, k: 'lift', name: 'Bench press', kg: 60, reps: 5, s: null, sets: 1, rpe: 8 }, { t: now - 5 * H, k: 'water', ml: 500 }],
    pf: { units: 'kg', bw: 81, cm: 180, age: 44, sex: 'f', diet: 'vegetarian', name: 'Sam', issues: ['knee'], goal: 'keep' } };
  const CASES = [
    ['red-team payload (BP sys)', { week: 1, done: {}, tests: {}, log: [], nt: [{ t: 1, k: 'bp', dia: 80, sys: IMG }] }],
    ['BP today (dia, pulse)', { nt: [{ t: now - 60000, k: 'bp', sys: 170, dia: IMG, pulse: IMG }] }],
    ['lift reps', { nt: [{ t: now - 7 * H, k: 'lift', name: 'Row', kg: 20, reps: IMG, sets: 1 }] }],
    ['lift t (attribute)', { nt: [{ t: ATTR, k: 'lift', name: 'Row', kg: 20, reps: 5, sets: 1 }] }],
    ['lift kg/sets/rpe/s', { nt: [{ t: now - 8 * H, k: 'lift', name: IMG, kg: IMG, s: 30, sets: IMG, rpe: IMG }] }],
    ['pain score', { nt: [{ t: now - 60000, k: 'pain', area: 'knee', score: IMG }, { t: now - 50000, k: 'pain', area: IMG, score: 6 }] }],
    ['profile age', { pf: Object.assign({}, valid.pf, { age: ATTR }) }],
    ['profile units/cm/name/inv', { pf: Object.assign({}, valid.pf, { units: IMG, cm: ATTR, name: IMG, inv: { k: ATTR }, issues: [IMG, 'knee'], diet: IMG }) }],
    ['food name and meal', { fd: [{ t: now - 60000, meal: IMG, items: [{ n: IMG, q: IMG, g: 100, p: IMG, k: 100, u: IMG }], src: IMG }] }],
    ['log, done, tests, cust, eq', { log: [[now - 9 * H, 3, 'wall-sit', IMG, 'h', IMG, 30], [now - 9 * H, 3, ATTR, 'k', 'h', 10, 30]], done: { [ATTR]: IMG, w3x: now }, tests: { 'wall-sit': { load: IMG, a: ATTR }, [IMG]: { a: 1 } }, cust: { [IMG]: { add: [IMG], off: {} }, d1am: { add: ['wall-sit', IMG], off: { 'wall-sit': { h: true }, [IMG]: { h: true } } } }, eq: [IMG, 'k'] }],
  ];
  for (const kind of ['android', 'iphone']) {
    for (const [i, [name, bad]] of CASES.entries()) {
      const code = enc(Object.assign({}, valid, bad, { nt: valid.nt.concat(bad.nt || []), fd: valid.fd.concat(bad.fd || []) }, name.startsWith('red-team') ? { nt: bad.nt, fd: undefined, pf: undefined } : {}));
      const how = i % 2 ? 'file' : 'paste';
      const { b, page, errs } = await boot(kind);
      const said = how === 'file' ? await fileRestore(page, code) : await pasteRestore(page, code);
      await visitAll(page);
      ok(!(await pwned(page)), kind + ' #27 restoring a code with HTML in ' + name + ' (' + how + ') runs no script and adds no <img src=x>');
      ok(/Restored week/.test(said), kind + ' #27 ' + name + ': the code still restores (' + said + ')');
      if (!name.startsWith('red-team')) {
        const st = await T(page, () => { const s = window.__isoTest.store(); return { lift: s.notes.some(n => n.k === 'lift' && n.name === 'Bench press' && n.reps === 5), bp: s.notes.some(n => n.k === 'bp' && n.sys === 128), food: s.food.some(m => m.items.some(i => i.n === 'Chicken breast' && i.p === 46)), w: s.body.some(x => x.kg === 81), week: s.week, pf: s.profile };
        });
        ok(st.lift && st.bp && st.food && st.w && st.week === 3, kind + ' #27 ' + name + ': the valid entries are restored ' + JSON.stringify(st).slice(0, 160));
      }
      if (name === 'profile age') ok(await T(page, () => { const p = window.__isoTest.store().profile; return p.age === undefined && p.cm === 180 && p.sex === 'f' && p.diet === 'vegetarian'; }), kind + ' #27 a bad profile age is dropped, the rest of the profile restores');
      if (name === 'profile units/cm/name/inv') ok(await T(page, () => { const p = window.__isoTest.store().profile; return p.units === undefined && p.cm === undefined && p.diet === undefined && JSON.stringify(p.issues) === '["knee"]' && typeof p.name === 'string' && p.name.length <= 40; }), kind + ' #27 profile choices are whitelisted and text is cut to length');
      if (name === 'lift t (attribute)') ok(await T(page, () => !window.__isoTest.store().notes.some(n => n.name === 'Row')), kind + ' #27 an entry without a real time is dropped');
      if (name === 'log, done, tests, cust, eq') ok(await T(page, () => { const s = window.__isoTest.store(); return JSON.stringify(s.eq) === '["k"]' && Object.keys(s.done).join() === 'w3x' && Object.keys(s.tests).join() === 'wall-sit' && JSON.stringify(s.cust) === '{"d1am":{"add":["wall-sit"],"off":{"wall-sit":{"h":true,"r":false}}}}' && s.log.length === 1 && s.log[0].eq === null && s.log[0].kg === 0; }), kind + ' #27 log, done, tests, plan changes and equipment keep only valid fields');
      ok(!errs.length, kind + ' #27 ' + name + ': no page or CSP errors ' + errs);
      await b.close();
    }

    // escaping at the sinks, for data that is already stored (an older version, or another way in): render it and nothing runs
    const bad = JSON.parse(JSON.stringify(BASE)); bad.profile.age = ATTR; bad.profile.cm = ATTR; bad.profile.units = 'kg';
    bad.notes = [{ t: now - 60000, k: 'bp', sys: '170' + IMG, dia: IMG, pulse: IMG }, { t: now - 2 * H, k: 'lift', name: 'Row', kg: 20, reps: IMG, s: null, sets: IMG, rpe: IMG }, { t: ATTR, k: 'lift', name: 'Row', kg: 20, reps: 5, sets: 1 }, { t: now - 30000, k: 'pain', area: 'knee', score: '7' + IMG }];
    {
      const { b, page } = await boot(kind, { state: bad });
      await visitAll(page);
      ok(!(await pwned(page)), kind + ' #27 stored values with HTML (BP, lift reps/sets/RPE/time, pain score, profile age/height) are escaped where they are shown');
      await b.close();
    }

    // CSP: present, and the app still works (Gemini is reachable; nothing else is)
    {
      const { b, page, errs } = await boot(kind);
      const csp = await T(page, () => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
      ok(/object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) && /connect-src 'self' https:\/\/generativelanguage\.googleapis\.com/.test(csp) && /img-src 'self' data: blob:/.test(csp), kind + ' #27 a Content-Security-Policy limits plugins, <base> and where data can be sent (' + csp + ')');
      const blocked = await T(page, () => fetch('https://example.com/steal', { mode: 'no-cors' }).then(() => false, () => true));
      ok(blocked, kind + ' #27 the CSP stops a fetch to another site');
      await T(page, () => window.__isoTest.handle('2 eggs')); await T(page, () => document.getElementById('tab-progress').click()); await page.waitForTimeout(150);
      ok(!errs.filter(e => !/example\.com|Content Security Policy|Refused to connect/i.test(e)).length, kind + ' #27 the app runs with the CSP without errors ' + errs);
      await b.close();
    }

    // ---- 29. cross-tab sync mirrors deletions ----
    {
      const { b, ctx, page } = await boot(kind);
      const p2 = await ctx.newPage(); await p2.goto(URL); await p2.waitForFunction(() => window.__isoholdReady);
      await T(p2, () => { const s = JSON.parse(localStorage.getItem('isohold.v1')); s.took = { w1a: 600 }; s.cmin = { w1a: 7 }; localStorage.setItem('isohold.v1', JSON.stringify(s)); });
      await page.waitForTimeout(300);
      const got = await T(page, () => !!(window.__isoTest.store().took && window.__isoTest.store().cmin));
      await T(p2, () => { const s = JSON.parse(localStorage.getItem('isohold.v1')); delete s.took; delete s.cmin; delete s.profile; localStorage.setItem('isohold.v1', JSON.stringify(s)); });
      await page.waitForTimeout(300);
      const gone = await T(page, () => { const s = window.__isoTest.store(); return s.took === undefined && s.cmin === undefined && s.profile === undefined && Array.isArray(s.notes) && Array.isArray(s.log); });
      await T(page, () => window.__isoTest.handle('drank 500 ml of water'));
      const saved = await T(page, () => JSON.parse(localStorage.getItem('isohold.v1')));
      ok(got && gone && saved.took === undefined && saved.cmin === undefined && saved.profile === undefined && saved.notes.some(n => n.k === 'water'), kind + ' #29 data removed in another tab is removed here too, and not brought back by this tab\'s next save');
      await b.close();
    }

    // ---- 30. today() has an upper bound ----
    {
      const { b, page } = await boot(kind);
      const r = await T(page, () => { const t = window.__isoTest, s = t.dayStart(), n = Date.now();
        return { future: t.today([{ t: n + 3 * 864e5 }, { t: s + 30 * 3600e3 }]).length, now: t.today([{ t: n }, { t: n + 1000 }]).length,
          crossed: t.today([{ t: n, d: t.dayStart(s - 3600e3) }]).length, started: t.today([{ t: n + 1000, d: s }]).length }; });
      ok(r.future === 0 && r.now === 2 && r.crossed === 0 && r.started === 1, kind + ' #30 entries dated tomorrow or later are not counted as today; a session keeps the day it started on ' + JSON.stringify(r));
      await T(page, () => { const s = window.__isoTest.store(); s.food.push({ t: Date.now() + 5 * 864e5, meal: 'Dinner', items: [{ n: 'Chicken breast', q: 1, g: 150, p: 46, c: 0, f: 5, k: 240 }], src: 'text' }); });
      await T(page, () => document.getElementById('tab-train').click()); await page.waitForTimeout(100);
      const prot = await T(page, () => window.__isoTest.today(window.__isoTest.store().food).length);
      ok(prot === 0, kind + ' #30 a meal dated 5 days ahead (clock set ahead, restored backup) is not in today\'s protein');
      await b.close();
    }
  }

  // ---- static: esc() and the service worker's install ----
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const escSrc = (html.match(/function esc\(s\) \{[^\n]*\}/) || [''])[0];
  ok(/&#39;/.test(escSrc) && /&gt;/.test(escSrc) && /&quot;/.test(escSrc) && /&lt;/.test(escSrc), '#27 esc() escapes & < > " and \'');
  ok(/addAll\(F\.map\(function \(u\) \{ return new Request\(u, \{ cache: "reload" \}\)/.test(sw), '#28 the service worker installs with cache: "reload"');

  // ---- 28. a new service worker caches the new index.html, not the one in the browser's HTTP cache ----
  let bump = 0;
  const sws = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    let body = fs.readFileSync(f);
    if (p === '/index.html' && bump) body = body.toString().replace(/var APP_VERSION = '(\d+)'/, (m, v) => "var APP_VERSION = '" + (+v + bump) + "'");
    if (p === '/sw.js' && bump) body = body.toString().replace(/isohold-v(\d+)/, (m, v) => 'isohold-v' + (+v + bump));
    // like GitHub Pages: the app may be cached for 10 minutes; the service worker script itself is always checked
    r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : p.endsWith('.json') ? 'application/json' : 'image/png', 'Cache-Control': p === '/sw.js' ? 'no-cache' : 'max-age=600' }); r.end(body); }).listen(SWPORT);
  {
    const kind = 'android';
    const { b, page } = await open(kind, { sw: true, state: BASE });
    await page.goto(`http://localhost:${SWPORT}/index.html`);
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => { });
    bump = 1;
    const res = await T(page, async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
      for (let i = 0; i < 100; i++) { const k = await caches.keys(); if (k.length === 1 && reg.active && !reg.installing && !reg.waiting) break; await new Promise(r => setTimeout(r, 100)); }
      const k = await caches.keys(), c = await caches.open(k.sort().pop()), m = await c.match('index.html');
      return { keys: k, ver: m ? ((await m.text()).match(/var APP_VERSION = '(\d+)'/) || [])[1] : null };
    });
    const want = String(+html.match(/var APP_VERSION = '(\d+)'/)[1] + 1);
    ok(res.ver === want, kind + ' #28 a new service worker saves the new index.html (version ' + want + '), not the HTTP-cached one ' + JSON.stringify(res));
    await b.close();
  }
  sws.close();
  console.log(pass + ' passed, ' + fail + ' failed'); srv.close();
  process.exit(fail ? 1 : 0);
})();
