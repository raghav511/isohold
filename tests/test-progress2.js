// Progress redesign: in-page tabs (Muscles / Strength / Body), daily strength + endurance index,
// strength-change map, protein today and cardio minutes on the Body tab.
const { serve, open } = require('./lib');
const path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8440, URL = `http://localhost:${PORT}/index.html`;
const SHOTS = process.env.SHOTS || '';
const seed = require('./fixtures/seed-week4.json');
// local noon k days ago
const ago = k => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime() - k * 864e5; };
const L = (k, id, kind, eq, kg, v, m = 0) => ({ t: ago(k) + m * 60e3, w: 4, id, eq, k: kind, kg, v });
// day -10 and -8, -7 trained; day -9 is a rest day
const log = [
  L(10, 'goblet-squat', 'r', 'k', 20, 10), L(10, 'goblet-squat', 'r', 'k', 18, 8, 1), L(10, 'wall-sit', 'h', 'd', 10, 30, 2),
  L(8, 'goblet-squat', 'r', 'k', 24, 10), L(8, 'wall-sit', 'h', 'd', 10, 45, 1),
  L(7, 'goblet-squat', 'r', 'k', 24, 12), L(7, 'wall-sit', 'h', 'd', 12, 40, 1)
];
const state = Object.assign({}, seed, { log, done: {}, food: [{ t: Date.now() - 60e3, meal: 'Lunch', items: [{ n: 'Chicken breast', q: 1, u: 'g', g: 150, p: 46, c: 0, f: 5, k: 250 }] }],
  notes: [{ t: Date.now() - 120e3, k: 'cardio', m: 'Walking', min: 30 }], profile: Object.assign({}, seed.profile, { dayHour: 0 }) });
async function boot(st, dark) { const o = await open('android', { state: st, dark }); await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); await o.page.waitForTimeout(150); return o; }
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot(state);
  await page.click('#tab-progress'); await page.waitForTimeout(150);
  // tabs
  ok(await page.getAttribute('#pt-strength', 'aria-selected') === 'true' && await page.isVisible('#dailyCard') && !(await page.isVisible('#mapCard')), 'opens on the Strength tab');
  await page.click('#pt-muscles'); await page.waitForTimeout(50);
  ok(await page.isVisible('#mapCard') && await page.isVisible('#cov') && !(await page.isVisible('#dailyCard')) && await page.getAttribute('#progPanel', 'aria-labelledby') === 'pt-muscles', 'Muscles tab shows the map and coverage');
  await page.focus('#pt-muscles'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(50);
  ok(await page.getAttribute('#pt-body', 'aria-selected') === 'true' && await page.evaluate(() => document.activeElement.id) === 'pt-body', 'arrow keys move between tabs');
  ok(await page.isVisible('#bodyNow') && !(await page.isVisible('#mapCard')), 'Body tab shows today');
  // Body tab: protein today and cardio minutes
  const bt = await page.locator('#bodyNow').innerText();
  ok(/46 g\s*protein today/.test(bt) && /30 min\s*cardio in the last 7 days/.test(bt) && /30 min today/.test(bt), 'Body tab shows protein today and cardio minutes: ' + bt.replace(/\s+/g, ' ').slice(0, 160));
  ok(await page.locator('#progExtras [data-pt="body"]').count() > 0 && await page.isVisible('#progExtras [data-pt="body"]'), 'Body and food card sits in the Body tab');
  await page.click('#pt-strength'); await page.waitForTimeout(50);
  // strength graph: points only on trained days, break on the rest day
  const sd = await page.getAttribute('#dailyCard path[data-series="strength"]', 'd'), ed = await page.getAttribute('#dailyCard path[data-series="endurance"]', 'd');
  ok((sd.match(/M/g) || []).length === 2 && (sd.match(/L/g) || []).length === 1, 'strength line has 2 segments with a gap for the rest day: ' + sd);
  ok((ed.match(/M/g) || []).length === 2, 'endurance line breaks on the rest day too');
  ok(await page.locator('#dailyCard circle.ms').count() === 3 && await page.locator('#dailyCard rect.me').count() === 3, 'one marker per trained day, none on the rest day');
  ok(await page.locator('#dailyCard svg.dchart[role="img"]').count() === 1 && /100 is your start/.test(await page.getAttribute('#dailyCard svg.dchart', 'aria-label')), 'chart has a role=img summary');
  // calculations
  const D = await page.evaluate(() => { const d = window.__isoTest.dailyIdx(), s = {}, e = {}; Object.keys(d.s).forEach(k => s[k] = d.s[k]); Object.keys(d.e).forEach(k => e[k] = d.e[k]); const x = d.ex['r|goblet-squat|k'], hm = (kg, v) => window.__isoTest.holdMax({ id: 'wall-sit', kg, v }).est; return { s, e, base: x.base, ep: window.__isoTest.epley(20, 10), lt: window.__isoTest.loadTime(0, 60), h2: hm(10, 45) / hm(10, 30), h3: hm(12, 40) / hm(10, 30) }; });
  const ds = await page.evaluate(ts => ts.map(t => window.__isoTest.dayStart(t)), [ago(10), ago(8), ago(7)]);
  ok(Math.abs(D.base - 20 * (1 + 10 / 30)) < 1e-9 && Math.abs(D.ep - 26.6667) < 1e-3, 'e1RM is Epley: 20 kg × 10 reps = 26.67 kg (best set of the day)');
  ok(Math.abs(D.s[ds[0]] - 100) < 1e-9 && Math.abs(D.s[ds[1]] - (120 + D.h2 * 100) / 2) < 1e-6 && Math.abs(D.s[ds[2]] - (24 * 1.4 / (20 * (1 + 1 / 3)) * 100 + D.h3 * 100) / 2) < 1e-6, 'strength index: mean of goblet squat (100, 120, 126) and the weighted wall-sit hold max: ' + Object.values(D.s).map(Math.round));
  ok(Math.abs(D.e[ds[0]] - 100) < 1e-9 && Math.abs(D.e[ds[1]] - 150) < 1e-6 && Math.abs(D.e[ds[2]] - 160) < 1e-6 && D.lt === 60, 'endurance index uses seconds × kg (300 → 450 → 480), bodyweight counts as 1');
  ok(/160/.test(await page.locator('#dailyCard table.dtab').textContent()), 'numbers table lists the indices');
  // info
  ok(await page.getAttribute('#dlyInfoB', 'aria-expanded') === 'false' && !(await page.isVisible('#dlyInfo')), 'info starts closed');
  const ib = await page.locator('#dlyInfoB').boundingBox(); ok(ib.width >= 44 && ib.height >= 44, 'info button is 44 px');
  await page.click('#dlyInfoB');
  const hrefs = await page.$$eval('#dlyInfo a', a => a.map(x => x.href));
  ok(await page.getAttribute('#dlyInfoB', 'aria-expanded') === 'true' && await page.isVisible('#dlyInfo'), 'info opens');
  ok(hrefs.length === 3 && hrefs.every(h => /^https:\/\/doi\.org\//.test(h)) && !/youtube|youtu\.be/i.test(await page.locator('#dlyInfo').innerHTML()), 'info has 3 DOI links and no YouTube');
  ok(/1 \+ \(reps \+ reps in reserve\) ÷ 30/.test(await page.locator('#dlyInfo').innerText()), 'info shows the Epley formula with reps in reserve');
  // strength map
  await page.click('#pt-muscles');
  const lab = await page.getAttribute('#mapCard svg.smap', 'aria-label');
  ok(/up 26%/.test(lab) && /No data:/.test(lab), 'strength map aria-label lists % change: ' + lab.slice(0, 140));
  ok(await page.locator('#mapCard svg.smap rect.sm-4').count() > 0 && await page.locator('#mapCard svg.smap rect.sm-none').count() > 0, 'regions coloured by change, no data dashed');
  ok(/\+26%/.test(await page.locator('#mapCard').innerText()), 'change listed in words');
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 413, 'no sideways scroll');
  await page.evaluate(() => window.__isoTest.handle('I weigh 82 kg')); await page.click('#tab-train'); await page.click('#tab-progress'); await page.waitForTimeout(80);
  ok(await page.getAttribute('#pt-body', 'aria-selected') === 'true' && /82 kg/.test(await page.locator('#progExtras').innerText()), 'after a weigh-in, Progress opens on Body');
  await page.evaluate(() => window.__isoTest.handle('goblet squat 26 kg x 8')); await page.click('#tab-train'); await page.click('#tab-progress'); await page.waitForTimeout(80);
  ok(await page.getAttribute('#pt-strength', 'aria-selected') === 'true', 'after a lift, Progress opens on Strength');
  ok(!errs.length, 'no page errors ' + errs);
  await b.close();
  // empty state
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 30, sex: 'm' }, eq: ['d'] }));
  await page.click('#tab-progress'); await page.waitForTimeout(100);
  ok(/After two days/.test(await page.locator('#dailyCard').innerText()) && await page.locator('#dailyCard svg.dchart').count() === 0, 'empty state with fewer than 2 training days');
  ok(/No data/.test(await page.getAttribute('#mapCard svg.smap', 'aria-label')), 'empty strength map still labelled');
  ok(!errs.length, 'no page errors (new user) ' + errs);
  await b.close();
  // the week-4 fixture, light and dark, each tab
  for (const dark of [false, true]) {
    ({ b, page, errs } = await boot(seed, dark));
    await page.click('#tab-progress'); await page.waitForTimeout(150);
    for (const t of ['muscles', 'strength', 'body']) {
      await page.click('#pt-' + t); await page.waitForTimeout(80);
      ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 413, (dark ? 'dark ' : 'light ') + t + ': fits 412 px');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `prog-${t}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    }
    ok(!/undefined|NaN/.test(await page.locator('#progress').innerText()), 'no undefined or NaN');
    ok(!errs.length, 'no page errors (fixture) ' + errs);
    await b.close();
  }
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
