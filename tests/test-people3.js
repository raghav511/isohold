// Round 3 fixes from the simulated users: heel drops run, skip vs done, plate and spoken-number logging, owned weights, equipment choice.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8242, URL = `http://localhost:${PORT}/index.html`;
const P0 = { units: 'kg', bw: 70, cm: 170, age: 40, sex: 'm', diet: 'any' };
async function boot(kind, state, opts = {}) {
  const o = await open(kind, Object.assign({ state }, opts));
  if (opts.clock) await o.page.clock.install();
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
const say = (page, t) => T(page, t => window.__isoTest.handle(t), t);
const lastCard = page => T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    // an osteopenia session plays from heel drops to the end without freezing
    const { b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { sex: 'f', age: 52, days: 3, len: 25, issues: ['bones'] }), eq: ['d'] }, { clock: true });
    await page.click('#sessions [data-start]');
    await page.clock.runFor(8000);
    const t1 = await page.textContent('#pTime'); await page.clock.runFor(3000); const t2 = await page.textContent('#pTime');
    ok(await page.textContent('#pName') === 'Heel Drops' && t1 !== t2, kind + ' heel drops count down (' + t1 + ' → ' + t2 + ')');
    for (let i = 0; i < 120 && !/complete/i.test(await page.textContent('#pName')); i++) { await T(page, () => document.getElementById('pSkip').click()); await page.clock.runFor(300); }
    ok(/Session complete|Nothing logged/.test(await page.textContent('#pName')) && await page.textContent('#pPhase') === 'Done', kind + ' osteopenia session runs to the end');
    ok(!errs.filter(e => !/AudioContext/.test(e)).length, kind + ' osteopenia session: no errors ' + errs);
    await b.close();
  }
  const kind = 'android';
  // "skip" logs what you did, "done" logs the full set
  let { b, page, errs } = await boot(kind, { profile: P0, eq: ['d'] }, { init: FAKE_SPEECH });
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(250); await page.click('#pMic'); await page.waitForTimeout(100);
  async function toReps() { for (let i = 0; i < 16 && !/^Reps/.test(await page.textContent('#pPhase')); i++) { await T(page, () => window.__speak('next')); await page.waitForTimeout(120); } }
  await toReps(); await page.waitForTimeout(400); await T(page, () => window.__speak('skip')); await page.waitForTimeout(150);
  let lg = await T(page, () => window.__isoTest.store().log.filter(l => l.k === 'r'));
  ok(!lg.length || lg[lg.length - 1].v < 5, '"skip" early in a rep set does not log a full set');
  await toReps(); await T(page, () => window.__speak('done')); await page.waitForTimeout(150);
  lg = await T(page, () => window.__isoTest.store().log.filter(l => l.k === 'r'));
  ok(lg.length && lg[lg.length - 1].v >= 8, '"done" logs the full set');
  // heavier at the top of what you own
  await b.close();
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { inv: { d: '4, 6' } }), eq: ['d'] }, { init: FAKE_SPEECH }));
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(250); await page.click('#pMic'); await page.waitForTimeout(100);
  await page.fill('#pWt', '6'); await page.dispatchEvent('#pWt', 'input');
  await T(page, () => { window.__spoken = []; window.__speak('heavier'); }); await page.waitForTimeout(150);
  ok(/heaviest/.test(await T(page, () => window.__spoken.join(' '))), '"heavier" at your heaviest weight says so');
  await b.close();

  // logging
  ({ b, page, errs } = await boot(kind, { profile: { units: 'lb', bw: 89.8, cm: 178, age: 29, sex: 'm', where: 'gym' }, eq: ['b', 'c'] }));
  const pa = t => T(page, t => window.__isoTest.parseText(t).actions[0] || null, t);
  let a = await pa('bench 2 plates and a 10 x 3'); ok(a && a.weight === 245 && a.reps === 3 && !a.sets, '"2 plates and a 10 x 3" = 245 lb × 3');
  a = await pa('deadlift five hundred and five for a single'); ok(a && a.weight === 505 && a.reps === 1, '"five hundred and five for a single" = 505 × 1');
  a = await pa('bench three fifteen for five sets of five'); ok(a && a.weight === 315 && a.sets === 5 && a.reps === 5, '"three fifteen for five sets of five"');
  a = await pa('single leg rdl 12 kg 10 reps'); ok(a && a.exercise === 'sl-rdl', '"single leg" is still single-leg');
  a = await pa('push ups 3x20'); ok(a && a.type === 'log_set' && a.exercise === 'floor-press' && a.eq === 'w', 'typed push-ups go to the program push-up');
  await say(page, 'bench 225 for 5 @rpe 8'); await say(page, 'bench 245x5, 5, 5 @rpe 8');
  ok(await T(page, () => window.__isoTest.store().notes.filter(n => n.k === 'lift').slice(-3).every(n => n.rpe === 8)), 'RPE kept on every set of a multi-set line');
  await say(page, 'bench 285 for 3'); let c = await lastCard(page); ok(!/typo/.test(c.warn || ''), 'a normal heavier triple is not flagged as a typo');
  await T(page, () => { const s = window.__isoTest.store(); s.notes.push({ t: Date.now(), k: 'lift', name: 'Deadlift', kg: 294.835, reps: 1, sets: 1 }); });
  await page.click('#tab-progress'); ok(/estimated max 650 lb/.test(await page.locator('#progExtras').innerText()), 'a single at 650 lb shows estimated max 650 lb');
  await b.close();
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { units: 'kg' }), eq: ['d'] }));
  const kp = t => T(page, t => window.__isoTest.parseText(t).actions[0] || null, t);
  a = await kp('squat 3 plates and a 10 for 2'); ok(a && a.weight === 160, 'kg: "3 plates and a 10" = 160 kg');
  a = await kp('bench 2 plates and a 2.5 x 1'); ok(a && a.weight === 105 && a.reps === 1, 'kg: "2 plates and a 2.5 x 1" = 105 kg × 1');
  a = await kp('deadlift 8 x 25 kg plates for 1'); ok(a && a.weight === 220 && a.name === 'Deadlift', 'kg: "8 x 25 kg plates" = 220 kg');
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions[0] || {}).items || [], t);
  ok((await fd('pollo 200'))[0].g === 200, '"pollo 200" is 200 g of chicken');
  ok((await fd('teh tarik'))[0].n === 'Teh tarik', 'teh tarik is its own drink');
  await say(page, 'I weigh 70.5 kg'); await say(page, '70.5kg');
  ok(await T(page, () => window.__isoTest.store().body.filter(x => Math.abs(x.kg - 70.5) < 0.01).length) === 1, 'the same weigh-in twice in a day is saved once');
  ok(/perceived effort/.test(await T(page, () => window.__isoTest.localAnswer('what is RPE?') || '')), 'offline: what is RPE');
  ok(/holding a position/.test(await T(page, () => window.__isoTest.localAnswer('what does isometric mean') || '')), 'offline: what does isometric mean');
  ok(/Larger text/.test(await T(page, () => window.__isoTest.localAnswer('how do I make the text bigger') || '')), 'offline: how to make text bigger');
  await say(page, 'a cup of tea with sugar'); c = await lastCard(page); ok(/chai/.test(c.warn || ''), 'plain tea explains how to log milk tea');
  await b.close();

  // weights you own count as real; bodyweight or a band instead of a bell that's too heavy
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { inv: { d: '3' } }), eq: ['d'] }));
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(200);
  for (let i = 0; i < 4; i++) { await page.click('#pSkip'); await page.waitForTimeout(80); }
  await page.waitForTimeout(5500); await page.click('#pSkip'); await page.waitForTimeout(150);
  const l1 = await T(page, () => window.__isoTest.store().log.slice(-1)[0]);
  ok(l1 && l1.kg === 3 && !l1.sug, 'a set at a weight from "Weights you own" is not marked as a guess');
  await b.close();
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { inv: { k: '24' } }), eq: ['k', 'w'] }));
  ok(await T(page, () => window.__isoTest.V('dead-bug', 'h').eq) === 'w', 'one 24 kg bell + bodyweight: dead bug uses bodyweight');
  ok(await T(page, () => window.__isoTest.V('goblet-squat', 'h').eq) === 'k', '... the goblet squat keeps the bell');
  ok(!/Swing 2\s×\s15\s\/ side/.test(await T(page, () => { document.querySelector('.strip button[data-i="1"]').click(); document.querySelectorAll('#sessions details').forEach(d => d.open = true); return document.getElementById('sessions').innerText; })), 'a two-hand swing is not "per side"');
  await b.close();
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { inv: { k: '6' }, sex: 'f', bw: 55 }), eq: ['k', 'r'] }));
  ok(await T(page, () => window.__isoTest.V('lateral-raise', 'h').eq) === 'r', 'a 6 kg bell is too heavy for lateral raises: the band is used');
  await b.close();

  // knees: no kneeling bird dog; a cut warm-up isn't listed; one session's cardio counted once
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { issues: ['knee'] }), eq: ['d'] }));
  ok(!(await T(page, () => window.__isoTest.buildQueue(window.__isoTest.allDays()[1], 'am', window.__isoTest.phaseOf(1)).some(it => it.id === 'bird-dog' && it.wk === 'h'))), 'knees: no kneeling bird dog');
  ok(/Knees/.test(await page.locator('#train').innerText()), 'knees: a knee note in Notes for you');
  await b.close();
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { days: 3, len: 15 }), eq: ['d'] }));
  await T(page, () => document.querySelectorAll('#sessions details').forEach(d => d.open = true));
  const st = await page.locator('#sessions').innerText();
  ok(/no warm-up/.test(st) && !/\nWarm-up\n/.test(st), 'a warm-up cut for time is not listed');
  await b.close();

  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
