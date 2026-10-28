// Round 11 fixes: Strength check lift list, reps in reserve, 1–12 rep limit, spine safety, owned weights; Search & log matches and announcements; no "Train tab" wording.
const { serve, open } = require('./lib');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8560, URL = `http://localhost:${PORT}/index.html`;
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/seed-week4.json'), 'utf8'));
const T = (page, f, a) => page.evaluate(f, a);
const store = page => T(page, () => JSON.parse(localStorage.getItem('isohold.v1')));
function state(mod) { const s = JSON.parse(JSON.stringify(SEED)); mod(s); return s; }
async function boot(st) {
  const o = await open('android', { state: st, viewport: { width: 412, height: 915 } });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  return o;
}
async function openStr(page) { await page.click('#tab-progress'); await page.waitForTimeout(150); await page.click('#chkCard [data-chk="str"]'); await page.waitForTimeout(150); }
const opts = page => T(page, () => [...document.querySelectorAll('#chkEx option')].map(o => ({ v: o.value, t: o.textContent })));
async function pick(page, val) { await page.selectOption('#chkEx', val); await page.waitForTimeout(120); }
async function search(page, q) { await page.fill('#cIn', q); await page.waitForTimeout(450); return (await page.locator('#cSrch').innerText()).replace(/\n/g, ' | '); }
const DAY = 864e5;
(async () => {
  const srv = await serve(PORT);
  // ---- Dev: gym, barbell, pounds, logged bench and squat ----
  {
    const st = state(s => { s.eq = ['d', 'b', 'c']; Object.assign(s.profile, { where: 'gym', units: 'lb', bw: 89.8, issues: [], age: 29 }); s.notes = (s.notes || []).concat([
      { t: Date.now() - 3 * DAY, k: 'lift', name: 'Bench Press', kg: 120, reps: 3, sets: 1, rpe: 9 }, { t: Date.now() - 2 * DAY, k: 'lift', name: 'Back Squat', kg: 177, reps: 3, sets: 1, rpe: 9 }]); });
    const { b, page, errs } = await boot(st);
    await openStr(page);
    const o = await opts(page), names = o.map(x => x.t);
    ok(['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row'].every((n, i) => names[i] === n), 'barbell user: the five barbell lifts come first (' + names.join(', ') + ')');
    for (const x of o) { await pick(page, x.v); ok(+(await page.inputValue('#chkKg')) > 0, 'dev: weight filled for ' + x.t + ' (' + await page.inputValue('#chkKg') + ')'); }
    await pick(page, o[1].v);
    const bw = +(await page.inputValue('#chkKg'));
    ok(bw >= 200 && bw <= 240 && bw % 5 === 0, 'bench weight from his logged bench, in 5 lb steps (' + bw + ')');
    // reps + 1 in reserve: 225 x 12 -> 225 x (1 + 13/30) = 322.5
    await page.fill('#chkKg', '225'); await page.fill('#chkReps', '12'); await page.waitForTimeout(60);
    let res = await page.textContent('#chkRes');
    ok(/322\.5 lb/.test(res) && /1 rep you had left/.test(res), '225 × 12 → 322.5 lb, and says it counts the rep left (' + res + ')');
    // too many reps: 135 x 30
    await page.fill('#chkKg', '135'); await page.fill('#chkReps', '30'); await page.waitForTimeout(60);
    res = await page.textContent('#chkRes');
    ok(/Too many reps for a good estimate — try a heavier weight next time/.test(res) && !/Estimated max/.test(res), '135 × 30: too many reps, no max shown (' + res + ')');
    ok(/normal set/i.test(await page.textContent('#chkSave')), 'save button offers a normal set');
    let s0 = await store(page);
    await page.click('#chkSave'); await page.waitForTimeout(250);
    let s1 = await store(page);
    ok((s1.tests._str || []).length === (s0.tests._str || []).length, '135 × 30: no estimated max saved');
    const ln = s1.notes[s1.notes.length - 1];
    ok(s1.notes.length === s0.notes.length + 1 && ln.k === 'lift' && ln.name === 'Bench Press' && ln.reps === 30 && Math.round(ln.kg * 2.20462) === 135, 'saved as a normal Bench Press set instead');
    ok(/Saved as a normal set/.test(await page.textContent('#srLive')), 'normal-set save announced');
    // zero and blank reps rejected cleanly
    await page.click('#chkCard [data-chk="str"]'); await page.waitForTimeout(150); await pick(page, o[1].v);
    for (const bad of ['0', '']) {
      await page.fill('#chkKg', '225'); await page.fill('#chkReps', bad); await page.waitForTimeout(60);
      s0 = await store(page); await page.click('#chkSave'); await page.waitForTimeout(150); s1 = await store(page);
      ok(await page.isVisible('#chkSave') && (s1.tests._str || []).length === (s0.tests._str || []).length && s1.notes.length === s0.notes.length, 'reps "' + bad + '": nothing saved (' + await page.textContent('#chkRes') + ')');
      ok(await T(page, () => document.activeElement.id) === 'chkReps', 'reps "' + bad + '": focus moves to the reps field');
    }
    await page.fill('#chkReps', '0'); await page.waitForTimeout(40);
    ok(/1 to 12/.test(await page.textContent('#chkRes')), '0 reps: explains 1 to 12');
    // a real estimate saves to the check history and Other lifts
    await page.fill('#chkKg', '225'); await page.fill('#chkReps', '10'); await page.waitForTimeout(40);
    s0 = await store(page); await page.click('#chkSave'); await page.waitForTimeout(250); s1 = await store(page);
    const rec = s1.tests._str[s1.tests._str.length - 1];
    ok(rec && rec.lift === 'Bench Press' && rec.reps === 10 && Math.abs(rec.e1 - (225 / 2.20462) * (1 + 11 / 30)) < 0.05, 'bench 225 × 10 saved with reps + 1 (' + JSON.stringify(rec) + ')');
    ok(s1.notes.length === s0.notes.length + 1 && s1.notes[s1.notes.length - 1].name === 'Bench Press', 'and logged as a Bench Press set');
    ok(/Bench Press: max about 307\.5 lb/.test(await page.locator('#chkCard').innerText()), 'card shows the bench result (' + (await page.locator('#chkCard').innerText()).replace(/\n/g, ' | ') + ')');
    ok(await T(page, () => document.activeElement && document.activeElement.dataset.chk === 'str'), 'focus returns to the Strength check button');
    // search "bench" finds exercises and his logged lifts
    await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(150);
    const r = await search(page, 'bench');
    ok(/Your lifts/.test(r) && /Bench Press/.test(r) && /Exercises/.test(r), 'search "bench" finds exercises and his logged bench (' + r + ')');
    ok(!errs.length, 'no page errors (dev): ' + errs.join(' | '));
    await b.close();
  }
  // ---- Tomás: home, one 24 kg kettlebell and bodyweight ----
  {
    const st = state(s => { s.eq = ['k', 'w']; Object.assign(s.profile, { where: 'home', units: 'kg', bw: 72, age: 23, issues: [], inv: { k: '24' } }); s.wt = {}; s.log = s.log.filter(l => l.k !== 'r'); delete s.tests; });
    const { b, page, errs } = await boot(st);
    await openStr(page);
    const o = await opts(page);
    ok(o[0].t === 'Push-Ups' && o.length >= 3, 'bodyweight user: push-ups offered first (' + o.map(x => x.t).join(', ') + ')');
    for (const x of o.slice(1)) { await pick(page, x.v); ok(await page.inputValue('#chkKg') === '24', 'tomás: ' + x.t + ' weight is his 24 kg kettlebell (' + await page.inputValue('#chkKg') + ')'); }
    await pick(page, o[0].v);
    ok(await page.locator('#chkKg').count() === 0 && /Bodyweight/.test(await page.locator('#sheetBody').innerText()), 'push-ups: no weight box, bodyweight shown');
    await page.fill('#chkReps', '25'); await page.waitForTimeout(40);
    ok(/25/.test(await page.textContent('#chkRes')) && !/Too many/.test(await page.textContent('#chkRes')), 'push-ups: 25 reps accepted as the result');
    const s0 = await store(page); await page.click('#chkSave'); await page.waitForTimeout(250); const s1 = await store(page);
    const rec = s1.tests._str[s1.tests._str.length - 1], l = s1.log[s1.log.length - 1];
    ok(rec.id === 'floor-press' && rec.eq === 'w' && rec.reps === 25 && rec.bw === 1, 'push-up check saved');
    ok(s1.log.length === s0.log.length + 1 && l.eq === 'w' && l.kg === 0 && l.v === 25, 'push-ups logged as a bodyweight set');
    ok(/Push-Ups: 25 reps/.test(await page.locator('#chkCard').innerText()), 'card shows push-ups: 25 reps');
    ok(!errs.length, 'no page errors (tomás): ' + errs.join(' | '));
    await b.close();
  }
  // ---- Mei: one 6 kg kettlebell, bands; logged 8 kg sets ----
  {
    const st = state(s => { s.eq = ['k', 'r']; Object.assign(s.profile, { where: 'home', units: 'kg', bw: 54, age: 45, sex: 'f', issues: [], inv: { k: '6' } }); s.wt = {}; delete s.tests;
      s.log = s.log.concat([{ t: Date.now() - DAY, w: s.week, id: 'floor-press', eq: 'k', k: 'r', kg: 8, v: 12, x: 1 }, { t: Date.now() - DAY, w: s.week, id: 'goblet-squat', eq: 'k', k: 'r', kg: 12, v: 10, x: 1 }]); });
    const { b, page, errs } = await boot(st);
    await openStr(page);
    for (const x of await opts(page)) { await pick(page, x.v); if (await page.locator('#chkKg').count()) ok(await page.inputValue('#chkKg') === '6', 'mei: ' + x.t + ' defaults to her 6 kg kettlebell (' + await page.inputValue('#chkKg') + ')'); }
    const lab = await T(page, () => { const i = document.getElementById('chkReps'); return { l: [...i.labels].map(x => x.textContent.trim()), d: (document.getElementById(i.getAttribute('aria-describedby')) || {}).textContent }; });
    ok(lab.l.length === 1 && lab.l[0] === 'Reps', 'reps field label is just "Reps" (' + JSON.stringify(lab.l) + ')');
    ok(/1 left/.test(lab.d || ''), 'reps field has a hint (' + lab.d + ')');
    const mb = await page.locator('#chkMic').boundingBox().catch(() => null); if (mb) ok(mb.width >= 44 && mb.height >= 44, 'mic button ≥ 44 px');
    await page.click('#sheetClose'); await page.waitForTimeout(150);
    await page.click('#chkCard [data-chk="end"]'); await page.waitForTimeout(150);
    const ph = await T(page, () => [...document.querySelectorAll('#tests input[data-k="load"]')].map(i => i.placeholder));
    ok(ph.length === 4 && ph.every(p => p === 'Bodyweight' || /^(2 × )?6 kg$/.test(p)), 'endurance weights use her 6 kg kettlebell (' + ph.join(', ') + ')');
    ok(!errs.length, 'no page errors (mei): ' + errs.join(' | '));
    await b.close();
  }
  // ---- Fatima: osteopenia, 4/6/8 kg dumbbells ----
  {
    const st = state(s => { s.eq = ['d']; Object.assign(s.profile, { where: 'home', units: 'kg', bw: 68, age: 52, sex: 'f', issues: ['bones'], inv: { d: '4, 6, 8' } }); s.wt = {}; delete s.tests; });
    const { b, page, errs } = await boot(st);
    await openStr(page);
    const o = await opts(page);
    ok(o.length >= 1 && !o.some(x => /^(rdl|bo-row|lift:Deadlift|lift:Barbell Row)\|/.test(x.v)) && !o.some(x => /Romanian|Deadlift/.test(x.t)), 'osteopenia: no Romanian deadlift or bent-over rows (' + o.map(x => x.t).join(', ') + ')');
    ok(await page.locator('#chkSpine').count() === 1 && /Spine: keep your back flat/.test(await page.textContent('#chkSpine')), 'osteopenia: spine note shown');
    for (const x of o) { await pick(page, x.v); if (await page.locator('#chkKg').count()) ok(['4', '6', '8'].includes(await page.inputValue('#chkKg')), 'fatima: ' + x.t + ' weight is one she owns (' + await page.inputValue('#chkKg') + ')'); }
    const gs = o.find(x => /^goblet-squat\|/.test(x.v)) || o[0]; await pick(page, gs.v);
    await page.fill('#chkKg', '8'); await page.fill('#chkReps', '20'); await page.waitForTimeout(60);
    ok(/Too many reps for a good estimate/.test(await page.textContent('#chkRes')) && !/13\.3/.test(await page.textContent('#chkRes')), '8 kg × 20: no misleading 13.3 kg max');
    const s0 = await store(page); await page.click('#chkSave'); await page.waitForTimeout(250); const s1 = await store(page);
    ok(!(s1.tests && s1.tests._str && s1.tests._str.length) && s1.log.length === s0.log.length + 1 && s1.log[s1.log.length - 1].v === 20, '8 kg × 20 saved as a normal set only');
    // a back issue alone also hides them
    await T(page, () => { const s = JSON.parse(localStorage.getItem('isohold.v1')); s.profile.issues = ['back']; s.profile.age = 40; s.eq = ['d', 'b']; localStorage.setItem('isohold.v1', JSON.stringify(s)); });
    await page.reload(); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); await openStr(page);
    const o2 = await opts(page);
    ok(o2.some(x => x.t === 'Back Squat') && !o2.some(x => /Deadlift|Barbell Row|Romanian/.test(x.t)) && await page.locator('#chkSpine').count() === 1, 'lower-back issue: no deadlifts or rows, spine note (' + o2.map(x => x.t).join(', ') + ')');
    await page.click('#sheetClose'); await page.waitForTimeout(150);
    // search
    await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(150);
    ok(await T(page, () => !document.getElementById('cSrch').hasAttribute('aria-live')), 'results box is not a live region that re-reads everything');
    let r = await search(page, 'heel');
    ok(/Calf/.test(r) && /Bones: Osteopenia/.test(r), '"heel" finds calf raises and the Bones guide card (' + r + ')');
    r = await search(page, 'bones'); ok(/Bones: Osteopenia/.test(r), '"bones" finds the Bones card (' + r + ')');
    r = await search(page, 'calf'); ok(/Calf/.test(r), '"calf" finds calf exercises (' + r + ')');
    r = await search(page, 'ramadan'); ok(/Ramadan: Training while fasting/.test(r), '"ramadan" finds the Ramadan card (' + r + ')');
    r = await search(page, 'iftar'); ok(/Ramadan/.test(r), 'guide body text is searched ("iftar") (' + r + ')');
    // announced once typing pauses, with a count
    await page.fill('#cIn', ''); await page.waitForTimeout(350); await T(page, () => { document.getElementById('srLive').textContent = ''; window.__ann = 0; new MutationObserver(() => { if (document.getElementById('srLive').textContent) window.__ann++; }).observe(document.getElementById('srLive'), { childList: true, characterData: true, subtree: true }); });
    await page.type('#cIn', 'plank', { delay: 60 }); await page.waitForTimeout(120);
    ok(!/result/.test(await page.textContent('#srLive')), 'nothing announced while still typing');
    await page.waitForTimeout(400);
    const live = await page.textContent('#srLive'), n = await page.locator('#cSrch .srch-r').count();
    ok(new RegExp('^' + n + ' results?: ').test(live) && /Plank/.test(live), 'announces "N results: …" (' + live + ')');
    ok(await T(page, () => window.__ann) === 1, 'announced once for the whole word (' + await T(page, () => window.__ann) + ')');
    await page.click('#cSrch [data-sgo]').catch(() => {}); 
    // Train tab wording gone from Search & log intro
    await page.fill('#cIn', ''); 
    ok(!errs.length, 'no page errors (fatima): ' + errs.join(' | '));
    await b.close();
  }
  // ---- no "Train tab" wording left in the app ----
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\/\/[^\n'"]*Train tab[^\n]*/g, '');
    ok(!/Train tab/.test(src), 'no "Train tab" wording in user-facing text');
    const st = state(s => { s.feed = []; });
    const { b, page, errs } = await boot(st);
    await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(200);
    const intro = await page.locator('#coach').innerText();
    ok(!/Train tab/.test(intro) && /top right/.test(intro), 'Search & log intro points to the profile button at the top right');
    ok(!errs.length, 'no page errors (wording): ' + errs.join(' | '));
    await b.close();
  }
  srv.close();
  console.log(`fix4: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
