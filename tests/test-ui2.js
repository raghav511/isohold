// Redesign part 2: body map on Today (empty, partly filled), gaps line, Start pinned in thumb reach.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8268, URL = `http://localhost:${PORT}/index.html`;
async function boot(state) { const o = await open('android', { state }); await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); await o.page.waitForTimeout(150); return o; }
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 30, sex: 'm' }, eq: ['d'] });
  ok(/Your map is empty/.test(await page.textContent('#bodyCard')), 'new user: the map says it is empty');
  ok(/Nothing trained yet/.test(await page.getAttribute('#bodyCard svg', 'aria-label')), 'new user: the map has a screen-reader label');
  ok(await page.isVisible('#startBar [data-startbar]'), 'Start is pinned above the tab bar');
  const box = await page.locator('#startBar .btn').boundingBox(), vh = page.viewportSize().height;
  ok(box && box.y > vh * 0.6 && box.height >= 44, 'Start sits in the bottom third (thumb reach), 44 px or taller');
  await page.click('#startBar [data-startbar]'); await page.waitForTimeout(300);
  ok(await page.isVisible('#player'), 'pinned Start opens the session');
  await page.click('#pClose'); await page.click('#pEndYes').catch(() => {}); await page.waitForTimeout(150);
  await page.click('#tab-progress'); await page.waitForTimeout(100);
  ok(!(await page.isVisible('#startBar')), 'pinned Start is only on Today');
  await b.close();
  ({ b, page, errs } = await boot(require('./fixtures/seed-week4.json')));
  const lab = await page.getAttribute('#bodyCard svg', 'aria-label');
  ok(/Trained: .*quads/.test(lab) && /Gaps: .*rear delts/.test(lab), 'week 4: trained quads, gap at rear delts (' + lab.slice(0, 120) + ')');
  ok(await page.locator('#bodyCard rect.bm-gap').count() > 0 && await page.locator('#bodyCard rect.bm-on').count() > 0, 'trained parts are filled, gaps are dashed');
  ok(/\d+ gaps?:/.test(await page.textContent('#bodyCard')), 'the gaps line names the gaps');
  await page.click('#bodyCard [data-gapfind]'); await page.waitForTimeout(200);
  ok(await page.isVisible('#coach') && (await page.inputValue('#cIn')).length > 1 && await page.locator('#cSrch [data-sx]').count() > 0, 'Find exercises searches for the first gap and finds some');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors ' + errs);
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
