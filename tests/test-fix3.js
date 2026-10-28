// Round 11 Progress fixes: one estimated max everywhere, a daily strength index that agrees with the strength map,
// other lifts on the body map and strength map, the calendar week on Today, the rebuilt coverage table, leg press name,
// forced-colours legends, graph legend/axis, and the Strength tab label at large text.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8540, URL = `http://localhost:${PORT}/index.html`;
const seed = require('./fixtures/seed-week4.json');
// "now" is Thursday 17 Dec 2026, 10:00 local; the calendar week started Monday 14 Dec
const NOW = new Date(2026, 11, 17, 10, 0, 0).getTime();
const at = (m, d, h = 12, min = 0) => new Date(2026, m, d, h, min, 0).getTime();
const L = (t, id, k, eq, kg, v, x = {}) => Object.assign({ t, w: 1, id, eq, k, kg, v }, x);
const lift = (t, name, kg, reps, x = {}) => Object.assign({ t, k: 'lift', name, kg, reps, sets: 1 }, x);
const T = (page, f, a) => page.evaluate(f, a);
async function boot(st, opts = {}) {
  const o = await open('android', Object.assign({ state: st }, opts));
  await o.page.clock.setFixedTime(NOW);
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); await o.page.waitForTimeout(150);
  return o;
}
const prof = (x = {}) => Object.assign({}, seed.profile, { issues: [], dayHour: 0, units: 'kg', days: 4 }, x);
const base = (x) => Object.assign({}, seed, { done: {}, food: [], body: [], tests: {}, notes: [], log: [], week: 1, profile: prof() }, x);

(async () => {
  const srv = await serve(PORT);
  let b, page, errs;

  // ---------- 1. one estimated max ----------
  {
    const st = base({
      log: [L(at(11, 7), 'wall-sit', 'r', 'c', 140, 10), L(at(11, 15), 'wall-sit', 'r', 'c', 145, 10), L(at(11, 15, 13), 'goblet-squat', 'r', 'd', 24, 10, { rpe: 8 })],
      notes: [lift(at(11, 14, 18), 'Back Squat', 160, 5, { rpe: 7 }), lift(at(11, 16, 18), 'Back Squat', 180, 1, { rpe: 9 }), lift(at(11, 15, 18), 'Bench Press', 100, 5, { rpe: 8 })]
    });
    ({ b, page, errs } = await boot(st));
    const E = await T(page, () => { const t = window.__isoTest; return { a: t.estMax(160, 5, 7), b: t.estMax(180, 1, 9), c: t.estMax(100, 13), d: t.estMax(100, 1, 5), e: t.estMax(24, 10), f: t.repMax({ id: 'goblet-squat', kg: 24, v: 10, rpe: 8, w: 1 }).est, g: t.estMax(0, 5) }; });
    ok(Math.abs(E.a - 160 * (1 + 8 / 30)) < 1e-9 && Math.abs(E.b - 192) < 1e-9, 'estMax = kg × (1 + (reps + (10 − RPE)) / 30): 160×5@7 = 202.7, 180×1@9 = 192');
    ok(E.c === null && E.g === null, 'no estimate past 12 reps or without a weight');
    ok(Math.abs(E.d - 100 * (1 + 5 / 30)) < 1e-9, 'reps in reserve capped at 4 (RPE 5 counts as 4 left)');
    ok(Math.abs(E.e - 32) < 1e-9 && Math.abs(E.f - 24 * (1 + 12 / 30)) < 1e-9, 'no RPE = 0 in reserve; program rep sets use the same function (repMax)');
    await page.click('#tab-progress'); await page.click('#pt-strength'); await page.waitForTimeout(100);
    const ext = await page.locator('#progExtras').innerText();
    const mSq = ext.match(/Back Squat[\s\S]*?estimated max ([\d.]+ kg)/), mBe = ext.match(/Bench Press[\s\S]*?estimated max ([\d.]+ kg)/);
    ok(mSq && mSq[1] === '202.5 kg' || mSq && /^20[23]/.test(mSq[1]), 'Other lifts: squat estimated max from 160 × 5 @ RPE 7 (' + (mSq && mSq[1]) + ')');
    ok(/from 160 kg × 5 @ RPE 7/.test(ext), 'Other lifts names the set the estimate came from');
    await page.click('#dailyCard details:nth-of-type(2) summary').catch(() => {});
    const dl = await page.locator('#dailyCard').innerText();
    const gBe = dl.match(/Bench Press\s*Estimated max ([\d.]+ kg)/);
    ok(gBe && mBe && gBe[1] === mBe[1], 'bench: graph list and Other lifts give the same estimate (' + (gBe && gBe[1]) + ' / ' + (mBe && mBe[1]) + ')');
    const gSq = dl.match(/Back Squat\s*Estimated max ([\d.]+ kg) \(from 160 kg × 5 reps @ RPE 7/);
    ok(!!gSq && mSq && gSq[1] === mSq[1], 'squat in the graph list uses the one current estimated max (best of 6 weeks: 160 × 5 @ 7), as Other lifts does');
    const ans = await T(page, () => window.__isoTest.localAnswer('what is my estimated max for squat') || '');
    ok(mSq && ans.indexOf(mSq[1]) > -1 && /RPE 7/.test(ans), 'coach answer matches Other lifts: ' + ans.slice(0, 100));
    const sd = await T(page, () => { const d = window.__isoTest.strengthData(); return { chest: d.Chest && d.Chest.r && d.Chest.r.est, quads: d.Quads && d.Quads.r && d.Quads.r.est }; });
    ok(Math.abs(sd.chest - 100 * (1 + 7 / 30)) < 1e-9, 'estimated maximum muscle by muscle: chest from bench, same number');
    // 6. leg press is named as leg press
    ok(/Leg Press/.test(dl) && !/Reverse Nordic/.test(dl), 'graph list calls the machine version "Leg Press", not "Reverse Nordic"');
    ok(await T(page, () => window.__isoTest.exName('wall-sit', 'r', 'c')) === 'Leg Press', 'exName uses the version’s own name');
    // Strength check uses the same function (RPE 9 = 1 rep left)
    await page.click('#chkCard [data-chk="str"]'); await page.waitForTimeout(150);
    if (await page.locator('#chkKg').count()) {
      await page.fill('#chkKg', '20'); await page.fill('#chkReps', '10'); await page.waitForTimeout(50);
      ok(/27\.3 kg/.test(await page.textContent('#chkRes')), 'Strength check 20 × 10 with 1 left = 27.3 kg (' + await page.textContent('#chkRes') + ')');
      await page.fill('#chkReps', '20'); await page.waitForTimeout(50);
      ok(/Too many reps for a good estimate|past 12 reps/.test(await page.textContent('#chkRes')), 'Strength check refuses an estimate past 12 reps');
      await page.click('#sheetClose'); await page.waitForTimeout(100);
    } else ok(false, 'Strength check opens');
    ok(!errs.length, 'no page errors (1) ' + errs); await b.close();
  }

  // ---------- 2. daily index includes holds and same-weight progress; agrees with the strength map ----------
  {
    // Fatima: same dumbbells, longer holds and more reps; a new exercise on the last day
    const st = base({
      log: [
        L(at(11, 1), 'glute-bridge', 'h', 'd', 8, 30), L(at(11, 1, 12, 5), 'goblet-squat', 'r', 'd', 8, 10),
        L(at(11, 8), 'glute-bridge', 'h', 'd', 8, 40), L(at(11, 8, 12, 5), 'goblet-squat', 'r', 'd', 8, 11),
        L(at(11, 15), 'glute-bridge', 'h', 'd', 8, 45), L(at(11, 15, 12, 5), 'goblet-squat', 'r', 'd', 8, 12), L(at(11, 15, 12, 9), 'curl', 'r', 'd', 6, 10)
      ]
    });
    ({ b, page, errs } = await boot(st));
    const R = await T(page, ([a, c, e]) => {
      const t = window.__isoTest, d = t.dailyIdx(), ds = [a, c, e].map(x => t.dayStart(x));
      const hm = v => t.holdMax({ id: 'glute-bridge', kg: 8, v }).est;
      return { s: ds.map(x => d.s[x]), exp3: ((hm(45) / hm(30)) + (t.estMax(8, 12) / t.estMax(8, 10))) / 2 * 100, ch: t.strChange() };
    }, [at(11, 1), at(11, 8), at(11, 15)]);
    ok(Math.abs(R.s[0] - 100) < 1e-9 && R.s[1] > 100 && R.s[2] > R.s[1], 'same weight, longer hold and more reps: strength index rises ' + R.s.map(Math.round));
    ok(Math.abs(R.s[2] - R.exp3) < 1e-6, 'a new exercise (curl) doesn’t pull the day back toward 100 (' + R.s[2].toFixed(1) + ' = ' + R.exp3.toFixed(1) + ')');
    ok(R.ch.glutes > 0 && R.ch.quads > 0, 'strength map agrees in direction (glutes +' + R.ch.glutes + '%, quads +' + R.ch.quads + '%)');
    await page.click('#tab-progress'); await page.click('#pt-strength'); await page.waitForTimeout(100);
    await page.click('#dlyInfoB');
    const info = await page.locator('#dlyInfo').innerText(), hrefs = await page.$$eval('#dlyInfo a', a => a.map(x => x.href));
    ok(/reps in reserve/.test(info) && /longer hold/.test(info) && /second day/.test(info), 'info panel documents the method');
    ok(hrefs.length === 3 && hrefs.every(h => /^https:\/\/doi\.org\//.test(h)), 'info panel keeps its 3 DOI links');
    // 8. legend describes markers; labels at least 12 px; axis starts at the first training day
    const leg = await page.locator('#dailyCard .dleg').innerText();
    ok(/circles/.test(leg) && /squares/.test(leg) && !/solid|dashed/.test(leg), 'legend describes circles and squares, not lines: ' + leg.replace(/\s+/g, ' '));
    const ax = await T(page, () => { const sv = document.querySelector('#dailyCard svg.dchart'), k = sv.getBoundingClientRect().width / 336; return [...sv.querySelectorAll('text.ax')].map(t => ({ px: parseFloat(getComputedStyle(t).fontSize) * k, tx: t.textContent })); });
    ok(ax.length && ax.every(a => a.px >= 12), 'graph axis labels ≥ 12 px: ' + ax.map(a => a.px.toFixed(1)).join(','));
    const firstLab = await T(page, t => new Date(window.__isoTest.dayStart(t)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), at(11, 1));
    ok(ax.some(a => a.tx === firstLab) && /Since your first training day/.test(await page.locator('#dailyCard').innerText()), 'axis starts at the first training day (' + firstLab + ')');
    ok(!errs.length, 'no page errors (2) ' + errs); await b.close();
  }
  // Tomás: one 24 kg kettlebell, reps go up
  {
    const st = base({ log: [L(at(11, 2), 'goblet-squat', 'r', 'k', 24, 6), L(at(11, 9), 'goblet-squat', 'r', 'k', 24, 8), L(at(11, 16), 'goblet-squat', 'r', 'k', 24, 10)] });
    ({ b, page, errs } = await boot(st));
    const s = await T(page, ts => { const t = window.__isoTest, d = t.dailyIdx(); return ts.map(x => d.s[t.dayStart(x)]); }, [at(11, 2), at(11, 9), at(11, 16)]);
    ok(s[0] === 100 && s[1] > 100 && s[2] > s[1], 'one kettlebell, more reps: index ' + s.map(Math.round));
    await b.close();
  }

  // ---------- 3/4. other lifts and the calendar week on Today ----------
  {
    // Dev: barbell lifts this week, program week 1 has lasted for weeks. Ravi: a Tuesday session, program week moved on.
    const st = base({
      week: 2, profile: prof({ dayHour: 4 }),
      log: [L(at(10, 20), 'floor-press', 'r', 'd', 20, 10), L(at(11, 15), 'goblet-squat', 'r', 'd', 20, 10, { w: 1 }), L(at(11, 14, 2), 'calf-raise', 'r', 'd', 20, 12, { w: 2 })],
      notes: [lift(at(11, 14, 18), 'Bench Press', 100, 5), lift(at(11, 16, 18), 'Deadlift', 180, 3), lift(at(11, 15, 18), 'Lat Pulldown', 60, 10), lift(at(11, 15, 19), 'Overhead Press', 50, 5),
        lift(at(11, 1, 18), 'Bench Press', 95, 5), lift(at(11, 1, 19), 'Lat Pulldown', 55, 10), lift(at(11, 1, 20), 'Hip Thrust', 100, 10), lift(at(11, 15, 20), 'Hip Thrust', 110, 10)]
    });
    ({ b, page, errs } = await boot(st));
    const W = await T(page, () => { const t = window.__isoTest; return { ws: t.weekStart(), got: t.bodyWeek(), tags: ['squat', 'bench press', 'deadlift', 'overhead press', 'lat pulldown', 'hip thrust', 'seated cable row', 'Dominadas'].map(n => t.liftTags(n)) }; });
    ok(W.ws === new Date(2026, 11, 14, 4).getTime(), 'calendar week starts Monday at the day-start hour (4:00)');
    ok(!!W.got.quads && !!W.got.glutes, 'Tuesday’s goblet squat (program week 1, now week 2) still counts this calendar week');
    ok(!W.got.calves, 'a set at 2:00 on Monday belongs to Sunday (day starts at 4:00), so not this week');
    ok(['chest', 'triceps', 'delts', 'hams', 'lower', 'upper', 'biceps'].every(r => W.got[r]), 'bench, OHP, deadlift and pulldown fill chest, triceps, delts, hamstrings, lower back, back and biceps');
    ok(JSON.stringify(W.tags) === JSON.stringify([['Quads', 'Glutes'], ['Chest', 'Triceps', 'Front delts'], ['Hamstrings', 'Glutes', 'Lower back'], ['Front delts', 'Triceps'], ['Lats', 'Mid back', 'Biceps'], ['Glutes'], ['Lats', 'Mid back', 'Biceps'], ['Lats', 'Mid back', 'Biceps']]), 'lift names map to muscles ' + JSON.stringify(W.tags));
    const lab = await page.getAttribute('#bodyCard svg', 'aria-label');
    ok(/Monday to Sunday/.test(lab) && /(Trained|Partly):[^.]*chest/.test(lab) && !/program week/.test(lab), 'Today map label: calendar week, chest trained (partly until its planned sets are done)');
    ok(!/Your map is empty/.test(await page.locator('#bodyCard').innerText()), 'Today map is not empty after a session earlier this week');
    const ch = await T(page, () => window.__isoTest.strChange());
    ok(ch.chest > 0 && ch.glutes > 0 && ch.upper > 0, 'strength map counts other lifts: chest +' + ch.chest + '%, glutes +' + ch.glutes + '%, back +' + ch.upper + '%');
    await page.click('#tab-progress'); await page.click('#pt-muscles'); await page.waitForTimeout(100);
    const ml = await page.getAttribute('#mapCard svg.smap', 'aria-label');
    ok(/chest up/.test(ml), 'strength map label lists chest from bench: ' + ml.slice(0, 120));
    ok(/Bench Press/.test(await page.locator('#mapCard .mlist').textContent()), 'muscle-by-muscle list names the bench press');
    // 5. coverage: 4-day plan, real names, planned vs done
    const cov = await T(page, () => { const th = [...document.querySelectorAll('#cov thead th')].map(x => x.innerText.replace(/\s+/g, ' ').trim()); const row = n => [...document.querySelectorAll('#cov tbody tr')].find(r => r.querySelector('td') && r.querySelector('th').textContent === n); const cells = r => [...r.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim()); return { th, quads: cells(row('Quads')), chest: cells(row('Chest')), glutes: cells(row('Glutes')) }; });
    ok(!cov.th.some(h => /Day 0/.test(h)) && cov.th.length === 1 + 4 + 2 && /Day 1 Upper Body & Core A/.test(cov.th[1]) && /Day 4 Lower Body B/.test(cov.th[4]), 'coverage columns are the 4 plan days with names: ' + cov.th.join(' | '));
    ok(/Planned/.test(cov.th[5]) && /Done/.test(cov.th[6]), 'planned and done are separate, labelled columns');
    const num = c => parseInt(c, 10) || 0;
    ok(num(cov.quads[4]) === cov.quads.slice(0, 4).reduce((t, c) => t + num(c), 0), 'planned per week = sum of the day columns (' + cov.quads.join(', ') + ')');
    ok(num(cov.chest[5]) === 1 && num(cov.glutes[5]) === 3, 'done this week: chest 1 (bench), glutes 3 (goblet squat, hip thrust, deadlift) ' + cov.chest[5] + ' / ' + cov.glutes[5]);
    ok(!errs.length, 'no page errors (3) ' + errs); await b.close();
  }
  // Fatima: 3 full-body days; large text
  {
    const st = base({ profile: prof({ days: 3, split: 'one', len: 25 }), log: [L(at(11, 15), 'glute-bridge', 'h', 'd', 8, 30), L(at(11, 15, 12, 2), 'glute-bridge', 'h', 'd', 8, 30)] });
    ({ b, page, errs } = await boot(st, { textScale: 1.5 }));
    await page.click('#tab-progress'); await page.click('#pt-muscles'); await page.waitForTimeout(100);
    const c = await T(page, () => { const th = [...document.querySelectorAll('#cov thead th')].map(x => x.innerText.replace(/\s+/g, ' ').trim()); const cols = th.length; const dayCols = [1, 2, 3].map(i => [...document.querySelectorAll('#cov tbody tr')].filter(r => r.querySelectorAll('td').length).map(r => r.querySelectorAll('td')[i - 1].innerText.trim()).join('|')); const n = document.querySelector('#cov .cv-n'), mk = document.querySelector('#cov .mk'); const gl = [...document.querySelectorAll('#cov tbody tr')].find(r => r.querySelector('td') && r.querySelector('th').textContent === 'Glutes'); return { th, cols, dup: new Set(dayCols).size !== dayCols.length, nfs: parseFloat(getComputedStyle(n).fontSize), mkw: mk.getBoundingClientRect().width, gl: [...gl.querySelectorAll('td')].map(td => td.innerText.trim()) }; });
    ok(c.cols === 6 && /Full Body A/.test(c.th[1]) && /Full Body B/.test(c.th[2]) && /Full Body C/.test(c.th[3]), '3-day plan: 3 named day columns ' + c.th.join(' | '));
    ok(!c.dup, 'no two day columns are identical');
    ok(parseInt(c.gl[4], 10) === 2 && parseInt(c.gl[3], 10) < 20, 'glutes: done 2, planned ' + c.gl[3] + ' (not 60)');
    ok(c.nfs >= 16 && c.mkw >= 10, 'numbers ' + c.nfs + ' px and marks ' + c.mkw + ' px at large text');
    ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways page scroll at 150% text');
    // 9. "Strength" tab label stays on one line at 150%
    const one = await T(page, () => { const bt = document.getElementById('pt-strength'), r = document.createRange(); r.selectNodeContents(bt); const lines = new Set([...r.getClientRects()].filter(x => x.width > 1).map(x => Math.round(x.top))); return { lines: lines.size, sw: bt.scrollWidth, cw: bt.clientWidth, txt: bt.textContent }; });
    ok(one.lines === 1 && one.sw <= one.cw + 1, '"' + one.txt + '" tab label on one line at 150% text (' + JSON.stringify(one) + ')');
    await page.click('#pt-strength'); await page.waitForTimeout(100);
    ok(!errs.length, 'no page errors (large text) ' + errs); await b.close();
  }

  // ---------- 7. forced colours: legends keep distinct, non-colour markers ----------
  {
    const st = base({ notes: [lift(at(11, 1), 'Bench Press', 100, 5), lift(at(11, 15), 'Bench Press', 90, 5), lift(at(11, 1, 13), 'Back Squat', 100, 5), lift(at(11, 15, 13), 'Back Squat', 102, 5), lift(at(11, 1, 14), 'Deadlift', 100, 5), lift(at(11, 15, 14), 'Deadlift', 107, 5), lift(at(11, 1, 15), 'Lat Pulldown', 50, 10), lift(at(11, 15, 15), 'Lat Pulldown', 60, 10)] });
    for (const fc of [false, true]) {
      ({ b, page, errs } = await boot(st, { forcedColors: fc }));
      await page.click('#tab-progress'); await page.click('#pt-muscles'); await page.waitForTimeout(100);
      const lg = await T(page, () => [...document.querySelectorAll('#mapCard .smleg li')].map(li => { const sv = li.querySelector('svg'), rs = [...sv.querySelectorAll('rect')]; return { step: li.dataset.step, txt: li.textContent, fca: getComputedStyle(sv).forcedColorAdjust, sig: rs.map(r => getComputedStyle(r).fill + '/' + (r.getAttribute('fill') || '') + '/' + getComputedStyle(r).strokeDasharray).join(';') }; }));
      const tag = fc ? 'forced colours: ' : 'normal: ';
      ok(lg.length === 5 && new Set(lg.map(x => x.sig)).size === 5, tag + 'all 5 legend swatches differ ' + lg.map(x => x.sig).join(' | '));
      ok(/url\(#smHatch/.test(lg[0].sig) && /url\(#smDots/.test(lg[1].sig) && /url\(#smLines/.test(lg[2].sig) && !/url/.test(lg[3].sig) && /↓/.test(lg[0].txt) && !/\/none$/.test(lg[4].sig), tag + 'Down striped with an arrow, 0–4% dotted, 5–9% lined, No data dashed');
      if (fc) ok(lg.every(x => x.fca === 'none'), 'forced colours: swatches keep their drawing');
      const mp = await T(page, () => ['sm-1', 'sm-2', 'sm-3', 'sm-4'].map(c => document.querySelectorAll('#mapCard svg.smap rect.' + c).length));
      const ov = await T(page, () => [...document.querySelectorAll('#mapCard svg.smap rect.sm-ov')].map(r => r.getAttribute('fill')));
      ok(mp[0] > 0 && ov.includes('url(#smHatch)'), tag + 'regions that went down are striped on the map too (steps ' + mp + ')');
      if (fc) { await page.click('#tab-train'); await page.waitForTimeout(80); ok(await T(page, () => [...document.querySelectorAll('#bodyCard .bm-legend i')].every(i => getComputedStyle(i).forcedColorAdjust === 'none')), 'forced colours: Today map legend swatches keep their fill'); }
      ok(!errs.length, tag + 'no page errors ' + errs); await b.close();
    }
  }

  // ---------- body map: what you trained is what shows, region by region ----------
  {
    const st = base({ eq: ['d'], profile: prof({ days: 4, issues: [] }) });
    ({ b, page, errs } = await boot(st));
    const REG = ['delts', 'chest', 'abs', 'obliques', 'biceps', 'quads', 'inner', 'shins', 'rear', 'upper', 'lower', 'triceps', 'glutes', 'sidehip', 'hams', 'calves'];
    // round 13: one count with the coverage table, so a region the sets mainly work is trained or partly (vs its planned sets), helpers alone leave a gap
    const want = (on, part) => Object.fromEntries(REG.map(r => [r, on.includes(r) ? 'set' : 'gap']));
    const check = async (name, setup, arg, on, part) => {
      const got = await T(page, setup, arg);
      const exp = want(on, part), st = r => got.map[r] ? 'set' : 'gap', diff = REG.filter(r => st(r) !== exp[r]).map(r => r + ': got ' + (got.map[r] || 'gap') + ', want ' + exp[r]);
      ok(!diff.length, name + ' → body map region by region' + (got.note ? ' (' + got.note + ')' : '') + (diff.length ? ': ' + diff.join('; ') : ''));
    };
    // a whole program day: every set of the day's queue, as the player logs it
    const day = idx => { const t = window.__isoTest, s = t.store(), d = t.allDays()[idx], q = t.buildQueue(d, 'all', t.phaseOf(1)).filter(it => it.kind !== 'cardio'), now = Date.now(); s.notes = []; s.log = q.map((it, i) => ({ t: now - 3600e3 + i * 1000, w: 1, id: it.id, eq: it.ex.eq, k: it.wk, kg: 8, v: 10 })); const ids = []; q.forEach(it => { const k = it.id + ':' + it.wk + ':' + it.ex.eq; if (!ids.includes(k)) ids.push(k); }); return { map: t.bodyWeek(), note: d.name + ': ' + ids.join(', ') }; };
    await check('Lower Body A', day, 1, ['quads', 'glutes', 'calves', 'lower', 'hams', 'sidehip'], ['inner', 'abs', 'upper', 'shins']);
    await check('Upper Body & Core A', day, 0, ['delts', 'triceps', 'abs', 'biceps', 'chest', 'obliques', 'glutes', 'upper'], ['quads', 'hams', 'lower', 'rear']);
    // a cable-and-machine gym session, logged by hand
    const cable = [['wall-sit', 'r'], ['sa-row', 'r'], ['lateral-raise', 'r'], ['rdl', 'r'], ['glute-bridge', 'r'], ['incline-press', 'r'], ['goblet-squat', 'h']];
    await check('Cable/machine session (leg press, cable row, cable lateral raise, pull-through, hip thrust machine, incline machine press, hack squat hold)', c => { const t = window.__isoTest, s = t.store(), now = Date.now(); s.notes = []; s.log = c.map((x, i) => ({ t: now - 3600e3 + i * 1000, w: 1, id: x[0], eq: 'c', k: x[1], kg: 30, v: 10 })); return { map: t.bodyWeek() }; }, cable,
      ['quads', 'glutes', 'upper', 'delts', 'hams', 'chest'], ['inner', 'biceps', 'rear', 'lower', 'triceps']);
    await check('Other lifts: squat, bench, deadlift', () => { const t = window.__isoTest, s = t.store(), now = Date.now(); s.log = []; s.notes = ['Back Squat', 'Bench Press', 'Deadlift'].map((n, i) => ({ t: now - 3600e3 + i * 1000, k: 'lift', name: n, kg: 100, reps: 5, sets: 3 })); return { map: t.bodyWeek() }; }, null,
      ['quads', 'glutes', 'chest', 'triceps', 'delts', 'hams', 'lower'], ['inner', 'upper']);
    // the strength map uses the same mapping: leg press on two days moves quads and glutes, not the reverse Nordic's
    const sm = await T(page, () => { const t = window.__isoTest, s = t.store(), now = Date.now(); s.notes = []; s.log = [{ t: now - 8 * 864e5, w: 1, id: 'wall-sit', eq: 'c', k: 'r', kg: 100, v: 10 }, { t: now - 864e5, w: 1, id: 'wall-sit', eq: 'c', k: 'r', kg: 110, v: 10 }]; return Object.keys(t.strChange()).sort().join(','); });
    ok(sm === 'glutes,quads', 'strength map: leg press counts for quads and glutes (' + sm + ')');
    // a set counts on Today the moment it is saved
    await T(page, () => { const s = window.__isoTest.store(); s.log = []; s.notes = []; });
    await page.click('#tab-progress'); await page.click('#tab-train'); await page.waitForTimeout(100);
    ok(!/Trained:/.test(await page.getAttribute('#bodyCard svg', 'aria-label')), 'Today map starts empty');
    await T(page, () => window.__isoTest.handle('bench press 60 kg x 8')); await page.waitForTimeout(150);
    ok(/(Trained|Partly):[^.]*chest/.test(await page.getAttribute('#bodyCard svg', 'aria-label')), 'a bench press typed in Search & log shows on the Today map straight away');
    ok(!errs.length, 'no page errors (region audit) ' + errs); await b.close();
  }

  // ---------- Exercise history labels ≥ 12 px ----------
  {
    const st = base({ log: [L(at(11, 2), 'goblet-squat', 'r', 'd', 16, 10), L(at(11, 9), 'goblet-squat', 'r', 'd', 18, 10), L(at(11, 16), 'goblet-squat', 'r', 'd', 20, 10)] });
    ({ b, page, errs } = await boot(st, { textScale: 1.5 }));
    await page.click('#tab-progress'); await page.click('#pt-strength'); await page.waitForTimeout(100);
    const ax = await T(page, () => [...document.querySelectorAll('#strCard svg.schart, #dailyCard svg.dchart')].flatMap(sv => { const k = sv.getBoundingClientRect().width / 336; return [...sv.querySelectorAll('text.ax')].map(t => parseFloat(getComputedStyle(t).fontSize) * k); }));
    ok(ax.length > 4 && ax.every(v => v >= 12), 'chart labels ≥ 12 px at 150% text: ' + ax.map(v => v.toFixed(1)).join(','));
    ok(!errs.length, 'no page errors (history) ' + errs); await b.close();
  }

  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
