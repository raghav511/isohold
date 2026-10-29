// Profile sheet: in-page tabs (You, Training, Look, AI, Backup), settings that save as they change, first-run setup, restore with undo.
const path = require('path'), fs = require('fs');
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8420, URL = `http://localhost:${PORT}/index.html`;
const SHOTS = process.env.SHOTS; // folder for screenshots of each tab (optional)
const P0 = { units: 'kg', bw: 70, cm: 170, age: 40, sex: 'm', diet: 'any', days: 6 };
async function boot(kind, state, opts = {}) {
  const o = await open(kind, Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
// a fresh page in the same browser profile (WebKit sometimes crashes on page.reload)
async function reload(o) { const p = await o.ctx.newPage(); p.on('pageerror', e => o.errs.push('pageerror: ' + e.message)); await o.page.close(); o.page = p; await p.goto(URL); await p.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return p; }
const TABS = ['you', 'train', 'look', 'ai', 'backup'];
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    let o = await boot(kind, { profile: P0, eq: ['k', 'd'], log: [{ t: 1, w: 1, id: 'curl', eq: 'd', k: 'r', kg: 10, v: 8 }] });
    let { b, page, errs } = o;
    await page.click('#profBtn'); await page.waitForTimeout(150);
    // tabs
    ok(await page.locator('#sheet [role="tablist"] [role="tab"]').count() === 5, kind + ' five tabs');
    ok(await page.getAttribute('#pfTab-you', 'aria-selected') === 'true' && await page.isVisible('#pfP-you') && !(await page.isVisible('#pfP-train')), kind + ' opens on You');
    for (const t of TABS) {
      await page.click('#pfTab-' + t); await page.waitForTimeout(80);
      ok(await page.getAttribute('#pfTab-' + t, 'aria-selected') === 'true' && await page.isVisible('#pfP-' + t), kind + ' tab ' + t + ' shows its panel');
      ok(await T(page, t => [...document.querySelectorAll('.pf-panel')].filter(p => !p.hidden).map(p => p.dataset.panel).join() === t, t), kind + ' only ' + t + ' panel visible');
      ok(await T(page, () => { const s = document.getElementById('sheetBody'); return s.scrollWidth <= s.clientWidth + 1; }), kind + ' ' + t + ' tab: nothing wider than the sheet');
      ok(await T(page, () => [...document.querySelectorAll('#sheet [role="tab"], #sheetBody .pf-panel:not([hidden]) button, #pfSave')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 40)), kind + ' ' + t + ' tab: buttons are big enough to tap');
    }
    // arrow keys move between tabs
    await page.focus('#pfTab-backup'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(50);
    ok(await T(page, () => document.activeElement.id) === 'pfTab-you' && await page.isVisible('#pfP-you'), kind + ' arrow keys wrap to the first tab');
    // each tab's controls
    for (const id of ['#pfName', '#pfAge', '#pfBw', '#pfCm', '.pchips[data-set="sex"]', '.pchips[data-set="goal"]', '.pchips[data-set="units"]']) ok(await page.locator('#pfP-you ' + id).count() === 1, kind + ' You has ' + id);
    for (const id of ['.pchips[data-set="days"]', '.pchips[data-set="len"]', '.pchips[data-set="pace"]', '.pchips[data-set="split"]', '.pchips[data-set="eq"]', '#pfInvK', '#pfPost', '.pchips[data-set="issues"]', '#pfFloor', '#pfCues']) ok(await page.locator('#pfP-train ' + id).count() === 1, kind + ' Training has ' + id);
    for (const id of ['.pchips[data-set="theme"]', '#pfBig', '#pfCalm']) ok(await page.locator('#pfP-look ' + id).count() === 1, kind + ' Look has ' + id);
    // Training setting saves as it changes and survives a reload
    await page.click('#pfTab-train');
    ok(await page.getAttribute('#pfGrpEq', 'open') === null && /Home · Kettlebells, Dumbbells/.test(await page.textContent('#pfSumEq')), kind + ' Equipment group starts closed with a summary');
    await page.click('#pfGrpEq summary'); await page.click('.pchips[data-set="eq"] button[data-v="r"]'); await page.waitForTimeout(80);
    ok(/Bands/.test(await page.textContent('#pfSumEq')) && await T(page, () => window.__isoTest.store().eq.join()) === 'k,d,r', kind + ' equipment saves as it changes');
    await page.click('#pfGrpHl summary');
    await page.click('#pfTab-train'); await page.click('.pchips[data-set="days"] button[data-v="3"]'); await page.waitForTimeout(100);
    ok(/Saved/.test(await page.textContent('#pfOk')), kind + ' the change says Saved');
    await page.click('.pchips[data-set="len"] button[data-v="25"]'); await page.check('#pfFloor'); await page.waitForTimeout(100);
    page = await reload(o);
    let pr = await T(page, () => window.__isoTest.store().profile);
    ok(pr.days === 3 && pr.len === 25 && pr.nofloor === true && pr.age === 40, kind + ' Training settings persist after reload ' + JSON.stringify([pr.days, pr.len, pr.nofloor]));
    await page.click('#profBtn'); await page.click('#pfTab-train');
    ok(await page.getAttribute('.pchips[data-set="days"] button[data-v="3"]', 'aria-pressed') === 'true', kind + ' reopened profile shows the saved days');
    // a bad value doesn't save and says why; Done stays put
    await page.click('#pfTab-you'); await page.fill('#pfAge', '7'); await page.press('#pfAge', 'Tab'); await page.waitForTimeout(80);
    ok(/Age should be/.test(await page.textContent('#pfErr')) && await T(page, () => window.__isoTest.store().profile.age) === 40, kind + ' a bad age is not saved and says why');
    await page.fill('#pfAge', '41'); await page.press('#pfAge', 'Tab'); await page.waitForTimeout(80);
    ok(await T(page, () => window.__isoTest.store().profile.age) === 41 && !(await page.textContent('#pfErr')), kind + ' fixing it saves');
    // Look: theme
    await page.click('#pfTab-look');
    await page.click('.pchips[data-set="theme"] button[data-v="dark"]'); await page.waitForTimeout(50);
    ok(await T(page, () => document.documentElement.getAttribute('data-theme')) === 'dark', kind + ' Dark sets data-theme');
    ok(await T(page, () => getComputedStyle(document.body).backgroundColor) === 'rgb(18, 24, 34)', kind + ' dark colours apply');
    await page.click('.pchips[data-set="theme"] button[data-v="light"]'); await page.waitForTimeout(50);
    ok(await T(page, () => document.documentElement.getAttribute('data-theme')) === 'light', kind + ' Light sets data-theme');
    page = await reload(o);
    ok(await T(page, () => document.documentElement.getAttribute('data-theme')) === 'light', kind + ' theme survives a reload');
    await page.click('#profBtn'); await page.click('#pfTab-look');
    await page.click('.pchips[data-set="theme"] button[data-v="auto"]'); await page.waitForTimeout(50);
    ok(await T(page, () => document.documentElement.hasAttribute('data-theme')) === false, kind + ' Match phone removes the override');
    await page.check('#pfBig'); await page.check('#pfCalm'); await page.waitForTimeout(80);
    ok(await T(page, () => document.documentElement.classList.contains('big') && document.documentElement.classList.contains('calm')), kind + ' larger text and less motion apply at once');
    ok(await T(page, () => { const p = window.__isoTest.store().profile; return p.big === true && p.calm === true && p.days === 3; }), kind + ' Look switches save without touching other settings');
    await page.uncheck('#pfBig'); await page.uncheck('#pfCalm'); await page.waitForTimeout(50);
    // AI
    await page.click('#pfTab-ai');
    ok(await page.isVisible('#pfP-ai #cKey') && await page.isVisible('#pfP-ai #cSave'), kind + ' AI tab: key field without a key');
    await T(page, () => { localStorage.setItem('isohold.coach.key', '"k"'); localStorage.setItem('isohold.coach.model', '"gemini-3.8-flash"'); });
    // Backup
    await page.click('#pfTab-backup');
    ok(/No backup saved/.test(await page.textContent('#pfP-backup .pf-stat')), kind + ' Backup: status says no backup yet');
    for (const id of ['#bkCopy', '#bkFile', '#bkIn', '#bkRestore', '#bkFileIn']) ok(await page.locator('#pfP-backup ' + id).count() === 1, kind + ' Backup has ' + id);
    await page.click('#bkFile'); await page.waitForTimeout(100);
    ok(/Last backup: today/.test(await page.textContent('#bkStatus')) && await T(page, () => window.__isoTest.store().bkAt > 0), kind + ' saving a file records the backup date');
    const code = await T(page, () => document.getElementById('bkOut').value);
    ok(/^ISOHOLD1:/.test(code), kind + ' backup code present');
    // restore replaces at once, with undo
    await page.fill('#bkIn', 'nonsense'); await page.click('#bkRestore');
    ok(/does not look like/.test(await page.textContent('#bkMsg')), kind + ' a bad code says why');
    await T(page, () => { const s = window.__isoTest.store(); s.log = []; s.week = 2; });
    await page.fill('#bkIn', code); await page.click('#bkRestore'); await page.waitForTimeout(150);
    ok(/Restored week 1: .*\b1 set\b/.test(await page.textContent('#bkMsg')), kind + ' restore says what came back: ' + await page.textContent('#bkMsg'));
    ok(await T(page, () => window.__isoTest.store().log.length) === 1 && await page.isVisible('#pfP-backup'), kind + ' restore applies and stays on Backup');
    ok(await page.isVisible('#toast .tu'), kind + ' restore offers Undo');
    await page.click('#toast .tu'); await page.waitForTimeout(150);
    ok(await T(page, () => { const s = window.__isoTest.store(); return s.log.length === 0 && s.week === 2; }), kind + ' Undo brings the earlier progress back');
    ok(/undone/.test(await page.textContent('#bkMsg')), kind + ' Undo is reported');
    // Done closes
    await page.click('#pfSave'); await page.waitForTimeout(150);
    ok(!(await page.isVisible('#sheet')), kind + ' Done closes the sheet');
    // the AI tab with a key shows model and key; the Log screen settings still open the same thing
    page = await reload(o);
    await page.click('#profBtn'); await page.click('#pfTab-ai');
    ok(await page.isVisible('#pfP-ai #cModel') && await page.isVisible('#pfP-ai #cForget'), kind + ' AI tab: model and key settings when connected');
    await page.selectOption('#cModel', { index: 1 }).catch(() => {}); const m = await page.inputValue('#cModel');
    ok(await T(page, () => JSON.parse(localStorage.getItem('isohold.coach.model'))) === m, kind + ' model choice saves');
    await page.click('#sheetClose'); await page.waitForTimeout(150);
    await T(page, () => { document.getElementById('tab-coach').click(); document.getElementById('cSet').click(); }); await page.waitForTimeout(150);
    ok(await page.isVisible('#cModel') && /Gemini settings/.test(await page.textContent('#sheetTitle')), kind + ' Log settings button still opens Gemini settings');
    await page.click('#sheetClose'); await page.waitForTimeout(150);
    // Progress points to the Backup tab
    await page.click('#tab-progress'); await page.click('#bkGo'); await page.waitForTimeout(150);
    ok(await page.isVisible('#pfP-backup') && await page.getAttribute('#pfTab-backup', 'aria-selected') === 'true', kind + ' Progress opens Profile on Backup');
    await page.click('#sheetClose');
    // screenshots, light and dark
    if (SHOTS && kind === 'android') for (const dark of [false, true]) {
      const o = await boot(kind, { profile: P0, eq: ['k', 'd'] }, { dark });
      await o.page.click('#profBtn'); await o.page.waitForTimeout(150);
      for (const t of TABS) { await o.page.click('#pfTab-' + t); await o.page.waitForTimeout(100); await o.page.screenshot({ path: path.join(SHOTS, `${t}-${dark ? 'dark' : 'light'}.png`) }); if (t === 'train') { await T(o.page, () => { document.querySelectorAll('.pf-grp').forEach(d => { d.open = true; }); const s = document.getElementById('sheetBody'); s.scrollTop = s.scrollHeight; }); await o.page.waitForTimeout(80); await o.page.screenshot({ path: path.join(SHOTS, `train-end-${dark ? 'dark' : 'light'}.png`) }); } }
      ok(o.errs.length === 0, 'screenshots: no errors ' + o.errs.join('; ')); await o.b.close();
    }
    ok(errs.length === 0, kind + ' no page errors ' + errs.join('; '));
    await b.close();

    // first run: a short guided setup, You then Training, and it completes
    o = await boot(kind, null); ({ b, page, errs } = o);
    ok(await page.isVisible('#sheet') && /Welcome/.test(await page.textContent('#sheetTitle')), kind + ' first run opens setup');
    ok(await page.locator('#sheet [role="tab"]').count() === 0 && await page.isVisible('#pfP-you') && !(await page.isVisible('#pfP-train')), kind + ' first run: step 1 is You, no tabs');
    if (SHOTS && kind === 'android') await page.screenshot({ path: path.join(SHOTS, 'first-1.png') });
    await page.fill('#pfAge', '35'); await page.click('#pfNext'); await page.waitForTimeout(80);
    ok(await page.isVisible('#pfP-train') && /Step 2 of 2/.test(await page.textContent('#pfStep')), kind + ' Next goes to Training');
    await page.click('#pfSave'); await page.waitForTimeout(80);
    ok(/at least one kind/.test(await page.textContent('#pfErr')) && await page.isVisible('#sheet'), kind + ' first run asks for equipment');
    await page.click('.pchips[data-set="eq"] button[data-v="d"]'); await page.click('#pfSave'); await page.waitForTimeout(200);
    ok(!(await page.isVisible('#sheet')), kind + ' Start training closes setup');
    pr = await T(page, () => window.__isoTest.store().profile);
    ok(pr && pr.age === 35 && pr.cues === true && await T(page, () => window.__isoTest.store().eq.join()) === 'd', kind + ' first run saved the profile');
    page = await reload(o);
    ok(!(await page.isVisible('#sheet')), kind + ' setup does not reopen after reload');
    ok(errs.length === 0, kind + ' first run: no page errors ' + errs.join('; '));
    await b.close();
    // first run: restore from another phone goes to the Backup tab
    o = await boot(kind, null); ({ b, page, errs } = o);
    await page.click('#pfHasBk'); await page.waitForTimeout(150);
    ok(await page.isVisible('#pfP-backup'), kind + ' first run: restore link opens Backup');
    ok(errs.length === 0, kind + ' restore link: no page errors ' + errs.join('; '));
    await b.close();
  }
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
