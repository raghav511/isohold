// Every tab opened directly on a fresh load (new user, seeded heavy user, gym/lb user) without errors.
const { serve, open } = require('./lib'); const seed = require('./fixtures/seed-week4.json');
const STATES = { new: undefined, seeded: seed, gymlb: { profile: { units: 'lb', diet: 'keto', where: 'gym', split: 'one', posture: true, issues: ['bp', 'bones', 'neck'], bw: 93, inv: { d: '5-75' } }, eq: ['d', 'c'], log: seed.log.slice(0, 200), notes: [{ t: Date.now() - 3600e3, k: 'pain', area: 'knee', score: 6 }, { t: Date.now(), k: 'lift', name: 'Lat Pulldown', kg: 50, reps: 10, sets: 3 }, { t: Date.now(), k: 'bp', sys: 140, dia: 90 }] } };
(async () => {
  const srv = await serve(8150); let n = 0, bad = 0;
  for (const kind of ['iphone', 'android']) for (const [name, st] of Object.entries(STATES)) for (const tab of ['train', 'exercises', 'coach', 'progress', 'guide']) {
    const { b, page, errs } = await open(kind, { state: st });
    await page.goto(`http://localhost:8150/index.html#${tab}`); n++;
    const ok = await page.waitForFunction(() => window.__isoholdReady, null, { timeout: 8000 }).then(() => true, () => false);
    if (!ok || errs.length) { bad++; console.log('FAIL', kind, name, tab, errs); }
    await b.close();
  }
  console.log(`${n - bad}/${n} boots clean`); srv.close();
})();
