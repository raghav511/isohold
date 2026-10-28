// The target effort for holds is a real number in every phase (weeks 5-8 are "7-8"), gentle mode caps it at 7,
// and the neck hold always asks for a light effort.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8620;
async function boot(profile, week) {
  const o = await open('android', { state: { profile: Object.assign({ units: 'kg', bw: 70, age: 40, sex: 'f' }, profile), eq: ['k', 'd'], week: week } });
  await o.page.goto(`http://localhost:${PORT}/index.html`); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  return o;
}
(async () => {
  const srv = await serve(PORT);
  for (const [week, want] of [[1, /RPE 6\b/], [3, /RPE 7\b/], [6, /RPE 7–8/], [10, /RPE 9\b/]]) {
    const { b, page, errs } = await boot({}, week);
    await page.click('#tab-exercises'); await page.waitForTimeout(200);
    await page.click('#lib [data-ex="goblet-squat"]'); await page.waitForTimeout(200);
    const t = await page.textContent('#sheet');
    ok(want.test(t) && !/NaN/.test(t), 'week ' + week + ': exercise sheet shows ' + want + ' (' + (t.match(/RPE [^ ,.]*/) || [''])[0] + ')');
    await page.click('#sheetClose'); await page.waitForTimeout(100);
    // session player
    await page.evaluate(() => document.querySelector('#startBar button, #bigStart, [data-start]') && (document.querySelector('#startBar button') || document.querySelector('[data-start]')).click());
    await page.waitForTimeout(400);
    const rx = await page.evaluate(() => { const e = document.getElementById('pRx'); return e ? e.textContent : ''; });
    ok(!/NaN/.test(rx), 'week ' + week + ': session player has no NaN (' + rx.slice(0, 60) + ')');
    ok(!errs.length, 'no page errors ' + errs); await b.close();
  }
  // gentle mode caps "7-8" at 7; the neck hold is light
  const { b, page } = await boot({ issues: ['bones'], age: 66 }, 6);
  const r = await page.evaluate(() => { const t = window.__isoTest; return [t.rpeTxt('goblet-squat', t.phaseOf(6)), t.rpeTxt('neck-hold', t.phaseOf(6)), t.rpeTxt('neck-hold', t.phaseOf(10))]; });
  ok(r[0] === '7', 'gentle mode: week 6 capped at RPE 7 (' + r[0] + ')');
  ok(r[1] === '3–4' && r[2] === '3–4', 'neck hold is always RPE 3–4 (' + r[1] + ', ' + r[2] + ')');
  await b.close(); srv.close();
  console.log('rpe: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
