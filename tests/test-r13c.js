// Round 13 (Ravi: knee arthritis, high BP, cataract, large text, vegetarian, three days a week) exercise-page and content fixes:
// 1 a health note and the steps, drawing and cues agree (Wall Sit 45°, not 90°), 2 no sheet runs off the screen at large text,
// 3 "RPE 7" explained, 4 no hills or stairs for sore knees, 5 the A/B/C rotation survives a week jump, 6 Dip Hold says it needs bars,
// 7 gap line, Help colours, Guide order, sheet heading, coverage table, 8 protein ideas follow the diet and the target is explained.
// Fatima (osteopenia, home, tablet 800×1280, Full Body A/B/C): F1 sheet heading, F2 notes per tab, F3 home warm-up, F4 pain names the Swing,
// F5 week tiles, colours, "This device", halal, F6 day summaries differ, F7 step badge matches the drawing, tablet figure size, F8 Guide snippet.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok', m); } else { fail++; console.log('FAIL', m); } };
const PORT = +(process.env.PORT || 8790), URL = `http://localhost:${PORT}/index.html`;
// the saved states carry real timestamps; blood-pressure readings in them would turn "today" into a high-BP day once the real
// clock reaches them, and none of these checks are about blood pressure, so they are left out
const noBp = st => Object.assign({}, st, { notes: (st.notes || []).filter(n => n.k !== 'bp') });
const RAVI = noBp(require('./fixtures/ravi-r13.json')), FATIMA = noBp(require('./fixtures/fatima-r13.json'));
const clone = o => JSON.parse(JSON.stringify(o));
const ready = p => p.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
async function boot(state, opts = {}) { const o = await open(opts.kind || 'android', Object.assign({ state }, opts)); if (opts.at) await o.page.clock.setFixedTime(new Date(opts.at)); await o.page.goto(URL); await ready(o.page); return o; }
// anything wider than the screen, outside a deliberate sideways scroller (the sheet body itself doesn't count as one)
const OVERFLOW = (root) => {
  const vw = window.innerWidth, se = document.scrollingElement, bad = [];
  const scroller = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { if (a.id === 'sheetBody' || a.id === 'sheet') continue; const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  document.querySelectorAll(root + ', ' + root + ' *').forEach(e => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (r.width <= 1 || r.height <= 1 || cs.visibility === 'hidden' || cs.position === 'fixed' && e.id !== 'sheet') return;
    if (r.right > vw + 1 && !scroller(e)) bad.push('right ' + e.tagName + '.' + (e.className.baseVal != null ? e.className.baseVal : e.className) + ' ' + Math.round(r.right) + '>' + vw);
    else if (!(e instanceof SVGElement) && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(cs.overflowX) && !scroller(e)) bad.push('wide ' + e.tagName + '.' + e.className + ' ' + e.scrollWidth + '/' + e.clientWidth);
  });
  return { doc: se.scrollWidth - se.clientWidth, bad: bad.slice(0, 4) };
};

(async () => {
  const srv = await serve(PORT);

  // ---- 1. The note, the numbered steps, the drawing and the cues agree for every modification ----
  {
    const o = await boot(clone(RAVI)), p = o.page;
    const audit = await p.evaluate(() => {
      const T = window.__isoTest, st = T.store(), out = {};
      const look = (id, kind, eq) => { let x; try { x = eq ? T.V(id, kind, { eq: eq.split(':')[0], style: eq.split(':')[1] || '' }) : T.V(id, kind); } catch (e) { return { err: e.message }; } return { steps: x.steps.map(s => s.txt).join(' | '), cues: (x.cues || []).join(' | '), why: x.why || '', mod: x.mod || '', last: JSON.stringify(x._r[x._r.length - 1]) }; };
      const run = (profile, list) => { st.profile = Object.assign({}, st.profile, profile); return list.map(([id, kind, eq]) => Object.assign({ id, kind, eq: eq || '' }, look(id, kind, eq))); };
      const p0 = Object.assign({}, st.profile);
      out.knee = run({ issues: ['knee'], age: 50 }, [['wall-sit', 'h'], ['wall-sit', 'h', 'w'], ['wall-sit', 'h', 'b:plate'], ['wall-sit', 'h', 'c:mach'], ['wall-sit', 'g', 'c:mach'], ['goblet-squat', 'h'], ['goblet-squat', 'g'], ['goblet-squat', 'h', 'w'], ['goblet-squat', 'h', 'c:mach'], ['split-squat', 'h'], ['split-squat', 'g'], ['split-squat', 'h', 'w'], ['suitcase', 'h'], ['suitcase', 'g']]);
      out.plain = run({ issues: [], age: 40 }, [['wall-sit', 'h'], ['goblet-squat', 'h'], ['split-squat', 'h'], ['dip-hold', 'h']]);
      out.gentle = run({ issues: ['bp'], age: 67 }, [['dip-hold', 'h'], ['dip-hold', 'g']]);
      out.wrist = run({ issues: ['wrist'], age: 40 }, [['pushup-plus', 'h', 'w'], ['pushup-plus', 'g', 'w']]);
      out.balance = run({ issues: ['balance'], age: 40 }, [['sl-balance', 'h'], ['sl-balance', 'g']]);
      out.fall = run({ issues: ['bones'], age: 70 }, [['rev-nordic', 'h', 'w']]);
      st.profile = p0;
      return out;
    });
    const by = (set, id, kind, eq) => audit[set].find(x => x.id === id && x.kind === kind && x.eq === (eq || ''));
    for (const x of audit.knee) {
      ok(!x.err && x.mod === 'knee', 'knee: ' + x.id + ' ' + x.kind + ' ' + x.eq + ' is rewritten for the knees (' + (x.err || x.mod) + ')');
      ok(!/90°|thighs parallel|parallel to the (floor|platform)|back knee just above the floor|nearly touches|long split stance|deep squat|tap the bell to the floor/i.test(x.steps + ' ' + x.cues), 'knee: ' + x.id + ' ' + x.kind + ' ' + x.eq + ' steps and cues never ask for the deep bend (' + x.steps.slice(-110) + ')');
    }
    ok(/45°/.test(by('knee', 'wall-sit', 'h').steps) && /45°/.test(by('knee', 'wall-sit', 'h').cues), 'Wall Sit: the hold step and a cue say about 45°');
    ok(!/90°/.test(by('knee', 'wall-sit', 'h').why.replace('than 90°', '')) && /45°/.test(by('knee', 'wall-sit', 'h').why), 'Wall Sit: the Why line matches the shallower sit');
    ok(/chair/.test(by('knee', 'goblet-squat', 'h').steps) && /chair/.test(by('knee', 'goblet-squat', 'g').steps), 'Goblet Squat: hold and reps stop at a chair');
    ok(/short split stance/.test(by('knee', 'split-squat', 'h').steps) && /45°/.test(by('knee', 'split-squat', 'g').steps), 'Split Squat: short stance, 45° in hold and reps');
    for (const id of ['wall-sit', 'goblet-squat', 'split-squat']) ok(by('knee', id, 'h').last !== by('plain', id, 'h').last, id + ': the hold drawing is shallower with sore knees');
    ok(/90°/.test(by('plain', 'wall-sit', 'h').steps) && !by('plain', 'wall-sit', 'h').mod, 'without a knee note the Wall Sit keeps its 90° steps');
    ok(/only slightly bent/.test(by('gentle', 'dip-hold', 'h').steps) && !/upper arms about level/.test(by('gentle', 'dip-hold', 'h').steps + by('gentle', 'dip-hold', 'g').steps) && by('gentle', 'dip-hold', 'h').last !== by('plain', 'dip-hold', 'h').last, 'gentle: the Dip Hold steps and drawing stay near the top');
    ok(audit.wrist.every(x => /fists/.test(x.steps + x.cues)), 'wrists: Push-Up Plus steps say fists or a wall');
    ok(audit.balance.every(x => /wall/.test(x.steps) && x.mod === 'balance'), 'balance: the steps say to stand by a wall');
    ok(/short way/.test(audit.fall[0].steps) && audit.fall[0].mod === 'fall', 'falls: the Reverse Nordic steps lean back only a short way');

    // the sheet itself: Ravi's Wall Sit reads 45° in the numbered steps, and the heading names his plan day
    await p.click('#tab-exercises'); await p.waitForTimeout(250);
    await p.click('#lib [data-ex="wall-sit"]'); await p.waitForTimeout(350);
    const sh = await p.evaluate(() => ({ title: document.getElementById('sheetTitle').textContent, steps: [...document.querySelectorAll('#dBody ol.steps li p')].map(e => e.textContent).join(' | '), note: (document.querySelector('#dBody .d-safe') || {}).textContent || '', rx: document.querySelector('#dBody .d-rx').textContent }));
    ok(/45°/.test(sh.note) && /45°/.test(sh.steps) && !/90°/.test(sh.steps), 'sheet: the note and the numbered steps both say 45° (' + sh.steps.slice(-90) + ')');
    ok(/^Day [1-3], Full Body [ABC]$/.test(sh.title), '7: the sheet heading names a day in Ravi’s plan, never Day 0 (' + sh.title + ')');
    // ---- 3. RPE explained where the target is shown ----
    ok(/RPE 7 \(effort 7 of 10: hard but steady/.test(sh.rx), '3: the sheet explains RPE 7 in plain words (' + sh.rx + ')');
    await p.click('#sheetClose'); await p.waitForTimeout(200);
    // ---- 6. Dip Hold at home without bars ----
    const dip = await p.evaluate(() => { const r = document.querySelector('#lib [data-ex="dip-hold"]'); return r ? r.textContent : window.__isoTest.libNote('dip-hold'); });
    ok(/Needs dip bars/.test(dip) && /chairs/.test(dip), '6: Dip Hold says it needs bars and how to use chairs instead (' + dip.slice(0, 160) + ')');
    const gym = await p.evaluate(() => { const st = window.__isoTest.store(), w = st.profile.where; st.profile.where = 'gym'; const n = window.__isoTest.libNote('dip-hold'); st.profile.where = w; return n; });
    ok(!/Needs dip bars/.test(gym), '6: at the gym the bars note is not shown');
    // ---- 8. Protein follows the diet and explains the target ----
    const pr = await p.evaluate(() => { const T = window.__isoTest, st = T.store(), d0 = st.profile.diet, out = {}; ['vegetarian', 'vegan', 'halal'].forEach(d => { st.profile.diet = d; out[d] = [T.localAnswer('how much protein should I eat'), T.localAnswer('what protein should i eat')].join(' || '); }); st.profile.diet = d0; return out; });
    ok(!/whey|greek yogurt/i.test(pr.vegetarian) && /paneer|dal|curd|soya|chana|milk|peanut/i.test(pr.vegetarian), '8: vegetarian ideas are familiar foods, no whey or Greek yogurt (' + pr.vegetarian.slice(-160) + ')');
    ok(/1\.6 g of protein per kg of bodyweight \(7\d(\.\d)? kg\)/.test(pr.vegetarian), '8: the target says where it comes from (g per kg)');
    ok(!/paneer|curd|milk|whey|yogurt|egg/i.test(pr.vegan), '8: vegan ideas have no dairy or eggs');
    ok(/halal/i.test(pr.halal) && !/pork|bacon/i.test(pr.halal), '8: halal ideas say halal');
    ok(!o.errs.length, '1/6/8: no errors ' + o.errs.join(' | '));
    await o.b.close();
  }

  // ---- 2. No sheet runs off the screen at large text (every exercise sheet, both tabs) ----
  for (const [w, z, all] of [[360, 2, true], [412, 1.5, true], [360, 1.5, false], [390, 1.5, false], [390, 2, false], [412, 2, false]]) {
    const o = await boot(clone(RAVI), { viewport: { width: w, height: 860 }, textScale: z }), p = o.page;
    await p.click('#tab-exercises'); await p.waitForTimeout(250);
    const ids = all ? await p.$$eval('#lib [data-ex]', bs => bs.map(b => b.dataset.ex)) : ['wall-sit'];
    const bad = [];
    for (const id of ids) {
      await p.click('#lib [data-ex="' + id + '"]'); await p.waitForTimeout(250);
      for (const part of ['hold', 'rep']) {
        const tab = p.locator('#sheetBody .seg [data-p="' + part + '"]'); if (await tab.count()) { await tab.click(); await p.waitForTimeout(150); }
        const r = await p.evaluate(OVERFLOW, '#sheet');
        if (r.doc > 0 || r.bad.length) bad.push(id + '/' + part + ': ' + r.doc + ' ' + r.bad.join(', '));
      }
      if (id === 'wall-sit' && w === 412 && z === 1.5 && process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/r13c-wallsit-412x1.5.png' });
      await p.click('#sheetClose'); await p.waitForTimeout(150);
    }
    ok(!bad.length, '2: ' + w + 'px ×' + z + ': ' + ids.length + ' exercise sheet(s) fit the screen ' + bad.slice(0, 3).join(' ; '));
    // the Help sheet and the Today page too
    await p.evaluate(() => { document.getElementById('tab-train').click(); window.scrollTo(0, 0); }); await p.waitForTimeout(200);
    const td = await p.evaluate(OVERFLOW, '#train');
    ok(!td.doc && !td.bad.length, '2: ' + w + 'px ×' + z + ': Today fits (' + td.bad.join(', ') + ')');
    // every page, not only the sheets: nothing makes the whole page scroll sideways
    const pages = [];
    for (const t of ['train', 'exercises', 'progress:body', 'progress:muscles', 'progress:strength']) {
      const r = await p.evaluate(t => { const [a, b] = t.split(':'); document.getElementById('tab-' + a).click(); if (b && document.getElementById('pt-' + b)) document.getElementById('pt-' + b).click(); const se = document.scrollingElement; return se.scrollWidth - se.clientWidth; }, t);
      await p.waitForTimeout(150); const r2 = await p.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
      if (r > 0 || r2 > 0) pages.push(t + ' +' + Math.max(r, r2));
    }
    ok(!pages.length, '2: ' + w + 'px ×' + z + ': no page scrolls sideways (' + pages + ')');
    await p.evaluate(() => { document.getElementById('tab-train').click(); window.scrollTo(0, 0); }); await p.waitForTimeout(200);
    await p.click('#train [data-tool="help"]'); await p.waitForTimeout(300);
    const hp = await p.evaluate(OVERFLOW, '#sheet');
    ok(!hp.doc && !hp.bad.length, '2: ' + w + 'px ×' + z + ': Help fits (' + hp.bad.join(', ') + ')');
    ok(!o.errs.length, '2: no errors ' + o.errs.join(' | '));
    await o.b.close();
  }

  // ---- 3 + 4. The player: RPE explained; the walk warm-up has no hills or stairs for sore knees ----
  {
    // Saturday after Ravi's Thursday session: Full Body B is due
    const o = await boot(clone(RAVI), { textScale: 1.5, init: FAKE_SPEECH, timezoneId: 'Asia/Kolkata', at: '2026-11-14T07:00:00+05:30' }), p = o.page;
    const cues = await p.evaluate(() => { const T = window.__isoTest, st = T.store(), out = { knee: T.cFig('out').cues.join(' | '), seg: T.subSeg(['out', 60, 'Hard', 'Hard: fast walk uphill or up stairs'])[3] }; const is = st.profile.issues; st.profile.issues = []; out.none = T.cFig('out').cues.join(' | '); st.profile.issues = is; return out; });
    ok(!/hills|stairs/.test(cues.knee) && !/stairs|uphill/.test(cues.seg), '4: with sore knees the walk never suggests hills or stairs (' + cues.knee + ' / ' + cues.seg + ')');
    ok(/hills or stairs/.test(cues.none), '4: without knee issues the cue is unchanged');
    const ta = p.getByRole('button', { name: /Train anyway/ }).first(); if (await ta.count() && await ta.isVisible()) { await ta.click(); await p.waitForTimeout(300); }
    await p.locator('#train [data-start]:visible').first().click(); await p.waitForTimeout(800);
    const warm = await p.evaluate(() => document.getElementById('player').innerText);
    ok(!/hills|stairs/i.test(warm), '4: the player warm-up has no hills or stairs (' + warm.replace(/\s+/g, ' ').slice(0, 120) + ')');
    const sk = p.getByRole('button', { name: /Skip warm-up/ }).first(); if (await sk.count()) { await sk.click(); await p.waitForTimeout(600); }
    let rx = '';
    for (let i = 0; i < 12 && !/RPE/.test(rx); i++) { rx = await p.evaluate(() => (document.getElementById('pRx') || {}).textContent || ''); if (!/RPE/.test(rx)) { const nx = p.getByRole('button', { name: /^(Skip|Next)/ }).first(); if (await nx.count()) await nx.click().catch(() => {}); await p.waitForTimeout(400); } }
    ok(/RPE 7 \(effort 7 of 10/.test(rx), '3: the player explains RPE (' + rx + ')');
    const pl = await p.evaluate(OVERFLOW, '#player');
    ok(!pl.doc && !pl.bad.length, '3: the longer target still fits the player at 1.5× (' + pl.bad.join(', ') + ')');
    await o.b.close();
  }

  // ---- 5. Jumping to a later week keeps the rotation: A was done, so B is next ----
  {
    const o = await boot(clone(RAVI), { textScale: 1.5, timezoneId: 'Asia/Kolkata', at: '2026-11-14T07:00:00+05:30' }), p = o.page;
    ok(await p.evaluate(() => window.__isoTest.nextDayIdx()) === 1, '5: in week 3 with Full Body A done, B is next');
    await p.click('#weekBtn'); await p.waitForTimeout(300);
    await p.click('#sheet [data-w="6"]'); await p.waitForTimeout(400);
    const conf = p.locator('#sheet').getByRole('button', { name: /Yes|Jump|Go to|Move/ }).first(); if (await conf.count()) { await conf.click(); await p.waitForTimeout(300); }
    if (await p.locator('#sheet').isVisible().catch(() => false)) { await p.click('#sheetClose').catch(() => {}); await p.waitForTimeout(300); }
    const t = await p.evaluate(() => ({ w: window.__isoTest.store().week, i: window.__isoTest.nextDayIdx(), start: [...document.querySelectorAll('#train [data-start]')].map(b => b.dataset.start + ':' + b.textContent.trim()).join(' | '), txt: document.getElementById('train').innerText.replace(/\s+/g, ' ').slice(0, 400) }));
    ok(t.w === 6 && t.i === 1 && /f2/.test(t.start) && !/Full Body A/.test(t.txt.split('Full Body B')[0] || ''), '5: after jumping to week 6, Today offers Full Body B (' + t.start + ')');
    // a fully done week still starts the next one at A; a half-done day comes first
    const r = await p.evaluate(() => { const T = window.__isoTest, st = T.store(), d0 = st.done, w0 = st.week, out = []; st.week = 4; st.done = { w3f1am: 1, w3f1pm: 1, w3f2am: 2, w3f2pm: 2, w3f3am: 3, w3f3pm: 3 }; out.push(T.nextDayIdx()); st.done = { w3f1am: 1, w3f1pm: 1, w4f2am: 5, w4f2pm: 5 }; out.push(T.nextDayIdx()); st.done = { w4f3am: 9 }; out.push(T.nextDayIdx()); st.done = d0; st.week = w0; return out; });
    ok(r[0] === 0 && r[1] === 2 && r[2] === 2, '5: after C comes A; after B comes C; a started day comes first (' + r + ')');
    ok(!o.errs.length, '5: no errors ' + o.errs.join(' | '));
    await o.b.close();
  }

  // ---- 7. Gap line, Help colours, Guide order, coverage table at large text ----
  for (const [w, z] of [[360, 1.5], [412, 1.5], [360, 2], [412, 2]]) {
    const o = await boot(clone(RAVI), { viewport: { width: w, height: 860 }, textScale: z }), p = o.page;
    const gap = await p.evaluate(() => { const el = document.querySelector('#train .bm-gaps p'); if (!el) return null; const words = el.textContent.trim().split(/\s+/).length, rg = document.createRange(); rg.selectNodeContents(el); const tops = new Set([...rg.getClientRects()].map(r => Math.round(r.top))); return { words, lines: tops.size, w: el.clientWidth }; });
    ok(gap && gap.words / gap.lines >= 2.5, '7: ' + w + 'px ×' + z + ': the gap line is not one word per line (' + JSON.stringify(gap) + ')');
    if (w === 412 && z === 1.5 && process.env.SHOTS) { await p.evaluate(() => document.querySelector('#train .bm-gaps').scrollIntoView({ block: 'center' })); await p.screenshot({ path: process.env.SHOTS + '/r13c-gap.png' }); }
    await p.click('#tab-progress'); await p.waitForTimeout(250);
    const mt = p.locator('#pt-muscles'); if (await mt.count()) { await mt.click(); await p.waitForTimeout(250); }
    const cov = await p.evaluate(() => { const s = document.getElementById('covScroll'), d = document.querySelector('#cov thead th.cv-done'), dl = document.querySelector('#cov .cv-dl'); return { sw: s.scrollWidth, cw: s.clientWidth, doneIn: d.getBoundingClientRect().right <= s.getBoundingClientRect().right + 1, cue: !document.getElementById('covCue').hidden, days: dl && getComputedStyle(dl).display !== 'none' ? dl.textContent : '' }; });
    ok(cov.sw <= cov.cw + 1 && cov.doneIn && !cov.cue, '7: ' + w + 'px ×' + z + ': the coverage table fits, Done on screen (' + cov.sw + '/' + cov.cw + ')');
    ok(/^Day 1: \d+, Day 2: \d+, Day 3: \d+$/.test(cov.days), '7: ' + w + 'px ×' + z + ': the per-day sets are still shown, under each area (' + cov.days + ')');
    if (w === 412 && z === 1.5 && process.env.SHOTS) { await p.evaluate(() => document.getElementById('cov').closest('.card').scrollIntoView()); await p.screenshot({ path: process.env.SHOTS + '/r13c-cov.png' }); }
    ok(!o.errs.length, '7: no errors ' + o.errs.join(' | '));
    await o.b.close();
  }
  {
    const o = await boot(clone(RAVI)), p = o.page;
    await p.click('#train [data-tool="help"]'); await p.waitForTimeout(300);
    const h = await p.evaluate(() => ({ col: [...document.querySelectorAll('#sheetBody .help-q')].find(d => /colours/.test(d.textContent)).textContent, guide: [...document.querySelectorAll('#sheetBody .help-guide .srch-r')].map(b => b.textContent.trim()) }));
    ok(/Hatching/.test(h.col) && /today/.test(h.col), '7: the Help colours answer explains hatching for today (' + h.col.slice(-90) + ')');
    const i2 = h.guide.indexOf('Why two short sessions');
    ok(i2 >= h.guide.length - 4 && i2 > 3, '7: one session a day: "Why two short sessions" moves to the end of the Guide (' + i2 + ' of ' + h.guide.length + ')');
    ok(h.guide.indexOf('Never hold your breath') < 3 && h.guide.indexOf('The pain rule') < 3, '7: high BP and sore knees: breathing and the pain rule come first (' + h.guide.slice(0, 4) + ')');
    await o.b.close();
    const two = clone(RAVI); two.profile.split = 'two'; two.profile.issues = [];
    const o2 = await boot(two), p2 = o2.page;
    await p2.click('#train [data-tool="help"]'); await p2.waitForTimeout(300);
    const g2 = await p2.evaluate(() => [...document.querySelectorAll('#sheetBody .help-guide .srch-r')].map(b => b.textContent.trim()));
    ok(g2.indexOf('Why two short sessions') === 1, '7: two sessions a day: the topic keeps its place (' + g2.indexOf('Why two short sessions') + ')');
    await o2.b.close();
  }

  // ---- Fatima: tablet 800×1280, osteopenia, home, Full Body A/B/C ----
  {
    const o = await boot(clone(FATIMA), { viewport: { width: 800, height: 1280 }, init: FAKE_SPEECH, timezoneId: 'Europe/London', at: '2027-01-06T09:30:00Z' }), p = o.page;
    // F1 + F2: the sheet heading names her day; the Wall Sit hold tab has no Reverse Nordic falls note, the reps tab does
    await p.click('#tab-exercises'); await p.waitForTimeout(250);
    for (const id of ['goblet-squat', 'wall-sit']) {
      await p.click('#lib [data-ex="' + id + '"]'); await p.waitForTimeout(300);
      const t = await p.textContent('#sheetTitle');
      ok(/^Day [1-3], Full Body [ABC]$/.test(t), 'F1: ' + id + ' sheet heading is her own plan day (' + t + ')');
      if (id === 'wall-sit') {
        const hold = await p.evaluate(() => (document.querySelector('#dBody .d-safe') || {}).textContent || '');
        await p.click('#sheetBody .seg [data-p="rep"]'); await p.waitForTimeout(250);
        const rep = await p.evaluate(() => (document.querySelector('#dBody .d-safe') || {}).textContent || '');
        ok(!/Falls|lean back/i.test(hold), 'F2: the Wall Sit hold tab has no falls note (' + hold + ')');
        ok(/Falls/.test(rep), 'F2: the falls note is on the Reverse Nordic reps tab (' + rep.slice(0, 60) + ')');
      }
      // F7: the "Step" badge names the key pose the drawing is closest to
      if (id === 'goblet-squat') {
        const bad = await p.evaluate(() => { const T = window.__isoTest, ex = T.V('goblet-squat', 'h'), R = ex._r; const d = (a, b) => { let s = 0; for (const k in b) { if (k[0] === '_') continue; const x = a[k], y = b[k]; if (typeof y === 'number' && typeof x === 'number') s += Math.abs(x - y); else if (Array.isArray(y) && Array.isArray(x)) y.forEach((v, i) => { if (typeof v === 'number' && typeof x[i] === 'number') s += Math.abs(x[i] - v); }); } return s; };
          let n = 0, wrong = 0; for (let t = 0; t < 8; t += 0.04) { const r = T.seq(ex, t); if (r[2]) continue; n++; const ds = R.slice(0, 3).map(k => d(r[0], k)), best = ds.indexOf(Math.min.apply(null, ds)); if (best !== r[1] && ds[r[1]] > ds[best] * 1.5 + 10) wrong++; } return { n, wrong }; });
        ok(bad.n > 20 && bad.wrong <= bad.n * 0.05, 'F7: the step badge matches the pose shown (' + bad.wrong + ' of ' + bad.n + ' frames off)');
      }
      await p.click('#sheetClose'); await p.waitForTimeout(200);
    }
    // F3: the warm-up in a home session is marching on the spot, not an outdoor walk
    const wu = await p.evaluate(() => { const T = window.__isoTest, q = T.buildQueue(T.allDays()[1], 'all', T.phaseOf(6)); return q.filter(it => it.kind === 'cardio').map(it => it.ex.name + ': ' + it.txt); });
    ok(wu.length && !wu.some(x => /Outdoor/i.test(x)) && wu.some(x => /^March on the spot/.test(x)), 'F3: home warm-up is "March on the spot" (' + wu.join(' | ') + ')');
    // F4: "back pain 3/10" after "twinges on the swing" names the Swing
    await p.click('#tab-train'); await p.waitForTimeout(200);
    await p.locator('[data-tool="search"]:visible').first().click(); await p.waitForTimeout(400);
    // F8: the Guide snippet keeps its first letter
    await p.fill('#cIn', 'heel'); await p.waitForTimeout(600);
    const sn = await p.evaluate(() => { const o = document.getElementById('cSrch'); return o ? o.innerText : ''; });
    ok(/If one tendon/.test(sn) && !/(^|\s)f one tendon/.test(sn), 'F8: the Guide snippet starts with its first letter (' + (sn.match(/.{0,12}one tendon.{0,10}/) || [''])[0] + ')');
    const say = async t => { await p.fill('#cIn', t); await p.press('#cIn', 'Enter'); await p.waitForTimeout(900); };
    await say('my lower back twinges a bit on the swing'); await say('back pain 3/10');
    const card = await p.evaluate(() => { const f = window.__isoTest.feed(); return JSON.stringify(f[f.length - 1]); });
    ok(/Swing/.test(card) && /3\/10/.test(card), 'F4: the pain advice names the Swing she mentioned (' + card.slice(0, 200) + ')');
    await p.evaluate(() => { const c = document.getElementById('sheetClose'); if (c && c.offsetParent) c.click(); document.getElementById('tab-train').click(); window.scrollTo(0, 0); }); await p.waitForTimeout(400);
    // F5 + F6: week tiles read "Week 3"; each day's summary is its own
    await p.click('#weekBtn'); await p.waitForTimeout(300);
    const wk = await p.evaluate(() => ({ tiles: [...document.querySelectorAll('#sheet .weeks button')].map(b => b.innerText.replace(/\s+/g, ' ').trim()), sums: [...document.querySelectorAll('#sheet .wkdays button .t b')].map(b => b.textContent) }));
    ok(wk.tiles.length === 12 && wk.tiles.every(t => /^Week \d+/.test(t)) && !wk.tiles.some(t => /\d+\/12/.test(t)), 'F5: week tiles say "Week N", no "3/12" (' + wk.tiles.slice(0, 3).join(' | ') + ')');
    ok(wk.sums.length === 3 && new Set(wk.sums).size === 3, 'F6: Full Body A, B and C have different summaries (' + wk.sums.join(' | ') + ')');
    await p.click('#sheetClose'); await p.waitForTimeout(200);
    // F5: Backup says "This device"; the diet list has Halal
    await p.locator('[data-tool="profile"]:visible, #profBtn:visible').first().click(); await p.waitForTimeout(400);
    const you = await p.evaluate(() => document.getElementById('sheetBody').innerText);
    ok(/Halal/.test(you), 'F5: the diet list offers Halal');
    await p.click('#pfTab-backup'); await p.waitForTimeout(300);
    const bk = await p.evaluate(() => document.getElementById('sheetBody').innerText);
    ok(/This device/.test(bk) && !/this phone/i.test(bk), 'F5: Backup says "This device" (' + (bk.match(/This \w+: [^\n]{0,30}/) || [''])[0] + ')');
    await p.click('#sheetClose'); await p.waitForTimeout(200);
    // F7: on the upright tablet the session figure spans the width and a good part of the height
    const ta = p.getByRole('button', { name: /Train anyway/ }).first(); if (await ta.count() && await ta.isVisible()) { await ta.click(); await p.waitForTimeout(300); }
    await p.locator('#train [data-start]:visible').first().click(); await p.waitForTimeout(800);
    const fig = await p.evaluate(() => { const r = document.querySelector('.p-fig svg').getBoundingClientRect(); return { w: r.width / innerWidth, h: r.height / innerHeight }; });
    ok(fig.w > 0.85 && fig.h > 0.35, 'F7: the session figure is big on the tablet (' + fig.w.toFixed(2) + ' wide, ' + fig.h.toFixed(2) + ' high)');
    if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/r13c-tablet-player.png' });
    ok(!o.errs.length, 'Fatima: no errors ' + o.errs.join(' | '));
    await o.b.close();
  }

  srv.close();
  console.log('test-r13c: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
