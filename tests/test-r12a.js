// Round 12 logging fixes: Spanish gym lifts (peso muerto is a deadlift, not a weigh-in), bodyweight jumps ask first,
// curl martillo, Spanish lifts on the body map, swing/dominadas/tendones in search, top single + back-offs,
// weighted pull-ups, "with 3 kg", lift names, shawarma/filete/calamares, reps x sets, RIR, shrugs, leg press and hip thrust.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8640, URL = `http://localhost:${PORT}/index.html`;
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
const J = x => JSON.stringify(x);
(async () => {
  const srv = await serve(PORT);

  // ---- Tomas: kg, gym, Spanish ----
  let { b, page, errs } = await boot({ profile: { units: 'kg', bw: 72, age: 41, sex: 'm', where: 'gym' }, eq: ['b', 'c', 'd', 'k'] });
  const P = t => T(page, t => window.__isoTest.parseText(t), t);
  const A = async t => (await P(t)).actions;

  // 1. peso muerto is a deadlift; no lift line is a weigh-in
  let a = await A('peso muerto 100kg 5 reps');
  ok(a.length === 1 && a[0].type === 'log_lift' && a[0].name === 'Deadlift' && a[0].weight === 100 && a[0].reps === 5, 'peso muerto 100kg 5 reps = Deadlift 100 kg x 5: ' + J(a));
  a = await A('peso muerto 100kg 5'); ok(a.length === 1 && a[0].name === 'Deadlift' && a[0].reps === 5, 'peso muerto 100kg 5 = Deadlift x 5: ' + J(a));
  a = await A('peso muerto rumano 60kg 3x10'); ok(a[0].name === 'Romanian Deadlift' || a[0].exercise === 'rdl', 'peso muerto rumano = Romanian deadlift: ' + J(a));
  for (const t of ['bw 100 x 5', 'weight 100 kg 5 reps', 'my weight 100 kg for 5', 'body weight 100 3 sets of 5', 'pullups bw+45 x5 x3'])
    ok(!(await A(t)).some(x => x.type === 'log_bodyweight'), 'never a weigh-in: ' + t);
  ok((await A('peso 72.5'))[0].type === 'log_bodyweight', '"peso 72.5" is still a weigh-in');
  ok((await A('I weigh 73 kg'))[0].type === 'log_bodyweight', '"I weigh 73 kg" is still a weigh-in');
  const tg0 = await T(page, () => window.__isoTest.proteinTarget());
  await T(page, () => window.__isoTest.handle('peso muerto 100kg 5 reps'));
  let st = await T(page, () => { const s = window.__isoTest.store(); return { body: s.body.length, lift: s.notes.filter(n => n.k === 'lift').pop() }; });
  ok(st.body === 0 && st.lift && st.lift.name === 'Deadlift' && st.lift.kg === 100 && st.lift.reps === 5, 'saved as a Deadlift lift, no bodyweight: ' + J(st));
  ok((await T(page, () => window.__isoTest.proteinTarget())) === tg0, 'protein target unchanged');
  // a weigh-in more than 10% from the last weight asks first
  await T(page, () => window.__isoTest.handle('I weigh 100 kg'));
  let c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
  st = await T(page, () => window.__isoTest.store().body.length);
  ok(st === 0 && c.k === 'body' && c.bwAsk && /bodyweight\?/.test(c.title) && /nothing is saved/.test(c.lines.join(' ')), '100 kg (+39% over 72) is not saved silently: ' + c.title + ' | ' + c.lines.join(' '));
  await T(page, () => window.__isoTest.handle('yes'));
  st = await T(page, () => window.__isoTest.store().body.map(x => x.kg));
  ok(st.length === 1 && st[0] === 100, 'replying "yes" saves it: ' + J(st));
  await T(page, () => window.__isoTest.handle('I weigh 70 kg'));
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(100);
  ok(await page.locator('.lgc [data-bwyes]').count() === 1, 'a "Yes, save it" button on the card');
  await page.locator('.lgc [data-bwyes]').click(); await page.waitForTimeout(100);
  st = await T(page, () => window.__isoTest.store().body.map(x => x.kg));
  ok(st.length === 2 && st[1] === 70 && await page.locator('.lgc [data-bwyes]').count() === 0, 'tapping it saves 70 kg, button gone: ' + J(st));
  await T(page, () => window.__isoTest.handle('I weigh 71 kg'));
  ok((await T(page, () => window.__isoTest.store().body.length)) === 3, 'a normal weigh-in (+1 kg) saves straight away');
  await T(page, () => window.__isoTest.handle('I weigh 90 kg')); await T(page, () => window.__isoTest.handle('2 eggs'));
  ok((await T(page, () => window.__isoTest.store().body.length)) === 3, 'an unanswered check saves nothing');

  // 2. curl martillo
  a = await A('curl martillo 12kg 10 reps');
  ok(a.length === 1 && a[0].exercise === 'hammer' && a[0].weight === 12 && a[0].reps === 10, 'curl martillo = Hammer Curl 12 kg x 10: ' + J(a));
  await T(page, () => window.__isoTest.handle('curl martillo 12kg 10 reps'));
  st = await T(page, () => window.__isoTest.store().log.slice(-1)[0]);
  ok(st.id === 'hammer' && st.kg === 12 && st.v === 10, 'saved as hammer, 12 kg, 10 reps: ' + J(st));

  // 3. Spanish lifts on the body map, with proper names (8)
  const ES = { 'press banca 60kg 8 reps': ['Bench Press', ['chest', 'triceps', 'delts']], 'press de banca 60kg 3x8': ['Bench Press', ['chest']], 'jalón al pecho 50kg 10 reps': ['Lat Pulldown', ['upper', 'biceps']],
    'press militar 40kg 3x8': ['Overhead Press', ['delts', 'triceps']], 'remo con barra 60kg 3x8': ['Barbell Row', ['upper', 'biceps']], 'remo en máquina 50kg 3x10': ['Seated Row', ['upper', 'biceps']],
    'prensa 150kg 3x10': ['Leg Press', ['quads', 'glutes']], 'hip thrust 100kg 3x10': ['Hip Thrust', ['glutes']] };
  for (const t of Object.keys(ES)) {
    a = await A(t); const [nm, rg] = ES[t];
    const reg = await T(page, n => window.__isoTest.liftRegions(n).on, a[0] && a[0].name);
    ok(a.length === 1 && a[0].type === 'log_lift' && a[0].name === nm && rg.every(r => reg.indexOf(r) > -1), t + ' -> ' + nm + ' on ' + rg + ': ' + J(a) + ' ' + reg);
  }
  a = await A('zancadas 12kg 3x10'); ok(a.length === 1 && (a[0].exercise === 'split-squat' || /Lunge/.test(a[0].name)), 'zancadas = lunges: ' + J(a));
  for (const [n, r] of [['Press Banca', 'chest'], ['Jalon Al Pecho', 'upper'], ['Press Militar', 'delts'], ['Peso Muerto', 'hams'], ['Prensa', 'quads']])
    ok((await T(page, n => window.__isoTest.liftRegions(n).on, n)).indexOf(r) > -1, 'lifts saved before under Spanish names map too: ' + n);
  await T(page, () => { window.__isoTest.handle('press banca 60kg 8 reps'); window.__isoTest.handle('jalón al pecho 50kg 10 reps'); });
  const got = await T(page, () => window.__isoTest.bodyWeek());
  ok(['chest', 'triceps', 'upper', 'biceps'].every(r => got[r] === 'on' || got[r] === 'part'), 'Today map: chest, triceps, upper back, biceps from the typed Spanish lifts: ' + J(got));
  a = await A('remo invertido en anillas 3x10'); ok(a[0] && a[0].type === 'log_lift' && !/\bEn\b/.test(a[0].name), 'small words stay lower case in a typed name: ' + (a[0] && a[0].name));

  // 4. search
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(100);
  for (const q of ['swing', 'kettlebell swing']) {
    await page.fill('#cIn', q); await page.waitForTimeout(80);
    const r = await page.locator('#cSrch [data-sp="rep"]').allTextContents();
    ok(r.length && /swing/i.test(r[0]), '"' + q + '" shows a result naming the swing: ' + J(r));
  }
  await page.locator('#cSrch [data-sp="rep"]').first().click(); await page.waitForTimeout(200);
  ok(await page.locator('[data-p="rep"][aria-selected="true"]').count() > 0, 'the swing result opens the Growth reps tab');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await T(page, () => { const x = document.querySelector('#sheet .close, [data-close], .sheet-x'); if (x) x.click(); });
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(100);
  await page.fill('#cIn', 'dominadas'); await page.waitForTimeout(80);
  const dom = await page.locator('#cSrch .srch-r b').allTextContents();
  ok(dom.length > 0, '"dominadas" finds pull-up / lat exercises: ' + J(dom));
  await page.fill('#cIn', '');
  await T(page, () => window.__isoTest.handle('tendones'));
  const m = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'm').pop().x);
  ok(/^From the guide/.test(m) && /tendon/i.test(m) && !/didn’t catch/.test(m), 'sending "tendones" answers from the guide: ' + m.slice(0, 120));

  // 7. with 3 kg; 9. foods
  a = await A('Chair squats 10 reps with 3 kg'); ok(a.length === 1 && a[0].reps === 10 && a[0].weight === 3 && a[0].unit === 'kg', 'chair squats 10 reps with 3 kg keeps 3 kg: ' + J(a));
  let r = await P('lunch: chicken shawarma wrap and a yoghurt');
  ok(r.actions.length === 1 && r.actions[0].items[0].n === 'Chicken shawarma wrap' && !r.unknown.length, 'shawarma is one known item, no "didn’t recognise": ' + J(r));
  r = await P('shawarma'); ok(r.actions.length === 1 && !r.unknown.length, 'shawarma alone logs');
  r = await P('filete de ternera con patatas'); ok(r.actions[0].items[0].n === 'Beef' && !r.unknown.length, 'filete de ternera: beef, nothing unrecognised: ' + J(r.unknown));
  r = await P('filete de pollo'); ok(r.actions[0].items[0].n === 'Chicken breast' && !r.unknown.length, 'filete de pollo: chicken');
  r = await P('bocadillo de calamares'); ok(r.actions[0].items[0].n === 'Bocadillo de calamares' && !r.unknown.length, 'bocadillo de calamares has its own entry');
  r = await P('bocata de tortilla'); ok(r.actions[0].items[0].n === 'Bocadillo de tortilla', 'bocata de tortilla unchanged');

  // Chloe: reps x sets, RIR, shrugs, leg press, hip thrust
  a = await A('leg press 140kg 10x3'); ok(a.length === 1 && a[0].name === 'Leg Press' && a[0].weight === 140 && a[0].reps === 10 && a[0].sets === 3, 'leg press 140kg 10x3 = Leg Press, 10 reps, 3 sets: ' + J(a));
  a = await A('lat pulldown 50x10x3'); ok(a[0].weight === 50 && a[0].reps === 10 && a[0].sets === 3, 'lat pulldown 50x10x3 = 3 sets of 10');
  a = await A('lat pulldown 50kg 12x3'); ok(a[0].weight === 50 && a[0].reps === 12 && a[0].sets === 3, '50kg 12x3 = 12 reps, 3 sets: ' + J(a));
  a = await A('bench press 60kg 3x8'); ok(a[0].sets === 3 && a[0].reps === 8, '3x8 stays 3 sets of 8');
  a = await A('bench press 60kg 5x5'); ok(a[0].sets === 5 && a[0].reps === 5, '5x5');
  a = await A('goblet squat 16kg 10x3'); ok(a[0].exercise === 'goblet-squat' && a[0].reps === 10 && a[0].sets === 3 && a[0].weight === 16, 'program exercise 16kg 10x3 = 10 reps, 3 sets: ' + J(a));
  a = await A('bench press 40kg 8 reps 2 in reserve'); ok(a.length === 1 && a[0].name === 'Bench Press' && a[0].weight === 40 && a[0].reps === 8 && a[0].rpe === 8, '2 in reserve = RPE 8, not in the name: ' + J(a));
  a = await A('bench press 40kg 8 reps 3 rir'); ok(a[0].name === 'Bench Press' && a[0].rpe === 7, '3 rir = RPE 7');
  a = await A('shrugs 20kg dumbbells 15x2'); ok(a.length === 1 && a[0].exercise === 'shrug' && a[0].weight === 20 && a[0].reps === 15 && a[0].sets === 2, 'shrugs 20kg dumbbells 15x2 = Shrug 20 kg, 15 reps x 2: ' + J(a));
  a = await A('hip thrust 70x10x3'); ok(a[0].type === 'log_lift' && a[0].name === 'Hip Thrust' && a[0].weight === 70 && a[0].sets === 3, 'hip thrust is its own lift: ' + J(a));
  ok((await T(page, () => window.__isoTest.liftRegions('Hip Thrust').on)).join() === 'glutes', 'hip thrust: glutes');
  a = await A('hip thrust machine 60 kg 10 reps'); ok(a[0].exercise === 'glute-bridge', 'hip thrust machine stays the program exercise');
  a = await A('leg press hold 100 kg 30 s'); ok(a[0].exercise === 'wall-sit', 'leg press hold stays the program exercise');
  await T(page, () => window.__isoTest.handle('leg press 140kg 10x3'));
  // round 13: the plan's Leg Press (the machine rep version of wall-sit) and a typed leg press are one history, saved as reps (never as a hold)
  st = await T(page, () => { const s = window.__isoTest.store(); return { ws: s.log.filter(l => l.id === 'wall-sit' && l.eq === 'c' && l.k === 'r' && l.kg === 140 && l.v === 10).length, lp: s.notes.filter(n => n.k === 'lift' && n.name === 'Leg Press').length }; });
  ok(st.ws === 3 && st.lp === 0, 'leg press saved as 3 x 140 kg x 10 reps on the plan’s Leg Press: ' + J(st));
  ok(!errs.length, 'no errors (kg) ' + errs);
  await b.close();

  // ---- Dev: lb ----
  ({ b, page, errs } = await boot({ profile: { units: 'lb', bw: 90, age: 29, sex: 'm', where: 'gym' }, eq: ['b', 'c', 'd'] }));
  const L = t => T(page, t => window.__isoTest.parseText(t).actions, t);
  a = await L('squat top single 425 @9 then backoffs 365 3x4');
  ok(a.length === 2 && a[0].name === 'Back Squat' && a[0].weight === 425 && a[0].reps === 1 && !a[0].sets && a[0].rpe === 9 && a[1].name === 'Back Squat' && a[1].weight === 365 && a[1].sets === 3 && a[1].reps === 4, 'top single then back-offs = 425 x 1 @9 and 365 3 x 4: ' + J(a));
  a = await L('bench top single 315 @8, backoffs 275 3x5'); ok(a.length === 2 && a[0].weight === 315 && a[0].reps === 1 && a[1].weight === 275 && a[1].sets === 3, 'bench top single with a comma: ' + J(a));
  a = await L('pullups bw+45 x5 x3'); ok(a.length === 1 && a[0].name === 'Pull-Up' && a[0].weight === 45 && a[0].unit === 'lb' && a[0].reps === 5 && a[0].sets === 3, 'pullups bw+45 x5 x3 = Pull-Up +45 lb, 3 x 5: ' + J(a));
  a = await L('pull ups bodyweight + 25 lb 3x6'); ok(a[0].name === 'Pull-Up' && a[0].weight === 25 && a[0].sets === 3 && a[0].reps === 6, 'bodyweight + 25 lb 3x6: ' + J(a));
  a = await L('deadlift 545 for 1 @9.5 and 495 for 3 3 rpe 8'); ok(a.length === 2 && a[1].weight === 495 && a[1].reps === 3, 'round-11 two-line deadlift still works');
  await T(page, () => window.__isoTest.handle('squat top single 425 @9 then backoffs 365 3x4'));
  st = await T(page, () => window.__isoTest.store().notes.filter(n => n.k === 'lift').map(n => n.name + ' ' + Math.round(n.kg * 2.20462) + 'x' + n.reps + 's' + n.sets));
  ok(J(st) === J(['Back Squat 425x1s1', 'Back Squat 365x4s3']), 'saved two Back Squat entries: ' + J(st));
  ok(!errs.length, 'no errors (lb) ' + errs);
  await b.close();

  srv.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
