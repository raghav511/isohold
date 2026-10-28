// Round 9 fixes from the simulated users: counts next to unknown foods, turkey breast, more foods, machine loads, own lifts on Train, screen-reader and coaching polish.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8250, URL = `http://localhost:${PORT}/index.html`;
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 23, sex: 'm' }, eq: ['k'] }, { locale: 'es-ES' });
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions.find(x => x.type === 'log_food') || {}).items || [], t);
  let f = await fd('2 kiwis y un yogur'); ok(f.length === 2 && f[0].n === 'Kiwi' && f[0].q === 2 && f[1].n === 'Yogurt' && f[1].q === 1, '"2 kiwis y un yogur": 2 kiwis, 1 yogurt');
  f = await fd('pechuga de pavo 150 gr'); ok(f.length === 1 && f[0].n === 'Turkey' && f[0].g === 150, 'pechuga de pavo is turkey, not chicken + turkey');
  f = await fd('pechuga de pollo 200g'); ok(f.length === 1 && f[0].n === 'Chicken breast' && f[0].g === 200, 'pechuga de pollo');
  for (const [w, n] of [['verduras', 'Salad'], ['espinacas', 'Spinach'], ['fabada', 'Fabada'], ['naranja', 'Orange'], ['solomillo', 'Beef'], ['carbonara', 'Carbonara']]) { f = await fd(w); ok(f[0] && f[0].n === n && !(await T(page, t => window.__isoTest.parseText(t).unknown, w)).length, w + ' is ' + n); }
  await b.close();

  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 68, age: 34, sex: 'f', where: 'gym' }, eq: ['d', 'c'] }));
  await T(page, () => window.__isoTest.handle('leg press 140x8x3 @8'));
  const c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
  ok(!c.warn && /@ RPE 8/.test(c.lines[0]), 'a 140 kg leg press: no "that’s a lot" warning, RPE on the card');
  await T(page, () => { window.__isoTest.handle('bench 60x5'); window.__isoTest.handle('lat pulldown 50x10'); }); await page.click('#tab-train');
  ok(/plus 1 day of your own lifts/.test(await page.locator('#band').innerText()), 'Train shows training you logged outside the program');
  f = await T(page, () => window.__isoTest.parseText('kailan and choy sum').actions[0].items.map(i => i.n));
  ok(f.every(n => n === 'Asian greens'), 'kailan and choy sum are Asian greens');
  ok(/unchanged/.test(await T(page, () => { window.__isoTest.handle('my knee hurts 3 out of 10'); return window.__isoTest.localAnswer('how is my knee') || ''; })), 'knee 3/10: "how is my knee" says sessions are unchanged');
  await b.close();

  // the exercise sheet offers your own equipment; the finished screen's ring closes it
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 55, age: 45, sex: 'f', inv: { k: '6' } }, eq: ['k', 'r'] }));
  await page.click('#sessions .th[data-ex]'); await page.waitForTimeout(200);
  const tabs = await T(page, () => [...document.querySelectorAll('#sheetBody .eqtabs button')].map(b => b.dataset.eq));
  ok(tabs.every(e => ['k', 'r', 'w'].includes(e)), 'exercise sheet: only equipment you have (' + tabs + ')');
  await page.click('#sheetClose'); await page.waitForTimeout(100);
  ok(await page.getAttribute('details.pf-inv', 'aria-label').catch(() => 'n/a') !== null, 'Weights you own has a name');
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(200);
  for (let i = 0; i < 80 && await page.textContent('#pPhase') !== 'Done'; i++) { await T(page, () => document.getElementById('pSkip').click()); await page.waitForTimeout(40); }
  await page.waitForTimeout(150);
  ok(await page.getAttribute('#pRingBtn', 'aria-label') === 'Close the session' && await T(page, () => document.activeElement.id === 'pClose'), 'finished screen: focus on Close, the ring says what it does');
  await page.click('#pRingBtn'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#player')), 'the ring closes the finished screen');
  ok(await T(page, () => document.getElementById('bkOut').getAttribute('aria-hidden')) === 'true', 'the long backup code isn’t read out');
  await b.close();

  // progression: the nudge is spoken; at your heaviest it says how to keep progressing
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 62, age: 52, sex: 'f', inv: { d: '4, 6' }, cues: true }, eq: ['d'], week: 2, wt: { 'lateral-raise|d|r': 6 }, log: [{ t: Date.now() - 5 * 864e5, w: 1, id: 'lateral-raise', eq: 'd', k: 'r', kg: 6, v: 12 }] }, { init: FAKE_SPEECH }));
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(200);
  let seen = '';
  for (let i = 0; i < 12 && !seen; i++) { const t = await T(page, () => document.getElementById('pLast').hidden ? '' : document.getElementById('pLast').textContent); if (/your heaviest/.test(t)) seen = t; await T(page, () => document.getElementById('pSkip').click()); await page.waitForTimeout(100); }
  ok(/your heaviest: lower each rep over 4 seconds/.test(seen), 'all reps at your heaviest: the session says how to keep progressing');
  ok(await T(page, () => (window.__spoken || []).some(x => /your heaviest/.test(x))), 'the progression nudge is spoken');
  await page.click('#pClose'); await page.click('#pEndYes').catch(() => {});
  await page.evaluate(() => document.getElementById('tab-guide').click()); ok(/Training while fasting/.test(await page.locator('#guide').innerText()) && /Osteopenia and osteoporosis/.test(await page.locator('#guide').innerText()), 'Guide has Bones and Ramadan cards');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors ' + errs);
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
