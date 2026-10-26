// Round 5 fixes from the simulated users: warm-up ramps, weight x reps x sets, bodyweight sets, Spanish meals, bodyweight precision, lift questions.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8244, URL = `http://localhost:${PORT}/index.html`;
async function boot(state) {
  const o = await open('android', { state });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({ profile: { units: 'lb', bw: 90, cm: 178, age: 29, sex: 'm', where: 'gym' }, eq: ['b', 'c'] });
  const acts = t => T(page, t => window.__isoTest.parseText(t).actions, t);
  let a = await acts('squat 135x5, 225x3, 315x2'); ok(a.length === 3 && a.map(x => x.weight).join() === '135,225,315' && a.map(x => x.reps).join() === '5,3,2', 'a warm-up ramp logs every set');
  a = await acts('lat pulldown 160x10x3'); ok(a.length === 1 && a[0].name === 'Lat Pulldown' && a[0].sets === 3 && a[0].reps === 10, '"160x10x3" is 3 sets of 10');
  a = await acts('pull ups 10 8 7'); ok(a.length === 1 && a[0].name === 'Pull-Up' && a[0].reps === 10 && a[0].more.join() === '8,7', '"pull ups 10 8 7" is three sets');
  a = await acts('curl 10 kg x 12, 12 kg x 10'); ok(a.length === 2 && a[1].weight === 12, 'two weights for a program exercise on one line');
  await T(page, () => { ['squat 135x5, 225x3, 315x2', 'squat 405x2 @8'].forEach(t => window.__isoTest.handle(t)); });
  ok(await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').every(c => !/typo/.test(c.warn || ''))), 'warm-ups earlier today don’t trigger the typo check');
  ok(/estimated max \*\*459 lb\*\*/.test(await T(page, () => window.__isoTest.localAnswer('what is my estimated max for squat') || '')), '"my estimated max for squat" gives the number');
  for (let i = 0; i < 3; i++) await T(page, () => window.__isoTest.handle('squat 300x5'));
  await page.click('#tab-progress'); await page.waitForTimeout(100);
  ok(/All 7 entries/.test(await page.locator('#progExtras').innerText()) && await page.locator('#progExtras [data-dlift]').count() === 7, 'every lift entry can be seen and deleted');
  await T(page, () => window.__isoTest.handle('I weigh 199.4 lb'));
  await page.click('#tab-train'); await page.click('#tab-progress'); await page.waitForTimeout(100);
  ok(/199\.4 lb/.test(await page.locator('#progExtras').innerText()), 'a 199.4 lb weigh-in shows as 199.4 lb');
  await T(page, () => window.__isoTest.handle('I weigh 199.0 lb'));
  ok(/−0\.4 lb/.test(await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop().lines[0])), 'the change shows −0.4 lb, not rounded to 0.5');
  await b.close();

  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 23, sex: 'm' }, eq: ['k'] }));
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions[0] || {}).items || [], t);
  let f = await fd('merienda: bocata de atun y un cola cao'); ok(f.map(i => i.n).join() === 'Bocadillo,Cocoa milk' && f[1].p > 5, 'bocata de atún y un Cola Cao');
  f = await fd('cena: 2 filetes de ternera a la plancha y pan'); ok(f[0].n === 'Beef' && f[0].g === 300 && f[1].n === 'Bread', '2 filetes de ternera a la plancha y pan');
  ok((await T(page, () => window.__isoTest.parseText('cena: 2 filetes de ternera a la plancha y pan').unknown)).length === 0, '"a la plancha" is understood');
  f = await fd('tostadas con aceite y tomate'); ok(f.map(i => i.n).join() === 'Bread,Olive oil,Tomato', 'tostadas con aceite y tomate');
  f = await fd('fideos con gambas'); ok(f.map(i => i.n).join() === 'Pasta,Prawns', 'fideos con gambas');
  a = await T(page, () => window.__isoTest.parseText('goblet 24 4x12').actions[0]); ok(a && a.exercise === 'goblet-squat' && a.sets === 4, '"goblet 24 4x12" is the program goblet squat');
  f = await fd('2 coffees with milk'); ok(f.length === 1 && f[0].n === 'White coffee' && f[0].q === 2, '"2 coffees with milk" is two white coffees, not a glass of milk');
  f = await fd('coffee with a splash of milk'); ok(f.length === 1 && f[0].n === 'White coffee', 'coffee with a splash of milk');
  ok(/night shift/i.test(await T(page, () => window.__isoTest.localAnswer('should I train after a 12 hour night shift') || '')), 'offline: training after a night shift');
  await page.click('#profBtn'); await page.waitForTimeout(150); await page.click('.pchips[data-set="where"] button[data-v="gym"]'); await page.click('.pchips[data-set="where"] button[data-v="home"]'); await page.click('#pfSave'); await page.waitForTimeout(150);
  ok(await T(page, () => !window.__isoTest.prof().cardio.some(c => /treadmill|rower|bike/.test(c))), 'switching to Home drops gym cardio machines');
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
