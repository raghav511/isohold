// Fixes from the simulated-user rounds (large text, health flags, plan settings, lifter logging, voice, accessibility, offline use).
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8240, URL = `http://localhost:${PORT}/index.html`;
const P0 = { units: 'kg', bw: 70, cm: 170, age: 40, sex: 'm', diet: 'any' };
async function boot(kind, state, opts = {}) {
  const o = await open(kind, Object.assign({ state }, opts));
  if (opts.clock) await o.page.clock.install({ time: new Date(opts.clock) });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
const say = (page, t) => T(page, t => window.__isoTest.handle(t), t);
const lastCard = page => T(page, () => { const f = window.__isoTest.feed(); return f[f.length - 1]; });
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    // ---- 200% page zoom: nothing runs off the screen, the session controls and timer are reachable
    let { b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { age: 67, issues: ['knee', 'bp'] }), eq: ['d'] }, { textScale: 2 });
    const vw = await T(page, () => innerWidth);
    for (const t of ['train', 'coach', 'progress', 'guide']) { await T(page, t => document.getElementById('tab-' + t).click(), t); await page.waitForTimeout(100); ok(await T(page, () => document.documentElement.scrollWidth) <= vw + 2, kind + ' zoom 200%: ' + t + ' fits the screen'); }
    await T(page, () => { document.getElementById('tab-train').click(); document.querySelector('#sessions [data-start]').click(); }); await page.waitForTimeout(300);
    await T(page, () => document.getElementById('pSkip').click()); await page.waitForTimeout(150); await T(page, () => document.getElementById('pSkip').click()); await page.waitForTimeout(300);
    const off = await T(page, () => ['pClose', 'pMic', 'pPause', 'pPrev', 'pSkip', 'pTime'].filter(id => { const e = document.getElementById(id); if (!e || !e.offsetParent) return false; const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }));
    ok(!off.length, kind + ' zoom 200%: session controls on screen ' + off);
    ok(await T(page, () => document.getElementById('pTime').getBoundingClientRect().bottom <= document.querySelector('.p-ctrl').getBoundingClientRect().top + 2), kind + ' zoom 200%: timer visible above the controls');
    ok(!errs.length, kind + ' zoom: no errors ' + errs); await b.close();

    // ---- knees, blood pressure, pain
    ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { age: 67, issues: ['knee', 'bp'] }), eq: ['d'] }));
    await page.evaluate(() => document.querySelector('.strip button[data-i="1"]').click()); await T(page, () => document.querySelectorAll('#sessions details').forEach(d => d.open = true));
    let txt = await page.locator('#sessions').innerText();
    ok(/Reverse Nordic left out for your knees/.test(txt), kind + ' knee flag leaves out kneeling Reverse Nordic');
    ok(/touch a chair/.test(txt) && /about 45°/.test(txt), kind + ' knee flag shortens squat and split-squat depth');
    ok(!(await T(page, () => window.__isoTest.buildQueue(window.__isoTest.allDays()[1], 'pm', window.__isoTest.phaseOf(1)).some(it => it.id === 'wall-sit' && it.wk === 'r'))), kind + ' knee flag: no Reverse Nordic in the session queue');
    await say(page, 'my knee hurts 4 out of 10');
    await page.click('#tab-train'); await page.evaluate(() => document.querySelector('.strip button[data-i="1"]').click()); await T(page, () => document.querySelectorAll('#sessions details').forEach(d => d.open = true));
    txt = await page.locator('#sessions').innerText();
    ok((txt.match(/Knee 4\/10/g) || []).length >= 3, kind + ' knee pain reaches goblet squat, split squat and wall sit');
    ok(/2\s×\s25\ss/.test(txt), kind + ' knee pain: plan shows the shortened hold');
    const q = await T(page, () => window.__isoTest.buildQueue(window.__isoTest.allDays()[1], 'am', window.__isoTest.phaseOf(1)).filter(it => it.id === 'goblet-squat' && it.wk === 'r')[0]);
    ok(q && q.reps < 12 && q.pain, kind + ' knee pain: fewer reps in the session');
    ok(/keep breathing/i.test(await T(page, () => window.__isoTest.localAnswer('is the wall sit safe for my blood pressure?') || '')), kind + ' offline answer: blood pressure');
    ok(/heel drops/i.test(await T(page, () => window.__isoTest.localAnswer('is this safe for osteopenia?') || '')), kind + ' offline answer: osteopenia');
    ok(/iftar/i.test(await T(page, () => window.__isoTest.localAnswer('can I train while fasting?') || '')), kind + ' offline answer: fasting');
    ok(!errs.length, kind + ' knees: no errors ' + errs); await b.close();

    // ---- one heavy kettlebell: no unsafe suggestion
    ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { inv: { k: '24' } }), eq: ['k'] }));
    ok(await T(page, () => window.__isoTest.suggestWt('lateral-raise', 'h')) === 0, kind + ' 24 kg only: lateral raise suggests no weight');
    ok(await T(page, () => window.__isoTest.suggestWt('goblet-squat', 'h')) === 24, kind + ' 24 kg only: goblet squat still uses the bell');
    await b.close();

    // ---- profile units switch converts once, however often the sheet was opened
    ({ b, page, errs } = await boot(kind, { profile: { units: 'lb', bw: 89.8, cm: 178, age: 29, sex: 'm' }, eq: ['b', 'c'], body: [{ t: Date.now() - 1e6, kg: 89.8 }] }));
    for (let i = 0; i < 2; i++) { await page.click('#profBtn'); await page.waitForTimeout(150); await page.click('#sheetClose'); await page.waitForTimeout(150); }
    await page.click('#profBtn'); await page.waitForTimeout(150); await page.click('.pchips[data-set="units"] button[data-v="kg"]');
    ok(Math.abs(parseFloat(await page.inputValue('#pfBw')) - 89.8) < 0.2, kind + ' units: 198 lb becomes 89.8 kg, not converted twice');
    await page.click('#pfSave'); await page.waitForTimeout(150);
    ok(Math.abs(await T(page, () => window.__isoTest.store().body.slice(-1)[0].kg) - 89.8) < 0.2, kind + ' units: saved bodyweight unchanged');
    // the exercise sheet: a weight typed for one exercise never lands on another opened earlier
    await page.click('#sessions .th[data-ex]'); await page.waitForTimeout(200); await page.click('#sheetClose'); await page.waitForTimeout(150);
    const ids = await T(page, () => [...document.querySelectorAll('#sessions .th[data-ex]')].map(b => b.dataset.ex));
    await page.click('#sessions .th[data-ex="' + ids[1] + '"]'); await page.waitForTimeout(200);
    await page.fill('#dWt', '33'); await page.waitForTimeout(100);
    const wts = await T(page, () => window.__isoTest.store().wt);
    ok(!Object.keys(wts).some(k => k.startsWith(ids[0] + '|')), kind + ' exercise sheet: weight only saved for the open exercise');
    await b.close();

    // ---- how lifters log
    ({ b, page, errs } = await boot(kind, { profile: { units: 'lb', bw: 89.8, cm: 178, age: 29, sex: 'm', where: 'gym' }, eq: ['b', 'c'] }));
    const pa = t => T(page, t => window.__isoTest.parseText(t).actions[0] || null, t);
    let a = await pa('leg press 10 plates a side for 8'); ok(a && a.weight === 900 && a.reps === 8, kind + ' plates: leg press 10 a side for 8 = 900 lb × 8');
    a = await pa('deadlift 4 plates for 5'); ok(a && a.name === 'Deadlift' && a.weight === 405 && a.reps === 5, kind + ' plates: deadlift 4 plates = 405 lb');
    a = await pa('squat 405 for 3'); ok(a && a.name === 'Back Squat' && a.weight === 405 && a.reps === 3, kind + ' "squat 405 for 3" is a back squat');
    a = await pa('bench 265x5 @RPE 8'); ok(a && a.name === 'Bench Press' && a.rpe === 8, kind + ' RPE kept, not part of the name');
    a = await pa('cable row 40 for 12'); ok(a && a.type === 'log_lift' && a.name === 'Cable Row', kind + ' cable row is a two-arm row, not the single-arm row');
    await say(page, 'deadlift 4 plates'); let c = await lastCard(page); ok(c && c.title === 'How many reps?', kind + ' weight with no reps asks for reps');
    await say(page, 'leg press 1000 lb x 10'); c = await lastCard(page); ok(c && c.k === 'set', kind + ' a 1000 lb leg press logs');
    await say(page, 'leg press 3000 lb x 10'); c = await lastCard(page); ok(c && c.k === 'err' && /looks wrong/.test(c.title), kind + ' an impossible weight shows a visible message');
    await say(page, 'bench 225x5'); await say(page, 'bench 245x5'); c = await lastCard(page); ok(c && c.pb, kind + ' heavier bench is a new best');
    await say(page, 'lat pulldown 100 lb 3 sets of 10');
    await page.evaluate(() => document.getElementById('tab-coach').click()); ok(/\b3\d? sets?\b|sets/.test(await page.locator('#cDay, .c-day, #coach').first().innerText()), kind + ' extra lifts count toward today');
    await page.click('#tab-progress'); await page.waitForTimeout(150); txt = await page.locator('#progExtras').innerText();
    ok(/estimated max/.test(txt) && /@ RPE 8/.test(txt) === false && /Bench Press/.test(txt), kind + ' Other lifts show heaviest and estimated max');
    ok(!/undefined/.test(await page.locator('#progress').innerText()), kind + ' Progress never shows "undefined"');
    await page.locator('#progExtras [data-dlift]').first().click(); await page.waitForTimeout(100);
    ok(/Deleted/.test(await page.locator('#toast').innerText()), kind + ' a single lift entry can be deleted (with undo)');
    ok(!errs.length, kind + ' lifters: no errors ' + errs); await b.close();

    // ---- voice: end-session question, repeat, how long, echo
    ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['d'] }, { init: FAKE_SPEECH }));
    await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(250); await page.click('#pMic'); await page.waitForTimeout(150);
    const n0 = await page.textContent('#pName');
    await T(page, () => { window.__spoken = []; window.__speak('repeat'); }); await page.waitForTimeout(150);
    ok(await page.textContent('#pName') === n0 && (await T(page, () => window.__spoken.join(' '))).includes(n0), kind + ' "repeat" says the step again instead of going back');
    await T(page, () => { window.__spoken = []; window.__speak('how long'); }); await page.waitForTimeout(150);
    ok(/minutes left in the session/.test(await T(page, () => window.__spoken.join(' '))), kind + ' "how long" answers');
    await T(page, () => { window.__spoken = []; window.__speak('end session'); }); await page.waitForTimeout(150);
    ok(await page.isVisible('#pConfirm') && /End this session\? Say yes/.test(await T(page, () => window.__spoken.join(' '))), kind + ' end-session question is spoken');
    await T(page, () => window.__speak('no')); await page.waitForTimeout(150);
    ok(!(await page.isVisible('#pConfirm')) && await page.isVisible('#player'), kind + ' "no" keeps the session going');
    await T(page, () => window.__speak('end session')); await page.waitForTimeout(150); await T(page, () => window.__speak('yes')); await page.waitForTimeout(150);
    ok(!(await page.isVisible('#player')), kind + ' "yes" ends the session');
    ok(!errs.length, kind + ' voice: no errors ' + errs); await b.close();
  }

  // ---- the rest once, on Android
  const kind = 'android';
  // days a week, session length, floor work, larger text, impact work
  let { b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { sex: 'f', age: 52, days: 3, len: 25, nofloor: true, issues: ['bones'], big: true }), eq: ['d'] });
  ok(await page.locator('.strip button').count() === 3, 'days a week: 3 days in the strip');
  ok(/\/3 days in program week/.test(await page.locator('#band').innerText()), 'days a week: rings count days, out of 3');
  const mm = +(await page.locator('#sessions .mins').first().innerText()).match(/\d+/)[0];
  ok(mm <= 25, 'longest session: ' + mm + ' min fits 25');
  ok(/To fit 25 minutes/.test(await page.locator('#sessions .sum').first().innerText()), 'longest session: says what was cut');
  const qq = await T(page, () => window.__isoTest.buildQueue(window.__isoTest.allDays()[0], 'all', window.__isoTest.phaseOf(1)));
  ok(!qq.some(it => ['dead-bug', 'floor-press', 'crunch', 'glute-bridge', 'plank-db'].includes(it.id)), 'no floor work: floor exercises left out');
  ok(qq[0].effort === 'Impact', 'osteopenia: the session starts with heel drops');
  ok(await T(page, () => document.documentElement.classList.contains('big')), 'larger text option applied');
  await b.close();

  // tablet and high contrast
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['d'], done: { w1d1am: Date.now() - 864e5, w1d1pm: Date.now() - 864e5 } }, { viewport: { width: 800, height: 1280 }, forcedColors: true }));
  ok(await page.locator('.strip button.dn svg').count() === 1, 'high contrast: a done day shows a check mark, not just colour');
  ok(/done/.test(await page.getAttribute('.strip button[data-i="0"]', 'aria-label')), 'done day is announced as done');
  await page.click('#sessions [data-start]'); await page.waitForTimeout(300);
  ok((await page.locator('.ring').boundingBox()).width >= 200, 'tablet: big timer readable from across the room');
  await b.close();

  // accessibility: focus, announcements, names
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['d'] }));
  await page.click('#profBtn'); await page.waitForTimeout(150);
  for (let i = 0; i < 80; i++) await page.keyboard.press('Tab');
  ok(await T(page, () => !!document.activeElement.closest('#sheet')), 'focus stays inside the profile sheet');
  ok(await T(page, () => [...document.querySelectorAll('#sheet .pchips')].every(g => g.getAttribute('aria-label'))), 'every choice group has a name');
  await page.click('#sheetClose'); await page.waitForTimeout(150);
  await page.click('#sessions [data-done]'); await page.waitForTimeout(150);
  ok(/marked done/.test(await page.textContent('#srLive')), 'marking a session done is announced');
  ok(await T(page, () => !!document.activeElement.dataset.done), 'focus stays on the done button');
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.fill('#cIn', '2 eggs'); await page.press('#cIn', 'Enter'); await page.waitForTimeout(150);
  ok(await T(page, () => document.activeElement.id === 'cIn') && /Egg/.test(await page.locator('#cMsgs').innerText()), 'Enter sends, and the cursor stays in the box');
  await b.close();

  // Spanish and mixed-language logging, offline
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['k'] }));
  const fd = t => T(page, t => (window.__isoTest.parseText(t).actions[0] || {}).items || [], t);
  ok((await fd('2 huevos y tostada')).map(i => i.n).join() === 'Egg,Bread', 'Spanish: huevos y tostada');
  ok((await fd('comí arroz con pollo')).map(i => i.n).join() === 'Rice with chicken', 'Spanish: arroz con pollo is one dish');
  ok((await fd('tortilla de patatas'))[0].n === 'Spanish omelette', 'Spanish: tortilla de patatas is not a roti');
  const two = await fd('200g chicken 150g rice'); ok(two[0].g === 200 && two[1].g === 150, 'each amount goes with its own food');
  ok((await fd('a cup of tea with milk'))[0].n === 'Chai', 'tea with milk is chai, not black tea');
  ok((await T(page, () => window.__isoTest.parseText('peso 70.5').actions[0] || {})).type === 'log_bodyweight', 'Spanish: peso 70.5 is a weigh-in');
  ok((await T(page, () => window.__isoTest.parseText('70.5kg').actions[0] || {})).type === 'log_bodyweight', 'a bare 70.5kg near your weight is a weigh-in');
  // a bike ride counts as the next cardio day (when today's session isn't already done: see test-r12b)
  await T(page, () => { const s = window.__isoTest.store(); ['d1', 'd2'].forEach(d => { s.done['w1' + d + 'am'] = s.done['w1' + d + 'pm'] = Date.now() - 864e5; }); });
  await say(page, 'bici 25 min'); let c = await lastCard(page);
  ok(c.doneK === 'w1c1am' && await T(page, () => !!window.__isoTest.store().done.w1c1am), 'a 25-minute ride counts as the next cardio session');
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.locator('.lgc [data-undo]').last().click().catch(() => {}); await page.waitForTimeout(100);
  ok(!(await T(page, () => window.__isoTest.store().done.w1c1am)), 'undoing the ride un-ticks the cardio session');
  ok(!errs.length, 'spanish: no errors ' + errs); await b.close();

  // resume a session after the tab was killed
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['d'] }));
  await page.click('#sessions [data-start][data-part="short-am"]'); await page.waitForTimeout(250);
  for (let i = 0; i < 3; i++) { await page.click('#pSkip'); await page.waitForTimeout(120); }
  const saved = await T(page, () => JSON.parse(localStorage.getItem('isohold.run')));
  await page.reload(); await page.waitForFunction(() => window.__isoholdReady);
  ok(/Pick up where you left off/.test(await page.locator('#train').innerText()), 'resume: the Train tab offers to pick up the session');
  await page.click('[data-resume]'); await page.waitForTimeout(250);
  ok(await page.isVisible('#player') && await T(page, () => JSON.parse(localStorage.getItem('isohold.run')).i) === saved.i, 'resume: back at the same step');
  await b.close();

  // night shifts: a day can start at 3 am, and a session that crosses midnight stays on one day
  ({ b, page, errs } = await boot(kind, { profile: Object.assign({}, P0, { dayHour: 3 }), eq: ['d'], food: [{ t: new Date('2026-10-26T22:00:00').getTime(), meal: 'Dinner', items: [{ n: 'Egg', g: 100, p: 12.6, c: 1, f: 10, k: 143 }] }] }, { clock: '2026-10-27T01:30:00' }));
  ok(await T(page, () => window.__isoTest.today(window.__isoTest.store().food).length) === 1, 'day starts at 3 am: a 10 pm meal still counts at 1:30 am');
  await b.close();

  // backups keep every detail of a set
  ({ b, page, errs } = await boot(kind, { profile: P0, eq: ['d'], log: [{ t: 1, w: 1, id: 'curl', eq: 'd', k: 'r', kg: 10, v: 8, sug: 1, rpe: 8, x: 1 }] }));
  await page.click('#tab-progress'); await page.click('#bkGo'); await page.click('#bkCopy').catch(() => {});
  const code = await T(page, () => document.getElementById('bkOut').value);
  await page.fill('#bkIn', code); await page.click('#bkRestore'); await page.waitForTimeout(150);
  ok(/other lifts/.test(await page.textContent('#bkMsg')), 'restore message counts other lifts and cardio');
  const l = await T(page, () => window.__isoTest.store().log[0]);
  ok(l.sug === 1 && l.rpe === 8 && l.x === 1, 'backup keeps the suggested-weight flag and RPE');
  await b.close();

  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
