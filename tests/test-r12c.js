// Round 12 numbers and safety: one current estimated max everywhere, Reverse Nordic falls note and one listing,
// knee/floor notes in the Exercises tab, pain advice names today's exercise, coverage uses the map's regions,
// a true body-map sentence, bodyweight without drift, an honest flat strength line, hold weights from rep weights,
// starting weights from logged lifts, lats named.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8681, URL = `http://localhost:${PORT}/index.html`;
const T = (page, f, a) => page.evaluate(f, a);
const DAY = 864e5, NOW = Date.now();
async function boot(st) {
  const o = await open('android', { state: st, viewport: { width: 412, height: 915 } });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  return o;
}
const base = (o) => Object.assign({ week: 1, done: {}, tests: {}, wt: {}, log: [], eq: ['d'], cust: {}, food: [], body: [], notes: [] }, o);
const lift = (t, name, kg, reps, rpe) => ({ t, k: 'lift', name, kg, reps, s: null, sets: 1, rpe: rpe || null });
const L = (t, id, k, eq, kg, v, x) => Object.assign({ t, w: 1, id, eq, k, kg, v, x: 1 }, x || {});
(async () => {
  const srv = await serve(PORT);
  let b, page, errs;

  // ---- 1. Dev: one current estimated max for squat on every screen ----
  {
    const st = base({ eq: ['d', 'b', 'c'], profile: { units: 'kg', bw: 89.8, age: 29, sex: 'm', where: 'gym', issues: [], days: 4 },
      notes: [lift(NOW - 60 * DAY, 'Back Squat', 200, 1), lift(NOW - 14 * DAY, 'Back Squat', 160, 5, 7), lift(NOW - 7 * DAY, 'Back Squat', 185, 1, 9), lift(NOW - 3600e3, 'Back Squat', 180, 3, 8)] });
    ({ b, page, errs } = await boot(st));
    const cm = await T(page, () => { const c = window.__isoTest.curMaxLift('Back Squat'); return { e: Math.round(c.e * 10) / 10, kg: c.kg, v: c.v }; });
    ok(cm.e === 210 && cm.kg === 180 && cm.v === 3, 'current max = best of the last 6 weeks: 180 × 3 @8 → 210 (' + JSON.stringify(cm) + ')');
    const tie = await T(page, () => window.__isoTest.curMax([{ e: 100, t: Date.now() - 5 * 864e5, n: 'old' }, { e: 100, t: Date.now() - 864e5, n: 'new' }, { e: 120, t: Date.now() - 50 * 864e5, n: 'stale' }]).n);
    ok(tie === 'new', 'a tie goes to the most recent set, and a set older than 6 weeks is not current (' + tie + ')');
    await page.click('#tab-progress'); await page.click('#pt-muscles'); await page.waitForTimeout(150);
    const mus = await T(page, () => document.querySelector('#mapCard .mlist').textContent + ' ' + (document.querySelector('#mapDet') || {}).textContent);
    ok(/210 kg/.test(mus) && !/≈ ?(203|197|207)/.test(mus), 'strength map: 210 kg for squat (' + (mus.match(/[^.]{0,40}210 kg[^.]{0,40}/) || [mus.slice(0, 120)])[0] + ')');
    await page.click('#pt-strength'); await page.waitForTimeout(150);
    const each = await T(page, () => { const li = [...document.querySelectorAll('#dailyCard li[data-exkey]')].find(x => /Back Squat/.test(x.textContent)); return li ? li.textContent : ''; });
    ok(/Estimated max 210 kg \(from 180 kg × 3 reps @ RPE 8/.test(each), 'each exercise against its start: 210 kg, from the named set (' + each + ')');
    const other = await T(page, () => document.getElementById('progExtras').textContent);
    ok(/estimated max 210 kg \(best of the last 6 weeks, from 180 kg × 3/.test(other), 'Other lifts: 210 kg from the same set');
    const ans = await T(page, () => window.__isoTest.localAnswer('what is my squat estimated max?') || '');
    ok(/210 kg/.test(ans) && /180 kg × 3/.test(ans), 'coach answer: 210 kg from 180 × 3 (' + ans + ')');
    await page.locator('[data-tool="search"]:visible').first().click(); await page.waitForTimeout(400);
    await page.fill('#cIn', 'squat'); await page.waitForTimeout(450);
    const sr = await page.locator('#cSrch').innerText();
    ok(/estimated max 210 kg \(from 180 kg × 3/.test(sr), 'search "Your lifts": 210 kg and its set (' + sr.replace(/\n/g, ' | ').slice(0, 200) + ')');
    await page.fill('#cIn', ''); await page.goto(URL); await page.waitForFunction(() => window.__isoholdReady); await page.click('#tab-progress'); await page.click('#pt-strength'); await page.waitForTimeout(100);
    await page.click('#chkCard [data-chk="str"]'); await page.waitForTimeout(150);
    await page.selectOption('#chkEx', 'lift:Back Squat|b'); await page.waitForTimeout(150);
    await page.fill('#chkKg', '150'); await page.fill('#chkReps', '8'); await page.waitForTimeout(80);
    const res = await page.textContent('#chkRes');
    ok(/vs your current estimated max, 210 kg \(from 180 kg × 3/.test(res), 'Strength check compares with the same 210 kg (' + res + ')');
    await page.click('#sheetClose'); await page.waitForTimeout(150);
    await T(page, () => window.__isoTest.handle('squat 185 kg 3 reps @8')); await page.waitForTimeout(250);
    const card = await T(page, () => window.__isoTest.feed().filter(x => x.k === 'set').pop());
    ok(card && card.pb && /Estimated max now 215\.8 kg \(from 185 kg × 3 reps @ RPE 8/.test(card.sub || ''), 'new best uses the same estimate and names it (' + (card && card.sub) + ')');
    await T(page, () => window.__isoTest.handle('squat 150 kg 3 reps @8')); await page.waitForTimeout(250);
    const c2 = await T(page, () => window.__isoTest.feed().filter(x => x.k === 'set').pop());
    ok(c2 && !c2.pb && /Estimated max now 215\.8 kg/.test(c2.sub || ''), 'a lighter set is no new best, and the card keeps the current max');
    ok(!errs.length, 'no page errors (1) ' + errs); await b.close();
  }

  // ---- 2. Fatima (osteopenia, 52): Reverse Nordic falls note, listed once ----
  {
    const st = base({ eq: ['d'], profile: { units: 'kg', bw: 68, age: 52, sex: 'f', where: 'home', issues: ['bones'], days: 3, split: 'one', len: 25, inv: { d: '4, 6, 8' } } });
    ({ b, page, errs } = await boot(st));
    const m = await T(page, () => ({ rn: window.__isoTest.modTxt('rev-nordic', 'h'), ws: window.__isoTest.modTxt('wall-sit', 'r'), wsh: window.__isoTest.modTxt('wall-sit', 'h') }));
    ok(/Falls/.test(m.rn) && /hands ready/.test(m.rn) && /band or machine leg extension/.test(m.rn), 'osteopenia: Reverse Nordic Hold has the falls note (' + m.rn + ')');
    ok(/Falls/.test(m.ws) && !/Falls/.test(m.wsh), 'the Wall Sit\'s kneeling Reverse Nordic reps have it, the wall sit itself doesn\'t');
    const q = await T(page, () => { const t = window.__isoTest, out = []; t.allDays().forEach(d => t.buildQueue(d, 'all', t.phaseOf(1)).forEach(i => { if (/Reverse Nordic/.test(i.ex && i.ex.name || '')) out.push(i.mod || ''); })); return out; });
    ok(q.length && q.every(x => /Falls/.test(x)), 'every Reverse Nordic set in the sessions carries the note (' + q.length + ')');
    await page.click('#tab-exercises'); await page.waitForTimeout(250);
    const lib = await T(page, () => [...document.querySelectorAll('#lib [data-ex]')].map(r => ({ id: r.dataset.ex, t: r.textContent })));
    const rnRows = lib.filter(r => /Reverse Nordic/.test(r.t));
    ok(rnRows.length === 1 && rnRows[0].id === 'wall-sit', 'Reverse Nordic appears once in the Exercises list (' + rnRows.map(r => r.id) + ')');
    ok(/Falls/.test(rnRows[0] && rnRows[0].t), 'and that row shows the falls note');
    const st2 = base({ eq: ['d'], profile: { units: 'kg', bw: 68, age: 40, sex: 'f', where: 'home', issues: [], days: 3 } });
    await b.close(); ({ b, page, errs } = await boot(st2));
    ok(!(await T(page, () => window.__isoTest.modTxt('rev-nordic', 'h'))), 'no falls note for a 40-year-old without bone issues');
    ok(!errs.length, 'no page errors (2) ' + errs); await b.close();
  }

  // ---- 3. Ravi (knees, no floor work, 67): notes in the Exercises tab, a safe Wall Sit partner ----
  {
    const st = base({ eq: ['d'], profile: { units: 'kg', bw: 70, age: 67, sex: 'm', where: 'home', issues: ['knee', 'bp'], nofloor: true, days: 3, split: 'one', inv: { d: '3' } } });
    ({ b, page, errs } = await boot(st));
    await page.click('#tab-exercises'); await page.waitForTimeout(250);
    const row = id => T(page, i => { const r = document.querySelector('#lib [data-ex="' + i + '"]'); return r ? r.textContent : null; }, id);
    const rn = await row('rev-nordic'), pp = await row('pushup-plus'), ws = await row('wall-sit');
    ok(rn && /Left out of your plan: kneeling, for your knees/.test(rn), 'Reverse Nordic Hold: "Left out of your plan: kneeling, for your knees" (' + rn + ')');
    ok(pp && /Left out of your plan: floor work/.test(pp), 'Push-Up Plus: left out for no floor work (' + pp + ')');
    ok(ws && /Goblet Squat to a chair/.test(ws) && !/Then Dumbbell Reverse Nordic|Then Reverse Nordic/.test(ws), 'Wall Sit pairs with a goblet squat to a chair, not the kneeling Reverse Nordic (' + ws + ')');
    await page.click('#lib [data-ex="wall-sit"]'); await page.waitForTimeout(250);
    await page.click('#sheetBody .seg button[data-p="rep"]'); await page.waitForTimeout(200);
    const sh = await T(page, () => ({ h: document.querySelector('#dBody h3').textContent, note: (document.querySelector('#dBody .d-safe') || {}).textContent || '' }));
    ok(/Goblet Squat/.test(sh.h) && !/Nordic/.test(sh.h) && /kneeling/i.test(sh.note), 'Wall Sit sheet, Growth reps: the safe partner with the reason (' + sh.h + ' / ' + sh.note + ')');
    ok(!errs.length, 'no page errors (3) ' + errs); await b.close();
  }

  // ---- 4. Pain advice names the exercise in today's plan ----
  {
    const st = base({ eq: ['d'], profile: { units: 'kg', bw: 68, age: 52, sex: 'f', where: 'home', issues: ['bones'], days: 3, split: 'one', len: 25, inv: { d: '4, 6, 8' } } });
    ({ b, page, errs } = await boot(st));
    const r = await T(page, () => { const t = window.__isoTest, s = t.store(), d = t.allDays()[0], names = t.buildQueue(d, 'all', t.phaseOf(s.week)).filter(i => i.id).map(i => i.ex.name); return { names, adv: t.painAdvice({ area: 'back', score: 3 })[0] }; });
    const said = (r.adv.match(/Keep an eye on ([^.]+)\./) || [, ''])[1].split(', ').filter(Boolean);
    ok(said.length && said.every(n => r.names.some(x => x.indexOf(n) > -1)), 'back pain 3/10 names exercises from today\'s plan (' + said.join(', ') + ')');
    ok(/Swing/.test(r.adv) && !/Bird Dog\b(?! Hold)/.test(r.adv.replace(/Bird Dog Hold/g, '')), 'it names the Swing done today (' + r.adv + ')');
    ok(!errs.length, 'no page errors (4) ' + errs); await b.close();
  }

  // ---- 5 & 6. Coverage uses the map's regions; the body-map sentence is true ----
  {
    const st = base({ eq: ['d', 'b', 'c'], profile: { units: 'kg', bw: 70, age: 35, sex: 'm', where: 'gym', issues: [], days: 3, split: 'one' },
      log: [L(NOW - 3600e3, 'sl-balance', 'h', 'd', 4, 30)],
      notes: ['Bench Press', 'Back Squat', 'Deadlift', 'Barbell Row', 'Overhead Press', 'Barbell Curl', 'Calf Raise', 'Crunch', 'Farmer Carry'].map((n, i) => lift(NOW - 3600e3 + i, n, 40, 8)) });
    ({ b, page, errs } = await boot(st));
    await page.click('#tab-progress'); await page.click('#pt-muscles'); await page.waitForTimeout(150);
    const cov = await T(page, () => {
      const t = window.__isoTest, cd = t.covDays(), want = {};
      cd.forEach(x => x.q.forEach(it => t.exRegions(it.id, it.wk, it.ex && it.ex.eq).on.forEach(r => { want[r] = (want[r] || 0) + 1; })));
      const got = {}; [...document.querySelectorAll('#cov tbody tr[data-reg]')].forEach(tr => { const td = tr.querySelectorAll('td'); got[tr.dataset.reg] = parseInt(td[td.length - 2].innerText, 10) || 0; });
      const chestCard = cd.some(x => x.q.some(it => t.exRegions(it.id, it.wk, it.ex && it.ex.eq).on.indexOf('chest') > -1));
      return { want, got, chestCard, rows: Object.keys(got) };
    });
    ok(cov.rows.length === 16 && Object.keys(cov.got).every(r => (cov.want[r] || 0) === cov.got[r]), 'planned per week = the body map\'s regions for every row (' + JSON.stringify(cov.got) + ')');
    ok(!cov.chestCard || cov.got.chest > 0, 'chest is planned when a day works the chest (' + cov.got.chest + ')');
    await page.click('#tab-train'); await page.waitForTimeout(150);
    const bm = await T(page, () => ({ txt: document.getElementById('bodyCard').innerText, got: window.__isoTest.bodyWeek() }));
    const partly = Object.keys(bm.got).filter(r => bm.got[r] === 'part'), gaps = Object.keys(await T(page, () => window.__isoTest.BM_NAME)).filter(r => !bm.got[r]);
    ok(partly.length > 0 && !gaps.length, 'setup: no gaps, ' + partly.length + ' partly (' + partly + ')');
    ok(!/Every muscle part/.test(bm.txt) && /fully trained this week; \d+ partly/.test(bm.txt), 'body map says how many are only partly trained (' + bm.txt.replace(/\n/g, ' | ').slice(0, 220) + ')');
    ok(!errs.length, 'no page errors (5/6) ' + errs); await b.close();
  }

  // ---- 7. Bodyweight: 197.4 lb stays 197.4 ----
  {
    const st = base({ eq: ['d', 'b'], profile: { units: 'lb', bw: 89.8, age: 29, sex: 'm', cm: 178, where: 'gym', issues: [] } });
    ({ b, page, errs } = await boot(st));
    await T(page, () => window.__isoTest.handle('I weigh 197.4 lb')); await page.waitForTimeout(200);
    await page.click('#profBtn'); await page.waitForTimeout(200);
    ok(await page.inputValue('#pfBw') === '197.4', 'profile shows 197.4 lb after logging 197.4 (' + await page.inputValue('#pfBw') + ')');
    await page.click('#pfSave'); await page.waitForTimeout(150);
    ok(await T(page, () => window.__isoTest.store().body.length) === 1, 'saving the untouched profile adds no weigh-in');
    ok(!errs.length, 'no page errors (7) ' + errs); await b.close();
  }

  // ---- 8. Strength line: a flat run is a real plateau, and says so ----
  {
    const days = [20, 18, 16, 13, 11, 9, 6, 4].map(d => NOW - d * DAY);
    const log = []; days.forEach((t, i) => { log.push(L(t, 'lateral-raise', 'h', 'd', 4, i ? 40 : 30)); });
    const st = base({ eq: ['d'], profile: { units: 'kg', bw: 68, age: 52, sex: 'f', where: 'home', issues: [], days: 3 }, log });
    ({ b, page, errs } = await boot(st));
    const v = await T(page, () => { const t = window.__isoTest, D = t.dailyIdx(), s = Object.keys(D.s).sort().map(k => D.s[k]); const h = l => t.holdMax({ id: 'lateral-raise', kg: 4, v: l }).est; return { s, want: h(40) / h(30) * 100 }; });
    ok(v.s.slice(1).every(x => Math.abs(x - v.want) < 0.01), 'each flat day is the real 40 s vs 30 s hold estimate (' + Math.round(v.want) + '), not a capped or stale value');
    await page.click('#tab-progress'); await page.click('#pt-strength'); await page.waitForTimeout(150);
    const fl = await T(page, () => (document.querySelector('#dailyCard .dflat') || {}).textContent || '');
    ok(/stayed at \d+ for your last 7 training days/.test(fl) && /haven’t changed/.test(fl), 'the flat line explains itself (' + fl + ')');
    ok(!errs.length, 'no page errors (8) ' + errs); await b.close();
  }

  // ---- Chloe: hold weight from rep weight, starting weights from logged lifts, lats named ----
  {
    const P = { units: 'kg', bw: 68, age: 34, sex: 'f', where: 'gym', issues: [], days: 3 };
    const st = base({ eq: ['d', 'b', 'c'], profile: P, log: [L(NOW - 2 * DAY, 'wall-sit', 'r', 'c', 130, 12), L(NOW - 2 * DAY + 1, 'wall-sit', 'h', 'c', 10, 30, { sug: 1 })],
      notes: [lift(NOW - 9 * DAY, 'Lat Pulldown', 45, 10), lift(NOW - DAY, 'Lat Pulldown', 50, 10), lift(NOW - DAY, 'Hip Thrust', 70, 10), lift(NOW - DAY, 'Bench Press', 40, 8, 8), lift(NOW - DAY, 'Leg Press', 140, 10)] });
    ({ b, page, errs } = await boot(st));
    const w = await T(page, () => window.__isoTest.getWt('wall-sit', 'h', 'c'));
    ok(w >= 0.6 * 130 && w <= 0.8 * 130, 'Leg Press Hold suggests about 70% of the 130 kg reps, not 10 kg (' + w + ')');
    const lv = await T(page, () => ({ lvl: window.__isoTest.trainLevel(), lr: window.__isoTest.suggestWt('lateral-raise', 'h'), cu: window.__isoTest.suggestWt('curl', 'r') }));
    await b.close(); ({ b, page, errs } = await boot(base({ eq: ['d', 'b', 'c'], profile: P })));
    const nv = await T(page, () => ({ lvl: window.__isoTest.trainLevel(), lr: window.__isoTest.suggestWt('lateral-raise', 'h'), cu: window.__isoTest.suggestWt('curl', 'r') }));
    ok(lv.lvl > 1.5 && nv.lvl === 1, 'logged lifts mark an experienced lifter (level ' + lv.lvl.toFixed(2) + ' vs ' + nv.lvl + ')');
    ok(lv.lr > nv.lr && lv.cu > nv.cu, 'her first suggestions are heavier than a beginner\'s (lateral raise ' + lv.lr + ' vs ' + nv.lr + ', curl ' + lv.cu + ' vs ' + nv.cu + ')');
    await b.close(); ({ b, page, errs } = await boot(st));
    await page.click('#tab-progress'); await page.click('#pt-muscles'); await page.waitForTimeout(150);
    const lab = await page.getAttribute('#mapCard svg.smap', 'aria-label');
    ok(/upper back and lats up 11%/.test(lab), 'lat pulldown shows under "upper back and lats" (' + lab.slice(0, 160) + ')');
    const g = await T(page, () => { const t = window.__isoTest, s = t.store(); s.week = 1; return t.suggestWt('lateral-raise', 'h'); });
    ok(g > 0, 'still a weight to start with');
    ok(!errs.length, 'no page errors (Chloe) ' + errs); await b.close();
  }

  srv.close();
  console.log(`test-r12c: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
