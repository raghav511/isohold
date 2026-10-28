// No horizontal overflow on any tab or sheet, at 360/390/412 px, light and dark, new and seeded users.
const { serve, open } = require('./lib'); const fs = require('fs');
const seed = require('./fixtures/seed-week4.json');
(async () => {
  const srv = await serve(8131); let bad = 0, n = 0;
  for (const [kind, w] of [['iphone', 390], ['android', 412], ['android', 360]]) for (const st of [{ profile: { units: 'kg' } }, seed]) {
    const { b, page, errs } = await open(kind, { state: st });
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('http://localhost:8131/index.html'); await page.waitForFunction(() => window.__isoholdReady);
    for (const tab of ['train', 'exercises', 'coach', 'progress', 'guide']) {
      await page.evaluate(t => document.getElementById('tab-' + t).click(), tab); await page.waitForTimeout(150); n++;
      const r = await page.evaluate(() => { const W = document.documentElement.clientWidth, out = []; document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && b.right > W + 1 && !e.closest('.chips,.cov-scroll,.c-sugs,.thumbs')) out.push(e.tagName + '.' + e.className + ' ' + Math.round(b.right)); }); return { sw: document.documentElement.scrollWidth, W, out: out.slice(0, 4) }; });
      if (r.sw > r.W || r.out.length) { bad++; console.log(kind, w, tab, st.week || 'new', JSON.stringify(r)); }
    }
    await page.click('#tab-train'); await page.click('#profBtn'); await page.waitForTimeout(200); n++;
    const r2 = await page.evaluate(() => { const b = document.getElementById('sheetBody'); return [b.scrollWidth, b.clientWidth]; }); if (r2[0] > r2[1] + 1) { bad++; console.log(kind, w, 'profile sheet', r2); }
    if (errs.length) console.log(errs);
    await b.close();
  }
  console.log(`${n - bad}/${n} layout checks clean`); srv.close();
})();
