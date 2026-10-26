// Round 2 fixes from the simulated users: larger text at zoom, honest trimmed sessions, heel drops, lifter and food logging, bodyweight and bands.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8241, URL = `http://localhost:${PORT}/index.html`;
const P0 = { units: 'kg', bw: 70, cm: 170, age: 40, sex: 'm', diet: 'any' };
async function boot(kind, state, opts = {}) {
  const o = await open(kind, Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
const say = (page, t) => T(page, t => window.__isoTest.handle(t), t);
const lastCard = page => T(page, () => { const f = window.__isoTest.feed(); return f.filter(x => x.r === 'card').pop(); });
async function toWork(page) { await page.click('#sessions [data-start]'); await page.waitForTimeout(250); for (let i = 0; i < 6 && !(await T(page, () => /Hold set|Rep set/.test(document.getElementById('pSetLabel').textContent))); i++) { await page.click('#pSkip'); await page.waitForTimeout(120); } }
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    // Larger text + page zoom: session controls and tabs stay on screen
    for (const z of [1, 1.5, 2]) {
      const { b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { age: 67, big: true }), eq: ['d'] }, { textScale: z });
      ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth + 2), kind + ' larger text at ' + z + 'x: Train fits');
      ok(await T(page, () => [...document.querySelectorAll('.tabbar button')].every(b => b.scrollWidth <= b.clientWidth + 1)), kind + ' larger text at ' + z + 'x: tab labels don’t overlap');
      await toWork(page);
      const off = await T(page, () => ['pClose', 'pMic', 'pPause', 'pPrev', 'pSkip'].filter(id => { const e = document.getElementById(id); if (!e || !e.offsetParent) return false; const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }));
      ok(!off.length, kind + ' larger text at ' + z + 'x: session buttons on screen ' + off);
      ok(await T(page, () => document.getElementById('pTime').getBoundingClientRect().bottom <= document.querySelector('.p-ctrl').getBoundingClientRect().top + 2), kind + ' larger text at ' + z + 'x: timer above the buttons');
      await b.close();
    }
  }
  const kind = 'android';
  // a session trimmed to one set says one set, everywhere
  let { b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { sex: 'f', age: 52, days: 3, len: 25, issues: ['bones'] }), eq: ['d'] }, { init: FAKE_SPEECH });
  await T(page, () => document.querySelectorAll('#sessions details').forEach(d => d.open = true));
  let txt = await page.locator('#sessions').innerText();
  ok(!/2\s×\s30\ss/.test(txt) && /1\s×\s30\ss/.test(txt), 'trimmed: plan list shows 1 × 30 s');
  await page.click('#sessions [data-start]'); await page.waitForTimeout(250);
  ok(await page.textContent('#pName') === 'Heel Drops' && await page.textContent('#pSkip') === 'Next part', 'osteopenia: heel drops are their own step, not a walk');
  ok(/toes/.test(await page.locator('#pCues').innerText()), 'heel drops: their own instructions');
  for (let i = 0; i < 6 && !(await T(page, () => /Hold set/.test(document.getElementById('pSetLabel').textContent))); i++) { await page.click('#pSkip'); await page.waitForTimeout(120); }
  ok(/Hold set 1 of 1/.test(await page.textContent('#pSetLabel')) && /^1\s×/.test(await page.textContent('#pRx')), 'trimmed: the session says set 1 of 1');
  await b.close();

  // saying "done" at the end of a rep set logs every rep; "close" leaves the finished screen
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['d'] }, { init: FAKE_SPEECH }));
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(250); await page.click('#pMic'); await page.waitForTimeout(100);
  for (let i = 0; i < 12 && !(await T(page, () => /Rep set/.test(document.getElementById('pSetLabel').textContent))); i++) { await T(page, () => window.__speak('next')); await page.waitForTimeout(120); }
  for (let i = 0; i < 3 && !/^Reps/.test(await page.textContent('#pPhase')); i++) { await T(page, () => window.__speak('next')); await page.waitForTimeout(150); } // rest -> get set -> reps
  await T(page, () => window.__speak('done')); await page.waitForTimeout(200);
  const lg = await T(page, () => window.__isoTest.store().log.slice(-1)[0]);
  ok(lg && lg.k === 'r' && lg.v >= 8, '"done" during a rep set logs the full set (' + (lg && lg.v) + ')');
  await b.close();

  // lifter logging
  ({ b, page, errs } = await boot(kind, { profile: { units: 'lb', bw: 89.8, cm: 178, age: 29, sex: 'm', where: 'gym' }, eq: ['b', 'c'], body: [{ t: Date.now() - 864e5, kg: 90.4 }] }));
  const pa = t => T(page, t => window.__isoTest.parseText(t).actions[0] || null, t);
  let a = await pa('bench 225 for 8, 8, 7'); ok(a && a.reps === 8 && a.more && a.more.join() === '8,7', '"225 for 8, 8, 7" keeps all three sets');
  a = await pa('bench two sixty five for 5'); ok(a && a.weight === 265, '"two sixty five" is 265');
  a = await pa('squat four oh five for 3'); ok(a && a.weight === 405, '"four oh five" is 405');
  a = await pa('deadlift 3 plates and a 25 for 5'); ok(a && a.weight === 365 && a.reps === 5, '"3 plates and a 25" is 365 lb');
  await say(page, 'deadlift 4 plates'); await say(page, '5'); let c = await lastCard(page);
  ok(c && c.title === 'Deadlift' && /405 lb × 5 reps/.test(c.lines[0]), 'a bare "5" answers "How many reps?"');
  await say(page, 'conventional deadlift 455 for 1'); c = await lastCard(page); ok(c.pb && c.title !== 'Conventional Deadlift', '"conventional deadlift" is the same lift as "deadlift"');
  await T(page, () => window.__isoTest.store().notes.forEach(n => { if (n.k === 'lift') n.t -= 864e5; })); // earlier lifts were on a previous day
  await say(page, 'deadlift 1100 lb for 1'); c = await lastCard(page); ok(c && /25% above your best/.test(c.warn || ''), 'a huge jump on a lift asks if it’s a typo');
  await page.click('#tab-progress'); txt = await page.locator('#progExtras').innerText();
  ok((txt.match(/^Deadlift$/gm) || []).length === 1, 'Progress shows deadlifts as one lift');
  // saving the profile without touching bodyweight adds no weigh-in
  const n0 = await T(page, () => window.__isoTest.store().body.length);
  await page.click('#tab-train'); await page.click('#profBtn'); await page.waitForTimeout(150); await page.click('#pfSave'); await page.waitForTimeout(150);
  ok(await T(page, () => window.__isoTest.store().body.length) === n0, 'profile save with bodyweight untouched adds no weigh-in');
  await b.close();

  // food counts and more foods
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['k'] }));
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions[0] || {}).items || [], t);
  ok((await fd('2 soft boiled eggs'))[0].q === 2, '"2 soft boiled eggs" is 2 eggs');
  ok((await fd('huevos 3'))[0].q === 3, '"huevos 3" is 3 eggs');
  ok((await fd('kopi and kaya toast')).map(i => i.n).join() === 'Kopi,Kaya toast', 'kopi and kaya toast');
  ok((await fd('3 dates'))[0].n === 'Dates', 'dates');
  ok((await T(page, () => window.__isoTest.parseText('cena: pasta con atun').actions[0])).meal_name === 'Dinner', '"cena" is dinner');
  // offline weight question; welcome-back counts ticked sessions
  await T(page, () => { const s = window.__isoTest.store(); s.body = [{ t: Date.now() - 20 * 864e5, kg: 72 }, { t: Date.now() - 864e5, kg: 70 }]; s.log = [{ t: Date.now() - 9 * 864e5, w: 1, id: 'curl', eq: 'd', k: 'h', kg: 8, v: 30 }]; s.done.w1d1am = Date.now() - 3600e3; });
  ok(/Latest/.test(await T(page, () => window.__isoTest.localAnswer('how is my weight going') || '')), '"how is my weight going" is answered offline');
  await page.click('#tab-coach'); await page.click('#tab-train'); await page.waitForTimeout(100);
  ok(!/It’s been \d+ days|Welcome back/.test(await page.locator('#train').innerText()), 'no "welcome back" right after ticking a session');
  await b.close();

  // bodyweight only, and resistance bands
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['w'] }));
  const names = await T(page, () => { const T = window.__isoTest; return T.allDays().filter(d => !d.cardio).map(d => d.ex.map(id => T.V(id, 'h')).filter(v => !v.missing).map(v => v.name)).flat(); });
  ok(names.includes('Push-Up Hold') && names.includes('Bodyweight Squat Hold') && names.includes('Towel Curl Hold'), 'bodyweight only: push-ups, squats and towel curls in the plan');
  ok(await T(page, () => !document.querySelector('#sessions .rw .s .h') || !/ at \d/.test(document.querySelector('#sessions').innerText)), 'bodyweight: no weights shown');
  await page.click('#sessions [data-start]'); await page.waitForTimeout(250);
  ok(await page.isHidden('#pWtRow'), 'bodyweight: no weight box in the session');
  await b.close();
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['r'] }));
  ok(await T(page, () => window.__isoTest.V('lateral-raise', 'h').name) === 'Band Lateral Raise Hold', 'bands: band lateral raise');
  ok(await T(page, () => /fig-band/.test(FIG.svgFor(window.__isoTest.V('curl', 'h'), window.__isoTest.V('curl', 'h')._r[2], {}))), 'bands: the picture shows the band');
  ok(/band/i.test(await T(page, () => window.__isoTest.V('curl', 'h').steps[0].txt)), 'bands: steps explain the band');
  await page.click('#profBtn'); await page.waitForTimeout(150);
  ok(await page.locator('.pchips[data-set="eq"] button[data-v="r"]').count() === 1 && await page.locator('.pchips[data-set="eq"] button[data-v="w"]').count() === 1, 'profile offers bands and bodyweight');
  ok(!errs.length, 'equipment: no errors ' + errs); await b.close();

  // gentle plans, one dot per day, first-run default for 60+
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { age: 67, issues: ['bp'], days: 3 }), eq: ['d'] }));
  ok(!(await T(page, () => window.__isoTest.buildQueue(window.__isoTest.allDays()[0], 'all', window.__isoTest.phaseOf(1)).some(it => it.id === 'bird-dog' && it.wk === 'r'))), 'blood pressure / 65+: no swings');
  ok(await page.locator('.strip button[data-i="0"] .dots i').count() === 1, 'one session a day: one dot per day');
  const f = await T(page, () => window.__isoTest.allDays().map(d => d.ex.join()));
  ok(new Set(f).size === 3, 'full-body days A, B and C are all different');
  await b.close();
  ({ b, page, errs } = await boot(kind, {}));
  await page.fill('#pfAge', '68'); await page.click('.pchips[data-set="eq"] button[data-v="d"]'); await page.click('#pfSave'); await page.waitForTimeout(150);
  ok(await T(page, () => window.__isoTest.prof().days) === 3, 'a new 68-year-old starts on 3 days a week');
  await b.close();

  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
