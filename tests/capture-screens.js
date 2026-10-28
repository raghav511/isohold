// Photographs every main screen for the design canvas: phone + desktop, light + dark, plus first-run, offline and error states.
// Usage: node capture-screens.js <outDir>
const fs = require('fs'), path = require('path');
const { serve, open } = require('./lib');
const PORT = 8290, URL = `http://localhost:${PORT}/index.html`;
const OUT = path.resolve(process.argv[2] || 'shots'); fs.mkdirSync(OUT, { recursive: true });
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/seed-week4.json'), 'utf8'));
const SIZES = { phone: null, desktop: { width: 1280, height: 800 } };
const list = [];
async function shot(page, name, meta) { const f = name + '.png'; await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, f) }); list.push(Object.assign({ f }, meta)); }
async function boot(size, dark, state, extra = {}) {
  const o = await open('android', Object.assign({ state, dark, viewport: SIZES[size] || undefined }, extra));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
(async () => {
  const srv = await serve(PORT);
  for (const size of Object.keys(SIZES)) for (const theme of ['light', 'dark']) {
    const dark = theme === 'dark', m = (screen, state) => ({ screen, state, size, theme });
    let { b, page } = await boot(size, dark, SEED);
    for (const t of ['train', 'exercises', 'coach', 'progress', 'guide']) { await page.click('#tab-' + t); await shot(page, `${t}-${size}-${theme}`, m(t, 'sample data')); }
    await page.click('#tab-train'); await page.click('#sessions .th[data-ex]'); await shot(page, `exercise-${size}-${theme}`, m('exercise sheet', 'sample data'));
    await page.click('#sheetClose'); await page.click('#profBtn'); await shot(page, `settings-${size}-${theme}`, m('settings', 'sample data'));
    await page.keyboard.press('Escape'); await page.reload(); await page.waitForFunction(() => window.__isoholdReady);
    await page.click('#sessions [data-start]'); await page.waitForTimeout(400); await shot(page, `session-${size}-${theme}`, m('session', 'in progress'));
    for (let i = 0; i < 80 && await page.textContent('#pPhase') !== 'Done'; i++) { await page.evaluate(() => document.getElementById('pSkip').click()); await page.waitForTimeout(30); }
    await shot(page, `done-${size}-${theme}`, m('session', 'finished'));
    await page.context().setOffline(true); await page.click('#pClose').catch(() => {}); await page.click('#tab-coach'); await shot(page, `coach-offline-${size}-${theme}`, m('coach', 'offline'));
    await b.close();
    ({ b, page } = await boot(size, dark, null)); await shot(page, `firstrun-${size}-${theme}`, m('first run', 'empty'));
    await page.evaluate(() => { const ks = Object.keys(localStorage); }); await b.close();
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(list, null, 1));
  srv.close(); console.log(list.length + ' screenshots in ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
