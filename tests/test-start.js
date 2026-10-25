// Every Start button works for every kind of user, including long-time users without a profile.
const { serve, open } = require('./lib');
const STATES = { 'no profile, has history': { week: 2, done: { w2d1am: true }, log: [{ t: Date.now() - 864e5, w: 2, id: 'curl', eq: 'd', k: 'h', kg: 8, v: 30 }] }, 'two sessions': { profile: { units: 'kg', split: 'two' }, eq: ['k', 'd'] }, 'one session': { profile: { units: 'kg', split: 'one' }, eq: ['d'] } };
(async () => {
  const srv = await serve(8170); let n = 0, bad = 0;
  for (const kind of ['iphone', 'android']) for (const [name, st] of Object.entries(STATES)) {
    const { b, page, errs } = await open(kind, { state: st });
    await page.goto('http://localhost:8170/index.html'); await page.waitForFunction(() => window.__isoholdReady);
    for (const di of [0, 1, 2]) {
      await page.click(`.strip button[data-i="${di}"]`);
      const btns = await page.$$eval('#sessions [data-start]', bs => bs.map(x => x.dataset.part));
      for (const part of btns) {
        n++;
        await page.click(`#sessions [data-start][data-part="${part}"]`); await page.waitForTimeout(400);
        const go = await page.$('#sheetWrap:not([hidden]) #eqGo'); if (go) { await go.click(); await page.waitForTimeout(300); }
        const open = !(await page.isHidden('#player'));
        if (!open || errs.length) { bad++; console.log('FAIL', kind, name, 'day', di + 1, part, errs); errs.length = 0; }
        if (open) { await page.click('#pClose'); if (!(await page.isHidden('#pConfirm'))) await page.click('#pEndYes'); await page.waitForTimeout(100); }
      }
    }
    await b.close();
  }
  console.log(`${n - bad}/${n} start buttons open a session`); srv.close();
})();
