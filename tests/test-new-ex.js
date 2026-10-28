// New exercises: side plank leg raise, Copenhagen plank, Pallof press, incline press. Placement, pictures, papers and equipment versions.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8264, URL = `http://localhost:${PORT}/index.html`;
async function boot(eq, extra = {}) {
  const o = await open('android', { state: { profile: Object.assign({ units: 'kg', bw: 70, age: 40, sex: 'm' }, extra), eq } });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const q = (page, day) => page.evaluate(d => { const t = window.__isoTest, dy = t.allDays().find(x => x.id === d); return t.buildQueue(dy, 'pm', t.phaseOf(1)).filter(i => i.id).map(i => [i.id, i.ex.name]); }, day);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot(['d', 'r']);
  let a = await q(page, 'c1'), ids = a.map(x => x[0]);
  ok(ids.includes('incline-press') && ids.includes('pallof'), 'cardio day 1 adds incline press and Pallof press');
  a = await q(page, 'c2'); ids = a.map(x => x[0]);
  ok(ids.includes('side-plank') && ids.includes('copenhagen'), 'cardio day 2 adds side plank leg raise and Copenhagen plank');
  // the Copenhagen picture has its bench; the info icon links to the trials
  await page.click('#tab-exercises'); await page.waitForTimeout(250);
  await page.click('#lib [data-ex="copenhagen"]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => [...document.querySelectorAll('#sheetBody svg')].some(s => /fig-prop/.test(s.innerHTML))), 'Copenhagen picture shows the bench');
  await page.click('#dInfo').catch(() => {}); await page.waitForTimeout(150);
  const links = await page.evaluate(() => [...document.querySelectorAll('#sheetBody a[href]')].map(x => x.href).join(' '));
  ok(/10\.1111\/sms\.12585/.test(links) && /bjsports-2017-098937/.test(links), 'Copenhagen info links to both trials');
  ok(!/youtube|squatuniversity|anatomylab/i.test(links), 'no video links in the info');
  await page.click('#sheetClose'); await page.waitForTimeout(100);
  await page.click('#lib [data-ex="incline-press"]'); await page.waitForTimeout(250); await page.click('#dInfo').catch(() => {}); await page.waitForTimeout(150);
  ok(/JSC\.0b013e3181ddfae7/.test(await page.evaluate(() => [...document.querySelectorAll('#sheetBody a[href]')].map(x => x.href).join(' '))), 'incline press info links to the incline study');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors ' + errs);
  await b.close();
  // cables only: cable and machine versions
  ({ b, page, errs } = await boot(['c'], { where: 'gym' }));
  const names = (await q(page, 'c1')).map(x => x[1]);
  ok(names.includes('Cable Pallof Press Hold') && names.includes('Incline Machine Press Hold'), 'cables: Cable Pallof Press and Incline Machine Press (' + [...new Set(names)] + ')');
  await b.close();
  // bands only: Pallof yes, dumbbell incline press no
  ({ b, page, errs } = await boot(['r'], { where: 'home' }));
  ids = (await q(page, 'c1')).map(x => x[0]);
  ok(ids.includes('pallof') && !ids.includes('incline-press'), 'bands: Pallof press in, incline press left out');
  ids = (await q(page, 'c2')).map(x => x[0]);
  ok(ids.includes('side-plank') && ids.includes('copenhagen'), 'bands: side plank and Copenhagen need no weights');
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
