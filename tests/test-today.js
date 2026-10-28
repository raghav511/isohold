// Today is only about today: week plan in the week sheet, today's muscles on the body map, one/two sessions switch.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8400, URL = `http://localhost:${PORT}/index.html`;
const SEED = require('./fixtures/seed-week4.json');
async function boot(state, o2) { const o = await open('android', Object.assign({ state, viewport: { width: 412, height: 915 } }, o2 || {})); await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); await o.page.waitForTimeout(200); return o; }
const T = (p, f, a) => p.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot(SEED);

  // 3. Today keeps only today's things
  for (const id of ['#band', '#overall', '#eqddTrain', '#fuel', '#strip']) ok(!(await page.isVisible(id)) || (await page.locator(id).boundingBox()).width <= 16, id + ' is not visible on Today');
  ok(await page.isVisible('#bodyCard') && await page.isVisible('#sessions .sess') && await page.isVisible('#weekBtn') && await page.isVisible('#startBar [data-startbar]'), 'body map, sessions, week chip and Start stay');
  ok(await T(page, () => document.querySelector('#strip').getAttribute('aria-hidden') === 'true' && [].every.call(document.querySelectorAll('#strip button'), b => b.tabIndex === -1)), 'hidden day strip is out of the tab order and hidden from screen readers');
  ok(!/Up next/.test(await page.innerText('#train')), 'no "Up next" hero text on Today');

  // week sheet: days, program %, equipment, week picker
  await page.click('#weekBtn'); await page.waitForTimeout(200);
  const days = page.locator('#sheetBody .wkdays button');
  ok(await days.count() === 6, 'week sheet lists the 6 days (' + await days.count() + ')');
  const txt = await page.innerText('#sheetBody');
  ok(/This week/.test(txt) && /Program/.test(txt) && /\d+%/.test(txt), 'sheet shows "This week" and the program %');
  ok(await page.isVisible('#sheetBody .overall .ov-bar'), 'program bar visible in the sheet');
  ok(await page.isVisible('#sheetBody #eqddWeek summary'), 'equipment line in the sheet');
  ok(await page.locator('#sheetBody .weeks button').count() === 12, 'week picker still below');
  const l0 = await days.nth(0).getAttribute('aria-label');
  ok(/quads|glutes|chest|delts|back/.test(l0) && !/Upper Body|Lower Body/.test(l0.split(':')[1]), 'day buttons name muscles in plain words (' + l0 + ')');
  ok(/Cardio/.test(await days.nth(2).innerText()), 'cardio day says Cardio');
  for (let i = 0; i < 6; i++) { const bb = await days.nth(i).boundingBox(); if (bb.height < 44) ok(false, 'day button ' + i + ' under 44px'); }
  const before = await T(page, () => document.querySelector('#strip button[aria-pressed="true"]').dataset.i);
  const pick = before === '3' ? 4 : 3;
  await days.nth(pick).click(); await page.waitForTimeout(250);
  ok(await page.isHidden('#sheetWrap'), 'tapping a day closes the sheet');
  ok(await T(page, () => document.querySelector('#strip button[aria-pressed="true"]').dataset.i) === String(pick), 'tapping a day selects it');
  await page.click('#weekBtn'); await page.waitForTimeout(200);
  ok(await page.locator('#sheetBody .wkdays button[data-day="' + pick + '"]').getAttribute('aria-pressed') === 'true', 'selected day is pressed in the sheet');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  // 4. body map shows today's regions
  await T(page, () => document.querySelector('#strip button[data-i="1"]').click()); await page.waitForTimeout(150); // a lower-body day
  const lab = await page.getAttribute('#bodyCard svg', 'aria-label');
  ok(/Today’s session trains: .*quads/.test(lab), 'aria-label names today\'s muscles (' + lab.slice(-120) + ')');
  ok(await page.locator('#bodyCard rect.bm-tdy').count() > 0 && await page.locator('#bodyCard rect.bm-ring').count() > 0, 'today\'s parts are hatched and outlined');
  ok(/Today/.test(await page.innerText('#bodyCard .bm-legend')), 'legend has Today');
  const line = await page.innerText('#bodyCard .bm-today');
  ok(/^Today: .*quads/.test(line) && !/Upper|Lower/.test(line), 'line under the map: ' + line);
  ok(/\d+ gaps?:|Every muscle/.test(await page.textContent('#bodyCard')), 'gaps line stays');
  await T(page, () => document.querySelector('#strip button[data-i="2"]').click()); await page.waitForTimeout(150); // cardio day
  ok(/Today: /.test(await page.innerText('#bodyCard .bm-today')) && await page.locator('#sessions .sess').count() >= 1, 'cardio day still renders map line and sessions');

  // 5. split toggle
  await T(page, () => document.querySelector('#strip button[data-i="0"]').click()); await page.waitForTimeout(150);
  ok(await page.locator('#sessions .sess').count() === 2, 'two sessions by default');
  const segBtn = page.locator('#splitSeg [data-split="one"]');
  const sb = await segBtn.boundingBox(); ok(sb.height >= 44, 'split buttons are 44px+');
  ok(await page.getAttribute('#splitSeg [data-split="two"]', 'aria-pressed') === 'true', 'Morning + evening pressed');
  await segBtn.click(); await page.waitForTimeout(200);
  ok(await page.locator('#sessions .sess').count() === 1 && await page.getAttribute('#splitSeg [data-split="one"]', 'aria-pressed') === 'true', 'One session shows one card');
  ok(await T(page, () => JSON.parse(localStorage.getItem('isohold.v1')).profile.split) === 'one', 'saved to profile.split');
  await page.reload(); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); await page.waitForTimeout(200);
  ok(await page.locator('#sessions .sess').count() === 1, 'one session persists after reload');
  await page.click('#splitSeg [data-split="two"]'); await page.waitForTimeout(200);
  ok(await page.locator('#sessions .sess').count() === 2, 'back to two cards');
  await T(page, () => document.querySelector('#strip button[data-i="2"]').click()); await page.waitForTimeout(150);
  await page.click('#splitSeg [data-split="one"]'); await page.waitForTimeout(150);
  ok(await page.locator('#sessions .sess').count() === 1, 'cardio day renders as one session');
  await page.click('#splitSeg [data-split="two"]'); await page.waitForTimeout(150);

  await T(page, () => document.querySelector('#strip button[data-i="0"]').click()); await page.waitForTimeout(150);
  await page.screenshot({ path: __dirname + '/_today-light.png', fullPage: true });
  await page.click('#weekBtn'); await page.waitForTimeout(250);
  await page.screenshot({ path: __dirname + '/_today-sheet-light.png' });
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors (light) ' + errs);
  await b.close();

  // dark, and no-profile user
  ({ b, page, errs } = await boot(SEED, { dark: true }));
  await page.screenshot({ path: __dirname + '/_today-dark.png', fullPage: true });
  await page.click('#weekBtn'); await page.waitForTimeout(250);
  await page.screenshot({ path: __dirname + '/_today-sheet-dark.png' });
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors (dark) ' + errs);
  await b.close();
  ({ b, page, errs } = await boot({ done: { w9xam: 1 } })); // no profile yet (an old done key skips the welcome sheet)
  ok(await page.locator('#sessions .sess').count() === 2, 'new user: two sessions');
  await page.click('#splitSeg [data-split="one"]'); await page.waitForTimeout(150);
  ok(await page.locator('#sessions .sess').count() === 1 && await T(page, () => !JSON.parse(localStorage.getItem('isohold.v1')).profile), 'new user: one session without creating a profile');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors (new user) ' + errs);
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
