// Trust: situations where the app could lose data, show stale or wrong numbers, or log the wrong thing.
const { serve, open, mockGemini } = require('./lib'); const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const BASE = { profile: { units: 'kg', bw: 80, cm: 175, age: 40, sex: 'm', diet: 'any' }, eq: ['k', 'd'] };
const PORT = 8230, URL = `http://localhost:${PORT}/index.html`;
async function boot(kind, opts = {}) { const o = await open(kind, Object.assign({ state: opts.state || BASE }, opts)); await o.page.goto(URL + (opts.hash || '')); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o; }
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    let { b, ctx, page, errs } = await boot(kind);
    const parse = t => T(page, t => window.__isoTest.parseText(t), t);
    // 1-5 logging misreads
    ok((await parse('black coffee with no sugar')).actions[0].items.every(i => i.n !== 'Sugar'), kind + ' "no sugar" does not log sugar');
    ok((await parse('latte without milk and a banana')).actions[0].items.length === 2, kind + ' "without" removes only the negated food');
    ok((await parse("I'm going to eat 2 eggs")).plan && !(await parse("I'm going to eat 2 eggs")).actions.length, kind + ' a plan is not logged');
    ok((await parse('tomorrow I will do goblet squat 16 kg 30 s')).plan, kind + ' "tomorrow" is a plan');
    ok(!(await parse('I had 2 eggs and will go for a walk later')).plan, kind + ' something already done still logs');
    ok((await parse('8,000 steps')).actions[0].steps === 8000 && (await parse('I weigh 78,5 kg')).actions[0].weight === 78.5, kind + ' thousands separators and decimal commas');
    await T(page, () => window.__isoTest.handle('yesterday 2 eggs and toast'));
    const y = await T(page, () => { const s = window.__isoTest.store(), f = s.food[s.food.length - 1], d = new Date(); d.setHours(0, 0, 0, 0); return [f.t < d.getTime(), window.__isoTest.feed().slice(-1)[0].title]; });
    ok(y[0] && /yesterday/.test(y[1]), kind + ' "yesterday" is logged on yesterday ' + y[1]);
    ok((await T(page, () => document.querySelector('#fuel').textContent)).includes('0 / '), kind + ' yesterday\'s food is not in today\'s protein');
    // 6 pain clears
    await T(page, () => window.__isoTest.handle('knee pain 6/10'));
    ok((await T(page, () => document.getElementById('extras').textContent)).includes('Knee'), kind + ' pain banner shows');
    await T(page, () => window.__isoTest.handle('knee feels fine now'));
    ok(!(await T(page, () => document.getElementById('extras').textContent)).includes('Knee: 6'), kind + ' "feels fine" clears the pain banner');
    // 19-20 implausible values
    const odd = await T(page, () => window.__isoTest.applyAction({ type: 'log_food', meal_name: 'Lunch', items: [{ name: 'Rice', grams: 300, protein_g: 400, carbs_g: 80, fat_g: 1, kcal: 9000 }] }));
    ok(odd && /too high/.test(odd.warn), kind + ' implausible food estimate is flagged');
    const heavy = await T(page, () => window.__isoTest.applyAction({ type: 'log_set', exercise: 'curl', part: 'reps', weight: 900, unit: 'kg', reps: 5 }));
    ok(heavy && heavy.k === 'err', kind + ' a 900 kg curl is refused');
    // 21 correct grams of a food
    await T(page, () => window.__isoTest.handle('200g chicken breast'));
    await page.evaluate(() => document.getElementById('tab-coach').click()); page.once('dialog', d => d.accept('100'));
    await page.locator('.lgc-ed').last().click(); await page.waitForTimeout(200);
    const ch = await T(page, () => { const s = window.__isoTest.store(); return s.food[s.food.length - 1].items[0]; });
    ok(ch.g === 100 && Math.abs(ch.p - 31) < 0.6, kind + ' editing grams rescales the item ' + JSON.stringify(ch));
    // 22 an old settings change can't be undone over newer ones
    await T(page, () => window.__isoTest.handle('switch to kettlebells only'));
    await T(page, () => window.__isoTest.handle('switch to dumbbells only'));
    await page.click('#tab-train'); await page.evaluate(() => document.getElementById('tab-coach').click());
    const undos = await T(page, () => [...document.querySelectorAll('.lgc')].filter(c => /Equipment updated/.test(c.textContent)).map(c => !!c.querySelector('[data-undo]')));
    ok(undos.length === 2 && !undos[0] && undos[1], kind + ' only the latest settings change offers Undo ' + undos);
    // 24 protein target with high BMI
    const tg = await T(page, () => { const s = window.__isoTest.store(); s.body = [{ t: Date.now(), kg: 130 }]; return window.__isoTest.proteinTarget(); });
    ok(tg < 170 && tg > 120, kind + ' protein target uses adjusted weight at BMI 42 (' + tg + ' g, not 208)');
    await b.close();

    // 7 two copies open
    ({ b, ctx, page, errs } = await boot(kind));
    const p2 = await ctx.newPage(); await p2.goto(URL); await p2.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    await T(page, () => window.__isoTest.handle('2 eggs')); await page.waitForTimeout(150);
    await T(p2, () => window.__isoTest.handle('I weigh 79 kg')); await page.waitForTimeout(150);
    const both = await T(page, () => { const s = JSON.parse(localStorage.getItem('isohold.v1')); return [s.food.length, s.body.length]; });
    ok(both[0] === 1 && both[1] >= 1, kind + ' two open copies keep each other\'s logs ' + both);
    await b.close();

    // 8-10 equipment-separated history, suggested weights, long holds
    const st = JSON.parse(JSON.stringify(BASE)); const day = 864e5, now = Date.now();
    st.log = [{ t: now - 3 * day, w: 1, id: 'curl', eq: 'k', k: 'r', kg: 16, v: 10 }, { t: now - 2 * day, w: 1, id: 'curl', eq: 'd', k: 'r', kg: 8, v: 10 }, { t: now - day, w: 1, id: 'lateral-raise', eq: 'd', k: 'h', kg: 10, v: 150 }, { t: now - day + 1, w: 1, id: 'calf-raise', eq: 'd', k: 'h', kg: 40, v: 30, sug: 1 }];
    ({ b, page, errs } = await boot(kind, { state: st, hash: '#progress' }));
    await page.selectOption('#strSel', 'curl'); await page.click('#strCard [data-k="r"]'); await page.waitForTimeout(100);
    const hist = await T(page, () => document.getElementById('strCard').textContent);
    ok(!/-50%/.test(hist) && /Kettlebell/.test(hist) && /Dumbbell/.test(hist), kind + ' history keeps kettlebell and dumbbell apart');
    const sd = await T(page, () => window.__isoTest.strengthData());
    ok(!sd['Side delts'], kind + ' a 150 s hold is not used to estimate strength');
    ok(!sd['Calves'], kind + ' a suggested weight is not counted as proven strength');
    ok(await T(page, () => !window.__isoTest.isPB(window.__isoTest.store().log[3])), kind + ' a suggested-weight set is never a personal best');
    await b.close();

    // 11 accidental tick that completes a week can be undone; 12-13 dated sessions and labels
    const wk = JSON.parse(JSON.stringify(BASE)); wk.week = 2; wk.done = {}; ['d1', 'd2', 'c1', 'd3', 'd4', 'c2'].forEach(d => ['am', 'pm'].forEach(p => { wk.done['w2' + d + p] = now - 20 * day; })); delete wk.done['w2c2pm'];
    ({ b, page, errs } = await boot(kind, { state: wk }));
    await page.click('.strip button[data-i="5"]'); await page.click('#sessions [data-done$="pm"]'); await page.waitForTimeout(150);
    ok((await T(page, () => window.__isoTest.store().week)) === 3, kind + ' completing the week moves on');
    await page.click('#toast .tu'); await page.waitForTimeout(150);
    ok((await T(page, () => [window.__isoTest.store().week, !!window.__isoTest.store().done.w2c2pm].join())) === '2,false', kind + ' Undo puts you back on the week, tick removed');
    const rl = await T(page, () => document.querySelector('.rl').textContent);
    ok(/program week 2/.test(rl) && /last 7 days/.test(rl) && /(^|\D)0\/150/.test(rl), kind + ' rings say what they count; 20-day-old sessions are not "last 7 days" (' + rl.replace(/\s+/g, ' ') + ')');
    await b.close();

    // 14 storage full, 15 storage blocked
    ({ b, page, errs } = await boot(kind));
    await T(page, () => { Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }; window.__isoTest.handle('2 eggs'); });
    await page.waitForTimeout(100); await page.click('#tab-train');
    ok(/Storage is full/.test(await T(page, () => document.getElementById('extras').textContent)), kind + ' full storage is shown, not silent');
    await b.close();
    ({ b, page, errs } = await boot(kind, { init: () => { Storage.prototype.setItem = function () { throw new Error('SecurityError'); }; } }));
    ok(/isn’t being saved/.test(await T(page, () => document.getElementById('extras').textContent)), kind + ' blocked storage (private mode) is shown');
    await b.close();

    // 16 Safari tab nudge (iPhone only)
    if (kind === 'iphone') {
      const hs = JSON.parse(JSON.stringify(BASE)); hs.log = [{ t: now, w: 1, id: 'curl', eq: 'd', k: 'h', kg: 8, v: 30 }];
      ({ b, page, errs } = await boot(kind, { state: hs }));
      ok(/Keep your progress safe/.test(await T(page, () => document.getElementById('extras').textContent)), 'iphone Safari tab is warned about 7-day clearing');
      await page.click('[data-nohs]');
      ok(!/Keep your progress safe/.test(await T(page, () => document.getElementById('extras').textContent)), 'iphone the nudge can be dismissed');
      await b.close();
    }

    // 17 a newer version online shows an update banner
    ({ b, ctx, page, errs } = await boot(kind, { before: async c => { await c.route(/index\.html\?v=/, async r => { const body = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/var APP_VERSION = '(\d+)'/, (m, v) => "var APP_VERSION = '" + (+v + 1) + "'"); r.fulfill({ status: 200, contentType: 'text/html', body }); }); } }));
    await page.waitForSelector('#updBanner', { timeout: 8000 }).then(() => ok(true), () => ok(false, kind + ' update banner appears for a newer version'));
    await b.close();

    // 18 "today" resets after midnight without a reload
    ({ b, page, errs } = await boot(kind));
    await page.clock.install({ time: new Date(new Date().setHours(23, 58, 0, 0)) });
    await page.reload(); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    await T(page, () => window.__isoTest.handle('200g chicken breast'));
    const before = await T(page, () => document.querySelector('#fuel').textContent);
    await page.clock.runFor(5 * 60000);
    const after = await T(page, () => document.querySelector('#fuel').textContent);
    ok(/62/.test(before) && /(^|\D)0 \//.test(after), kind + ' protein today resets after midnight (' + before.slice(0, 30) + ' -> ' + after.slice(0, 30) + ')');
    ok(!errs.length, kind + ' no errors ' + errs);
    await b.close();
  }
  console.log(pass + ' passed, ' + fail + ' failed'); srv.close();
})();
