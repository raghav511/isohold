// Redesign part 1: Today name, Search / Help / Profile on every tab, Search finds muscles by everyday words, Help works offline.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8266, URL = `http://localhost:${PORT}/index.html`;
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    const o = await open(kind, { state: require('./fixtures/seed-week4.json') });
    const p = o.page; await p.goto(URL); await p.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    ok(/Today/.test(await p.textContent('#tab-train')) && /Today/.test(await p.textContent('#train h1')), kind + ': the first tab is called Today');
    for (const t of ['train', 'exercises', 'coach', 'progress', 'guide']) {
      await p.evaluate(t => document.getElementById('tab-' + t).click(), t); await p.waitForTimeout(80);
      const labels = await p.evaluate(id => [...document.querySelectorAll('#' + id + ' .view-head .tool:not(.back)')].map(b => b.textContent.trim()), t);
      ok(labels.length === 3 && labels[0] === 'Search' && labels[1] === 'Help' && /Profile$/.test(labels[2]), kind + ' ' + t + ': top bar has Search, Help, Profile (' + labels + ')');
      const small = await p.evaluate(id => [...document.querySelectorAll('#' + id + ' .view-head .tool:not(.back)')].filter(b => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length, t);
      ok(!small, kind + ' ' + t + ': top-bar buttons are at least 44 px');
    }
    await p.click('#guide .view-head [data-tool="profile"]'); await p.waitForTimeout(200);
    ok(await p.isVisible('#sheet') && /profile|Profile|Welcome|Name/i.test(await p.textContent('#sheet')), kind + ': Profile opens from another tab');
    await p.click('#sheetClose'); await p.waitForTimeout(150);
    await p.click('#guide .view-head [data-tool="search"]'); await p.waitForTimeout(150);
    ok(await p.isVisible('#coach') && /Search & log/.test(await p.textContent('#coach h1')), kind + ': Search opens Search & log');
    await p.fill('#cIn', 'shoulder'); await p.waitForTimeout(150);
    ok(/Lateral Raise/.test(await p.textContent('#cSrch')), kind + ': typing “shoulder” finds the lateral raise');
    await p.click('#cSrch [data-sx]'); await p.waitForTimeout(250);
    ok(await p.isVisible('#sheet') && /Lateral Raise/.test(await p.textContent('#sheetBody')), kind + ': a search result opens that exercise');
    await p.click('#sheetClose'); await p.waitForTimeout(150); await p.fill('#cIn', '');
    await p.click('#coach .view-head [data-tool="help"]'); await p.waitForTimeout(150);
    ok(await p.locator('#sheetBody details.help-q').count() === 6, kind + ': Help shows 6 offline answers');
    await p.click('#sheetClose');
    ok(!o.errs.filter(e => !/Audio/.test(e)).length, kind + ': no errors ' + o.errs);
    await o.b.close();
  }
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
