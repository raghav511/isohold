// v57: the body map sits below today's sessions; Progress > Strength opens with "Your level" (strength level per lift
// adjusted for bodyweight, age and sex, endurance score per hold against the joint's typical hold time).
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8395, URL = `http://localhost:${PORT}/index.html`;
const SEED = require('./fixtures/seed-week4.json');
const LV = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const withProfile = over => Object.assign(JSON.parse(JSON.stringify(SEED)), { profile: Object.assign({}, SEED.profile, over) });
async function levels(kind, state) {
  const o = await open(kind, { state }), p = o.page;
  await p.goto(URL); await p.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  const order = await p.evaluate(() => { const s = document.getElementById('sessions'), b = document.getElementById('bodyCard'); return !!(s.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && !document.getElementById('bodyCard').querySelector('svg').style.maxHeight; });
  await p.evaluate(() => document.getElementById('tab-progress').click()); await p.waitForTimeout(200);
  await p.locator('#progress button', { hasText: /^Strength$/ }).first().click(); await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const c = document.getElementById('levelCard'), sum = c.querySelectorAll('.lv-sum b');
    const lifts = [...c.querySelectorAll('[aria-label="Strength level by lift"] li')].map(li => ({ name: li.querySelector('b').textContent, lv: li.querySelector('.lv-chip').textContent, pos: parseFloat(li.querySelector('.lv-bar em').style.left), sub: li.querySelector('.lv-sub').textContent }));
    const holds = [...c.querySelectorAll('[aria-label="Endurance by hold"] li')].map(li => ({ name: li.querySelector('b').textContent, score: +li.querySelector('.lv-chip').textContent, sub: li.querySelector('.lv-sub').textContent }));
    return { visible: !!c.offsetParent, before: !!(c.compareDocumentPosition(document.getElementById('dailyCard')) & Node.DOCUMENT_POSITION_FOLLOWING), overall: sum[0] && sum[0].textContent, endurance: sum[1] && sum[1].textContent, who: (c.querySelector('.lv-sum span') || {}).textContent || '', lifts, holds, links: [...c.querySelectorAll('details a')].map(a => a.href), text: c.textContent };
  });
  r.order = order; r.errs = o.errs.filter(e => !/Audio/.test(e)); await o.b.close(); return r;
}
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    const a = await levels(kind, SEED);
    ok(a.order, kind + ': the body map comes after today’s sessions, at full size');
    ok(a.visible && a.before, kind + ': “Your level” shows on Progress › Strength, above the strength chart');
    ok(LV.includes(a.overall), kind + ': an overall strength level (' + a.overall + ')');
    ok(/47-year-old man, 83 kg/.test(a.who), kind + ': says who it is compared for (' + a.who + ')');
    ok(a.lifts.length >= 3 && a.lifts.every(l => LV.includes(l.lv) && l.pos >= 0 && l.pos <= 100 && /Max about \d/.test(l.sub)), kind + ': each main lift has a level, a bar and its max (' + a.lifts.map(l => l.name + ' ' + l.lv).join(', ') + ')');
    ok(!a.lifts.some(l => /Lateral Raise|Crunch|Calf/.test(l.name)), kind + ': lifts without a level table are left out');
    ok(a.holds.length >= 1 && a.holds.every(h => h.score > 0 && /\d+ s at \d+% of your max; typical for that joint and effort: \d+ s/.test(h.sub)), kind + ': each hold gets an endurance score against the typical time');
    ok(/^\d+$/.test(a.endurance), kind + ': an overall endurance score (' + a.endurance + ')');
    ok(/trained for \d+ weeks?/.test(a.text), kind + ': says how long you’ve trained');
    ok(['10.1080/00140130903389068', '10.1519/JSC.0b013e31817b02ad', '10.1002/jcsm.13731'].every(d => a.links.some(h => h.includes(d))), kind + ': “How this is worked out” links its sources');
    ok(!a.errs.length, kind + ': no errors ' + a.errs);
    if (kind === 'iphone') continue;
    // age: past 40 the masters coefficient lifts the comparison, so a 70-year-old with the same lifts ranks at least as high
    const old = await levels(kind, withProfile({ age: 70 }));
    const posOf = (r, n) => (r.lifts.find(l => l.name === n) || {}).pos;
    ok(a.lifts.every(l => posOf(old, l.name) >= l.pos) && a.lifts.some(l => posOf(old, l.name) > l.pos), 'age 70 ranks the same lifts higher than age 47');
    ok(/age coefficient \(1\.53 for you\)/.test(old.text), 'the 70-year-old sees their coefficient (1.53)');
    // sex: women are compared with women's levels
    const fem = await levels(kind, withProfile({ sex: 'f' }));
    ok(a.lifts.every(l => posOf(fem, l.name) >= l.pos) && /woman/.test(fem.who), 'the same lifts rank higher against women’s levels');
    // bodyweight: heavier with the same lifts ranks lower
    const heavy = await levels(kind, Object.assign(withProfile({}), { body: SEED.body.map(b => Object.assign({}, b, { kg: b.kg + 25 })) }));
    ok(a.lifts.every(l => posOf(heavy, l.name) <= l.pos) && a.lifts.some(l => posOf(heavy, l.name) < l.pos), '25 kg heavier with the same lifts ranks lower');
    // no history: an invitation, not an empty card
    const none = await levels(kind, Object.assign(withProfile({}), { log: [], done: {} }));
    ok(/Log a few sets/.test(none.text) && !none.errs.length, 'with no sets the card says what to log');
  }
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
