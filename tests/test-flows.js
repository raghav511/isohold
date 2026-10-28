// End-to-end: voice log, hands-free session commands, photo via mocked Gemini, undo, units, backup round-trip.
const { serve, open, FAKE_SPEECH, mockGemini } = require('./lib'); const path = require('path');
const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else pass++; }; let pass = 0; const fails = [];
(async () => {
  const srv = await serve(8128);
  for (const kind of ['android', 'iphone']) {
    const { b, ctx, page, errs } = await open(kind, { state: { profile: { units: 'kg', diet: 'vegetarian', bw: 70, cardio: ['treadmill', 'rower'] }, eq: ['k', 'd'] }, init: FAKE_SPEECH, before: ctx => mockGemini(ctx, (body, mode) => mode === 'chat' ? 'Mock answer' : { reply: 'Looks like dal, rice and curd.', actions: [{ type: 'log_food', meal_name: 'Lunch', items: [{ name: 'Dal', grams: 200, protein_g: 14, carbs_g: 30, fat_g: 6, kcal: 230 }, { name: 'Rice', grams: 150, protein_g: 4, carbs_g: 42, fat_g: 0.5, kcal: 195 }] }] }) });
    page.on('response', r => { if (r.status() >= 400) console.log('RESP', r.status(), r.url().slice(0, 90)); }); page.on('requestfailed', r => console.log('REQFAIL', r.url().slice(0, 90), r.failure() && r.failure().errorText));
    await page.goto('http://localhost:8128/index.html#coach'); await page.waitForFunction(() => window.__isoholdReady);
    // voice -> log
    await page.evaluate(() => window.__say = 'two eggs and a glass of milk'); await page.click('#cSend'); await page.waitForTimeout(400);
    let f = await page.evaluate(() => window.__isoTest.store().food); ok(f.length === 1 && f[0].items.length === 2, kind + ' voice meal logged');
    ok(await page.locator('.lgc-w').count() === 1, kind + ' egg flagged for vegetarian');
    // undo
    await page.click('.lgc [data-undo]'); ok((await page.evaluate(() => window.__isoTest.store().food.length)) === 0, kind + ' undo removes meal');
    // photo -> mocked Gemini
    await page.setInputFiles('#cFile', path.join(__dirname, 'fixtures', 'meal.jpg')); await page.waitForTimeout(1500);
    f = await page.evaluate(() => window.__isoTest.store().food); ok(f.length === 1 && f[0].ph && f[0].items[0].n === 'Dal', kind + ' photo meal via Gemini with photo id');
    ok(await page.locator('.lgc img.lg-ph').count() >= 1, kind + ' photo thumbnail shown');
    // question goes to chat
    await page.fill('#cIn', 'why do holds help tendons?'); await page.click('#cSend'); await page.waitForTimeout(600);
    ok((await page.textContent('#cMsgs')).includes('Mock answer'), kind + ' question answered by coach');
    // hands-free session
    await page.click('#tab-train'); await page.click('#sessions [data-start][data-part=am]'); await page.waitForTimeout(300);
    await page.click('#pMic'); await page.waitForTimeout(200);
    ok((await page.getAttribute('#pMic', 'aria-pressed')) === 'true', kind + ' voice control on');
    const i0 = await page.evaluate(() => document.getElementById('pName').textContent);
    await page.evaluate(() => { window.__spoken = []; }); await page.waitForTimeout(500);
    await page.evaluate(() => window.__speak('pause')); await page.waitForTimeout(150); ok((await page.textContent('#pPause')) === 'Resume', kind + ' "pause" pauses');
    await page.evaluate(() => window.__speak('resume')); await page.waitForTimeout(150); ok((await page.textContent('#pPause')) === 'Pause', kind + ' "resume" resumes');
    for (let k = 0; k < 3; k++) { await page.evaluate(() => window.__speak('next')); await page.waitForTimeout(150); }
    ok(await page.evaluate(() => document.getElementById('pName').textContent) !== i0, kind + ' "next" advances');
    // move on to first hold and say a weight
    for (let k = 0; k < 6 && !(await page.evaluate(() => /Hold/.test(document.getElementById('pName').textContent) && !document.getElementById('pWtRow').hidden)); k++) { await page.evaluate(() => window.__speak('next')); await page.waitForTimeout(120); }
    await page.evaluate(() => window.__speak('use 12 kilos')); await page.waitForTimeout(150);
    ok((await page.inputValue('#pWt')) === '12', kind + ' spoken weight set');
    const spoken = await page.evaluate(() => window.__spoken || []); ok(spoken.length > 0, kind + ' spoken cues played (' + spoken.slice(0, 3).join(' | ') + ')');
    await page.evaluate(() => window.__speak('end session')); await page.waitForTimeout(150); ok(!(await page.isHidden('#pConfirm')), kind + ' "end session" asks to confirm');
    await page.click('#pEndYes');
    // units switch shows lb
    await page.click('#profBtn'); await page.click('[data-set=units] [data-v=lb]'); await page.click('#pfSave'); await page.waitForTimeout(200);
    const wtxt = await page.evaluate(() => { const s = window.__isoTest.store(); return Object.values(s.wt)[0]; }); ok(Math.abs(wtxt - 12) < .01, kind + ' stored weight unchanged in kg after unit switch');
    await page.evaluate(() => document.getElementById('tab-coach').click()); await page.fill('#cIn', 'I weigh 160 lb'); await page.click('#cSend'); await page.waitForTimeout(200);
    const bw = await page.evaluate(() => window.__isoTest.store().body.slice(-1)[0].kg); ok(Math.abs(bw - 72.6) < .1, kind + ' lb bodyweight stored as kg (' + bw + ')');
    // backup round trip includes food and profile
    await page.click('#tab-progress'); const code = await page.inputValue('#bkOut');
    await page.evaluate(() => { const s = window.__isoTest.store(); s.food = []; s.profile = null; });
    await page.fill('#bkIn', code); await page.click('#bkRestore'); await page.click('#bkYes');
    const after = await page.evaluate(() => { const s = window.__isoTest.store(); return [s.food.length, s.profile && s.profile.units]; });
    ok(after[0] === 1 && after[1] === 'lb', kind + ' backup restores food and profile');
    ok(errs.length === 0, kind + ' no console errors ' + errs.join('; '));
    await b.close();
  }
  console.log(pass + ' passed, ' + fails.length + ' failed'); srv.close();
})();
