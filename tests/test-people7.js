// Round 7 fixes from the simulated users: RPE on ramp lines, high/very high blood pressure days, logs ending in a question, Spanish dishes, iftar lines.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8246, URL = `http://localhost:${PORT}/index.html`;
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state }, opts));
  if (opts.clock) await o.page.clock.install();
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({ profile: { units: 'lb', bw: 90, age: 29, sex: 'm', where: 'gym' }, eq: ['b'] });
  const acts = t => T(page, t => window.__isoTest.parseText(t).actions, t);
  let a = await acts('squat 405x1, 425x1 @9'); ok(a.length === 2 && a[1].rpe === 9 && !a[0].rpe, 'RPE on a ramp line goes on the top set');
  a = await acts('I slept only 5 hours, should I train today?'); ok(a.some(x => x.type === 'log_sleep' && x.hours === 5), 'a log that ends with "?" is still logged');
  a = await acts('I slept only 4 hours, should I train tomorrow'); ok(a.some(x => x.type === 'log_sleep'), '"... tomorrow" doesn’t turn a sleep log into a plan');
  a = await acts('250g lean beef mince 300g pasta'); ok(a[0].items.length === 2 && a[0].items[0].g === 250, '"lean beef mince"');
  ok(!(await T(page, () => window.__isoTest.parseText('chicken and rice from the canteen').unknown)).length, '"from the canteen" is not reported as unrecognised');
  await T(page, () => { window.__isoTest.handle('lat pulldown 160x10x3'); });
  ok(/Lat Pulldown/.test(await T(page, () => window.__isoTest.localAnswer('what is my estimated max for lat pulldown') || '')), 'estimated max for any logged lift');
  await b.close();

  // high blood pressure: the walk counts; very high: rest, one message everywhere
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, cm: 170, age: 67, issues: ['bp'] }, eq: ['d'] }, { clock: true }));
  await T(page, () => window.__isoTest.handle('BP 168 over 102')); await page.click('#tab-train');
  ok(/Today: walk only/.test(await page.locator('#band .dose').innerText()), 'high BP: the top of Train says walk only');
  await page.click('#sessions [data-start][data-part="am"]');
  for (let i = 0; i < 40 && await page.textContent('#pPhase') !== 'Done'; i++) await page.clock.runFor(60000);
  ok(await T(page, () => !window.__isoTest.store().done.w1d1am && window.__isoTest.store().notes.some(n => n.k === 'cardio' && n.min >= 3)), 'high BP: the walk counts as cardio and the strength session waits');
  await b.close();
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, cm: 170, age: 67, issues: ['bp'] }, eq: ['d'] }));
  await T(page, () => window.__isoTest.handle('BP 185 over 112')); await page.click('#tab-train');
  ok(/Don’t train today/.test(await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop().lines[0])), 'very high BP: Log says don’t train');
  ok(await page.locator('#sessions [data-start]').count() === 0 && /Rest today/.test(await page.locator('#sessions').innerText()), 'very high BP: no session to start, "Rest today"');
  await b.close();

  // food
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 23, sex: 'm' }, eq: ['k'] }, { locale: 'es-ES' }));
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions.find(x => x.type === 'log_food') || {}).items || [], t);
  let f = await fd('cena: merluza a la plancha 200g con patatas'); ok(f[0].n === 'White fish' && f[0].g === 200 && f[1].n === 'Potato', 'merluza a la plancha 200g con patatas');
  f = await fd('comí macarrones con tomate 300g'); ok(f[0].n === 'Pasta' && f[0].g === 300, '"comí macarrones con tomate 300g"');
  f = await fd('churros con chocolate'); ok(f.map(i => i.n).join() === 'Churros,Cocoa milk', 'churros con chocolate');
  f = await fd('albondigas con arroz'); ok(f[0].n === 'Meatballs', 'albóndigas');
  f = await fd('pollo asado medio'); ok(f[0].n === 'Roast chicken' && f[0].q === 0.5, 'pollo asado medio is half a roast chicken');
  f = await fd('bocata de tortilla'); ok(f.length === 1 && f[0].n === 'Bocadillo', 'bocata de tortilla is one item');
  f = await fd('menu del dia: cocido'); ok(f[0].n === 'Cocido' && !(await T(page, () => window.__isoTest.parseText('menu del dia: cocido').unknown)).length, 'menú del día');
  ok(await T(page, () => window.__isoTest.parseText('macarrones 300g').actions[0].meal_name) !== 'Snack' || new Date().getHours() >= 17, 'Spanish meal times');
  ok(!/de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/.test(await T(page, () => { window.__isoTest.handle('peso 70'); document.getElementById('tab-progress').click(); return document.getElementById('progress').innerText; })), 'dates are in English on a Spanish-language device');
  await b.close();
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 62, age: 52, sex: 'f' }, eq: ['d'] }));
  const all = await T(page, () => window.__isoTest.parseText('iftar: 3 dates, a glass of water, lentil soup and chicken biryani'));
  ok(all.actions.length === 3 && all.actions[0].items[0].n === 'Dates' && all.actions[1].type === 'log_water' && all.actions[2].items.length === 2 && !all.unknown.length, 'iftar line: dates, water, lentil soup and biryani all logged');
  ok(!(await T(page, () => window.__isoTest.parseText('sehri: 2 eggs and toast').unknown)).length, '"sehri" is not reported as unrecognised');
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
