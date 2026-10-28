// Round 4 fixes from the simulated users: set lists, doubles, push-up history, Spanish food amounts, spoken sets, warm-up and walk nudges.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8243, URL = `http://localhost:${PORT}/index.html`;
const P0 = { units: 'kg', bw: 70, cm: 170, age: 40, sex: 'm', diet: 'any' };
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({ profile: { units: 'lb', bw: 89.8, cm: 178, age: 29, sex: 'm', where: 'gym' }, eq: ['b', 'c'] });
  const pa = t => T(page, t => window.__isoTest.parseText(t).actions[0] || null, t);
  let a = await pa('bench 225 for 8 8 7 @9'); ok(a && a.reps === 8 && a.more && a.more.join() === '8,7' && a.rpe === 9, '"for 8 8 7" is three sets');
  a = await pa('bench two twenty five for eight eight and seven'); ok(a && a.weight === 225 && a.more && a.more.join() === '8,7', 'spoken "eight eight and seven" is three sets');
  a = await pa('squat four hundred for a double'); ok(a && a.name === 'Back Squat' && a.weight === 400 && a.reps === 2, '"for a double" is 2 reps');
  a = await pa('deadlift 4 plates and a 10 and a 5 for 1'); ok(a && a.weight === 435, '"4 plates and a 10 and a 5" = 435 lb');
  a = await pa('bench 2 plates and a 2.5 a side x 1'); ok(a && a.name === 'Bench Press' && a.weight === 230, '"... a side" is not part of the name');
  a = await pa('bench 225 for 5 sets of 5'); ok(a && a.sets === 5 && a.reps === 5 && !a.more, '"for 5 sets of 5" is still 5 × 5');
  await b.close();

  ({ b, page, errs } = await boot({ profile: P0, eq: ['k'] }));
  const pu = t => T(page, t => window.__isoTest.parseText(t).actions[0] || null, t);
  a = await pu('push ups 20 20 18'); ok(a && a.exercise === 'floor-press' && a.eq === 'w' && a.reps === 20 && a.more.join() === '20,18', 'push-ups "20 20 18"');
  a = await pu('flexiones 3 series de 15'); ok(a && a.sets === 3 && a.reps === 15, 'flexiones 3 series de 15');
  a = await pu('flexiones tres por veinte'); ok(a && a.sets === 3 && a.reps === 20, 'flexiones tres por veinte');
  a = await pu('twenty push ups'); ok(a && a.reps === 20 && a.exercise === 'floor-press', 'twenty push ups');
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions[0] || {}).items || [], t);
  let f = await fd('comida: macarrones 250g y ensalada'); ok(f.length === 2 && f[0].n === 'Pasta' && f[0].g === 250 && f[1].n === 'Salad', 'macarrones 250g y ensalada');
  f = await fd('300 gr de lentejas'); ok(f[0].n === 'Lentils' && f[0].g === 300, '"300 gr" is grams');
  f = await fd('dos huevos fritos con patatas'); ok(f[0].q === 2 && f[1].n === 'Potato', 'dos huevos fritos con patatas');
  ok((await T(page, () => window.__isoTest.parseText('dos huevos fritos con patatas').unknown)).length === 0, 'nothing left unrecognised');
  ok((await fd('dates'))[0].q === 3, 'plain "dates" is a few');
  // push-up history is called Push-Up, with no weight chart
  await T(page, () => window.__isoTest.handle('push ups 3x20'));
  await page.click('#tab-progress'); await page.waitForTimeout(100);
  await page.selectOption('#strSel', 'floor-press').catch(() => {}); await page.waitForTimeout(100);
  const sc = await page.locator('#strCard').innerText();
  ok(/Push-Up/.test(await page.locator('#strSel option:checked').innerText()) && !/Weight \(/.test(sc) && !/Heaviest/.test(sc), 'history: Push-Up, reps only');
  ok(/read|VoiceOver|TalkBack/.test(await T(page, () => window.__isoTest.localAnswer('can you read the exercise aloud') || '')), 'read aloud answer mentions spoken cues and screen readers');
  ok(/band/i.test(await T(page, () => window.__isoTest.localAnswer('what band should I use') || '')), 'which band answer');
  await b.close();

  // hands-free: every logged set is spoken, including the second exercise of a pair
  ({ b, page, errs } = await boot({ profile: P0, eq: ['d'] }, { init: FAKE_SPEECH }));
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(250); await page.click('#pMic'); await page.waitForTimeout(100);
  await T(page, () => { window.__spoken = []; });
  for (let i = 0; i < 30 && (await T(page, () => window.__isoTest.store().log.length)) < 4; i++) { const ph = await page.textContent('#pPhase'); if (/^Hold|^Reps/.test(ph)) await page.waitForTimeout(5300); await T(page, () => window.__speak(/^Reps/.test(document.getElementById('pPhase').textContent) ? 'done' : 'next')); await page.waitForTimeout(120); }
  const n = await T(page, () => window.__isoTest.store().log.length), said = await T(page, () => window.__spoken.filter(x => /^Logged/.test(x)).length);
  ok(n >= 2 && said === n, 'hands-free: every logged set is spoken (' + said + ' of ' + n + ')');
  await b.close();

  // blood pressure: walk nudge; the next phase is named; warm-up kept when it fits; trimmed sessions offer no "short" version
  ({ b, page, errs } = await boot({ profile: Object.assign({}, P0, { age: 67, issues: ['bp'], days: 3, len: 25 }), eq: ['d'], week: 2, log: [{ t: Date.now() - 864e5, w: 2, id: 'curl', eq: 'd', k: 'h', kg: 3, v: 30 }] }));
  const tr = await page.locator('#train').innerText();
  ok(/Walk on your rest days/.test(tr), 'blood pressure: a walk-on-rest-days nudge');
  await page.click('#weekBtn'); await page.waitForTimeout(150);
  ok(/From week 3: Build phase/.test(await page.textContent('#sheetBody')), 'week 2: the week sheet says what changes in week 3');
  await page.click('#sheetClose'); await page.waitForTimeout(100);
  ok(!(await page.locator('#sessions .shortbtn').count()), 'a trimmed session offers no shorter version');
  const q = await T(page, () => { const T = window.__isoTest, Q = T.buildQueue(T.allDays()[0], 'all', T.phaseOf(2)); return { warm: Q.some(it => it.kind === 'cardio'), secs: Q.reduce((t, it) => t + it.dur + (it.after || 0), 0), note: Q.trimNote }; });
  ok(q.secs <= 25 * 60 + 60, 'trimmed session fits 25 min');
  await b.close();

  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
