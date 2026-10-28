// Round 13: one lift-name resolver. Cue, gear, effort and connector words (English and Spanish) never end up in a
// lift's name; synonyms map to one lift; old saved names merge on load; weighted pull-ups count bodyweight + load.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8745, URL = `http://localhost:${PORT}/index.html`;
async function boot(state) {
  const o = await open('android', { state });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
const J = x => JSON.stringify(x);
const DAY = 864e5;
(async () => {
  const srv = await serve(PORT);

  // ---- Dev: pounds ----
  let { b, page, errs } = await boot({ profile: { units: 'lb', bw: 89.5, age: 29, sex: 'm', where: 'gym' }, eq: ['b', 'c', 'd', 'k'], body: [{ t: Date.now() - DAY, kg: 89.5 }] });
  const P = t => T(page, t => window.__isoTest.parseText(t), t);
  const A = async t => (await P(t)).actions;
  const H = t => T(page, t => window.__isoTest.handle(t), t);
  const lifts = () => T(page, () => window.__isoTest.store().notes.filter(n => n.k === 'lift'));

  let a = await A('squat 405x3x3 rpe 8 belt');
  ok(a.length === 1 && a[0].name === 'Back Squat' && a[0].weight === 405 && a[0].reps === 3 && a[0].sets === 3 && a[0].rpe === 8 && a[0].cue === 'belt', 'squat 405x3x3 rpe 8 belt = Back Squat 405 x3 x3 @8, belt as a note: ' + J(a));
  a = await A('comp bench 285x1 long pause');
  ok(a.length === 1 && a[0].name === 'Bench Press' && a[0].weight === 285 && a[0].reps === 1 && /pause/.test(a[0].cue), 'comp bench 285x1 long pause = Bench Press, pause noted: ' + J(a));
  a = await A('comp bench 285 3x2 @8 long pause'); ok(a[0].name === 'Bench Press' && a[0].sets === 3 && a[0].reps === 2 && a[0].rpe === 8, 'comp bench 285 3x2 @8 long pause: ' + J(a));
  a = await A('ssb squat 315x5'); ok(a.length === 1 && a[0].name === 'Safety Bar Squat' && a[0].weight === 315, 'ssb squat = Safety Bar Squat: ' + J(a));
  ok((await T(page, () => window.__isoTest.liftRegions('Safety Bar Squat').on)).indexOf('quads') > -1, 'Safety Bar Squat on the map (quads)');
  a = await A('paused squat 315 3x3 with belt and sleeves'); ok(a.length === 1 && a[0].name === 'Back Squat' && a[0].sets === 3, 'paused squat with belt and sleeves = one Back Squat: ' + J(a));
  let r = await P('squat 405x3, 3 RIR');
  ok(r.actions.length === 1 && r.actions[0].name === 'Back Squat' && r.actions[0].rpe === 7 && !r.unknown.length, 'squat 405x3, 3 RIR = RPE 7, nothing unrecognised: ' + J(r));
  r = await P('bench 275x5, rpe 8'); ok(r.actions[0].rpe === 8 && !r.unknown.length, 'bench 275x5, rpe 8');
  a = await A('top single deadlift 500 then 3x5 at 425');
  ok(a.length === 2 && a.every(x => x.name === 'Deadlift') && a[0].weight === 500 && a[0].reps === 1 && a[1].weight === 425 && a[1].sets === 3 && a[1].reps === 5, 'top single deadlift then 3x5 at (lb): ' + J(a));

  // saved under the resolver, and the max is one lift's max
  await H('squat 405x3x3 rpe 8 belt'); await H('comp bench 285x1 long pause'); await H('ssb squat 315x5');
  let L = await lifts();
  ok(J(L.map(n => n.name)) === J(['Back Squat', 'Bench Press', 'Safety Bar Squat']), 'saved names are clean: ' + J(L.map(n => n.name)));
  ok(L[0].cue === 'belt' && /pause/.test(L[1].cue), 'cues kept as data on the entry');

  // a typo can be corrected by talking
  await H('bench 2775x3');
  let c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop()); ok(c.k === 'err', '2775 refused');
  await H('actually that was 275 not 2775');
  L = await lifts(); const lastB = L[L.length - 1];
  ok(lastB.name === 'Bench Press' && Math.round(lastB.kg * 2.20462) === 275 && lastB.reps === 3, 'the correction logs bench 275 x 3: ' + J(lastB));
  await H('bench 255x3'); await H('oops it was 265 not 255');
  L = await lifts(); ok(L.filter(n => n.name === 'Bench Press' && n.reps === 3).map(n => Math.round(n.kg * 2.20462)).join() === '275,265', 'the wrong entry is undone and replaced: ' + J(L.map(n => Math.round(n.kg * 2.20462))));

  // weighted pull-ups: bodyweight + load, compared only with weighted sets
  await H('pull ups 10'); await H('pull ups 12');
  await H('pullups bw+45 x5');
  c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
  L = await lifts(); let pu = L[L.length - 1];
  ok(pu.name === 'Pull-Up' && pu.add === 1 && Math.round(pu.kg * 2.20462) === 45, 'Pull-Up with +45 lb added: ' + J(pu));
  ok(!c.pb, 'first weighted set is not a "New best" over bodyweight sets');
  ok(/bodyweight \+ 45 lb/.test(c.lines[0] + c.sub) && /Estimated max now 2[3-9]\d(\.\d)? lb/.test(c.sub), 'estimate uses bodyweight + load (≈ 197 + 45): ' + c.lines[0] + ' | ' + c.sub);
  const cm = await T(page, () => window.__isoTest.curMaxLift('Pull-Up'));
  ok(cm && cm.e > 89.5 + 20 && cm.add, 'curMaxLift(Pull-Up) is total load: ' + J(cm));
  await H('pullups bw+50 x5');
  c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop()); ok(c.pb, 'heavier weighted set is a new best against the weighted one');
  ok(!errs.length, 'no errors (lb) ' + errs);
  await b.close();

  // ---- Tomás: kg, Spanish, old saved names ----
  const t0 = Date.now() - 10 * DAY;
  const old = [['Press Banca', 60, 8], ['Remo En Maquina', 50, 10], ['Squat Belt', 100, 5], ['Pull Ups Lastradas', 10, 6], ['Deadlift Luego', 140, 1], ['Overhead Press en Reserva', 40, 8], ['Mancuernas', 12, 10], ['Ssb Squat', 90, 5], ['Bench Press', 62.5, 8]]
    .map((x, i) => ({ t: t0 + i * 1000, k: 'lift', name: x[0], kg: x[1], reps: x[2], s: null, sets: 1, rpe: null }));
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 72, age: 23, sex: 'm', where: 'gym' }, eq: ['k', 'w'], body: [{ t: t0, kg: 72 }], notes: old }));
  L = await lifts();
  ok(J(L.map(n => n.name)) === J(['Bench Press', 'Seated Row', 'Back Squat', 'Pull-Up', 'Deadlift', 'Overhead Press', 'Mancuernas', 'Safety Bar Squat', 'Bench Press']), 'old names map to their lift on load: ' + J(L.map(n => n.name)));
  ok(L[0].was === 'Press Banca' && L[0].kg === 60 && L[0].reps === 8 && L[3].add === 1, 'nothing lost: the typed name is kept, weighted pull-up flagged: ' + J(L[0]) + J(L[3]));
  await page.evaluate(() => document.getElementById('tab-progress').click()); await page.waitForTimeout(150);
  const other = await T(page, () => [...document.querySelectorAll('#progExtras .lifts > li > b')].map(x => x.textContent));
  ok(other.filter(x => x === 'Bench Press').length === 1 && !other.some(x => /Banca|Maquina|Belt|Luego|Reserva/.test(x)), 'Other lifts: one Bench Press, no junk lifts: ' + J(other));

  const PE = t => T(page, t => window.__isoTest.parseText(t), t);
  const AE = async t => (await PE(t)).actions;
  a = await AE('press militar 40kg 8 reps 2 en reserva');
  ok(a.length === 1 && a[0].name === 'Overhead Press' && a[0].rpe === 8 && a[0].weight === 40 && a[0].reps === 8, 'press militar ... 2 en reserva = Overhead Press @8: ' + J(a));
  a = await AE('top single deadlift 140kg then 3x5 at 120kg');
  ok(a.length === 2 && a.every(x => x.name === 'Deadlift') && a[0].weight === 140 && a[0].reps === 1 && a[1].weight === 120 && a[1].sets === 3 && a[1].reps === 5, 'top single deadlift 140kg then 3x5 at 120kg: ' + J(a));
  r = await PE('peso muerto 140kg x1 luego 3x5 120kg');
  ok(r.actions.length === 2 && r.actions.every(x => x.name === 'Deadlift') && r.actions[0].weight === 140 && r.actions[0].reps === 1 && r.actions[1].weight === 120 && r.actions[1].sets === 3 && r.actions[1].reps === 5 && !r.unknown.length, 'peso muerto 140kg x1 luego 3x5 120kg: ' + J(r));

  // zancadas: a lunge with its weight, on the map, no card opening
  r = await PE('zancadas con mancuernas 2x12kg 10 reps');
  ok(r.actions.length === 1 && r.actions[0].type === 'log_set' && r.actions[0].exercise === 'split-squat' && r.actions[0].weight === 12 && r.actions[0].reps === 10 && r.actions[0].eq === 'd' && r.actions[0].perHand, 'zancadas con mancuernas 2x12kg 10 reps = split squat, 12 kg per hand, dumbbells: ' + J(r));
  const lg0 = await T(page, () => window.__isoTest.store().log.length);
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(100);
  await T(page, () => window.__isoTest.handle('zancadas con mancuernas 2x12kg 10 reps')); await page.waitForTimeout(200);
  let lg = await T(page, () => window.__isoTest.store().log.slice(-1)[0]);
  c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
  ok(lg && lg.id === 'split-squat' && lg.kg === 12 && lg.v === 10 && lg.eq === 'd', 'saved: split squat 12 kg x 10 with dumbbells: ' + J(lg));
  ok(/Split Squat/.test(c.title) && /per hand/.test(c.lines[0]), 'card says split squat, per hand: ' + c.title + ' | ' + c.lines[0]);
  ok(!(await T(page, () => !document.getElementById('sheetWrap').hidden)), 'no exercise card opens');
  ok((await T(page, () => window.__isoTest.bodyWeek())).quads, 'quads on the body map: ' + J(await T(page, () => window.__isoTest.bodyWeek())));
  await T(page, () => window.__isoTest.handle('zancadas 12kg 10 reps'));
  lg = await T(page, () => window.__isoTest.store().log.slice(-1)[0]);
  ok(lg.id === 'split-squat' && lg.kg === 12 && lg.v === 10 && lg.eq !== 'w', 'zancadas 12kg 10 reps keeps 12 kg (weighted version, not bodyweight): ' + J(lg));
  ok((await T(page, () => window.__isoTest.store().log.length)) === lg0 + 2, 'two sets, no extras');

  // weighted pull-ups in Spanish
  for (const t of ['bw+20 dominadas 5x3', 'dominadas lastradas 20kg 5x3']) {
    a = await AE(t);
    ok(a.length === 1 && a[0].name === 'Pull-Up' && a[0].weight === 20 && a[0].add && a[0].sets === 5 && a[0].reps === 3, t + ' = Pull-Up +20 kg: ' + J(a));
  }
  await T(page, () => window.__isoTest.handle('dominadas 8')); await T(page, () => window.__isoTest.handle('dominadas lastradas 20kg 5x3'));
  L = await lifts(); pu = L[L.length - 1];
  ok(pu.name === 'Pull-Up' && pu.add === 1 && pu.kg === 20 && pu.bw === 72, 'saved +20 kg with bodyweight 72: ' + J(pu));
  const cm2 = await T(page, () => window.__isoTest.curMaxLift('Pull-Up'));
  ok(cm2 && Math.abs(cm2.e - 92 * (1 + 3 / 30)) < 0.6, 'estimated max from 92 kg x 3 (bodyweight + 20): ' + J(cm2));

  // search finds Spanish names
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(100);
  for (const [q, re] of [['peso muerto', /deadlift|rdl/i], ['zancadas', /split squat|lunge/i]]) {
    await page.fill('#cIn', q); await page.waitForTimeout(100);
    const hits = await page.locator('#cSrch .srch-r b').allTextContents();
    ok(hits.some(h => re.test(h)), 'search "' + q + '" finds ' + re + ': ' + J(hits));
  }
  await page.fill('#cIn', '');
  ok(!errs.length, 'no errors (kg) ' + errs);
  await b.close();

  srv.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
