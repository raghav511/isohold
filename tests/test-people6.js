// Round 6 fixes from the simulated users: more Spanish and Singapore foods, amounts after a food, skipped cardio days, "no change".
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8245, URL = `http://localhost:${PORT}/index.html`;
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 23, sex: 'm' }, eq: ['k'] });
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions[0] || {}).items || [], t);
  const un = t => T(page, t => window.__isoTest.parseText(t).unknown, t);
  let f = await fd('judías verdes con patatas'); ok(f[0].n === 'Green beans' && f[1].n === 'Potato', 'judías verdes are green beans, not black beans');
  f = await fd('macarrones con tomate 300g'); ok(f[0].n === 'Pasta' && f[0].g === 300, '"macarrones con tomate 300g": the 300 g is the pasta');
  f = await fd('pizza 2 trozos'); ok(f[0].n === 'Pizza' && f[0].q === 2, 'pizza 2 trozos is 2 slices');
  f = await fd('3 galletas'); ok(f[0].n === 'Biscuits' && f[0].q === 3, '3 galletas');
  f = await fd('yogur griego'); ok(f[0].n === 'Greek yogurt' && !(await un('yogur griego')).length, 'yogur griego is Greek yogurt');
  ok(!(await un('huevos revueltos')).length, '"revueltos" is understood');
  f = await fd('cocido madrileño'); ok(f[0].n === 'Cocido', 'cocido madrileño');
  f = await fd('spinach 100g'); ok(f[0].n === 'Spinach', 'spinach is spinach, not broccoli');
  f = await fd('mackerel 150g'); ok(f[0].n === 'Mackerel' && f[0].g === 150, 'mackerel');
  await b.close();
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 23, sex: 'm' }, eq: ['k'] }, { locale: 'es-ES' }));
  ok(await T(page, () => window.__isoTest.parseText('tortilla media').actions[0].items[0].n) === 'Spanish omelette', 'in Spanish, "tortilla" is the omelette');
  ok(await T(page, () => window.__isoTest.parseText('tortilla media').actions[0].items[0].q) === 0.5, '"tortilla media" is half');
  await b.close();

  // a cardio morning where everything was skipped is not marked done
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 60, age: 45, sex: 'f' }, eq: ['k'], done: { w1d1am: 1, w1d1pm: 1, w1d2am: 1, w1d2pm: 1 } }));
  await page.click('.strip button[data-i="2"]'); await page.waitForTimeout(100);
  await page.click('#sessions [data-start][data-part="am"]'); await page.waitForTimeout(250);
  for (let i = 0; i < 6 && await page.isVisible('#player') && await page.textContent('#pPhase') !== 'Done'; i++) { await T(page, () => document.getElementById('pSkip').click()); await page.waitForTimeout(150); }
  ok(!(await T(page, () => window.__isoTest.store().done.w1c1am)), 'a skipped cardio morning is not marked done');
  // "no change" rather than "+0 kg"
  await T(page, () => { window.__isoTest.handle('I weigh 60 kg'); });
  await T(page, () => { const s = window.__isoTest.store(); s.body[s.body.length - 1].t -= 864e5; window.__isoTest.handle('I weigh 60 kg'); });
  ok(/No change/.test(await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop().lines[0])), 'same weight: "No change", not "+0 kg"');
  await b.close();
  // a high blood pressure reading today changes today's plan
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, cm: 170, age: 67, issues: ['bp', 'knee'] }, eq: ['d'] }));
  await T(page, () => window.__isoTest.handle('my BP is 165 over 100')); await page.click('#tab-train');
  ok(/Blood pressure 165\/100 today: no strength work/.test(await page.locator('#train').innerText()), 'high BP today: a banner on Train');
  ok(await T(page, () => window.__isoTest.buildQueue(window.__isoTest.allDays()[0], 'am', window.__isoTest.phaseOf(1)).every(i => i.kind === 'cardio')), 'high BP today: only the walk is left in the session');
  ok(/skip strength work today/.test(await T(page, () => window.__isoTest.localAnswer('should I train today if my BP is 165 over 100') || '')), 'asking with a high reading: skip strength today');
  ok(/Don’t train today/.test(await T(page, () => window.__isoTest.localAnswer('my bp is 185 over 115, can I train') || '')), 'very high reading: don’t train');
  await T(page, () => window.__isoTest.handle('I slept only 4 hours, should I train today'));
  const last2 = await T(page, () => window.__isoTest.feed().slice(-2).map(x => x.title || x.x).join(' | '));
  ok(/Sleep 4 h/.test(last2) && /little sleep/.test(last2) && !/didn’t recognise/.test(last2), 'logs the sleep and answers the question');
  await b.close();
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 62, age: 52, sex: 'f' }, eq: ['d'], log: [{ t: Date.now() - 864e5, w: 1, id: 'goblet-squat', eq: 'd', k: 'r', kg: 10, v: 12 }] }));
  f = await T(page, () => window.__isoTest.parseText('chicken salad sandwich and an apple').actions[0].items);
  ok(f[0].n === 'Chicken sandwich' && f[0].p < 30 && f.length === 2, 'a chicken salad sandwich is one sandwich');
  ok(await T(page, () => window.__isoTest.parseText('iftar: 3 dates and water').actions[0].meal_name) === 'Iftar', 'iftar is a meal name');
  ok(/Goblet Squat/.test(await T(page, () => window.__isoTest.localAnswer('what is my estimated max for goblet squat') || '')), 'estimated max for goblet squat answers about the goblet squat');
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
