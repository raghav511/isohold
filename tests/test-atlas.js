// Screen-atlas review (v57): 44 px tap targets, chart text 12 px or more, the tab you came from stays lit, one-line Search & log title,
// sheets open on their title (no ring on Close), toggles name their exercise, "Make it yours" first for new users, why 2 to 6 days.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8394, URL = `http://localhost:${PORT}/index.html`;
const ready = p => p.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
const smallIn = (p, sel) => p.evaluate(sel => [...document.querySelectorAll(sel)].filter(b => { const r = b.getBoundingClientRect(); return r.width && r.height && b.closest('label') === null; })
  .filter(b => b.getBoundingClientRect().height < 44 && !(b.tagName === 'A' && getComputedStyle(b).display === 'inline')).map(b => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 30) + ' ' + Math.round(b.getBoundingClientRect().height)), sel);
const tinyText = p => p.evaluate(() => [...document.querySelectorAll('#progress text, #progress small, #progress span')].filter(e => e.getBoundingClientRect().width).map(e => {
  let fs = parseFloat(getComputedStyle(e).fontSize);
  if (e.tagName === 'text') { const s = e.ownerSVGElement, vb = s.viewBox.baseVal; if (vb && vb.width) fs *= s.getBoundingClientRect().width / vb.width; }
  return [e.textContent.trim().slice(0, 12), Math.round(fs * 10) / 10];
}).filter(x => x[1] < 12));
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    // ---- fresh install ----
    let o = await open(kind, {}), p = o.page;
    await p.goto(URL); await ready(p); await p.waitForTimeout(600);
    const wf = await p.evaluate(() => ({ id: document.activeElement.id, ol: getComputedStyle(document.activeElement).outlineStyle }));
    ok(wf.id === 'sheetTitle' && wf.ol === 'none', kind + ': the welcome sheet opens on its title with no focus ring (' + JSON.stringify(wf) + ')');
    await p.click('#sheetClose'); await p.waitForTimeout(250);
    const order = await p.evaluate(() => { const s = document.querySelector('#setupCard [data-prof]'), b = document.getElementById('bodyCard'); return s && b && !!(s.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); });
    ok(order, kind + ': before a profile exists, “Set up profile” comes before the body map');
    const clear = await p.evaluate(() => { const s = document.querySelector('#setupCard [data-prof]').getBoundingClientRect(), bar = document.getElementById('startBar').getBoundingClientRect(); return s.bottom <= bar.top; });
    ok(clear, kind + ': the Start button does not cover “Set up profile” on the first screen');
    let sm = await smallIn(p, '#train button, #train a');
    ok(!sm.length, kind + ': every Today button is at least 44 px tall (' + sm + ')');
    const tg = await p.evaluate(() => [...document.querySelectorAll('#sessions .tg')].map(g => g.getAttribute('aria-label')));
    ok(tg.length && tg.every(l => /^Include in this session: \S/.test(l)), kind + ': each Hold/Reps group names its exercise (' + tg[0] + ')');
    await p.evaluate(() => { document.getElementById('tab-train').scrollIntoView(); window.scrollTo(0, 1e6); });
    const end = await p.evaluate(() => { const bar = document.getElementById('startBar').getBoundingClientRect(); const last = document.getElementById('fuel').innerHTML ? document.getElementById('fuel') : document.getElementById('sessions'); return last.getBoundingClientRect().bottom <= bar.top + 1; });
    ok(end, kind + ': scrolled to the end, the last card sits clear of the Start button');
    await p.evaluate(() => window.scrollTo(0, 0)); await p.click('#profBtn'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.activeElement.id === 'sheetTitle'), kind + ': Profile opens on its title, not the Close button');
    await p.evaluate(() => { const b = [...document.querySelectorAll('#sheet .pf-tabs button')].find(b => b.textContent.trim() === 'Training'); b && b.click(); }); await p.waitForTimeout(200);
    ok(/2 to 6: one day can.t cover every muscle/.test(await p.textContent('#sheetBody')), kind + ': Training says why the choice is 2 to 6 days');
    for (const t of ['You', 'Training', 'Look', 'AI', 'Backup']) {
      await p.evaluate(t => { const b = [...document.querySelectorAll('#sheet .pf-tabs button')].find(b => b.textContent.trim() === t); b && b.click(); }, t); await p.waitForTimeout(150);
      sm = await smallIn(p, '#sheetBody button');
      ok(!sm.length, kind + ' profile ' + t + ': buttons and chips are at least 44 px (' + sm + ')');
    }
    await o.b.close();

    // ---- with history ----
    o = await open(kind, { state: require('./fixtures/seed-week4.json') }); p = o.page;
    await p.goto(URL); await ready(p);
    ok(!(await p.evaluate(() => document.querySelector('#setupCard').children.length)), kind + ': no setup card once a profile exists');
    for (const from of ['progress', 'exercises', 'train']) {
      await p.evaluate(t => document.getElementById('tab-' + t).click(), from); await p.waitForTimeout(120);
      await p.click('#' + from + ' .view-head [data-tool="search"]'); await p.waitForTimeout(200);
      const lit = await p.evaluate(() => [...document.querySelectorAll('.tabbar button:not([hidden])')].filter(b => b.getAttribute('aria-selected') === 'true' || b.classList.contains('home')).map(b => b.id));
      ok(lit.length === 1 && lit[0] === 'tab-' + from, kind + ': on Search & log the ' + from + ' tab stays lit (' + lit + ')');
      const h = await p.evaluate(() => { const h = document.querySelector('#coach h1'); return Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)); });
      ok(h === 1, kind + ': the Search & log title is one line (' + h + ')');
      ok(await p.getAttribute('#coach [data-back]', 'aria-label') === 'Back' && !(await p.textContent('#coach [data-back]')).trim(), kind + ': Back is an arrow with a spoken name');
      await p.click('#coach [data-back]'); await p.waitForTimeout(150);
    }
    ok(!(await p.evaluate(() => document.querySelectorAll('.tabbar button.home').length)), kind + ': back on a tab, only that tab is lit');
    await p.evaluate(() => document.getElementById('tab-progress').click()); await p.waitForTimeout(200);
    for (const name of ['Muscles', 'Strength', 'Body']) {
      await p.locator('#progress button', { hasText: new RegExp('^' + name + '$') }).first().click(); await p.waitForTimeout(350);
      const t = await tinyText(p);
      ok(!t.length, kind + ' Progress › ' + name + ': no text under 12 px (' + JSON.stringify(t.slice(0, 4)) + ')');
    }
    ok(!o.errs.filter(e => !/Audio/.test(e)).length, kind + ': no errors ' + o.errs);
    await o.b.close();
  }
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
