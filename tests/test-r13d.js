// Round 13 (Chloe): first weights scaled per movement from a RELATED logged lift (never an isolation lift straight from
// a compound), "Last time" only for the same exercise + equipment + part, one count for trained / partly / gap and the
// coverage table, and the Add exercise sheet labelled for the user's own plan.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = +(process.env.PORT || 8800), URL = `http://localhost:${PORT}/index.html`;
const T = (page, f, a) => page.evaluate(f, a);
const DAY = 864e5, NOW = Date.now();
async function boot(st, kind) {
  const o = await open(kind || 'android', { state: st, viewport: kind === 'iphone' ? undefined : { width: 412, height: 915 }, dark: kind === 'iphone' });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  return o;
}
const base = (o) => Object.assign({ week: 1, done: {}, tests: {}, wt: {}, log: [], eq: ['d'], cust: {}, food: [], body: [], notes: [] }, o);
const lift = (t, name, kg, reps, rpe) => ({ t, k: 'lift', name, kg, reps, s: null, sets: 1, rpe: rpe || null });
const L = (t, id, k, eq, kg, v, x) => Object.assign({ t, w: 1, id, eq, k, kg, v, x: 1 }, x || {});
const CHLOE = { units: 'kg', bw: 68, age: 34, sex: 'f', where: 'gym', issues: [], days: 3, split: 'one', len: 45, dayHour: 5 };
const CHLOE_LIFTS = [lift(NOW - 9 * DAY, 'Lat Pulldown', 45, 10), lift(NOW - DAY, 'Lat Pulldown', 50, 10), lift(NOW - DAY, 'Hip Thrust', 70, 10), lift(NOW - DAY, 'Bench Press', 40, 8, 8), lift(NOW - DAY, 'Leg Press', 140, 10)];
// every scaled exercise in every equipment version, with the working weight (estimated max × 0.75) of each related lift
const AUDIT = () => {
  const t = window.__isoTest, out = [];
  const ids = ['oh-triceps', 'kickback', 'floor-press', 'lateral-raise', 'rear-fly', 'curl', 'sa-row', 'goblet-squat', 'wall-sit', 'split-squat', 'glute-bridge', 'rdl', 'sl-rdl', 'suitcase', 'calf-raise', 'seated-calf', 'dead-bug', 'crunch', 'hollow'];
  ids.forEach(id => ['h', 'r'].forEach(k => ['d', 'k', 'b', 'c'].forEach(eq => {
    const v = t.getWt ? null : null; let w = null;
    try { const ex = t.V(id, k === 'h' ? 'h' : 'g'); w = t.sugFor(id, k, eq); } catch (e) { }
    if (w && w.v != null) out.push(Object.assign({ id, k, eq }, w));
  })));
  return out;
};
(async () => {
  const srv = await serve(PORT);
  let b, page, errs;

  // ---- 1. First weights: per movement, from a related lift, capped ----
  {
    ({ b, page, errs } = await boot(base({ eq: ['d', 'b', 'c', 'k'], profile: CHLOE, notes: CHLOE_LIFTS })));
    const ch = await T(page, AUDIT);
    const g = (id, k, eq) => ch.find(x => x.id === id && x.k === k && x.eq === eq) || {};
    const benchW = 40 * (1 + 8 / 30 + 0 ) ; // only for the message
    const oht = g('oh-triceps', 'r', 'b');
    ok(oht.v >= 10 && oht.v <= 15 && oht.from === 'Bench Press', 'Chloe: barbell overhead triceps extension 10–15 kg from her bench, not 40 (' + JSON.stringify(oht) + ')');
    const ohtH = g('oh-triceps', 'h', 'b');
    ok(ohtH.v <= 15, 'and its hold too (' + ohtH.v + ')');
    // a related-lift working weight is never exceeded, and isolation stays far below its compound
    ok(ch.filter(x => x.from).every(x => x.v <= x.relW + 0.01), 'no scaled weight is above its related lift\'s working weight: ' + JSON.stringify(ch.filter(x => x.from && x.v > x.relW).map(x => x.id + x.k + x.eq + ' ' + x.v + '>' + x.relW)));
    const iso = ['oh-triceps', 'kickback', 'lateral-raise', 'rear-fly', 'curl'];
    ok(ch.filter(x => iso.includes(x.id) && x.from).every(x => x.v <= 0.4 * x.relW + 2.5), 'isolation lifts are at most ~40% of the related compound (+ one rounding step): ' + JSON.stringify(ch.filter(x => iso.includes(x.id) && x.from).map(x => x.id + ':' + x.eq + ' ' + x.v + '/' + Math.round(x.relW))));
    ok(ch.filter(x => iso.includes(x.id) && x.from).every(x => x.v <= Math.max(x.std, 2.5 * x.base) + 2.5), 'isolation lifts stay within 2.5× their cautious start');
    const lr = g('lateral-raise', 'r', 'd'), kb = g('kickback', 'r', 'd'), cu = g('curl', 'r', 'd'), cub = g('curl', 'r', 'b');
    ok(lr.v >= 2 && lr.v <= 5, 'dumbbell lateral raise is very small: ' + lr.v + ' kg');
    ok(kb.v >= 2 && kb.v <= 6, 'dumbbell kickback small: ' + kb.v + ' kg');
    ok(cu.v >= 4 && cu.v <= 9 && cu.from === 'Lat Pulldown', 'dumbbell curl from her pulldown (no row logged): ' + cu.v + ' kg');
    ok(cub.v >= 10 && cub.v <= 17.5, 'barbell curl ≈ 30% of pulldown: ' + cub.v + ' kg');
    const lp = g('wall-sit', 'r', 'c'), gb = g('glute-bridge', 'r', 'c');
    ok(lp.v >= 80 && lp.v <= lp.relW && lp.from === 'Leg Press', 'leg press from her leg press (same movement): ' + lp.v);
    ok(gb.v >= 40 && gb.v <= gb.relW && gb.from === 'Hip Thrust', 'machine hip thrust from her hip thrust: ' + gb.v);
    // no related lift: the standard start
    const cr = g('calf-raise', 'r', 'd'), sl = g('sl-rdl', 'r', 'd'), rdl = g('rdl', 'r', 'b');
    ok(!cr.from && cr.v === cr.stdSnap, 'calf raise: no related lift, standard start (' + cr.v + ')');
    ok(!sl.from && !rdl.from, 'RDLs: no deadlift logged, standard start (' + sl.v + ', ' + rdl.v + ')');
    // rounded to real steps
    ok(ch.every(x => x.eq === 'd' ? (x.v < 10 ? Number.isInteger(x.v) : x.v % 2 === 0) : x.eq === 'k' ? x.v % 4 === 0 : Math.abs(x.v / 2.5 - Math.round(x.v / 2.5)) < 1e-9), 'every weight is a real dumbbell, kettlebell or plate step');
    // the session she saw: Full Body C / A shows the triceps extension at a safe weight
    const q = await T(page, () => { const t = window.__isoTest, out = []; t.allDays().forEach(d => t.buildQueue(d, 'all', t.phaseOf(1)).forEach(it => { if (it.id === 'oh-triceps') out.push(it.ex.eq + ':' + t.getWt('oh-triceps', it.wk, it.ex.eq)); })); return out; });
    ok(q.length && q.every(x => +x.split(':')[1] <= 15), 'every overhead triceps set in her sessions is ≤ 15 kg (' + q.join(', ') + ')');
    // a set already logged at the old unsafe suggestion doesn't carry it forward
    await T(page, () => { const s = window.__isoTest.store(); s.log.push({ t: Date.now() - 3 * 864e5, w: 1, id: 'oh-triceps', eq: 'b', k: 'r', kg: 40, v: 12, x: 1, sug: 1 }); });
    const after = await T(page, () => window.__isoTest.getWt('oh-triceps', 'r', 'b'));
    ok(after <= 15, 'a set logged at the old 40 kg suggestion is not reused (' + after + ')');
    await T(page, () => { const s = window.__isoTest.store(); s.log.push({ t: Date.now() - 2 * 864e5, w: 1, id: 'oh-triceps', eq: 'b', k: 'r', kg: 17.5, v: 12, x: 1 }); });
    ok(await T(page, () => window.__isoTest.getWt('oh-triceps', 'r', 'b')) === 17.5, 'a weight she chose herself is kept');
    ok(!errs.length, 'no page errors (1) ' + errs); await b.close();
  }
  // ---- 1b. Strong male lifter and a beginner ----
  {
    const P = { units: 'kg', bw: 90, age: 30, sex: 'm', where: 'gym', issues: [], days: 4 };
    ({ b, page, errs } = await boot(base({ eq: ['d', 'b', 'c', 'k'], profile: P, notes: [lift(NOW - DAY, 'Bench Press', 100, 5), lift(NOW - DAY, 'Back Squat', 140, 5), lift(NOW - DAY, 'Deadlift', 180, 5), lift(NOW - DAY, 'Barbell Row', 80, 8), lift(NOW - DAY, 'Overhead Press', 60, 5)] })));
    const ex = await T(page, AUDIT);
    const g = (id, k, eq) => ex.find(x => x.id === id && x.k === k && x.eq === eq) || {};
    ok(ex.filter(x => x.from).every(x => x.v <= x.relW + 0.01), 'strong lifter: nothing above its related lift');
    const oht = g('oh-triceps', 'r', 'b'), lr = g('lateral-raise', 'r', 'd'), cu = g('curl', 'r', 'd'), rdl = g('rdl', 'r', 'b'), gs = g('goblet-squat', 'r', 'd');
    ok(oht.v >= 20 && oht.v <= 32.5 && oht.from === 'Bench Press', 'strong lifter: overhead triceps 20–32.5 kg (' + oht.v + ', bench working ' + Math.round(oht.relW) + ')');
    ok(lr.v >= 4 && lr.v <= 12 && lr.from === 'Overhead Press', 'lateral raise from OHP, 4–12 kg (' + lr.v + ')');
    ok(cu.v >= 8 && cu.v <= 16 && cu.from === 'Barbell Row', 'dumbbell curl from his row, 8–16 kg (' + cu.v + ')');
    ok(rdl.v >= 80 && rdl.v <= 120 && rdl.from === 'Deadlift', 'barbell RDL ≈ 70% of deadlift working weight (' + rdl.v + ')');
    ok(gs.v >= 20 && gs.v <= 40 && gs.from === 'Back Squat', 'goblet squat from squat (' + gs.v + ')');
    await b.close();
    ({ b, page, errs } = await boot(base({ eq: ['d', 'b', 'c', 'k'], profile: Object.assign({}, CHLOE) })));
    const nb = await T(page, AUDIT);
    ok(nb.every(x => !x.from && x.v === x.stdSnap), 'beginner: every first weight is the standard start');
    const g2 = (id, k, eq) => nb.find(x => x.id === id && x.k === k && x.eq === eq) || {};
    ok(g2('oh-triceps', 'r', 'b').v === 10 && g2('curl', 'r', 'b').v === 10, 'beginner barbell triceps and curls start on a 10 kg EZ bar (' + g2('oh-triceps', 'r', 'b').v + ', ' + g2('curl', 'r', 'b').v + ')');
    ok(g2('lateral-raise', 'r', 'd').v <= 3 && g2('curl', 'r', 'd').v <= 5, 'beginner dumbbell lateral raise ≤ 3, curl ≤ 5');
    // gentle plan: never scaled
    await b.close();
    ({ b, page, errs } = await boot(base({ eq: ['d', 'b', 'c', 'k'], profile: Object.assign({}, CHLOE, { issues: ['bp'] }), notes: CHLOE_LIFTS })));
    ok((await T(page, AUDIT)).every(x => !x.from), 'gentle plan (blood pressure): never scaled up');
    ok(!errs.length, 'no page errors (1b) ' + errs); await b.close();
  }

  // ---- 2. "Last time" in the player ----
  {
    const st = base({ eq: ['d', 'b', 'c'], profile: CHLOE, notes: CHLOE_LIFTS,
      log: [L(NOW - 3 * DAY, 'wall-sit', 'r', 'c', 130, 12), L(NOW - 3 * DAY + 1, 'wall-sit', 'h', 'c', 10, 30, { sug: 1 }), L(NOW - 3 * DAY + 2, 'curl', 'h', 'd', 6, 30)] });
    ({ b, page, errs } = await boot(st));
    const r = await T(page, () => {
      const t = window.__isoTest, P = window.__isoP;
      return null;
    });
    // run the leg press hold in the player and read the "Last time" line
    const res = await T(page, async () => {
      const t = window.__isoTest; const out = {};
      out.hold = t.getWt('wall-sit', 'h', 'c');
      out.lastHold = t.lastTxt({ id: 'wall-sit', wk: 'h', ex: t.V('wall-sit', 'h', { eq: 'c', style: 'mach' }) });
      out.lastCurl = t.lastTxt({ id: 'curl', wk: 'h', ex: t.V('curl', 'h', { eq: 'd', style: '' }) });
      out.lastCurlR = t.lastTxt({ id: 'curl', wk: 'r', ex: t.V('curl', 'g', { eq: 'd', style: '' }) });
      out.lastCurlC = t.lastTxt({ id: 'curl', wk: 'h', ex: t.V('curl', 'h', { eq: 'c', style: 'cable' }) });
      return out;
    });
    ok(res.hold >= 80 && res.lastHold == null, 'leg press hold at ' + res.hold + ' kg: no "Last time: 10 kg" from an old suggestion (' + res.lastHold + ')');
    ok(/6 kg/.test(res.lastCurl || ''), 'a real set of the same exercise, equipment and part is shown (' + res.lastCurl + ')');
    ok(res.lastCurlR == null && res.lastCurlC == null, 'not for the reps part or another equipment version (' + res.lastCurlR + ', ' + res.lastCurlC + ')');
    ok(!errs.length, 'no page errors (2) ' + errs); await b.close();
  }

  // ---- 3. Coverage: trained / partly / gap from the same counts as the table ----
  {
    const st = base({ eq: ['d', 'b', 'c'], profile: CHLOE, notes: CHLOE_LIFTS.slice(1) });
    ({ b, page, errs } = await boot(st));
    // log one chest set this week (of the several planned)
    await T(page, () => { const t = window.__isoTest, s = t.store(); s.log.push({ t: Date.now() - 60e3, w: 1, id: 'floor-press', eq: 'd', k: 'r', kg: 14, v: 10, x: 1 }); });
    await page.click('#tab-progress'); await page.click('#pt-muscles'); await page.waitForTimeout(150);
    const tab = await T(page, () => { const got = {}; [...document.querySelectorAll('#cov tbody tr[data-reg]')].forEach(tr => { const td = tr.querySelectorAll('td'); got[tr.dataset.reg] = { plan: parseInt(td[td.length - 2].innerText, 10) || 0, done: parseInt(td[td.length - 1].innerText, 10) || 0 }; }); return got; });
    const note = await page.textContent('#covNote');
    await page.click('#tab-train'); await page.waitForTimeout(150);
    const bw = await T(page, () => window.__isoTest.bodyWeek());
    const txt = await page.locator('#bodyCard').innerText();
    const bad = Object.keys(tab).filter(r => { const t = tab[r], want = t.done === 0 ? undefined : t.done >= (t.plan || 2) ? 'on' : 'part'; return bw[r] !== want; });
    ok(!bad.length, 'every region: map state = table (done vs planned) ' + bad.map(r => r + ' ' + JSON.stringify(tab[r]) + ' map ' + bw[r]).join('; '));
    ok(tab.chest.plan > 1 && bw.chest === 'part', 'chest: 1 of ' + tab.chest.plan + ' planned sets is partly, not fully trained (' + bw.chest + ')');
    ['rear', 'obliques', 'inner', 'shins', 'lower'].forEach(r => ok(tab[r].done > 0 || !bw[r], r + ': 0 sets done → a gap, not partly (' + bw[r] + ')'));
    const partly = (txt.match(/\d+ partly: ([^.]+)\./) || [])[1] || '';
    ok(!/rear delts|obliques|inner thighs|shins|lower back/.test(partly), 'Today\'s "partly" list has none of the 0-set parts (' + partly + ')');
    ok(/Fully trained means you’ve done all the sets your plan has for that part this week/.test(txt) && /Fully trained means/.test(note), 'one definition line on Today and on the coverage table');
    // doing all planned sets makes it fully trained
    await T(page, () => { const t = window.__isoTest, s = t.store(), n = Object.keys(t.bodyWeek()).length; const plan = {}; t.covDays().forEach(x => x.q.forEach(it => t.exRegions(it.id, it.wk, it.ex.eq).on.forEach(r => plan[r] = (plan[r] || 0) + 1))); for (let i = 0; i < plan.chest; i++) s.log.push({ t: Date.now() - 50e3 + i, w: 1, id: 'floor-press', eq: 'd', k: 'r', kg: 14, v: 10, x: 1 }); });
    ok((await T(page, () => window.__isoTest.bodyWeek().chest)) === 'on', 'chest is fully trained once its planned sets are done');
    ok(!errs.length, 'no page errors (3) ' + errs); await b.close();
  }

  // ---- 4. Add exercise sheet (One session, Full Body days, no cardio day) ----
  {
    const st = base({ eq: ['d', 'b', 'c'], profile: Object.assign({}, CHLOE, { stab: true }) });
    ({ b, page, errs } = await boot(st, 'iphone'));
    await page.getByText('Show exercises').first().click(); await page.waitForTimeout(400);
    await page.locator('#sessions button:visible', { hasText: /Add exercise/ }).last().click(); await page.waitForTimeout(500);
    const sh = await T(page, () => ({ intro: document.querySelector('#sheetBody p.muted').textContent, hs: [...document.querySelectorAll('#sheetBody .lib-group h2')].map(h => h.textContent),
      chips: (() => { const c = document.getElementById('addChips'), r = c.getBoundingClientRect(), ch = c.querySelector('.chip').getBoundingClientRect(); return { box: r.height, chip: ch.height, top: ch.top - r.top, bottom: r.bottom - ch.bottom }; })() }));
    ok(/to your session on Full Body/.test(sh.intro) && !/evening|morning/.test(sh.intro), 'One session: "your session", no evening (' + sh.intro + ')');
    ok(sh.hs.length >= 4 && sh.hs.slice(0, 3).every((h, i) => h === 'Day ' + (i + 1) + ', Full Body ' + 'ABC'[i]), 'headers are her days, numbered from 1 (' + sh.hs.join(' | ') + ')');
    ok(!sh.hs.some(h => /Day 0|Upper Body|Lower Body|cardio days/.test(h)), 'no "Day 0", 4-day names or "cardio days" (' + sh.hs.join(' | ') + ')');
    ok(sh.chips.chip >= 38 && sh.chips.top >= 0 && sh.chips.bottom >= 0 && sh.chips.box >= sh.chips.chip, 'chip row shows whole chips (' + JSON.stringify(sh.chips) + ')');
    // the filter still works across her days
    await page.locator('#addChips .chip').nth(1).click(); await page.waitForTimeout(150);
    ok(await T(page, () => [...document.querySelectorAll('#sheetBody .lib-group')].some(g => !g.hidden)), 'filtering keeps some groups visible');
    ok(!errs.length, 'no page errors (4) ' + errs); await b.close();
    // two sessions a day still says morning / evening
    ({ b, page, errs } = await boot(base({ eq: ['d'], profile: { units: 'kg', bw: 70, age: 40, sex: 'm', where: 'home', issues: [], days: 4, split: 'two' } })));
    await page.getByText('Show exercises').first().click(); await page.waitForTimeout(400);
    await page.locator('#sessions button:visible', { hasText: /Add exercise/ }).last().click(); await page.waitForTimeout(400);
    const i2 = await T(page, () => ({ intro: document.querySelector('#sheetBody p.muted').textContent, hs: [...document.querySelectorAll('#sheetBody .lib-group h2')].map(h => h.textContent) }));
    ok(/your (morning|evening) session/.test(i2.intro) && i2.hs[0] === 'Day 1, Upper Body & Core A', 'two sessions a day: morning/evening, Day 1 (' + i2.intro.slice(0, 80) + ' | ' + i2.hs[0] + ')');
    ok(!errs.length, 'no page errors (4b) ' + errs); await b.close();
  }

  // ---- 5. Fatima: one strength number for the line, the list and the map; one max on the check card; one day length ----
  {
    const fat = JSON.parse(require('fs').readFileSync(__dirname + '/fixtures/fatima-r13.json', 'utf8'));
    const o = await open('android', { state: fat, viewport: { width: 800, height: 1280 }, timezoneId: 'Europe/London' });
    ({ b, page, errs } = o);
    await page.clock.install({ time: new Date('2027-01-05T09:00:00') });
    await page.goto(URL); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    const c = await T(page, () => {
      const t = window.__isoTest, D = t.dailyIdx(), now = t.dayStart(), sd = Object.keys(D.s).map(Number).sort((a, b) => a - b), last = sd[sd.length - 1];
      const per = {}, all = [];
      Object.values(D.ex).filter(e => e.kind === 's' && e.ds.length >= 2 && now - e.last <= 28 * 864e5).forEach(e => {
        const kp = e.key.split('|'), cm = kp[0] === 'r' ? t.curMaxEx(kp[1], 'r', kp[2]) : kp[0] === 'hs' ? t.curMaxEx(kp[1], 'h', kp[2]) : t.curMaxLift(e.name);
        const pc = (cm.e / e.base - 1) * 100; all.push(pc);
        const rs = t.exRegions(kp[1], kp[0] === 'r' ? 'r' : 'h', kp[2]).on; rs.forEach(r => (per[r] = per[r] || []).push(pc));
      });
      const reg = {}; Object.keys(per).forEach(r => reg[r] = Math.round(per[r].reduce((a, b) => a + b, 0) / per[r].length));
      return { line: D.s[last], mean: 100 + all.reduce((a, b) => a + b, 0) / all.length, map: t.strChange(), reg, vals: sd.map(d => Math.round(D.s[d] * 10) / 10) };
    });
    ok(Math.abs(c.line - c.mean) < 0.05, 'Fatima: today\'s strength point = the average of each exercise\'s current estimated max vs its start (' + c.line.toFixed(1) + ' vs ' + c.mean.toFixed(1) + ')');
    ok(JSON.stringify(c.map) === JSON.stringify(Object.fromEntries(Object.keys(c.map).map(r => [r, c.reg[r]]))), 'the strength map averages the same per-exercise numbers by muscle (' + JSON.stringify(c.map) + ')');
    ok(c.map.sidehip >= 15 && c.line > 109, 'side hip +' + c.map.sidehip + '% and the line at ' + c.line.toFixed(1) + ' (was 105 → 109)');
    ok(c.vals.every((v, i) => !i || v >= c.vals[i - 1] - 0.01), 'fewer planned reps at the same weight no longer pull the line down (' + c.vals.join(', ') + ')');
    await page.click('#tab-progress'); await page.click('#pt-strength'); await page.waitForTimeout(300);
    const dc = await page.locator('#dailyCard').innerText();
    ok(/is the average of your \d+ weighted exercises against their start\. The strength map splits the same numbers by muscle: [^.]*side hip \+17%/.test(dc), 'the daily card links the line and the map (' + (dc.match(/Strength \d+ is the average[^\n]*/) || [''])[0] + ')');
    const ck = await page.locator('#chkCard [data-chk="str"]').innerText();
    ok(!/13\.3/.test(ck) && (ck.split('Goblet Squat:')[1].match(/max/g) || []).length === 1 && /estimated max 11\.2 kg \(from 8 kg × 12 reps/.test(ck), 'strength check card: one max, not the 8 × 20 estimate (' + ck.replace(/\n/g, ' | ') + ')');
    // a +17% exercise moves the line
    const mv = await T(page, () => { const t = window.__isoTest, s = t.store(), D0 = t.dailyIdx(), k0 = Math.max(...Object.keys(D0.s).map(Number)), before = D0.s[k0];
      s.log.push({ t: Date.now() + 3600e3, w: 6, id: 'goblet-squat', eq: 'd', k: 'r', kg: 8, v: 12, rpe: 7 }); const D1 = t.dailyIdx(), k1 = Math.max(...Object.keys(D1.s).map(Number)); s.log.pop(); return [before, D1.s[k1]]; });
    ok(mv[1] > mv[0] + 0.2, 'a stronger goblet squat set today moves the line (' + mv.map(x => x.toFixed(1)).join(' → ') + ')');
    // the day's minutes: no time recorded → the plan's length, the same number in both views, no invented evening
    await page.click('#tab-train'); await page.waitForTimeout(200);
    const one = await page.locator('#splitSeg .daytot').innerText();
    await page.click('[data-split="two"]'); await page.waitForTimeout(250);
    const two = await page.locator('#splitSeg .daytot').innerText();
    const n1 = (one.match(/(\d+) min/) || [])[1], n2 = (two.match(/(\d+) min/) || [])[1];
    ok(n1 && n1 === n2 && !/evening/.test(two) && !/You did: Morning/.test(two), 'one session done: same minutes in One session and Morning + evening, no evening invented (' + one.replace(/\n/g, ' ') + ' | ' + two.replace(/\n/g, ' ') + ')');
    // with the time the session actually took: "You did: one session, 22 min" in both views
    await T(page, () => { const s = window.__isoTest.store(); s.took = { w6f1am: 22, w6f1pm: 0 }; });
    await page.click('[data-split="one"]'); await page.waitForTimeout(250);
    const one2 = await page.locator('#splitSeg .daytot').innerText();
    await page.click('[data-split="two"]'); await page.waitForTimeout(250);
    const two2 = await page.locator('#splitSeg .daytot').innerText();
    ok(/You did: one session, 22 min today/.test(one2) && /You did: one session, 22 min today/.test(two2), 'the session\'s own 22 minutes in both views (' + one2.replace(/\n/g, ' ') + ' | ' + two2.replace(/\n/g, ' ') + ')');
    await page.click('[data-split="one"]'); await page.waitForTimeout(150);
    // exercise detail title: her day, not "Day 0, Lower Body A"
    await page.click('#tab-exercises'); await page.waitForTimeout(300);
    await page.locator('#lib [data-ex="goblet-squat"]').first().click(); await page.waitForTimeout(400);
    const title = await page.textContent('#sheetTitle');
    ok(/^Day [1-3], Full Body [ABC]$/.test(title), 'exercise detail title is her own day (' + title + ')');
    ok(!errs.length, 'no page errors (5) ' + errs); await b.close();
  }
  // ---- 5b. A finished session records its own minutes ----
  {
    ({ b, page, errs } = await boot(base({ eq: ['d'], profile: { units: 'kg', bw: 68, age: 52, sex: 'f', where: 'home', issues: [], days: 3, split: 'one', len: 25, inv: { d: '4, 6, 8' } } })));
    const src = await T(page, () => document.documentElement.outerHTML.indexOf('store.took[k] = i ? 0 : took0') > -1);
    ok(src, 'finish() stores the minutes the session took');
    await b.close();
  }

  srv.close();
  console.log(`test-r13d: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
