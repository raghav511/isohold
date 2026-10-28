// Progress checks: the old max-hold test renamed "Endurance check" (data kept), plus a "Strength check" (reps -> Epley estimated max).
const { serve, open } = require('./lib');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8460, URL = `http://localhost:${PORT}/index.html`;
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/seed-week4.json'), 'utf8'));
const SHOTS = process.env.SHOTS;
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state, viewport: { width: 412, height: 915 } }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  await o.page.click('#tab-progress'); await o.page.waitForTimeout(150); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
(async () => {
  const srv = await serve(PORT);
  const st = JSON.parse(JSON.stringify(SEED)); st.tests = { 'wall-sit': { load: '16 kg', a: '45', b: '60' }, suitcase: { load: '24 kg', a: '30' } };
  for (const dark of [false, true]) {
    let { b, page, errs } = await boot(st, { dark });
    const card = await page.locator('#chkCard').innerText();
    ok(/Endurance check/.test(card) && /endurance, not max strength/.test(card), 'card: Endurance check with its plain explanation');
    ok(!/max.hold/i.test(await page.locator('#progress').innerText()), 'no "max-hold" wording left on Progress');
    ok(/Wall Sit 45 → 60 s/i.test(card) && /Suitcase.*30 s/i.test(card), 'card shows the old hold-test results (' + card.replace(/\n/g, ' | ') + ')');
    ok(/Strength check/.test(card), 'card: Strength check');
    const box = await page.locator('#chkCard').boundingBox();
    ok(box.y + box.height < 2000, 'checks card sits near the top of Progress (y=' + Math.round(box.y) + ')');
    if (SHOTS && !dark) await page.locator('#chkCard').scrollIntoViewIfNeeded(), await page.screenshot({ path: SHOTS + '/card-light.png' });
    // tap 1: Endurance check
    await page.click('#chkCard [data-chk="end"]'); await page.waitForTimeout(150);
    ok(await page.textContent('#sheetTitle') === 'Endurance check', 'one tap opens the Endurance check');
    const eb = await page.locator('#sheetBody').innerText();
    ok(/how long you can hold a weight: your endurance, not your maximum strength/.test(eb), 'sheet explains endurance vs max strength');
    ok(await page.inputValue('#t-wall-sit-a') === '45' && await page.inputValue('#t-wall-sit-b') === '60' && await page.textContent('#d-wall-sit') === '+33%', 'old wall-sit results and change still shown');
    await page.click('#chkInfo'); await page.waitForTimeout(80);
    let links = await T(page, () => [...document.querySelectorAll('#chkEv a')].map(a => a.href));
    ok(links.includes('https://doi.org/10.3390/sports9020032') && links.includes('https://doi.org/10.1249/MSS.0b013e3181915670'), 'endurance info links Schoenfeld 2021 and ACSM 2009');
    ok(!/youtu/i.test(await page.innerHTML('#sheetBody')), 'no YouTube links in endurance info');
    const ib = await page.locator('#chkInfo').boundingBox(); ok(ib.width >= 44 && ib.height >= 44, 'info button is at least 44 px');
    await page.fill('#t-plank-db-a', '50'); await page.waitForTimeout(50);
    ok((await T(page, () => JSON.parse(localStorage.getItem('isohold.v1')).tests['plank-db'].a)) === '50', 'editing a hold result still saves to store.tests');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/endurance-' + (dark ? 'dark' : 'light') + '.png' });
    await page.click('#sheetClose'); await page.waitForTimeout(150);
    // Strength check
    await page.click('#chkCard [data-chk="str"]'); await page.waitForTimeout(150);
    ok(await page.textContent('#sheetTitle') === 'Strength check', 'one tap opens the Strength check');
    const sb = await page.locator('#sheetBody').innerText();
    ok(/skip it if anything hurts/i.test(sb) && /blood pressure/.test(sb), 'safety line present');
    const optIds = await T(page, () => [...document.querySelectorAll('#chkEx option')].map(o => o.value));
    ok(optIds.length >= 2 && optIds.every(id => ['goblet-squat', 'floor-press', 'sa-row', 'bo-row', 'rdl'].includes(id)), 'exercise choices are loadable rep lifts (' + optIds + ')');
    ok(+(await page.inputValue('#chkKg')) > 0, 'a weight is suggested from logged sets (' + await page.inputValue('#chkKg') + ')');
    await page.click('#chkInfo'); await page.waitForTimeout(80);
    links = await T(page, () => [...document.querySelectorAll('#chkEv a')].map(a => a.href));
    ok(links.includes('https://doi.org/10.1519/JSC.0000000000003731'), 'strength info links Nickerson 2020');
    ok(!/youtu/i.test(await page.innerHTML('#sheetBody')), 'no YouTube links in strength info');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/strength-' + (dark ? 'dark' : 'light') + '.png' });
    if (!dark) {
      const id = optIds[0], logN = await T(page, () => JSON.parse(localStorage.getItem('isohold.v1')).log.length);
      await page.fill('#chkKg', '20'); await page.fill('#chkReps', '10'); await page.waitForTimeout(50);
      ok(/26\.7 kg/.test(await page.textContent('#chkRes')), '20 kg × 10 reps → 26.7 kg (' + await page.textContent('#chkRes') + ')');
      await page.click('#chkSave'); await page.waitForTimeout(200);
      const s = await T(page, () => JSON.parse(localStorage.getItem('isohold.v1')));
      const h = s.tests._str || [], last = h[h.length - 1], l = s.log[s.log.length - 1];
      ok(last && last.id === id && last.kg === 20 && last.reps === 10 && Math.abs(last.e1 - 26.67) < 0.01, 'result saved to the check history');
      ok(s.log.length === logN + 1 && l.id === id && l.k === 'r' && l.kg === 20 && l.v === 10, 'also logged into store.log as a rep set');
      ok(/26\.7 kg/.test(await page.locator('#chkCard').innerText()), 'card shows the latest result');
      // second check: reps pre-filled, change shown
      await page.click('#chkCard [data-chk="str"]'); await page.waitForTimeout(150);
      ok(await page.inputValue('#chkReps') === '10' && await page.inputValue('#chkKg') === '20', 'reps and weight pre-filled from last time');
      await page.fill('#chkReps', '12'); await page.waitForTimeout(50);
      ok(/\+1\.3 kg vs last time/.test(await page.textContent('#chkRes')), 'change vs last time shown (' + await page.textContent('#chkRes') + ')');
      await page.click('#chkSave'); await page.waitForTimeout(200);
      ok(/28 kg.*\+1\.3 kg since/.test(await page.locator('#chkCard').innerText()), 'card shows the change since last time');
    }
    ok(!errs.length, 'no page errors ' + (dark ? 'dark' : 'light') + ': ' + errs.join(' | '));
    await b.close();
  }
  // very high BP today: strength check hidden with a reason
  {
    const s2 = JSON.parse(JSON.stringify(SEED)); s2.notes = (s2.notes || []).concat([{ t: Date.now(), k: 'bp', sys: 185, dia: 112 }]);
    const { b, page, errs } = await boot(s2);
    ok(/Not today: your blood pressure reading is high/.test(await page.locator('#chkCard').innerText()), 'high-BP day: card says why');
    await page.click('#chkCard [data-chk="str"]'); await page.waitForTimeout(150);
    ok(await page.locator('#chkOff').count() === 1 && /185\/112/.test(await page.textContent('#chkOff')), 'high-BP day: reason shown in the sheet');
    ok(await page.locator('#chkSave').count() === 0 && await page.locator('#chkReps').count() === 0, 'high-BP day: no strength check form');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/strength-bp.png' });
    ok(!errs.length, 'no page errors (bp): ' + errs.join(' | '));
    await b.close();
  }
  srv.close();
  console.log(`checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
