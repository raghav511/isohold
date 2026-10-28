// Round 11 session fixes: easy walking only on a high-BP day, "Done for today", the daily time limit, skipped final walk, ride wording, 65+ defaults.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8500, URL = `http://localhost:${PORT}/index.html`;
async function boot(state, o2) { const o = await open('android', Object.assign({ state, viewport: { width: 412, height: 915 } }, o2 || {})); if (o2 && o2.clock) await o.page.clock.install(); await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); await o.page.waitForTimeout(200); return o; }
const T = (p, f, a) => p.evaluate(f, a);
const say = (page, t) => T(page, t => window.__isoTest.handle(t), t);
const RAVI = { age: 67, bw: 72, days: 3, split: 'one', len: 25, where: 'home', cardio: ['outdoors'], issues: ['knee', 'balance', 'bp'], nofloor: true };
// every cardio item of every day, part and phase
const allCardio = page => T(page, () => { const t = window.__isoTest, out = []; t.allDays().forEach(d => ['all', 'am', 'pm'].forEach(pt => [1, 2, 4, 5, 8, 11].forEach(w => t.buildQueue(d, pt, t.phaseOf(w)).forEach(it => { if (it.kind === 'cardio') out.push({ d: d.id, pt, w, m: it.m, e: it.effort, txt: it.txt, cues: (it.ex.cues || []).join(' | ') }); })))); return out; });
(async () => {
  const srv = await serve(PORT);

  // 1. high blood pressure: easy/steady walking only, card text matches
  for (const split of ['one', 'two']) {
    let { b, page, errs } = await boot({ week: 3, done: {}, log: [], profile: Object.assign({}, RAVI, { split }), eq: ['d'] });
    await T(page, () => { window.__isoTest.store().profile.len = 0; }); let c0 = await allCardio(page); await T(page, () => { window.__isoTest.store().profile.len = 25; });
    ok(c0.some(x => x.e === 'Hard'), split + ': a normal day without a time limit has hard intervals (control)');
    await say(page, 'my blood pressure is 165 over 102'); await page.waitForTimeout(150);
    const c = await allCardio(page);
    ok(c.length > 0 && c.every(x => ['Easy', 'Steady'].includes(x.e)), split + ': BP day, every cardio part is easy or steady (' + [...new Set(c.map(x => x.e))] + ')');
    ok(c.every(x => ['out', 'walk'].includes(x.m)), split + ': BP day, walking only (' + [...new Set(c.map(x => x.m))] + ')');
    ok(!c.some(x => /hard|hill|stair|interval/i.test(x.txt + ' ' + x.cues)), split + ': BP day, no hard/hills/stairs words');
    const txt = await page.innerText('#sessions');
    ok(!/then \d+ exercises?/.test(txt) && /Walking only/.test(txt) && !/× \d+ s hard/.test(txt), split + ': BP card text: ' + txt.replace(/\s+/g, ' ').slice(0, 160));
    await T(page, () => document.querySelectorAll('#sessions details').forEach(d => d.open = true));
    ok(!/hard/i.test(await page.innerText('#sessions')), split + ': BP exercise list has no hard cardio');
    await page.click('#sessions [data-start]'); await page.waitForTimeout(300);
    ok(!/hard|hill|stair/i.test(await page.innerText('#player')), split + ': BP walk session screen has no hard/hills/stairs');
    await page.click('#pClose'); await page.click('#pEndYes').catch(() => {}); await page.waitForTimeout(150);
    ok(!errs.length, split + ': no errors ' + errs);
    await b.close();
  }
  // a cardio-day plan with intervals (6 days, week 2) is walking only too; very high BP stays rest only
  {
    let { b, page, errs } = await boot({ week: 2, done: {}, log: [], profile: { age: 50, days: 6, split: 'two', where: 'gym', cardio: ['rower', 'treadmill'], issues: [] }, eq: ['d'] });
    await say(page, 'blood pressure 162/98'); await page.waitForTimeout(100);
    const c = await allCardio(page);
    ok(c.every(x => ['Easy', 'Steady'].includes(x.e) && x.m === 'walk'), 'BP day with a rower: treadmill walking only, easy/steady');
    await say(page, 'blood pressure 185/112'); await page.waitForTimeout(100);
    ok(/Rest today/.test(await page.innerText('#sessions')) && await page.isHidden('#startBar'), 'very high BP: rest only, no Start');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  // 2. Done for today
  {
    let { b, page, errs } = await boot({ week: 1, done: {}, log: [], profile: { age: 52, days: 3, split: 'one', where: 'home', cardio: ['outdoors'], issues: [] }, eq: ['d'] });
    ok(await page.isVisible('#startBar [data-startbar]'), 'before training: pinned Start shows');
    await page.click('#sessions [data-done^="all:"]'); await page.waitForTimeout(250);
    const t = await page.innerText('#sessions');
    ok(/Done for today/.test(t), 'after the session: Done for today');
    ok(/Next: (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(t) && /Full Body B/.test(t), 'says when the next session is: ' + t.replace(/\s+/g, ' '));
    ok(!(await page.locator('#sessions .btn.go').count()), 'no big Start for the next session');
    ok(await page.isHidden('#startBar'), 'pinned Start bar hidden the same day');
    const ab = page.locator('#sessions [data-another]'); ok(await ab.count() === 1 && (await ab.boundingBox()).height >= 44, '"Do another session" is there, 44px+');
    ok(/marked done/.test(await page.textContent('#srLive')), 'announced');
    await page.reload(); await page.waitForFunction(() => window.__isoholdReady); await page.waitForTimeout(200);
    ok(/Done for today/.test(await page.innerText('#sessions')) && await page.isHidden('#startBar'), 'still done after reopening the app');
    await page.click('#sessions [data-another]'); await page.waitForTimeout(250);
    ok(await page.locator('#sessions .btn.go[data-start]').count() === 1 && await page.isVisible('#startBar [data-startbar]'), '"Do another session" brings the next session back');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
    // yesterday's session: the next one is offered as usual
    ({ b, page, errs } = await boot({ week: 1, done: { w1f1am: Date.now() - 864e5, w1f1pm: Date.now() - 864e5 }, log: [], profile: { age: 52, days: 3, split: 'one', where: 'home', issues: [] }, eq: ['d'] }));
    ok(!/Done for today/.test(await page.innerText('#sessions')) && await page.isVisible('#startBar [data-startbar]'), 'a session done yesterday: today offers the next one');
    await b.close();
    // morning + evening: only after the evening
    ({ b, page, errs } = await boot({ week: 1, done: {}, log: [], profile: { age: 40, days: 3, split: 'two', where: 'home', issues: [] }, eq: ['d'] }));
    await page.click('#sessions [data-done$="am"]'); await page.waitForTimeout(200);
    ok(!/Done for today/.test(await page.innerText('#sessions')) && /Start evening/.test(await page.innerText('#startBar')), 'morning done: the evening is still offered');
    await page.click('#sessions [data-done$="pm"]'); await page.waitForTimeout(200);
    ok(/Done for today/.test(await page.innerText('#sessions')) && /Next: \w+ morning/.test(await page.innerText('#sessions')), 'evening done: Done for today, next morning named');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  // 3. the daily time limit
  {
    const CHLOE = { age: 34, days: 3, split: 'one', len: 45, where: 'gym', cardio: ['treadmill'], issues: [], dayHour: 5 };
    let { b, page, errs } = await boot({ week: 2, done: {}, log: [], profile: CHLOE, eq: ['d', 'b', 'c'] });
    const r = await T(page, () => { const t = window.__isoTest, ph = t.phaseOf(2); return t.allDays().map(d => ({ all: t.mins(d, 'all', ph), am: t.mins(d, 'am', ph), pm: t.mins(d, 'pm', ph), one: !!t.buildQueue(d, 'all', ph).oneSet })); });
    ok(r.every(x => x.all <= 45 && x.all >= 40), 'One session fills up to 45 min (' + r.map(x => x.all) + ')');
    ok(r.every(x => x.am + x.pm <= 45), 'Morning + evening stay within 45 min a day (' + r.map(x => x.am + '+' + x.pm) + ')');
    ok(r.some(x => !x.one), 'not cut to one set of everything when there is time');
    let txt = await page.innerText('#train');
    ok(/4\d min today/.test(txt) && /45-minute limit/.test(txt), 'Today states the total and the limit');
    await page.click('#splitSeg [data-split="two"]'); await page.waitForTimeout(200);
    txt = await page.innerText('#train');
    const m = txt.match(/Morning (\d+) min \+ evening (\d+) min = (\d+) min today/);
    ok(m && +m[1] + +m[2] === +m[3] && +m[3] <= 45, 'two sessions: the total is stated and within 45 (' + (m && m[0]) + ')');
    ok(/45-minute day/.test(await page.innerText('#sessions')), 'trim note names the daily limit');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
    ({ b, page, errs } = await boot({ week: 5, done: {}, log: [], profile: { age: 52, sex: 'f', days: 3, split: 'two', len: 25, where: 'home', issues: ['bones'] }, eq: ['d'] }));
    const f = await T(page, () => { const t = window.__isoTest, ph = t.phaseOf(5); return t.allDays().map(d => [t.mins(d, 'am', ph), t.mins(d, 'pm', ph)]); });
    ok(f.every(x => x[0] + x[1] <= 25), 'Fatima: 25-min cap, morning + evening together within 25 (' + f.map(x => x.join('+')) + ')');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  // 4. skipping the final walk of a strength session still marks it done (cardio day, evening back work + walk)
  {
    let { b, page, errs } = await boot({ week: 1, done: {}, log: [], profile: { age: 23, days: 6, split: 'two', where: 'home', cardio: ['outdoors'], issues: [] }, eq: ['k', 'w'] }, { clock: true });
    await T(page, () => document.querySelector('.strip button[data-i="5"]').click());
    await page.click('#sessions [data-start][data-part=pm]'); await page.clock.runFor(500);
    for (let i = 0; i < 200; i++) {
      const n = await page.textContent('#pName'); if (/Walk/.test(n) && !/Next/.test(n)) break;
      const logged = await T(page, () => window.__isoTest.store().log.length), sk = await page.textContent('#pSkip');
      if (!logged && /Set done/.test(sk)) { await page.clock.runFor(15000); if (/Set done/.test(await page.textContent('#pSkip'))) await page.click('#pSkip'); }
      else await page.click('#pSkip');
      await page.clock.runFor(1200);
    }
    ok(await T(page, () => window.__isoTest.store().log.length) > 0, 'strength sets logged before the walk');
    for (let k = 0; k < 5 && await page.isVisible('#pSkip'); k++) { await page.click('#pSkip'); await page.clock.runFor(800); }
    ok(await page.textContent('#pName') === 'Session complete', 'walk skipped: "Session complete" (' + await page.textContent('#pName') + ')');
    ok(/sets? logged/.test(await page.textContent('#pSetLabel')), 'summary shows the sets, not just cardio minutes');
    ok(await T(page, () => !!window.__isoTest.store().done.w1c2pm), 'session marked done');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  // 5. ride in One session mode; 65+ new-install defaults
  {
    const now = Date.now(); let { b, page, errs } = await boot({ week: 1, done: { w1d1am: now - 2 * 864e5, w1d1pm: now - 2 * 864e5, w1d2am: now - 864e5, w1d2pm: now - 864e5 }, log: [], profile: { age: 23, days: 6, split: 'one', where: 'home', cardio: ['cycle'], issues: [] }, eq: ['k'] });
    await say(page, 'rode my bike for 3 hours'); await page.waitForTimeout(100);
    const c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
    ok(c && /Counted as your cardio session for day 3/.test(c.warn || '') && !/morning|evening/.test(c.warn || ''), 'one session mode: ride wording has no morning/evening (' + (c && c.warn) + ')');
    ok(await T(page, () => { const d = window.__isoTest.store().done; return !!(d.w1c1am && d.w1c1pm); }), 'one session mode: the ride counts for the whole cardio day');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
    ({ b, page, errs } = await boot({}));
    await page.fill('#pfAge', '67'); await page.click('#pfNext'); await page.waitForTimeout(100);
    const pr = await T(page, () => ['days', 'split', 'len'].map(k => (document.querySelector('.pchips[data-set="' + k + '"] [aria-pressed="true"]') || {}).dataset.v).join());
    ok(pr === '3,one,25', '67-year-old: Training step starts at 3 days, one session, 25 min (' + pr + ')');
    await page.click('.pchips[data-set="eq"] button[data-v="d"]'); await page.click('#pfSave'); await page.waitForTimeout(150);
    ok(await T(page, () => { const p = window.__isoTest.prof(); return p.days === 3 && p.split === 'one' && p.len === 25; }), '67-year-old: saved as 3 days, one session, 25 min');
    await b.close();
    ({ b, page, errs } = await boot({}));
    await page.fill('#pfAge', '40'); await page.click('#pfNext'); await page.waitForTimeout(100);
    ok(await T(page, () => document.querySelector('.pchips[data-set="len"] [aria-pressed="true"]').dataset.v) === '0', '40-year-old: no shorter default');
    await b.close();
  }

  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
