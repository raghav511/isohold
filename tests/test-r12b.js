// Round 12 Today/plan consistency: the cardio-day add-on preview matches the queue, cardio days keep to the daily limit,
// rest days, "Do another session" labelled as the next one, one set count, Done-for-today lines, group headings,
// a short warm-up kept under a cap, add-on holds for plans without cardio days, Start bar clear of the body map.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8665, URL = `http://localhost:${PORT}/index.html`;
const T = (p, f, a) => p.evaluate(f, a);
async function boot(state, o2) { const o = await open('android', Object.assign({ state, viewport: { width: 412, height: 915 } }, o2 || {})); await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); await o.page.waitForTimeout(200); return o; }
const DAY = 864e5, now = Date.now();
const DEV = { units: 'lb', bw: 90, age: 29, sex: 'm', days: 6, split: 'two', len: 0, where: 'gym', cardio: ['treadmill', 'bike'], issues: [] };
const doneFor = (w, ids, t) => { const o = {}; ids.forEach(d => { o['w' + w + d + 'am'] = t; o['w' + w + d + 'pm'] = t; }); return o; };
const qInfo = (page, d, part) => T(page, ([d, part]) => { const t = window.__isoTest, dy = t.allDays().find(x => x.id === d), ph = t.phaseOf(t.store().week), q = t.buildQueue(dy, part, ph);
  return { ids: [...new Set(q.filter(i => i.id).map(i => i.id))], cardio: q.filter(i => i.kind === 'cardio').map(i => ({ m: i.m, dur: i.dur })), note: q.trimNote || '', am: t.mins(dy, 'am', ph), pm: t.mins(dy, 'pm', ph), all: t.mins(dy, 'all', ph) }; }, [d, part]);
(async () => {
  const srv = await serve(PORT);

  // 1 + 7. cardio-day add-on: the Today list is this week's queue, headings name what is in them
  for (const wk of [1, 2]) {
    const { b, page, errs } = await boot({ week: wk, done: doneFor(wk, ['d1', 'd2'], now - 2 * DAY), log: [], profile: DEV, eq: ['d', 'b', 'c'] });
    const q = await qInfo(page, 'c1', 'pm');
    for (const d of await page.$$('#sessions details')) await d.evaluate(x => { x.open = true; });
    const ev = page.locator('#sessions article.sess').nth(1);
    const listed = await ev.evaluate(a => [...a.querySelectorAll('.plan [data-ex]')].map(x => x.dataset.ex));
    const heads = await ev.evaluate(a => [...a.querySelectorAll('.plan .grp-t')].map(x => x.textContent));
    ok(q.ids.every(id => listed.includes(id)), 'week ' + wk + ': every queued add-on hold is listed (' + q.ids.filter(id => !listed.includes(id)) + ')');
    const other = wk === 1 ? ['hammer', 'pushup-plus'] : ['dip-hold', 'incline-curl'];
    ok(!other.some(id => listed.includes(id)), 'week ' + wk + ': the other week\'s pair is not listed (' + listed + ')');
    ok(!heads.some(h => /Back and stabilizers/.test(h)), 'no "Back and stabilizers" heading over chest or biceps holds (' + heads + ')');
    if (wk === 2 && listed.includes('hammer')) ok(heads.some(h => /^Biceps and serratus/.test(h)), 'hammer curl + push-up plus heading: ' + heads);
    const card = await ev.innerText();
    const machines = [...new Set(q.cardio.map(c => ({ walk: 'Treadmill', bike: 'Bike', row: 'Rower', out: 'Walk' })[c.m]))];
    ok(machines.every(m => card.includes(m)), 'evening card names the machines the session uses (' + machines + ')');
    ok(!/brachialis|long-head/.test(await ev.locator('.sum').innerText()) || wk === 0, 'evening summary names only what is in this week\'s add-on');
    // 2. within the hour (no "Longest session" set), and the total line shows on a cardio day
    ok(q.am + q.pm <= 60, 'week ' + wk + ': cardio day within 60 min (' + q.am + ' + ' + q.pm + ')');
    ok(q.cardio.filter(c => c.m !== 'heel').every(c => c.dur >= 300), 'evening cardio never under 5 min a part');
    const tot = await page.innerText('#splitSeg');
    ok(new RegExp('Morning ' + q.am + ' min \\+ evening ' + q.pm + ' min = ' + (q.am + q.pm) + ' min today, within the hour').test(tot), 'cardio-day total line: ' + tot.replace(/\s+/g, ' '));
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }
  // 2. "Longest session" 45 and 25 on a cardio day; one session too
  for (const [len, split] of [[45, 'two'], [45, 'one'], [25, 'two']]) {
    const { b, page, errs } = await boot({ week: 1, done: doneFor(1, ['d1', 'd2'], now - 2 * DAY), log: [], profile: Object.assign({}, DEV, { len, split }), eq: ['d', 'b', 'c'] });
    const q = await qInfo(page, 'c1', 'pm'), amq = await qInfo(page, 'c1', 'am');
    const tot = split === 'one' ? q.all : q.am + q.pm, txt = await page.innerText('#train');
    ok(amq.cardio.reduce((s, c) => s + c.dur, 0) === 1800, len + '/' + split + ': the morning cardio is not cut');
    if (len === 45) {
      ok(tot <= 45, len + '/' + split + ': day within 45 min (' + tot + ')');
      ok(/To fit your 45-minute day/.test(q.note) && txt.includes(q.note), 'the card says what the limit cut: ' + q.note);
      ok(new RegExp(tot + ' min today, within your 45-minute limit').test(txt), 'the total line says within the limit');
    } else {
      ok(q.ids.length === 0 && /more than your 25-minute day/.test(q.note), 'cannot fit: the add-on is left out and it says so honestly: ' + q.note);
      ok(/over your 25-minute limit/.test(txt), 'the total line says over the limit');
    }
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  // 3. rest day after "Done for today" on a 3-day plan
  {
    const R = { age: 67, bw: 72, days: 3, split: 'one', len: 25, where: 'home', cardio: ['outdoors'], issues: [] };
    let { b, page, errs } = await boot({ week: 1, done: doneFor(1, ['f1'], now - DAY), log: [], profile: R, eq: ['d'] });
    let t = await page.innerText('#sessions');
    ok(/Rest day/.test(t) && /Next: Tomorrow/.test(t) && /Full Body B/.test(t), 'the day after: rest day, next session tomorrow: ' + t.replace(/\s+/g, ' '));
    ok(await page.isHidden('#startBar') && !(await page.locator('#sessions .btn.go').count()), 'no big Start on a rest day');
    ok(/Today:\s*rest/.test(await page.innerText('#bodyCard .bm-today')), 'body map says rest');
    ok(!/min today/.test(await page.innerText('#splitSeg')), 'no day total on a rest day');
    await page.click('#sessions [data-another]'); await page.waitForTimeout(250);
    t = await page.innerText('#sessions');
    ok(await page.isVisible('#startBar [data-startbar]') && /^Next: day 2, Full Body B/.test(t), '"Train anyway" shows the next session labelled Next: ' + t.slice(0, 80));
    await b.close();
    ({ b, page, errs } = await boot({ week: 1, done: doneFor(1, ['f1'], now - DAY), log: [], profile: R, eq: ['d'] }));
    ok(await page.locator('#sessions [data-another]').innerText() === 'Train anyway', 'the quiet option is "Train anyway"');
    await b.close();
    ({ b, page, errs } = await boot({ week: 1, done: doneFor(1, ['f1'], now - 2 * DAY), log: [], profile: R, eq: ['d'] }));
    ok(!/Rest day/.test(await page.innerText('#sessions')) && await page.isVisible('#startBar [data-startbar]'), 'two days later: the session is offered');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  // 4 + 5. "Do another session" is labelled Next; a ride then doesn't use up tomorrow's cardio day; one set count
  {
    const log = [0, 1, 2].map(i => ({ t: now - 3000 + i, w: 1, id: 'goblet-squat', eq: 'd', k: 'r', kg: 16, v: 10 })).concat([0, 1].map(i => ({ t: now - 1000 + i, w: 1, id: 'curl', eq: 'd', k: 'r', kg: 10, v: 12, x: 1 })));
    const { b, page, errs } = await boot({ week: 1, done: Object.assign(doneFor(1, ['d1'], now - DAY), doneFor(1, ['d2'], now - 5000)), log, profile: { age: 30, days: 6, split: 'one', where: 'home', cardio: ['bike'], issues: [] }, eq: ['d'] });
    let t = await page.innerText('#sessions');
    ok(/Done for today/.test(t) && /3 sets logged \(plus 2 typed in\)/.test(t), 'Done card counts session sets apart from typed ones: ' + t.replace(/\s+/g, ' ').slice(0, 120));
    await page.click('#sessions [data-another]'); await page.waitForTimeout(250);
    t = await page.innerText('#sessions');
    ok(/^Next: day 3, Walk & Row, planned for tomorrow/.test(t) && /Next session/.test(t), '"Do another session" says it is the next session: ' + t.slice(0, 90));
    ok(/Next session:/.test(await page.innerText('#bodyCard .bm-today')), 'body map line is labelled Next session');
    ok(/day 3, Walk & Row/.test(await page.textContent('#srLive')), 'announced with the session name');
    await T(page, () => window.__isoTest.handle('rode my bike for 2 hours')); await page.waitForTimeout(150);
    const c = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
    ok(c && !/Counted as/.test(c.warn || ''), 'a ride after today\'s session is not counted as the next cardio day (' + (c && c.warn) + ')');
    ok(await T(page, () => { const d = window.__isoTest.store().done; return !d.w1c1am && !d.w1c1pm; }), 'the next cardio day is still to do');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }
  // 5. the morning card's minutes match the total line
  {
    const { b, page, errs } = await boot({ week: 1, done: {}, log: [], profile: { age: 67, bw: 72, days: 3, split: 'two', len: 25, where: 'home', cardio: ['outdoors'], issues: [] }, eq: ['d'] });
    const tot = await page.innerText('#splitSeg'), sum = await page.innerText('#sessions'), m = tot.match(/Morning (\d+) min \+ evening (\d+) min/), n = sum.match(/\((\d+) min this morning\)/), e = sum.match(/\((\d+) min this evening\)/);
    ok(m && (!n || n[1] === m[1]) && (!e || e[1] === m[2]), 'trim note minutes match the total line: ' + (m && m[0]) + ' / ' + (n && n[0]) + ' / ' + (e && e[0]));
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  // 6. marking the evening done on a cardio day: the lines describe what was done
  {
    const ids = ['d1', 'd2', 'c1', 'd3', 'd4'], done = doneFor(1, ids, now - 2 * DAY); done.w1c2am = now - 3000;
    const { b, page, errs } = await boot({ week: 1, done, log: [], profile: { age: 40, days: 6, split: 'two', where: 'home', cardio: ['rower', 'outdoors'], issues: [] }, eq: ['d', 'r'] });
    const exp = await qInfo(page, 'c2', 'pm'), expAm = await qInfo(page, 'c2', 'am');
    await page.click('#sessions [data-done="w1c2pm"]'); await page.waitForTimeout(400);
    ok(/Evening session marked done\. Done for today\./.test(await page.textContent('#srLive')), 'announces Done for today: ' + await page.textContent('#srLive'));
    ok(/Done for today/.test(await page.innerText('#sessions')), 'Done card shows (week rolled over)');
    const tot = await page.innerText('#splitSeg');
    ok(new RegExp('You did: Morning ' + expAm.am + ' min \\+ evening ' + exp.pm + ' min = ' + (expAm.am + exp.pm) + ' min today').test(tot), 'total line describes today\'s finished day: ' + tot.replace(/\s+/g, ' '));
    const bm = await page.innerText('#bodyCard .bm-today');
    ok(/^Today \(done\):/.test(bm) && !/triceps|biceps/i.test(bm), 'body map line describes the finished day: ' + bm);
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  // Chloe: a capped one-session gym day keeps a short warm-up; add-on holds for a plan without cardio days; Start bar clear of the map
  {
    const C = { age: 34, days: 3, split: 'one', len: 45, dayHour: 5, where: 'gym', cardio: ['treadmill'], issues: [] };
    const { b, page, errs } = await boot({ week: 1, done: {}, log: [], profile: C, eq: ['d', 'b', 'c'] }, { viewport: { width: 390, height: 664 } });
    const r = await T(page, () => { const t = window.__isoTest; return t.allDays().map(d => { const q = t.buildQueue(d, 'all', t.phaseOf(1)); return { n: q.trimNote || '', warm: q.findIndex(i => i.kind !== 'cardio') > 0 ? q.slice(0, q.findIndex(i => i.kind !== 'cardio')).reduce((s, i) => s + i.dur, 0) : 0, m: t.mins(d, 'all', t.phaseOf(1)) }; }); });
    ok(r.every(x => !/no warm-up/.test(x.n) && x.warm >= 170), 'every capped day keeps a warm-up of 3 min or more: ' + JSON.stringify(r));
    ok(r.every(x => x.m <= 45), 'and stays within 45 min');
    // Start bar: the last line of the body-map card is not under the pinned Start
    const cov = await T(page, () => { const bar = document.querySelector('#startBar'), last = document.querySelector('#bodyCard').lastElementChild; if (bar.hidden || !last) return 'no bar'; const a = last.getBoundingClientRect(), z = bar.getBoundingClientRect(); return a.bottom <= z.top + 1 || a.top >= z.bottom ? '' : a.bottom + ' > ' + z.top; });
    ok(!cov || cov === 'no bar', 'Start bar does not cover the end of the body-map card (' + cov + ')');
    // add-on holds: a note on Today and a group in Add exercise
    ok(/no cardio day, so the add-on holds/.test(await page.locator('#sessions').textContent()), 'Today explains how to get the add-on holds');
    await page.evaluate(() => { const d = document.querySelector('#sessions details'); d.open = true; });
    await page.click('#sessions [data-add$="pm"]'); await page.waitForTimeout(250);
    ok(await page.locator('#sheetBody [data-ag="addon"] [data-addid="hammer"]').count() === 1, 'Add exercise lists the add-on holds');
    await page.click('#sheetBody [data-ag="addon"] [data-addid="hammer"]'); await page.waitForTimeout(250);
    ok(await T(page, () => { const t = window.__isoTest, d = t.allDays()[0]; return t.buildQueue(d, 'pm', t.phaseOf(1)).some(i => i.id === 'hammer') || t.buildQueue(d, 'all', t.phaseOf(1)).some(i => i.id === 'hammer'); }), 'an added add-on hold is in the session');
    ok(!errs.length, 'no errors ' + errs);
    await b.close();
  }

  console.log(`test-r12b: ${pass} passed, ${fail} failed`);
  srv.close(); process.exit(fail ? 1 : 0);
})();
