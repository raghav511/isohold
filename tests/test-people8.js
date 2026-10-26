// Round 8 fixes from the simulated users: weight x reps x sets on program exercises, "365 for 3 3", amounts next to unknown words, more foods, pain and progression prompts.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8248, URL = `http://localhost:${PORT}/index.html`;
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({ profile: { units: 'kg', bw: 68, age: 34, sex: 'f', where: 'gym' }, eq: ['d', 'c'] });
  const a1 = t => T(page, t => window.__isoTest.parseText(t).actions[0] || null, t);
  let a = await a1('leg press 130x10x3 @8'); ok(a && a.exercise === 'wall-sit' && a.weight === 130 && a.reps === 10 && a.sets === 3 && a.rpe === 8, '"leg press 130x10x3" keeps 130 kg, 3 sets of 10');
  a = await a1('goblet squat 24x10x3'); ok(a && a.weight === 24 && a.reps === 10 && a.sets === 3, 'program exercise: weight x reps x sets');
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions.find(x => x.type === 'log_food') || {}).items || [], t);
  const un = t => T(page, t => window.__isoTest.parseText(t).unknown, t);
  ok((await un('meal prep lean beef mince 150g and rice 180g')).length === 0, '"meal prep" isn’t reported as unrecognised');
  let f = await fd('sabzi aur curd, 1 katori'); ok(f.length === 2 && !(await un('sabzi aur curd, 1 katori')).length, '"…, 1 katori" is the amount of the food before it');
  f = await fd('prawn fried rice'); ok(f.length === 1 && f[0].n === 'Fried rice', 'prawn fried rice is one dish');
  f = await fd('fish bee hoon soup'); ok(f[0].n === 'Noodle soup' && f[0].c > 0, 'fish bee hoon soup');
  f = await fd('kailan'); ok(f[0].n === 'Asian greens', 'kailan is Asian greens, not spinach');
  f = await fd('100g stuffing'); ok(f[0].n === 'Stuffing', 'stuffing');
  f = await fd('a slice of pumpkin pie'); ok(f[0].n === 'Pie', 'pumpkin pie');
  await T(page, () => window.__isoTest.handle('my shoulder hurts 4 out of 10'));
  ok(/shoulder 4\/10/.test(await T(page, () => window.__isoTest.localAnswer('how is my shoulder') || '')), '"how is my shoulder" gives the last logged pain');
  await b.close();

  ({ b, page, errs } = await boot({ profile: { units: 'lb', bw: 90, age: 29, sex: 'm', where: 'gym' }, eq: ['b'] }));
  a = await a1('squat 365 for 3 3 @7.5'); ok(a && a.weight === 365 && a.reps === 3 && a.more.join() === '3' && a.rpe === 7.5, '"365 for 3 3" keeps 365');
  a = await a1('squat 375 for 3 3'); ok(a && a.weight === 375, '"375 for 3 3" keeps 375');
  await b.close();

  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 23, sex: 'm' }, eq: ['k'] }, { locale: 'es-ES' }));
  f = await fd('dorada al horno 300g'); ok(f[0].n === 'White fish' && f[0].g === 300, 'dorada al horno 300g: the 300 g is kept');
  f = await fd('paella de marisco 400g'); ok(f[0].n === 'Seafood paella' && f[0].g === 400, 'paella de marisco 400g');
  f = await fd('2 hamburguesas de ternera'); ok(f[0].n === 'Burger' && f[0].q === 2, '2 hamburguesas');
  f = await fd('cordero 250 g'); ok(f[0].n === 'Lamb' && f[0].g === 250, 'cordero is lamb');
  f = await fd('patatas fritas'); ok(f[0].n === 'Fries', 'patatas fritas are fries');
  f = await fd('batido de proteinas'); ok(f[0].n === 'Whey protein', 'batido de proteínas');
  f = await fd('aguacate, pimientos y una cerveza'); ok(f.map(i => i.n).join() === 'Avocado,Peppers,Beer', 'aguacate, pimientos y una cerveza');
  ok(!(await un('menú del día: paella')).length, '"menú del día" with accents');
  await b.close();

  // one message is one meal; heavier when last week's reps were all done
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 62, age: 52, sex: 'f', inv: { d: '4, 6, 8' } }, eq: ['d'], week: 2, wt: { 'lateral-raise|d|r': 4 }, log: [{ t: Date.now() - 5 * 864e5, w: 1, id: 'lateral-raise', eq: 'd', k: 'r', kg: 4, v: 12 }] }));
  const ms = await T(page, () => window.__isoTest.parseText('iftar: 3 dates, a glass of water, lentil soup and chicken biryani').actions.filter(x => x.type === 'log_food').map(x => x.meal_name));
  ok(ms.length === 1 && ms[0] === 'Iftar', 'one iftar line is one meal card');
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(200);
  let seen = '';
  for (let i = 0; i < 12 && !seen; i++) { const t = await T(page, () => document.getElementById('pLast').hidden ? '' : document.getElementById('pLast').textContent); if (/try 6 kg/.test(t)) seen = t; await T(page, () => document.getElementById('pSkip').click()); await page.waitForTimeout(100); }
  ok(/all 12 reps at 4 kg: try 6 kg/.test(seen), 'all reps done last week: the session suggests the next weight');
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
