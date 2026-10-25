// Renders every exercise x equipment version x step (picture + instruction) into sheets for review.
// Writes PNG sheets to tests/audit-out/ (git-ignored). Example: node audit.js " c" for gym versions.
// node audit.js [filter-regex]
const { serve, open } = require('./lib');
(async () => {
  require('fs').mkdirSync(__dirname + '/audit-out', { recursive: true }); const srv = await serve(8180); const { b, page, errs } = await open('android', { state: { profile: { units: 'kg' }, eq: ['k', 'd', 'b', 'c'] } });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:8180/index.html'); await page.waitForFunction(() => window.__isoholdReady);
  const n = await page.evaluate((flt) => {
    const T = window.__isoTest, re = new RegExp(flt || '.');
    const ids = []; DAYS.forEach(d => d.ex.forEach(id => { if (!ids.includes(id)) ids.push(id); })); ADDON.forEach(id => ids.push(id));
    const rows = [];
    ids.forEach(id => ['h', 'g'].forEach(kind => parseEq(EQV[id][kind]).forEach(o => {
      const v = T.V(id, kind, o); const key = id + ' ' + kind + ' ' + o.eq + (o.style ? ':' + o.style : '');
      if (!re.test(key + ' ' + v.name)) return;
      rows.push('<div class="r"><div class="l"><b>' + v.name + '</b><br><small>' + key + '</small></div>' + v._r.map((r, i) => '<div class="f">' + FIG.svgFor(v, r, {}) + '<p>' + (i + 1) + '. ' + (v.steps[i] ? v.steps[i].txt : '') + '</p></div>').join('') + '</div>');
    })));
    document.body.innerHTML = '<style>body{font:12px system-ui;background:#fff;margin:8px;color:#111} .r{display:grid;grid-template-columns:170px repeat(3,300px);gap:8px;border-bottom:1px solid #ddd;padding:6px 0} .f svg{width:300px;height:225px;background:#f1f5f9;border-radius:8px} .f p{margin:2px 0;font-size:11px;line-height:1.25}</style>' + rows.join('');
    window.scrollTo(0, 0); return rows.length;
  }, process.argv[2] || '');
  const H = await page.evaluate(() => document.body.scrollHeight); const per = 6 * 300;
  for (let y = 0, k = 0; y < H; y += per, k++) { await page.setViewportSize({ width: 1400, height: Math.min(per, H - y) }); await page.evaluate(y => window.scrollTo(0, y), y); await page.waitForTimeout(100); await page.screenshot({ path: __dirname + `/audit-out/audit-${String(k).padStart(2, '0')}.png` }); }
  console.log(n, 'variant rows,', Math.ceil(H / per), 'sheets', errs); await b.close(); srv.close();
})();
