// Round 12 accessibility and visual fixes: area chips keep focus and announce, the Help sheet is opaque, Guide focus and topic names,
// Welcome focus, the coverage table on phones, the body map key and walk card by ear, tab bar words, the progression hint once,
// and the Neck Hold step-1 drawing.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok', m); } else { fail++; console.log('FAIL', m); } };
const PORT = +(process.env.PORT || 8710), URL = `http://localhost:${PORT}/index.html`;
const SEED = require('./fixtures/seed-week4.json');
const ready = p => p.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return /^(canvas|white|black|#)/i.test(c) ? 1 : 0; const a = m[1].split(',').map(s => s.trim()); return a.length < 4 ? 1 : +a[3]; };

(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    // ---- 1. Exercises area chips: focus stays on the chosen chip, and the count is announced ----
    let o = await open(kind, { state: SEED }), p = o.page;
    await p.goto(URL); await ready(p);
    await p.click('#tab-exercises'); await p.waitForTimeout(200);
    const chips = await p.$$eval('#chips [data-f]', bs => bs.map(b => b.dataset.f));
    const pick = chips.find(c => c !== 'All');
    await p.focus('#chips [data-f="' + pick + '"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    const st = await p.evaluate(() => { const a = document.activeElement; return { f: a.dataset && a.dataset.f, pressed: a.getAttribute('aria-pressed'), live: document.getElementById('srLive').textContent, shown: [...document.querySelectorAll('#lib [data-ex]')].filter(r => !r.hidden).length }; });
    ok(st.f === pick && st.pressed === 'true', kind + ': focus stays on the chosen chip, pressed (' + JSON.stringify(st) + ')');
    ok(new RegExp('^' + pick + ': ' + st.shown + ' exercises?$').test(st.live), kind + ': the result count is announced (' + st.live + ')');
    await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.activeElement.dataset.f) === pick, kind + ': pressing the chip again keeps focus');
    await p.click('#chips [data-f="All"]'); await p.waitForTimeout(200);
    ok(/^All areas: \d+ exercises$/.test(await p.textContent('#srLive')), kind + ': All is announced too');

    // ---- 3. Guide: the topic name is read title first, and Back returns focus to the Help button ----
    await p.click('#tab-train'); await p.waitForTimeout(150);
    await p.click('#train [data-tool="help"]'); await p.waitForTimeout(300);
    const topic = await p.textContent('#sheetBody [data-hg]');
    await p.click('#sheetBody [data-hg]'); await p.waitForTimeout(400);
    const nm = await p.evaluate(() => { const a = document.activeElement; return a.tagName + '|' + a.textContent.replace(/\s+/g, ' ').trim(); });
    ok(nm.startsWith('SUMMARY|' + topic.trim()), kind + ': the open topic is read title first (' + nm + ')');
    const snap = await p.locator('#guide').ariaSnapshot();
    ok(!/"Alternate Why exercises/.test(snap) && !/summary.*Alternate Why/i.test(snap), kind + ': no badge word before the title in the screen-reader tree');
    const vis = await p.evaluate(() => { const s = [...document.querySelectorAll('#guide summary')].find(x => x.querySelector('.gb') && x.querySelector('.gb').textContent.trim()); const b = s.querySelector('.gb').getBoundingClientRect(), h = s.querySelector('.gh').getBoundingClientRect(); return b.top < h.top - 2 || b.left < h.left - 2; });
    ok(vis, kind + ': the badge still shows before the title');
    await p.click('#guide [data-back]'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => { const a = document.activeElement; return a.dataset.tool === 'help' && !!a.closest('#train'); }), kind + ': Back from the Guide focuses the Help button that opened it');

    // ---- 6. Body map key read as one sentence; the walk card names the walk and has no empty group ----
    const bm = await p.evaluate(() => ({ hid: document.querySelector('#bodyCard .bm-legend').getAttribute('aria-hidden'), sr: (document.querySelector('#bodyCard p.sr-only') || {}).textContent || '' }));
    ok(bm.hid === 'true', kind + ': the swatch list is hidden from screen readers');
    ok(/% of muscle parts fully trained this week/.test(bm.sr) && /dashed outline is a gap/.test(bm.sr), kind + ': the map key is one meaningful sentence (' + bm.sr.slice(0, 80) + ')');
    const walk = await p.evaluate(() => { const b = [...document.querySelectorAll('#strip button')].find(x => /Walk & Row/.test(x.getAttribute('aria-label'))); if (!b) return null; b.click(); return true; });
    if (walk) {
      await p.waitForTimeout(200);
      const two = p.locator('#splitSeg [data-split="two"]'); if (await two.count()) { await two.click(); await p.waitForTimeout(200); }
      const card = await p.evaluate(() => { const a = document.querySelector('#sessions article.sess'); return { sum: a.querySelector('.sum').textContent, grp: [...a.querySelectorAll('.thumbs[role="group"]')].map(g => g.querySelectorAll('button').length) }; });
      ok(/walk/i.test(card.sum) && !/^\d+ min/.test(card.sum), kind + ': the cardio card says what you do, not the minutes twice (' + card.sum + ')');
      ok(card.grp.every(n => n > 0), kind + ': no empty "Exercises in this session" group (' + card.grp + ')');
      const aria = await p.locator('#sessions article.sess').first().ariaSnapshot();
      ok(!/group "Exercises in this session[^"]*"\s*(\n\s*- button "Start|$)/.test(aria), kind + ': the walk card has no empty group in the tree');
    } else ok(false, kind + ': a cardio day is in the plan');
    ok(!o.errs.length, kind + ': no errors ' + o.errs.join(' | '));
    await o.b.close();

    // ---- 2. The Help sheet is opaque, even if its slide-in animation never runs (frozen clock), in light, dark and forced colours ----
    for (const mode of ['light', 'dark', 'forced']) {
      o = await open(kind, { state: SEED, dark: mode === 'dark', forcedColors: mode === 'forced' }); p = o.page;
      await p.clock.install({ time: new Date('2026-10-28T07:00:00') });
      await p.goto(URL); await ready(p); await p.clock.runFor(500);
      await p.click('#train [data-tool="help"]'); await p.clock.runFor(800);
      const sh = await p.evaluate(() => { const s = document.getElementById('sheet'), b = document.getElementById('sheetBody'); return { op: getComputedStyle(s).opacity, bg: getComputedStyle(s).backgroundColor, bb: getComputedStyle(b).backgroundColor }; });
      ok(sh.op === '1' && alpha(sh.bg) === 1 && alpha(sh.bb) === 1, kind + ' ' + mode + ': the Help sheet is opaque (' + JSON.stringify(sh) + ')');
      if (kind === 'android' && mode === 'light' && process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/r12d-help.png' });
      await o.b.close();
    }

    // ---- 4. Fresh install: focus is in the Welcome dialog, not on the page body ----
    o = await open(kind, {}); p = o.page;
    await p.goto(URL); await ready(p); await p.waitForTimeout(600);
    const wf = await p.evaluate(() => { const a = document.activeElement; return { inSheet: !!a.closest('#sheet'), id: a.id, title: document.getElementById('sheetTitle').textContent }; });
    ok(wf.inSheet && /Welcome/.test(wf.title), kind + ': focus starts inside the Welcome dialog (' + JSON.stringify(wf) + ')');
    await p.keyboard.press('Tab');
    ok(await p.evaluate(() => !!document.activeElement.closest('#sheet')), kind + ': Tab stays in the dialog');
    await o.b.close();
  }

  // ---- 5 + 7. Phones: the coverage table fits at 360–412 px; at very large text it says it scrolls. Tab icons keep their words ----
  // three training days (as for Ravi and Fatima); the six-day plan has more columns, so there the cue must show instead
  const SEED3 = JSON.parse(JSON.stringify(SEED)); SEED3.profile.days = 3;
  for (const [w, z, days] of [[360, 1, 3], [390, 1, 3], [412, 1, 3], [412, 1.5, 3], [360, 1.3, 3], [360, 1, 6]]) {
    const o = await open('android', { state: days === 3 ? SEED3 : SEED, viewport: { width: w, height: 860 }, textScale: z }), p = o.page;
    await p.goto(URL); await ready(p);
    const tabs = await p.evaluate(() => [...document.querySelectorAll('nav.tabbar [role=tab]')].filter(b => b.getBoundingClientRect().width > 0).map(b => { const r = b.getBoundingClientRect(), bar = document.querySelector('nav.tabbar').getBoundingClientRect(); return { t: b.innerText.trim(), fs: parseFloat(getComputedStyle(b).fontSize), inBar: r.bottom <= bar.bottom + 1 && b.scrollHeight <= b.clientHeight + 2 }; }));
    ok(tabs.length === 3 && tabs.every(t => t.t && t.fs >= 11 && t.inBar), w + 'px ×' + z + ': every tab icon has a visible word (' + JSON.stringify(tabs) + ')');
    await p.click('#tab-progress'); await p.waitForTimeout(250);
    const mt = p.locator('#pt-muscles'); if (await mt.count()) { await mt.click(); await p.waitForTimeout(200); }
    const cov = await p.evaluate(() => { const s = document.getElementById('covScroll'); return { sw: s.scrollWidth, cw: s.clientWidth, cue: !document.getElementById('covCue').hidden, cols: [...document.querySelectorAll('#cov thead th')].map(th => th.textContent.replace(/\s+/g, ' ').trim()) }; });
    ok(!cov.cols.some(c => /\b[A-Z][a-z]* [a-z]\b/.test(c)), w + 'px: no word is split in the headings (' + cov.cols + ')');
    if (z === 1 && days === 3) ok(cov.cols.length === 6 && cov.sw <= cov.cw + 1 && !cov.cue, w + 'px: Day 3, Planned and Done fit without sideways scrolling (' + cov.sw + '/' + cov.cw + ')');
    else ok(cov.sw <= cov.cw + 1 ? !cov.cue : cov.cue, w + 'px ×' + z + ': a scroll cue shows whenever the table is wider than the screen (' + cov.sw + '/' + cov.cw + ', cue ' + cov.cue + ')');
    ok(cov.cols.some(c => /^Planned/.test(c)) && cov.cols.some(c => /^Done/.test(c)), w + 'px: column names stay complete for screen readers (' + cov.cols.slice(-2) + ')');
    if (w === 360 && z === 1 && days === 3 && process.env.SHOTS) { await p.evaluate(() => document.getElementById('cov').closest('.card').scrollIntoView()); await p.screenshot({ path: process.env.SHOTS + '/r12d-cov-360.png' }); }
    ok(!o.errs.length, w + 'px: no errors ' + o.errs.join(' | '));
    await o.b.close();
  }

  // ---- 8. The progression hint: once per exercise, and the same "at your heaviest" advice only once per session ----
  {
    const o = await open('android', { state: SEED, init: FAKE_SPEECH }), p = o.page;
    await p.goto(URL); await ready(p);
    const r = await p.evaluate(() => {
      const L = window.__isoTest.progressLine, mem = {}, out = [];
      const heavy = 'Last week you did all 12 reps at 3 kg, your heaviest: lower each rep over 4 seconds to make it harder, or add a heavier weight in your profile.';
      const up = 'Last week you did all 10 reps at 8 kg: try 10 kg today (tap +).';
      const items = [['lr', 'Lateral Raise', heavy], ['lr', 'Lateral Raise', heavy], ['curl', 'Biceps Curl', heavy], ['sq', 'Goblet Squat', heavy], ['row', 'Row', up], ['row', 'Row', up], ['press', 'Floor Press', up], ['calf', 'Calf Raise', 'Last time: 3 kg × 12']];
      items.forEach(([id, name, h]) => out.push(L({ id, kind: 'reps', ex: { name } }, h, mem)));
      return out;
    });
    const said = r.filter(Boolean);
    ok(said.filter(x => /heaviest/.test(x)).length === 1, 'the "at your heaviest" advice is spoken once per session, not for every exercise (' + said.length + ')');
    ok(said.filter(x => /^Row\./.test(x)).length === 1 && said.some(x => /^Floor Press\. .*try 10 kilos today$/.test(x)), 'a "try a heavier weight" hint is spoken once per exercise, in kilos, without "(tap +)"');
    ok(r[7] === null, 'no hint for an exercise that isn\u2019t ready to progress');
    await o.b.close();
  }

  // ---- 9. Neck Hold step 1: the palm stands in front of the forehead (not on top of the head), and moves smoothly ----
  {
    const o = await open('android', { state: SEED }), p = o.page;
    await p.goto(URL); await ready(p);
    const nk = await p.evaluate(() => {
      const ex = EX_ADDON.find(e => e.id === 'neck-hold') || EX.find(e => e.id === 'neck-hold');
      const q = FIG.place(ex._r[0], ex._anchor, 0);
      const K = ex._r.slice(0, 3); let prev = null, jump = 0;
      for (let i = 0; i <= 160; i++) { const o = FIG.place(FIG.move(ex, K, null, i / 60, 2.65), ex._anchor, 0), pts = Object.values(o).filter(v => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number'); if (prev) pts.forEach((x, k) => { if (prev[k]) jump = Math.max(jump, Math.hypot(x[0] - prev[k][0], x[1] - prev[k][1])); }); prev = pts; }
      return { head: q.head, face: q.face, W: q.Wn, P: q.Pn, jump };
    });
    const R = 8; // head radius
    ok(nk.W[0] > nk.head[0] + R * 0.9 && nk.P[0] > nk.head[0] + R * 0.9, 'neck hold step 1: the hand is in front of the face (' + nk.W + ' / ' + nk.P + ', head ' + nk.head + ')');
    ok(nk.P[1] < nk.head[1] && nk.P[1] > nk.head[1] - R * 1.2 && nk.W[1] > nk.head[1] - R * 0.2, 'neck hold step 1: the palm spans forehead height, not above the head (' + nk.W[1] + '..' + nk.P[1] + ', head y ' + nk.head[1] + ')');
    ok(Math.abs(nk.P[0] - nk.W[0]) < 2, 'neck hold step 1: the palm stands upright');
    ok(nk.jump < 1.2, 'neck hold: smooth between steps (max ' + nk.jump.toFixed(2) + ' per frame)');
    await o.b.close();
  }

  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
