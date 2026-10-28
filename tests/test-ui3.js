// Redesign part 3: the session says how it runs (by itself, by tap or by voice). Rep sets saving themselves is covered in test-people2/3.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8269, URL = `http://localhost:${PORT}/index.html`;
async function boot(extra, opts = {}) { const o = await open('android', Object.assign({ state: { profile: Object.assign({ units: 'kg', bw: 70, age: 30, sex: 'm' }, extra), eq: ['d'] } }, opts)); if (opts.clock) await o.page.clock.install(); await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o; }
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({}, { init: FAKE_SPEECH });
  await page.click('#sessions [data-start][data-part="am"]'); await page.waitForTimeout(200);
  ok(/No need to touch the screen/.test(await page.textContent('#pHands')), 'auto pace: says it moves on by itself');
  ok(/say “pause” or “next”/.test(await page.textContent('#pHands')), 'auto pace: says how to use voice');
  await page.click('#pMic'); await page.waitForTimeout(100);
  ok(/Listening/.test(await page.textContent('#pHands')), 'voice on: says it is listening');
  await page.click('#pMic'); await page.waitForTimeout(100);
  for (let i = 0; i < 80 && await page.textContent('#pPhase') !== 'Done'; i++) { await page.evaluate(() => document.getElementById('pSkip').click()); await page.waitForTimeout(30); }
  await page.waitForTimeout(150);
  ok(await page.isHidden('#pHands'), 'finished screen: the line is hidden');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors ' + errs);
  await b.close();
  ({ b, page, errs } = await boot({ pace: 'self' }));
  await page.click('#sessions [data-start][data-part="am"]'); await page.waitForTimeout(200);
  ok(/tap Start next/.test(await page.textContent('#pHands')), 'tap-when-ready: says it waits for your tap');
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
