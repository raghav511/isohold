// Round 14: the body map counts this calendar week's sets against the sessions finished this week (a program week can
// span two calendar weeks, and finishing a week moves store.week on), plus voice undo in the player, chips from current
// data, "cancel", units in hints, gaps vs parts left out of the plan, pain advice with no lighter weight, and wording fixes.
const { serve, open, FAKE_SPEECH } = require('./lib');
const fs = require('fs');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = +(process.env.PORT || 8826), URL = `http://localhost:${PORT}/index.html`;
const T = (page, f, a) => page.evaluate(f, a);
const fx = n => JSON.parse(fs.readFileSync(__dirname + '/fixtures/' + n + '.json', 'utf8'));
const J = JSON.stringify;
async function boot(st, o) {
  const r = await open((o && o.kind) || 'android', Object.assign({ state: st, init: FAKE_SPEECH }, o || {}));
  if (o && o.time) await r.page.clock.install({ time: new Date(o.time) });
  await r.page.goto(URL); await r.page.waitForFunction(() => window.__isoholdReady);
  return r;
}
const mapLab = p => T(p, () => document.querySelector('#bodyCard svg').getAttribute('aria-label'));
const mapState = p => T(p, () => { const t = window.__isoTest, w = t.bodyWeek(), k = Object.keys(t.BM_NAME); return { on: k.filter(r => w[r] === 'on').length, part: k.filter(r => w[r] === 'part').length, w, week: t.store().week }; });

(async () => {
  const srv = await serve(PORT);
  let b, page, errs;

  // ---- 1. Mei, Fri 27 Nov: 10 of 12 week-2 sessions done, ~100 sets logged Tue to Thu ----
  {
    ({ b, page, errs } = await boot(fx('mei-r14'), { kind: 'iphone', time: '2026-11-27T20:30:00', reducedMotion: true }));
    await page.getByRole('button', { name: 'Not now' }).click({ timeout: 800 }).catch(() => {});
    const c = await T(page, () => { const t = window.__isoTest, s = t.store(), ws = t.weekStart(); return { n: s.log.filter(l => l.t >= ws).length, done: t.covDone(), sp: t.sessPlan() }; });
    ok(c.n > 90, 'setup: ' + c.n + ' sets logged this calendar week');
    // every set she did counts, per region, with the same region table the plan uses: done = the plan of the sessions she finished
    const miss = Object.keys(c.sp).filter(r => Math.abs((c.done[r] || 0) - c.sp[r]) > 0.01);
    ok(!miss.length, 'done sets per region = planned sets of the sessions finished this week: ' + miss.map(r => r + ' ' + c.done[r] + '/' + c.sp[r]).join(', '));
    const m0 = await mapState(page), lab0 = await mapLab(page);
    ok(m0.on >= 10, 'most parts fully trained after 4 days of sessions (' + m0.on + ' of 16, ' + m0.part + ' partly)');
    ok(!/Nothing trained yet/.test(lab0), 'no "Nothing trained yet" (' + lab0.slice(0, 120) + ')');
    const sr0 = await T(page, () => document.getElementById('bodyCard').innerText);
    ok(!/\b0% fully trained/.test(sr0) && /(\d+)% fully trained/.test(sr0) && +sr0.match(/(\d+)% fully trained/)[1] >= 60, 'the percentage reflects her week (' + (sr0.match(/\d+% fully trained/) || [])[0] + ')');
    // finishing today's sessions moves her to program week 3: this calendar week's map stays
    await page.getByRole('button', { name: /Mark morning as done/ }).first().click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Mark evening as done/ }).first().click(); await page.waitForTimeout(400);
    const m1 = await mapState(page), lab1 = await mapLab(page);
    ok(m1.week === 3, 'setup: on program week 3 now (' + m1.week + ')');
    ok(m1.on >= m0.on && J(Object.keys(m0.w).filter(r => m0.w[r] === 'on')) === J(Object.keys(m1.w).filter(r => m1.w[r] === 'on')), 'advancing the program week keeps this calendar week\'s map (' + m0.on + ' → ' + m1.on + ')');
    ok(!/Today’s session trains/.test(lab1), 'day done: the map no longer describes today\'s session as upcoming (' + lab1.slice(-160) + ')');
    ok(!errs.length, 'no page errors (1) ' + errs); await b.close();
  }

  // ---- 2. "None fully trained yet" when only partly trained; "Nothing trained yet" only for an empty week ----
  {
    const st = { week: 1, done: {}, tests: {}, wt: {}, log: [], eq: ['d'], cust: {}, food: [], body: [], notes: [], profile: { units: 'kg', bw: 70, age: 35, sex: 'm', where: 'home', issues: [], days: 3, split: 'one' } };
    ({ b, page, errs } = await boot(st));
    ok(/Nothing trained yet/.test(await mapLab(page)), 'empty week: "Nothing trained yet"');
    await b.close();
    ({ b, page, errs } = await boot(Object.assign({}, st, { log: [{ t: Date.now() - 60e3, w: 1, id: 'floor-press', eq: 'd', k: 'r', kg: 8, v: 10, x: 1 }] })));
    const lab = await mapLab(page);
    ok(/None fully trained yet/.test(lab) && !/Nothing trained yet/.test(lab), 'one set of several: "None fully trained yet. Partly: …" (' + lab.slice(0, 120) + ')');
    ok(!errs.length, 'no page errors (2) ' + errs); await b.close();
  }

  // ---- 3. Chips from current data; "cancel" takes back a meal ----
  {
    ({ b, page, errs } = await boot(fx('mei-r14'), { time: '2026-11-27T12:30:00' }));
    await page.locator('[data-tool="search"]:visible').first().click(); await page.waitForTimeout(300);
    for (const t of ['I weigh 64 kg', 'no', 'I weigh 64 kg', 'yes', 'undo']) { await T(page, t => window.__isoTest.handle(t), t); await page.waitForTimeout(80); }
    let chips = await page.locator('#cSugs').innerText();
    ok(!/64 kg/.test(chips), 'an undone / rejected weigh-in is never offered as a chip (' + chips.replace(/\n/g, ' | ') + ')');
    ok(await T(page, () => Math.abs(window.__isoTest.store().body.slice(-1)[0].kg - 64) > 1), 'setup: 64 kg was undone');
    for (const t of ['I weigh 53.5 kg', 'I weigh 53.5 kg']) { await T(page, t => window.__isoTest.handle(t), t); await page.waitForTimeout(80); }
    chips = await page.locator('#cSugs').innerText();
    ok(/53\.5 kg/.test(chips) && !/64 kg/.test(chips), 'her real weight, said twice, is offered (' + chips.replace(/\n/g, ' | ') + ')');
    const f0 = await T(page, () => window.__isoTest.store().food.length);
    await T(page, () => window.__isoTest.handle('white fish and rice for lunch')); await page.waitForTimeout(100);
    const f1 = await T(page, () => window.__isoTest.store().food.length);
    await T(page, () => window.__isoTest.handle('cancel')); await page.waitForTimeout(100);
    const f2 = await T(page, () => window.__isoTest.store().food.length), last = await T(page, () => window.__isoTest.feed().slice(-1)[0].x || '');
    ok(f1 === f0 + 1 && f2 === f0, '"cancel" right after a meal takes it back (' + f0 + ' → ' + f1 + ' → ' + f2 + ')');
    ok(/^Undone: /.test(last), '"cancel" says what it undid (' + last + ')');
    // the fasting question about heel drops gets its own answer
    const fa = await T(page, () => window.__isoTest.localAnswer('can I do heel drops while fasting?'));
    ok(/Heel drops and impact work while fasting/.test(fa || '') && /dizzy/.test(fa), 'heel drops while fasting: a specific answer (' + String(fa).slice(0, 80) + ')');
    const gen = await T(page, () => window.__isoTest.localAnswer('I\'m fasting for Ramadan next month. When should I train?'));
    ok(/Training while fasting/.test(gen || ''), 'the general fasting answer is unchanged');
    ok(!errs.length, 'no page errors (3) ' + errs); await b.close();
  }

  // ---- 4. Fatima, hands-free: undo / cancel / no / undo last set by voice; march labels; rest names the next exercise; own weights in the hint ----
  {
    ({ b, page, errs } = await boot(fx('fatima-r14'), { viewport: { width: 800, height: 1280 }, timezoneId: 'Europe/London', time: '2027-01-09T09:00:00Z' }));
    const cmds = await T(page, () => ['undo', 'cancel', 'no', 'undo last set', 'Undo.', 'cancel that'].map(x => (window.__isoTest.parsePlayerCmd(x) || [])[0]));
    ok(cmds.every(c => c === 'undo'), 'undo, cancel, no, undo last set are the player\'s undo (' + cmds + ')');
    await page.click('[data-start][data-part="all"]'); await page.waitForTimeout(400);
    await page.click('#pMic'); await page.waitForTimeout(200);
    const tx = id => page.evaluate(id => (document.getElementById(id) || {}).textContent || '', id);
    const nx0 = await tx('pNext');
    ok(/March on the spot/.test(nx0) && !/Walk/.test(nx0), 'heel drops screen names the march, not a walk (' + nx0 + ')');
    // nothing logged yet: undo says so
    await T(page, () => window.__speak('undo')); await page.waitForTimeout(200);
    let sp = await T(page, () => window.__spoken.slice(-1)[0]);
    ok(/Nothing to undo/.test(sp), '"undo" with nothing logged: "Nothing to undo yet" (' + sp + ')');
    const phases = new Set(); let restCue = '', restNext = '';
    for (let i = 0; i < 80; i++) {
      const ph = await tx('pPhase'); phases.add(ph);
      if (/^Rest|^Move to next/.test(ph) && await T(page, () => window.__isoTest.store().log.length) > 318) { restCue = await tx('pAngle'); restNext = await tx('pName'); break; }
      await page.clock.runFor(4000);
    }
    ok([...phases].some(p => /^March, easy/.test(p)) && ![...phases].some(p => /^Walk/.test(p)), 'phase labels follow the indoor march (' + [...phases].join(' / ') + ')');
    ok(restCue && !/start position/.test(restCue) && /Next: \S/.test(restCue), 'rest banner names what\'s next (' + restCue + ' | ' + restNext + ')');
    const n0 = await T(page, () => window.__isoTest.store().log.length);
    await T(page, () => window.__speak('undo')); await page.waitForTimeout(200);
    const n1 = await T(page, () => window.__isoTest.store().log.length); sp = await T(page, () => window.__spoken.slice(-1)[0]);
    ok(n1 === n0 - 1 && /^Undone: /.test(sp), 'voice "undo" during the rest takes back the set and says so (' + n0 + ' → ' + n1 + ', "' + sp + '")');
    await T(page, () => window.__speak('cancel')); await page.waitForTimeout(200);
    sp = await T(page, () => window.__spoken.slice(-1)[0]);
    ok(/Nothing to undo/.test(sp) && await T(page, () => window.__isoTest.store().log.length) === n1, '"cancel" then: nothing left to undo, said out loud (' + sp + ')');
    await T(page, () => window.__speak('blah blah')); await page.waitForTimeout(150);
    const hint = await tx('pHeard');
    ok(/undo/.test(hint) && !/16 kg/.test(hint) && /\b[468] kg\b/.test(hint), 'the hint uses a weight she owns (' + hint + ')');
    await T(page, () => { window.__isoTest.store().profile.units = 'lb'; }); await T(page, () => window.__speak('blah')); await page.waitForTimeout(150);
    const hintLb = await tx('pHeard');
    ok(/ lb\b/.test(hintLb) && !/kg/.test(hintLb), 'a pounds user hears pounds (' + hintLb + ')');
    ok(!errs.filter(e => !/AudioContext/.test(e)).length, 'no page errors (4) ' + errs); await b.close();
  }

  // ---- 5. Chin tuck: gentle rep wording ----
  {
    ({ b, page, errs } = await boot(fx('fatima-r14'), { viewport: { width: 800, height: 1280 }, timezoneId: 'Europe/London' }));
    await page.click('#tab-exercises'); await page.waitForTimeout(300);
    await page.getByText('Neck Hold', { exact: true }).first().click(); await page.waitForTimeout(400);
    const tabs = page.locator('#sheet [role=tab]:visible');
    if (await tabs.count() > 1) { await tabs.nth(1).click(); await page.waitForTimeout(300); }
    const d = await page.locator('#sheet').innerText();
    ok(/Chin Tuck/.test(d) && !/short of failure/.test(d) && !/drive up/.test(d) && /never to failure/.test(d) && /nod back/i.test(d), 'chin tuck: slow nod back, never to failure (' + (d.match(/Week \d+:[^\n]*/) || [''])[0] + ')');
    ok(!errs.length, 'no page errors (5) ' + errs); await b.close();
  }

  // ---- 6. Dev (pounds): no rounding drift; Heaviest without the set count ----
  {
    const st = { week: 2, done: {}, tests: {}, wt: {}, log: [], eq: ['d', 'b', 'c'], cust: {}, food: [], body: [{ t: Date.now() - 3 * 864e5, kg: 89.6 }], notes: [], profile: { units: 'lb', bw: 89.6, age: 29, sex: 'm', cm: 178, where: 'gym', issues: [], days: 4, split: 'one' } };
    ({ b, page, errs } = await boot(st));
    await T(page, () => window.__isoTest.handle('I weigh 197.4 lb')); await page.waitForTimeout(100);
    const c = await T(page, () => window.__isoTest.handle('pullups bw+45 x5 x3'));
    const txt = await T(page, () => JSON.stringify(window.__isoTest.feed().slice(-3)));
    ok(/197\.4 lb/.test(txt) && !/197\.5/.test(txt), 'reply uses 197.4 lb, the weight just logged');
    await page.click('#tab-progress'); await page.waitForTimeout(200);
    const all = await page.locator('main').innerText();
    const hv = (all.match(/Heaviest: [^·\n]*/) || [''])[0];
    ok(/Heaviest: bodyweight \+ 45 lb × 5/.test(hv) && !/Heaviest: 3 ×/.test(hv), 'Heaviest has no set count (' + hv + ')');
    ok(!errs.length, 'no page errors (6) ' + errs); await b.close();
  }

  // ---- 7. Ravi: parts left out of his plan aren't gaps; pain advice for his only dumbbell; the drawing stays visible at 1.5× text ----
  {
    ({ b, page, errs } = await boot(fx('ravi-r14'), { textScale: 1.5, timezoneId: 'Asia/Kolkata', time: '2026-11-14T07:00:00+05:30' }));
    const bc = await page.locator('#bodyCard').innerText();
    const gl = (bc.match(/\d+ gaps?:[^\n]*/) || [''])[0];
    ok(/Left out of your plan for your knees[^:]*: [^\n]*chest/.test(bc), 'parts his plan has no sets for are named apart (' + (bc.match(/Left out[^\n]*/) || [''])[0] + ')');
    ok(!/chest|abs\b/.test(gl), 'and aren\'t counted as gaps (' + gl + ')');
    const lab = await mapLab(page); ok(/Left out of your plan/.test(lab) && !/Gaps:[^.]*chest/.test(lab), 'map label too');
    const ph = await T(page, () => window.__isoTest.painHow('wall-sit', 'h', 'knee', 5));
    ok(!/20% lighter/.test(ph) && /without weight|less range|shorten/.test(ph), 'only 3 kg dumbbells: no "go 20% lighter" (' + ph + ')');
    // a session with knee pain: no double full stop
    await page.locator('[data-tool="search"]:visible').first().click(); await page.waitForTimeout(200);
    await T(page, () => window.__isoTest.handle('my knee hurts 5 out of 10')); await page.waitForTimeout(100);
    await page.goto(URL); await page.waitForFunction(() => window.__isoholdReady); await page.clock.runFor(500);
    await page.getByRole('button', { name: /^Start/ }).first().click(); await page.clock.runFor(800);
    const sk = page.getByRole('button', { name: /Skip warm-up/ }).first(); if (await sk.count()) { await sk.click(); await page.clock.runFor(1500); }
    let rx = '', geo = null, seenPain = '';
    for (let i = 0; i < 60; i++) {
      rx = await T(page, () => document.getElementById('pRx').textContent);
      if (/\/10:/.test(rx) && !seenPain) seenPain = rx;
      if (/^Hold/.test(await T(page, () => document.getElementById('pPhase').textContent)) && !geo) geo = await T(page, () => { const r = id => document.getElementById(id).getBoundingClientRect(); return { svgB: Math.round(r('pSvg').bottom), svgH: Math.round(r('pSvg').height), ctrlT: Math.round(r('pPrev').top) }; });
      if (seenPain && geo) break;
      await page.clock.runFor(5000);
    }
    ok(seenPain && !/\.\./.test(seenPain) && !/20% lighter/.test(seenPain), 'pain line in the session: no "..", no 20% lighter (' + seenPain.slice(-120) + ')');
    ok(geo && geo.svgH > 60 && geo.svgB <= geo.ctrlT + 2, 'at 1.5× text the hold drawing sits above the controls (' + J(geo) + ')');
    ok(!errs.filter(e => !/AudioContext/.test(e)).length, 'no page errors (7) ' + errs); await b.close();
  }

  // ---- 8. Chloe: first weights not below the standard start; under 2 kg = bodyweight ----
  {
    ({ b, page, errs } = await boot(fx('chloe-r14')));
    const s = await T(page, () => { const t = window.__isoTest; return { lr: t.sugFor('lateral-raise', 'h', 'd'), lrr: t.sugFor('lateral-raise', 'r', 'd'), ho: t.sugFor('hollow', 'h', 'd'), cr: t.sugFor('calf-raise', 'r', 'd') }; });
    ok(s.lr.v >= 3 && s.lrr.v >= 3, 'lateral raise from her pulldown: ' + s.lr.v + ' / ' + s.lrr.v + ' kg, not 2');
    ok(s.ho.v === 0, 'hollow hold: bodyweight, not 1 kg (' + s.ho.v + ')');
    ok(Object.values(s).every(x => !x || x.v === 0 || x.v >= x.stdSnap), 'nothing below its standard start ' + J(s));
    ok(!errs.length, 'no page errors (8) ' + errs); await b.close();
  }

  srv.close();
  console.log(`test-r14a: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
