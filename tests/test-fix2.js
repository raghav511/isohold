// Round 11 parser fixes: pain is never a set (and no made-up score), lifter notation (three triples, plates plus 25s, "and" lines),
// dictated food amounts without commas, UK canteen and Spanish everyday foods, "New best" by estimated max, chips in your units.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8520, URL = `http://localhost:${PORT}/index.html`;
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);

  // ---- 1. pain (Fatima: dumbbells at home) ----
  let { b, page, errs } = await boot({ profile: { units: 'kg', bw: 64, age: 52, sex: 'f' }, eq: ['d'] });
  const P = t => T(page, t => window.__isoTest.parseText(t), t);
  let r = await P('my lower back twinges a bit on the swing');
  ok(r.actions.length === 1 && r.actions[0].type === 'log_pain' && r.actions[0].area === 'back' && r.actions[0].score == null && r.actions[0].exercise === 'bird-dog' && !r.unknown.length, 'twinge on the swing: a lower-back pain note with the swing, no score, no set');
  r = await P('my back hurts after swings');
  ok(r.actions.length === 1 && r.actions[0].type === 'log_pain' && r.actions[0].score == null && r.actions[0].exercise === 'bird-dog', '"my back hurts after swings": pain, no invented 3/10');
  r = await P('my knee aches a little during lunges'); ok(r.actions[0].type === 'log_pain' && r.actions[0].area === 'knee' && r.actions[0].score == null, 'aches: knee pain, no score');
  r = await P('my lower back is a bit sore'); ok(r.actions[0].type === 'log_pain' && r.actions[0].score == null, '"a bit" is not read as a score');
  r = await P('back pain 3/10'); ok(r.actions[0].score === 3, 'back pain 3/10 keeps its score');
  r = await P('my shoulder hurts 6 out of 10 on bench'); ok(r.actions[0].type === 'log_pain' && r.actions[0].score === 6, 'a stated score is kept');

  const logs0 = await T(page, () => window.__isoTest.store().log.length);
  await T(page, () => window.__isoTest.handle('my lower back twinges a bit on the swing'));
  let st = await T(page, () => { const s = window.__isoTest.store(); return { log: s.log.length, note: s.notes.filter(n => n.k === 'pain').pop() }; });
  ok(st.log === logs0, 'no set saved for a pain sentence');
  ok(st.note && st.note.area === 'back' && st.note.score == null && st.note.ex === 'bird-dog', 'pain note saved for the lower back with the exercise, without a score');
  let c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
  ok(c.k === 'pain' && /lower back/.test(c.title) && !/\/10/.test(c.title) && /How bad, 0–10\?/.test(c.lines.join(' ')) && /Swing/.test(c.lines.join(' ')), 'card asks "How bad, 0–10?" and names the swing: ' + c.title + ' | ' + c.lines.join(' '));
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(100);
  ok(await page.locator('.lgc [data-pain]').count() === 11, 'eleven score buttons (0–10) on the card, offline');
  await page.locator('.lgc [data-pain][data-x="4"]').last().click(); await page.waitForTimeout(100);
  st = await T(page, () => window.__isoTest.store().notes.filter(n => n.k === 'pain').pop());
  c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
  ok(st.score === 4 && /4\/10/.test(c.title) && /Swing/.test(c.lines.join(' ')) && !c.ask, 'tapping 4 scores it 4/10, advice names the swing first');
  ok(await page.locator('.lgc [data-pain]').count() === 0, 'score buttons go once answered');
  // typed answer
  await T(page, () => window.__isoTest.handle('my back hurts after swings'));
  const nFood = await T(page, () => window.__isoTest.store().food.length);
  await T(page, () => window.__isoTest.handle('2'));
  st = await T(page, () => window.__isoTest.store().notes.filter(n => n.k === 'pain').pop());
  ok(st.score === 2 && (await T(page, () => window.__isoTest.store().food.length)) === nFood, 'typing "2" after the question scores the pain 2/10');
  ok(/lower back/.test(await T(page, () => window.__isoTest.localAnswer('how is my back') || '')), '"how is my back" still answers');
  await T(page, () => window.__isoTest.handle('my knee aches'));
  ok(/no score/.test(await T(page, () => window.__isoTest.localAnswer('how is my knee') || '')), 'a pain logged without a score says so, not "null/10"');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors (pain) ' + errs);
  await b.close();

  // ---- 2. lifter notation (Dev: pounds, barbell) ----
  ({ b, page, errs } = await boot({ profile: { units: 'lb', bw: 90, age: 29, sex: 'm', where: 'gym' }, eq: ['b', 'c', 'd'] }));
  const L = t => T(page, t => window.__isoTest.parseText(t).actions.filter(a => a.type === 'log_lift' || a.type === 'log_set'), t);
  let a = await L('squat 405 for three triples @8');
  ok(a.length === 1 && a[0].name === 'Back Squat' && a[0].sets === 3 && a[0].reps === 3 && a[0].weight === 405 && a[0].rpe === 8, 'three triples @8 = Back Squat 3 x 3 at 405, RPE 8: ' + JSON.stringify(a));
  a = await L('bench 315 for two doubles'); ok(a[0].name === 'Bench Press' && a[0].sets === 2 && a[0].reps === 2 && a[0].weight === 315, 'two doubles');
  a = await L('deadlift 495 for five singles @9'); ok(a[0].name === 'Deadlift' && a[0].sets === 5 && a[0].reps === 1 && a[0].rpe === 9, 'five singles');
  a = await L('squat 405 for a triple'); ok(a[0].name === 'Back Squat' && a[0].reps === 3 && !a[0].sets, 'a triple');
  a = await L('squat 2 plates a side plus 25s 3x5 @7'); ok(a.length === 1 && a[0].name === 'Back Squat' && a[0].weight === 275 && a[0].sets === 3 && a[0].reps === 5 && a[0].rpe === 7, 'plates plus 25s = 275 lb, 3 x 5: ' + JSON.stringify(a));
  a = await L('bench 3 plates 1x1'); ok(a[0].weight === 315, 'plates alone still work');
  a = await L('bench 225x5 and rows 185x8'); ok(a.length === 2 && a[0].weight === 225 && a[0].reps === 5 && a[1].weight === 185 && a[1].reps === 8, '"and" line logs both halves');
  r = await P('deadlift 545 for 1 @9.5 and 495 for 3 3 rpe 8');
  a = r.actions; ok(a.length === 2 && a[1].name === 'Deadlift' && a[1].weight === 495 && a[1].reps === 3 && JSON.stringify(a[1].more) === '[3]' && a[1].rpe === 8 && !r.unknown.length, 'second half of an "and" line goes to the same lift');
  // New best by estimated max
  await T(page, () => window.__isoTest.handle('squat 410 for 1 @9'));
  await T(page, () => window.__isoTest.handle('squat 390 for 3 @8'));
  c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
  ok(c.pb, '390 x 3 @8 (higher estimated max) is a New best after 410 x 1 @9');
  await T(page, () => window.__isoTest.handle('squat 300 for 2'));
  c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop()); ok(!c.pb, 'a lighter, easier set is not a New best');
  // chips in pounds
  await page.evaluate(() => { window.__isoTest.feed().length = 0; document.getElementById('tab-coach').click(); }); await page.waitForTimeout(100);
  const chips = await page.locator('#cSugs').innerText();
  ok(/Goblet squat [\d.]+ lb 30 s/.test(chips) && /I weigh 198 lb/.test(chips) && !/\bkg\b/.test(chips), 'one-tap chips in pounds, with your own weight: ' + chips.replace(/\n/g, ' | '));
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors (lifts) ' + errs);
  await b.close();
  // kg plates
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 80, age: 30, sex: 'm', where: 'gym' }, eq: ['b', 'c', 'd'] }));
  a = await T(page, () => window.__isoTest.parseText('squat 2 plates a side plus 10s 3x5 @7').actions);
  ok(a[0].name === 'Back Squat' && a[0].weight === 120 && a[0].sets === 3 && a[0].reps === 5, 'kg: 20 kg bar + 2 x 20 a side + 10s = 120 kg');
  await b.close();

  // ---- 3 & 4. foods (Chloe, Ravi, Tomás) ----
  for (const loc of ['en-GB', 'es-ES']) {
    ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 62, age: 31, sex: 'f' }, eq: ['d'] }, { locale: loc }));
    const F = t => T(page, t => { const r = window.__isoTest.parseText(t); return { items: [].concat(...r.actions.filter(x => x.type === 'log_food').map(x => x.items)), unknown: r.unknown }; }, t);
    const has = (f, n, g) => f.items.some(i => i.n === n && (g == null || i.g === g));
    if (loc === 'en-GB') {
      let f = await F('meal prep chicken 150g rice 200g broccoli 80g');
      ok(f.items.length === 3 && has(f, 'Chicken breast', 150) && has(f, 'Rice', 200) && has(f, 'Broccoli', 80) && !f.unknown.length, 'dictated grams go to the food before them: ' + f.items.map(i => i.n + ' ' + i.g).join(', '));
      f = await F('chicken 150g rice 200g'); ok(has(f, 'Chicken breast', 150) && has(f, 'Rice', 200), 'chicken 150g rice 200g');
      f = await F('150g chicken 200g rice'); ok(has(f, 'Chicken breast', 150) && has(f, 'Rice', 200), 'amount before the food still works');
      f = await F('150g chicken and 200g rice'); ok(has(f, 'Chicken breast', 150) && has(f, 'Rice', 200), '150g chicken and 200g rice');
      f = await F('i had 200g chicken and rice 100g'); ok(has(f, 'Chicken breast', 200) && has(f, 'Rice', 100), 'mixed order keeps both amounts');
      f = await F('jacket potato with tuna mayo and beans from the canteen');
      ok(has(f, 'Baked potato') && has(f, 'Tuna mayo') && has(f, 'Baked beans') && !has(f, 'Black beans') && !f.unknown.length, 'jacket potato, tuna mayo, baked beans; no "didn’t recognise": ' + f.items.map(i => i.n).join(', ') + ' / ' + f.unknown);
      ok(f.items.find(i => i.n === 'Tuna mayo').f >= 15, 'tuna mayo keeps the mayo fat');
      f = await F('jacket potato with baked beans and cheese'); ok(has(f, 'Baked potato') && has(f, 'Baked beans') && has(f, 'Cheese') && !f.unknown.length, 'jacket with baked beans and cheese');
      f = await F('beans on toast'); ok(has(f, 'Baked beans') && has(f, 'Bread'), 'beans on toast are baked beans');
      f = await F('black beans 100g'); ok(has(f, 'Black beans', 100), 'black beans are still black beans');
      for (const t of ['cheese and ham toastie', 'ham and cheese toastie', 'cheese toastie', 'toastie']) { f = await F(t); ok(f.items.length === 1 && f.items[0].n === 'Toastie' && f.items[0].c > 30 && f.items[0].k > 350 && !f.unknown.length, t + ' is a toasted sandwich with bread'); }
      f = await F('tuna mayo sandwich'); ok(f.items.length === 1 && f.items[0].n === 'Fish sandwich', 'tuna mayo sandwich stays one sandwich');
      f = await F('jacket with beans'); ok(has(f, 'Baked potato') && has(f, 'Baked beans') && !f.unknown.length, '"jacket" alone is a baked potato');
      f = await F('chai with two marie biscuits'); ok(has(f, 'Chai') && f.items.some(i => i.n === 'Marie biscuits' && i.q === 2) && !f.unknown.length, 'two Marie biscuits');
      // card: nothing "didn't recognise" under a card that logged it
      await T(page, () => window.__isoTest.handle('jacket potato with tuna mayo and beans from the canteen'));
      ok(!(await T(page, () => window.__isoTest.feed().some(m => m.r === 'm' && /recognise/.test(m.x || '')))), 'no "didn’t recognise" line under the canteen card');
    }
    for (const [t, n] of [['una caña', 'Caña (small beer)'], ['croquetas', 'Croquetas'], ['croquetas de jamón', 'Croquetas'], ['gazpacho', 'Gazpacho'], ['un pincho', 'Pincho'], ['huevos rotos', 'Huevos rotos'], ['flan', 'Flan'], ['filete', 'Beef'], ['bocata de tortilla', 'Bocadillo de tortilla'], ['pincho de tortilla', 'Spanish omelette']]) {
      const f = await F(t); ok(f.items.length === 1 && f.items[0].n === n && !f.unknown.length, loc + ': ' + t + ' -> ' + n + ' (' + f.items.map(i => i.n).join(', ') + ' / ' + f.unknown + ')');
    }
    let f = await F('filete con patatas'); ok(has(f, 'Beef') && has(f, 'Potato') && !f.unknown.length, loc + ': filete con patatas');
    f = await F('una caña y unas croquetas'); ok(has(f, 'Caña (small beer)') && has(f, 'Croquetas') && !f.unknown.length, loc + ': una caña y unas croquetas');
    f = await F('2 filetes de ternera a la plancha y pan'); ok(has(f, 'Beef', 300) && has(f, 'Bread'), loc + ': 2 filetes de ternera still 300 g beef');
    ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors (' + loc + ') ' + errs);
    await b.close();
  }
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
