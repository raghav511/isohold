// Android Chrome checks: manifest is valid and installable, service worker controls the page, offline reload works.
const { chromium, devices } = require('playwright'); const { serve } = require('./lib');
(async () => {
  const srv = await serve(8126);
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'] }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8126/index.html'); await page.waitForFunction(() => window.__isoholdReady);
  await page.waitForFunction(() => navigator.serviceWorker.controller || new Promise(r => setTimeout(r, 1500)), null, { timeout: 8000 }).catch(() => {});
  await page.reload(); await page.waitForFunction(() => window.__isoholdReady);
  const cdp = await ctx.newCDPSession(page);
  const m = await cdp.send('Page.getAppManifest'); const inst = await cdp.send('Page.getInstallabilityErrors');
  console.log('manifest errors:', m.errors, 'installability errors:', inst.installabilityErrors);
  console.log('sw controlling:', await page.evaluate(() => !!navigator.serviceWorker.controller), 'SpeechRecognition:', await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition)));
  await ctx.setOffline(true); await page.reload(); await page.waitForFunction(() => window.__isoholdReady, null, { timeout: 8000 });
  console.log('offline reload ok, band:', (await page.textContent('#band')).slice(0, 40), 'errors:', errs);
  await b.close(); srv.close();
})();
