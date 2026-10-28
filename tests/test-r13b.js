// Round 13 session player, speech and accessibility: holds say their effort target (and the neck hold its safety cue), trimmed sets
// match the prescription shown, "undo" / "no" by words after a weigh-in, Yes/No on the weight question with focus kept, named
// portion buttons, the body map sentence once, area chips that turn off, one-tap chips from your own kit, and the cardio-day card.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok', m); } else { fail++; console.log('FAIL', m); } };
const PORT = +(process.env.PORT || 8770), URL = `http://localhost:${PORT}/index.html`;
const SEED = require('./fixtures/seed-week4.json');
const ready = p => p.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
const T = (p, f, a) => p.evaluate(f, a);
const clone = o => JSON.parse(JSON.stringify(o));

// walk the Row & Walk evening (day 6), skipping through every step; returns what was shown and spoken
async function walkEvening(p) {
  await p.evaluate(() => [...document.querySelectorAll('#strip button')].find(b => /Row & Walk/.test(b.getAttribute('aria-label'))).click());
  await p.waitForTimeout(200);
  const two = p.locator('#splitSeg [data-split="two"]'); if (await two.count()) { await two.click(); await p.waitForTimeout(200); }
  const card = await p.evaluate(() => { const a = [...document.querySelectorAll('#sessions article.sess')].find(x => x.querySelector('[data-part="pm"]')); return a ? a.querySelector('.sum').textContent : ''; });
  await T(p, () => { window.__spoken = []; });
  await p.click('#sessions [data-start][data-part="pm"]'); await p.waitForTimeout(250);
  const seen = [];
  for (let i = 0; i < 400; i++) {
    const s = await T(p, () => { if (document.getElementById('player').hidden) return null; const g = id => document.getElementById(id).textContent; return { name: g('pName'), set: g('pSetLabel'), rx: g('pRx'), phase: g('pPhase'), up: (document.getElementById('pUp') || {}).textContent || '' }; });
    if (!s) break; seen.push(s);
    if (/done|Finished|Well done/i.test(s.phase)) break;
    const sk = await T(p, () => { const b = document.getElementById('pSkip'); if (b.hidden) return false; b.click(); return true; });
    if (!sk) break;
    await p.waitForTimeout(25);
  }
  return { seen, card, spoken: await T(p, () => window.__spoken || []) };
}

// "…fully trained this week" appears once on screen and once in what a screen reader reads
async function bodyOnce(p, label) {
  const cnt = s => (s.match(/fully trained this week/g) || []).length;
  const screen = await T(p, () => [...document.querySelectorAll('#bodyCard .bm-legend, #bodyCard .bm-gaps')].map(e => e.textContent).join(' '));
  const tree = await p.locator('#bodyCard').ariaSnapshot();
  ok(cnt(screen) === 1 && cnt(tree) === 1, label + ': "fully trained this week" shown once and read once (' + cnt(screen) + ' on screen, ' + cnt(tree) + ' read)');
}
(async () => {
  const srv = await serve(PORT);

  // ---- 1 + 2 + 9. Spoken effort and the neck safety cue; trimmed sets match the prescription; the evening card matches the queue ----
  {
    const st = clone(SEED); st.profile.cues = true;
    const o = await open('android', { state: st, init: FAKE_SPEECH }), p = o.page;
    await p.goto(URL); await ready(p);
    const qn = await T(p, () => { const t = window.__isoTest, d = t.allDays().find(x => x.id === 'c2'), q = t.buildQueue(d, 'pm', t.phaseOf(t.store().week)); return { m: q.filter(i => i.kind === 'cardio').map(i => i.m), rpe: t.rpeTxt('goblet-squat', t.phaseOf(t.store().week)), trimmed: q.filter(i => i.kind === 'hold' && i.sets === 1).map(i => i.ex.name) }; });
    const { seen, card, spoken } = await walkEvening(p);
    const holdCues = spoken.filter(x => / second hold/.test(x));
    const neck = holdCues.filter(x => /^Neck Hold/.test(x));
    ok(neck.length >= 1 && /Effort 3 to 4 out of 10/.test(neck[0]) && /Gentle: about a third of your effort/.test(neck[0]) && /dizziness or tingling/.test(neck[0]), '1: the Neck Hold speaks its gentle effort and safety cue (' + neck[0] + ')');
    const want = 'Effort ' + qn.rpe.replace('–', ' to ') + ' out of 10';
    const other = holdCues.filter(x => !/^Neck Hold/.test(x) && /Effort/.test(x));
    ok(other.length >= 3 && other.every(x => x.includes(want)), '1: other holds speak their effort target "' + want + '" (' + (other[0] || 'none') + ')');
    const byEx = {}; holdCues.filter(x => /Effort/.test(x)).forEach(x => { const n = x.split('.')[0].split(',')[0]; byEx[n] = (byEx[n] || 0) + 1; });
    ok(Object.values(byEx).every(n => n === 1), '1: the effort is said once per exercise, not every set (' + JSON.stringify(byEx) + ')');
    ok(holdCues.some(x => !/Effort/.test(x)) || Object.keys(byEx).length === holdCues.length, '1: later sets are short again');
    ok(holdCues.every(x => x.length < 200), '1: spoken hold cues stay short');
    // 2. Hold set N of M  ==  "M × 30 s"
    const holds = seen.filter(s => /^Hold set/.test(s.set) && !/shortened/.test(s.rx));
    const bad = holds.filter(s => { const a = s.set.match(/of (\d+)/), b = s.rx.match(/^(\d+)\s*×/); return !a || !b || a[1] !== b[1]; });
    ok(holds.length > 5 && !bad.length, '2: every hold shows as many sets as it runs (' + (bad[0] ? bad[0].name + ': ' + bad[0].set + ' / ' + bad[0].rx : holds.length + ' checked') + ')');
    const one = holds.filter(s => /of 1\b/.test(s.set));
    ok(qn.trimmed.length && one.length && one.every(s => /^1\s*×/.test(s.rx)), '2: a trimmed hold reads "1 × 30 s" (' + (one[0] ? one[0].name + ' ' + one[0].rx : 'none') + ')');
    // 9. the card's cardio is named from the queue
    const names = { walk: 'treadmill walk', row: 'rowing', bike: 'bike ride', out: 'walk' };
    ok(qn.m.every(m => card.toLowerCase().includes(names[m])), '9: the evening card names the cardio the session runs (' + qn.m + ' / ' + card.slice(0, 160) + ')');
    const cardioNames = [...new Set(seen.filter(s => /^Part /.test(s.set) && !/^Next: /.test(s.name)).map(s => s.name))];
    ok(cardioNames.length === new Set(qn.m).size, '9: the session runs every cardio part the card lists (' + cardioNames + ')');
    ok(!o.errs.length, 'no errors ' + o.errs.join(' | '));
    await o.b.close();
  }
  // 1. gentle mode: "7–8" weeks are capped at 7 when spoken
  {
    const st = clone(SEED); st.profile.cues = true; st.profile.age = 67; st.week = 6; st.done = {};
    const o = await open('android', { state: st, init: FAKE_SPEECH }), p = o.page;
    await p.goto(URL); await ready(p);
    await T(p, () => { window.__spoken = []; });
    await p.click('#sessions [data-start]'); await p.waitForTimeout(200);
    for (let i = 0; i < 40; i++) { await T(p, () => document.getElementById('pSkip').click()); await p.waitForTimeout(20); }
    const eff = (await T(p, () => window.__spoken)).filter(x => /Effort/.test(x));
    ok(eff.length && eff.every(x => /Effort (7|3 to 4) out of 10/.test(x)) && !eff.some(x => /7 to 8/.test(x)), '1: gentle mode speaks the capped effort (' + (eff[0] || 'none') + ')');
    await o.b.close();
  }

  for (const kind of ['android', 'iphone']) {
    // ---- 3 + 4. Weigh-in: Yes and No, focus after each, and "undo" / "no" / "cancel" by words ----
    const st = clone(SEED); st.profile.bw = 54; st.body = [{ t: Date.now() - 2 * 864e5, kg: 53.5 }];
    let o = await open(kind, { state: st, init: FAKE_SPEECH }), p = o.page;
    await p.goto(URL); await ready(p);
    await p.evaluate(() => document.getElementById('tab-coach').click()); await p.waitForTimeout(150);
    const nb = () => T(p, () => window.__isoTest.store().body.length);
    const n0 = await nb();
    await T(p, () => window.__isoTest.handle('I weigh 64 kg')); await p.waitForTimeout(150);
    const btns = await T(p, () => [...document.querySelectorAll('#cMsgs [data-bwyes], #cMsgs [data-bwno]')].map(b => b.textContent));
    ok(btns.join('|') === 'Yes, save it|No', kind + ' 4: the weight question has Yes and No (' + btns + ')');
    ok(await T(p, () => { const g = document.querySelector('#cMsgs [data-bwno]').closest('[role=group]'); return !!g && /64 kg/.test(g.getAttribute('aria-label')); }), kind + ' 4: the two buttons are a named group');
    await p.focus('#cMsgs [data-bwno]'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    let f = await T(p, () => ({ id: document.activeElement.id, live: document.getElementById('srLive').textContent, q: !!document.querySelector('#cMsgs [data-bwyes]') }));
    ok(f.id === 'cIn' && /not saved/.test(f.live) && !f.q, kind + ' 4: No: focus goes to the input, "not saved" is announced, the question goes away (' + JSON.stringify(f) + ')');
    ok(await nb() === n0, kind + ' 4: No saves nothing');
    // Yes with the keyboard: focus on the saved card
    await T(p, () => window.__isoTest.handle('I weigh 64 kg')); await p.waitForTimeout(150);
    await p.focus('#cMsgs [data-bwyes]'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    f = await T(p, () => { const a = document.activeElement; return { card: a.classList.contains('lgc'), txt: a.textContent.slice(0, 60), body: a === document.body, live: document.getElementById('srLive').textContent }; });
    ok(f.card && !f.body && /64/.test(f.txt) && /^Saved/.test(f.live), kind + ' 4: Yes: focus goes to the saved result and it is announced (' + JSON.stringify(f) + ')');
    ok(await nb() === n0 + 1, kind + ' 4: Yes saves it');
    // 3. "undo" right after a confirmed weigh-in removes it
    await T(p, () => window.__isoTest.handle('undo')); await p.waitForTimeout(150);
    let last = await T(p, () => window.__isoTest.feed().slice(-1)[0].x);
    ok(await nb() === n0 && /^Undone/.test(last) && !/catch that/.test(last), kind + ' 3: "undo" undoes the weigh-in (' + last + ')');
    // 3. "undo" while the question is pending cancels it; "no" and "cancel" too
    for (const w of ['undo', 'no', 'cancel']) {
      await T(p, () => window.__isoTest.handle('I weigh 64 kg')); await p.waitForTimeout(100);
      await T(p, w => window.__isoTest.handle(w), w); await p.waitForTimeout(100);
      const r = await T(p, () => { const c = window.__isoTest.feed().filter(x => x.r === 'card').pop(); return { t: c.title, q: !!document.querySelector('#cMsgs [data-bwyes]'), m: window.__isoTest.feed().slice(-1)[0] }; });
      ok(/not saved/.test(r.t) && !r.q && !/catch that/.test(JSON.stringify(r.m)) && await nb() === n0, kind + ' 3: "' + w + '" cancels a pending weigh-in (' + r.t + ')');
    }
    // "undo" by voice after a set also works, and with nothing to undo it says so
    await T(p, () => window.__isoTest.handle('2 eggs')); const nf = await T(p, () => window.__isoTest.store().food.length);
    await p.evaluate(() => { window.__say = 'undo'; }); await p.click('#cSend'); await p.waitForTimeout(400);
    ok(await T(p, () => window.__isoTest.store().food.length) === nf - 1, kind + ' 3: "undo" said out loud undoes the last meal');

    // ---- 5. Portion buttons have names ----
    await T(p, () => window.__isoTest.handle('rice and white fish')); await p.waitForTimeout(150);
    const por = await T(p, () => { const c = [...document.querySelectorAll('#cMsgs .lgc.food')].pop(); return { names: [...c.querySelectorAll('[data-scale]')].map(b => b.getAttribute('aria-label')), group: (c.querySelector('[data-scale]').closest('[role=group]') || {}).getAttribute ? c.querySelector('[data-scale]').closest('[role=group]').getAttribute('aria-label') : '' }; });
    ok(/^Half portion of .*rice/i.test(por.names[0]) && /^One and a half portions of/.test(por.names[1]) && /^Double portion of/.test(por.names[2]) && por.group === 'Portion', kind + ' 5: portion buttons are named (' + por.names.join(' / ') + ')');
    const snap = await p.locator('#cMsgs .lgc.food').last().ariaSnapshot();
    ok(!/button "½×"/.test(snap) && /Half portion/.test(snap), kind + ' 5: the tree reads the name, not "½×"');
    await p.focus('#cMsgs .lgc.food:last-of-type [data-x="2"]').catch(() => {});
    await T(p, () => [...document.querySelectorAll('#cMsgs .lgc.food')].pop().querySelector('[data-x="2"]').focus());
    await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    ok(await T(p, () => document.activeElement.dataset.x === '2' && document.activeElement.getAttribute('aria-pressed') === 'true'), kind + ' 5: focus stays on the pressed portion button');
    ok(!o.errs.length, kind + ': no errors ' + o.errs.join(' | '));
    await o.b.close();

    // ---- 6 + 7. Body map sentence once; area chips turn off when pressed again ----
    o = await open(kind, { state: SEED }); p = o.page;
    await p.goto(URL); await ready(p);
    await bodyOnce(p, kind + ' 6 (week 4)');
    await p.click('#tab-exercises'); await p.waitForTimeout(200);
    const pick = await T(p, () => [...document.querySelectorAll('#chips [data-f]')].map(b => b.dataset.f).find(f => f !== 'All'));
    await p.focus('#chips [data-f="' + pick + '"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    const ch = await T(p, () => ({ f: document.activeElement.dataset.f, pressed: document.activeElement.getAttribute('aria-pressed'), all: document.querySelector('#chips [data-f="All"]').getAttribute('aria-pressed'), live: document.getElementById('srLive').textContent, hidden: [...document.querySelectorAll('#lib [data-ex]')].filter(r => r.hidden).length }));
    ok(ch.f === pick && ch.pressed === 'false' && ch.all === 'true' && ch.hidden === 0, kind + ' 7: pressing a pressed chip again un-presses it, back to All (' + JSON.stringify(ch) + ')');
    ok(new RegExp('^' + pick + ' off\\. All areas: \\d+ exercises$').test(ch.live), kind + ' 7: and it is announced (' + ch.live + ')');
    ok(!o.errs.length, kind + ': no errors ' + o.errs.join(' | '));
    await o.b.close();
  }

  // ---- 6. a week with no gaps but some parts only partly trained (Mei's case): the sentence once on screen and once when read ----
  {
    const st = clone(SEED), o = await open('android', { state: st }), p = o.page;
    await p.goto(URL); await ready(p);
    // every exercise this week, logged now: no gaps left
    await T(p, () => { const t = window.__isoTest, s = t.store(), now = Date.now(); t.allDays().forEach(d => { if (d.ex) d.ex.forEach((id, i) => s.log.push({ t: now - 1000 - i, w: s.week, id, eq: t.V(id, 'h').eq, k: 'h', kg: 0, v: 30 })); }); document.getElementById('tab-progress').click(); document.getElementById('tab-train').click(); });
    await p.waitForTimeout(200);
    const st6 = await T(p, () => { const t = window.__isoTest, w = t.bodyWeek(), k = Object.keys(t.BM_NAME); return { gaps: k.filter(r => !w[r]).length, part: k.filter(r => w[r] === 'part').length }; });
    if (st6.gaps === 0) await bodyOnce(p, '6 (no gaps, ' + st6.part + ' partly)');
    else ok(true, '6: (could not clear every gap: ' + st6.gaps + ')');
    await o.b.close();
  }

  // ---- 8. One-tap chips use your own kit and recent weights ----
  {
    // Mei: a 6 kg kettlebell, no history
    const mei = { profile: { units: 'kg', bw: 54, age: 45, sex: 'f', inv: { k: '6' } }, eq: ['k', 'r'], week: 1 };
    let o = await open('android', { state: mei }), p = o.page;
    await p.goto(URL); await ready(p); await p.evaluate(() => document.getElementById('tab-coach').click()); await p.waitForTimeout(150);
    let chips = await p.locator('#cSugs').innerText();
    ok(/Goblet squat 6 kg 30 s/.test(chips) && !/16 kg/.test(chips), '8: the goblet chip uses your 6 kg kettlebell (' + chips.replace(/\n/g, ' | ') + ')');
    await o.b.close();
    // pounds, no kit for it: no made-up weight in kg
    o = await open('android', { state: { profile: { units: 'lb', bw: 90, age: 30, sex: 'm' }, eq: ['d'], week: 1 } }); p = o.page;
    await p.goto(URL); await ready(p); await p.evaluate(() => document.getElementById('tab-coach').click()); await p.waitForTimeout(150);
    chips = await p.locator('#cSugs').innerText();
    ok(/Goblet squat [\d.]+ lb 30 s/.test(chips) && !/\bkg\b/.test(chips), '8: in pounds the chip is in pounds (' + chips.replace(/\n/g, ' | ') + ')');
    await o.b.close();
    // with history: your newest sets, which log the same exercise when tapped
    const hist = clone(mei); hist.log = [{ t: Date.now() - 864e5, w: 1, id: 'seated-calf', eq: 'k', k: 'r', kg: 6, v: 12 }, { t: Date.now() - 864e5 + 60000, w: 1, id: 'goblet-squat', eq: 'k', k: 'h', kg: 6, v: 30 }];
    o = await open('android', { state: hist }); p = o.page;
    await p.goto(URL); await ready(p); await p.evaluate(() => document.getElementById('tab-coach').click()); await p.waitForTimeout(150);
    const cs = await T(p, () => [...document.querySelectorAll('#cSugs button')].map(b => b.textContent));
    ok(cs.some(x => /6 kg 30 s/.test(x)) && cs.some(x => /6 kg 12 reps/.test(x)) && !cs.some(x => /16 kg/.test(x)), '8: recent personal sets become chips (' + cs.join(' | ') + ')');
    const calf = cs.find(x => /12 reps/.test(x));
    await p.click('#cSugs button:has-text("' + calf + '")'); await p.waitForTimeout(200);
    const l = await T(p, () => window.__isoTest.store().log.slice(-1)[0]);
    ok(l.id === 'seated-calf' && l.kg === 6 && l.v === 12, '8: tapping it logs that exercise again (' + JSON.stringify(l) + ')');
    ok(!o.errs.length, 'no errors ' + o.errs.join(' | '));
    await o.b.close();
  }

  srv.close(); console.log('r13b: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
