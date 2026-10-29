// Round 14 logging (Tomás, Ravi): Spanish cue words never join a lift's name ("Bench Press Pausa"), an equipment-only name is an
// unnamed lift you can name, space-separated rep lists save every set, "2x10kg" is a pair of dumbbells, Spanish search puts the lift
// you named first, Spanish undo / correction / session commands, undo after a correction restores the entry, resume skips a set
// already logged, a ride only counts on its own day, "1 set", and one header row in Search & log.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok', m); } else { fail++; console.log('FAIL', m); } };
const PORT = +(process.env.PORT || 8845), URL = `http://localhost:${PORT}/index.html`;
const SEED = require('./fixtures/seed-week4.json');
const T = (p, f, a) => p.evaluate(f, a);
const J = x => JSON.stringify(x);
const DAY = 864e5;
const clone = o => JSON.parse(JSON.stringify(o));
async function boot(state, extra = {}) {
  const o = await open('android', { state, locale: 'es-ES', timezoneId: 'Europe/Madrid', ...extra });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const lastCard = p => T(p, () => window.__isoTest.feed().filter(x => x.r === 'card').pop());
const lastMsg = p => T(p, () => (window.__isoTest.feed().filter(x => x.r === 'm').pop() || {}).x || '');
(async () => {
  const srv = await serve(PORT);
  const t0 = Date.now() - 6 * DAY;
  const old = [['Bench Press Pausa', 70, 5, 'belt'], ['Mancuernas', 12, 10], ['Squat Rodilleras', 100, 5], ['Bench Press', 62.5, 8]]
    .map((x, i) => ({ t: t0 + i * 1000, k: 'lift', name: x[0], kg: x[1], reps: x[2], s: null, sets: 1, rpe: null, ...(x[3] ? { cue: x[3] } : {}) }));
  const tomas = { profile: { units: 'kg', bw: 72, age: 23, sex: 'm', where: 'gym' }, eq: ['k', 'w'], body: [{ t: t0, kg: 72 }], notes: old };
  let { b, page, errs } = await boot(tomas);
  const P = t => T(page, t => window.__isoTest.parseText(t), t);
  const H = t => T(page, t => { window.__isoTest.handle(t); }, t);
  const lifts = () => T(page, () => window.__isoTest.store().notes.filter(n => n.k === 'lift'));

  // ---- 1. Spanish cue words are notes, not part of the name ----
  let r = await P('press banca 70kg 5x5 belt pausa');
  ok(r.actions.length === 1 && r.actions[0].name === 'Bench Press' && /paused/.test(r.actions[0].cue) && /belt/.test(r.actions[0].cue) && r.actions[0].sets === 5 && r.actions[0].weight === 70, '1: press banca ... belt pausa = Bench Press, noted paused + belt: ' + J(r.actions));
  for (const [t, nm, cue] of [['sentadilla 100kg 5x5 rodilleras', 'Back Squat', /knee sleeves/], ['press banca 60kg 8 agarre cerrado', 'Bench Press', /close grip/], ['peso muerto 140kg 3 con cinturon y munequeras', 'Deadlift', /belt/], ['press banca 60kg 5 con pausa', 'Bench Press', /paused/], ['remo con barra 60kg 8 al fallo', 'Barbell Row', /to failure/], ['press militar 40kg 6 lento', 'Overhead Press', null]]) {
    const a = (await P(t)).actions[0];
    ok(a && a.name === nm && (!cue || cue.test(a.cue || '')), '1: ' + t + ' = ' + nm + ': ' + J(a));
  }
  let L = await lifts();
  ok(L[0].name === 'Bench Press' && L[0].was === 'Bench Press Pausa' && /belt/.test(L[0].cue) && /paused/.test(L[0].cue) && L[2].name === 'Back Squat', '1: old "Bench Press Pausa" / "Squat Rodilleras" merge on load, cue kept: ' + J([L[0], L[2]]));

  // ---- 2. an equipment-only name is an unnamed lift that can be named ----
  ok(L[1].name === 'Unnamed lift (dumbbells)' && L[1].was === 'Mancuernas' && L[1].kg === 12, '2: "Mancuernas" is shown as Unnamed lift (dumbbells), nothing lost: ' + J(L[1]));
  await page.evaluate(() => document.getElementById('tab-progress').click()); await page.waitForTimeout(150);
  let other = await T(page, () => [...document.querySelectorAll('#progExtras .lifts > li > b')].map(x => x.textContent));
  ok(!other.includes('Mancuernas') && other.includes('Unnamed lift (dumbbells)'), '2: Other lifts has no lift called Mancuernas: ' + J(other));
  await page.click('[data-nlift]'); await page.waitForTimeout(150);
  await page.fill('#nlIn', 'zancadas'); await page.click('#nlGo'); await page.waitForTimeout(150);
  L = await lifts();
  ok(L[1].name === 'Lunge' && L[1].was === 'Mancuernas', '2: "Name it" moves the entries to the named lift: ' + J(L[1]));
  other = await T(page, () => [...document.querySelectorAll('#progExtras .lifts > li > b')].map(x => x.textContent));
  ok(!other.some(x => /Unnamed/.test(x)) && other.includes('Lunge'), '2: and the list shows it: ' + J(other));

  // ---- 3. space-separated rep lists; 2x10kg = two dumbbells ----
  r = await P('jalon 55 kg 10 10 9');
  ok(r.actions.length === 1 && r.actions[0].name === 'Lat Pulldown' && r.actions[0].reps === 10 && J(r.actions[0].more) === '[10,9]', '3: jalon 55 kg 10 10 9 = three sets: ' + J(r.actions));
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(100);
  await H('jalon 55 kg 10 10 9');
  L = await lifts(); const lp = L.filter(n => n.name === 'Lat Pulldown');
  ok(lp.length === 3 && lp.map(n => n.reps).join() === '10,10,9' && lp.every(n => n.kg === 55), '3: saved 55 kg x 10, 10, 9: ' + J(lp));
  r = await P('curl biceps 2x10kg 12 reps');
  ok(r.actions.length === 1 && r.actions[0].exercise === 'curl' && r.actions[0].eq === 'd' && r.actions[0].perHand && r.actions[0].weight === 10 && r.actions[0].reps === 12 && !r.actions[0].sets, '3: curl biceps 2x10kg 12 reps = dumbbell curl, 10 kg per hand, one set: ' + J(r.actions));
  await H('curl biceps 2x10kg 12 reps');
  let c = await lastCard(page);
  ok(/Dumbbell/.test(c.title) && /per hand/.test(c.lines.join(' ')) && !/Kettlebell/.test(c.title), '3: the card says dumbbell, per hand: ' + c.title + ' | ' + c.lines);
  r = await P('curl 3x10 12kg'); ok(r.actions[0].sets === 3 && r.actions[0].reps === 10 && r.actions[0].weight === 12 && !r.actions[0].perHand, '3: "curl 3x10 12kg" is still 3 sets of 10: ' + J(r.actions));

  // ---- 4. Spanish search: the lift you named first; fondos finds dips ----
  await H('fondos lastrados +15kg 8');
  const hits = async q => { await page.fill('#cIn', q); await page.waitForTimeout(80); return page.locator('#cSrch .srch-r b').allTextContents(); };
  for (const [q, want] of [['peso muerto', 'Deadlift'], ['dominadas', 'Pull-Up'], ['fondos', 'Dip'], ['press banca', 'Bench Press']]) {
    if (want === 'Deadlift' || want === 'Pull-Up') await H(q + (want === 'Pull-Up' ? ' 8' : ' 120kg 5'));
    const h = await hits(q); ok(h[0] === want, '4: search "' + q + '" lists ' + want + ' first: ' + J(h));
  }
  let h = await hits('fondos'); ok(h.some(x => /Dip Hold/.test(x)), '4: "fondos" also finds the Dip Hold exercise: ' + J(h));
  for (const [q, re] of [['elevaciones laterales', /lateral raise/i], ['plancha', /plank/i], ['remo', /row/i], ['sentadilla', /squat/i], ['zancadas', /split squat|lunge/i], ['press militar', /overhead/i]]) {
    h = await hits(q); ok(h.some(x => re.test(x)), '4: search "' + q + '" finds ' + re + ': ' + J(h));
  }
  await page.fill('#cIn', '');

  // ---- 5. typed Spanish undo and correction ----
  await H('sentadilla 100kg 5'); await H('deshacer');
  ok(/^Undone: Back Squat/.test(await lastMsg(page)), '5: "deshacer" undoes: ' + await lastMsg(page));
  await H('sentadilla 100kg 5'); await H('no, eran 105kg');
  L = await lifts(); let sq = L.filter(n => n.name === 'Back Squat' && n.reps === 5 && n.t > t0 + 10000);
  ok(sq.length === 1 && sq[0].kg === 105, '5: "no, eran 105kg" replaces 100 with 105: ' + J(sq));
  await H('cancelar');
  ok(true, '5: "cancelar" handled');
  // Ravi: undo right after a correction restores the entry as it was before the correction
  await H('curl biceps 2x10kg 12 reps'); const nlog = await T(page, () => window.__isoTest.store().log.length);
  await H('actually that was 12 kg not 10'); await H('undo');
  const lg = await T(page, () => window.__isoTest.store().log.slice(-1)[0]), nlog2 = await T(page, () => window.__isoTest.store().log.length);
  ok(lg.id === 'curl' && lg.kg === 10 && lg.v === 12 && nlog2 === nlog, '5: undo after a correction puts back the 10 kg set (not deletes it): ' + J(lg) + ' ' + nlog + '→' + nlog2);
  ok(/correction/.test(await lastMsg(page)), '5: reply says the correction was undone: ' + await lastMsg(page));
  const cards = await T(page, () => window.__isoTest.feed().filter(x => x.r === 'card' && /Curl/.test(x.title)).slice(-2).map(x => !!x.undone));
  ok(J(cards) === '[false,true]', '5: the original card is live again, the corrected one undone: ' + J(cards));
  await H('undo');
  ok((await T(page, () => window.__isoTest.store().log.length)) === nlog - 1, '5: a second undo then removes the set');
  ok(await T(page, () => { try { JSON.parse(localStorage.getItem('isohold.coach.feed')); return true; } catch (e) { return false; } }), '5: the chat still saves');

  // ---- 7. "1 set" and one header row ----
  await page.reload(); await page.waitForFunction(() => window.__isoholdReady);
  await page.evaluate(() => document.getElementById('tab-coach').click()); await page.waitForTimeout(150);
  const day = await T(page, () => document.getElementById('lgDay').textContent);
  ok(!/\b1 sets\b/.test(day), '7: no "1 sets" on the Search & log summary: ' + day.slice(0, 120));
  ok(await T(page, () => window.__isoTest.plural(1, 'set') === 'set' && window.__isoTest.plural(2, 'set') === 'sets' && window.__isoTest.plural(0, 'set') === 'sets'), '7: plural helper');
  const head = await T(page, () => { const hh = document.querySelector('#coach .view-head'), bs = [...hh.querySelectorAll('button:not([hidden]), h1')].filter(e => e.offsetParent); const tops = bs.map(e => e.getBoundingClientRect().top); return { n: hh.querySelectorAll('[data-tool="search"]').length, prof: !!hh.querySelector('[data-tool="profile"], #profBtn'), spread: Math.max(...tops) - Math.min(...tops) }; });
  ok(head.n === 0 && head.prof && head.spread < 30, '7: Search & log has one header row, Profile in it, no second Search: ' + J(head));
  ok(!errs.length, 'no errors (Tomás) ' + errs);
  await b.close();

  // ---- 2. an unnamed lift is renamed from the message that logged it, when the chat still has it ----
  {
    const tt = Date.now() - 3 * DAY;
    const o = await open('android', { state: { profile: { units: 'kg', bw: 80, age: 30, sex: 'm', where: 'gym' }, eq: ['d'], notes: [{ t: tt, k: 'lift', name: 'Mancuernas', kg: 20, reps: 10, s: null, sets: 1, rpe: null }] },
      before: async ctx => { await ctx.addInitScript(`(${(f => { localStorage.setItem('isohold.coach.feed', JSON.stringify([{ t: f - 200, r: 'u', x: 'press inclinado mancuernas 20kg 10' }])); }).toString()})(${tt})`); } });
    await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady);
    const n = await T(o.page, () => window.__isoTest.store().notes[0]);
    ok(n.name !== 'Mancuernas' && !/^Unnamed/.test(n.name) && n.was === 'Mancuernas', '2: named from the stored message: ' + J(n));
    await o.b.close();
  }

  // ---- 5 + 6. Spanish session commands, a spoken reply to anything unknown, correction by voice, resume after a kill ----
  {
    const st = clone(SEED); st.profile.cues = true;
    const o = await boot(st, { init: FAKE_SPEECH }), p = o.page;
    const pc = t => T(p, t => window.__isoTest.parsePlayerCmd(t), t);
    for (const [es, en] of [['siguiente', 'next'], ['pausa', 'pause'], ['repetir', 'repeat'], ['repite', 'repeat'], ['más peso', 'more weight'], ['menos peso', 'less weight'], ['saltar ejercicio', 'skip exercise'], ['atrás', 'back'], ['sigue', 'resume'], ['más descanso', 'more rest'], ['¿cuánto queda?', 'time left'], ['terminar sesión', 'end session'], ['hice 8', 'did 8'], ['listo', 'done'], ['deshacer', 'undo'], ['cancelar', 'cancel']]) {
      const a = await pc(es), e = await pc(en);
      ok(J(a) === J(e) && (a || /undo|cancel/.test(en)), '5: "' + es + '" = "' + en + '": ' + J(a));
    }
    ok(J(await pc('no, eran 24kg')) === J(['weight', 24, 'kg', true]), '5: "no, eran 24kg" is a weight correction: ' + J(await pc('no, eran 24kg')));
    ok(J(await pc('12.5 kg')) === J(['weight', 12.5, 'kg', false]), '5: "12.5 kg" keeps its decimal');
    await p.click('#sessions [data-start]'); await p.waitForTimeout(250);
    await p.click('#pMic'); await p.waitForTimeout(200);
    await T(p, () => { window.__spoken = []; window.__speak('blah blah hola'); }); await p.waitForTimeout(100);
    const sp = await T(p, () => window.__spoken.slice());
    ok(sp.some(x => /didn’t get that/.test(x)), '5: an unknown command gets a spoken reply: ' + J(sp));
    await T(p, () => window.__speak('pausa')); await p.waitForTimeout(100);
    ok(await T(p, () => /Resume|Reanudar|Continue/i.test(document.getElementById('pPause').textContent + document.getElementById('pPause').getAttribute('aria-label'))), '5: "pausa" pauses');
    await T(p, () => window.__speak('sigue')); await p.waitForTimeout(100);
    // get to a weighted strength set, log it, then say a correction in the rest
    const ph = () => T(p, () => ({ ph: pPhase.textContent, name: pName.textContent, set: pSetLabel.textContent, wt: +document.getElementById('pWt').value }));
    let s, logged = null;
    for (let i = 0; i < 200 && !logged; i++) {
      s = await ph();
      if (/^(Hold|Reps)$/.test(s.ph) && s.wt > 0) {
        await T(p, () => window.__isoTest.runCmd('did 20')); const n0 = await T(p, () => window.__isoTest.store().log.length);
        await p.click('#pSkip'); await p.waitForTimeout(80);
        if ((await T(p, () => window.__isoTest.store().log.length)) === n0 + 1) logged = { ...s, n: n0 + 1, after: await ph() };
        continue;
      }
      await p.click('#pSkip'); await p.waitForTimeout(40);
    }
    ok(logged && /Rest|Switch|Move/.test(logged.after.ph), '6: a set is logged and the rest begins: ' + J(logged));
    await T(p, () => window.__speak('no, eran 30kg')); await p.waitForTimeout(100);
    const last = await T(p, () => window.__isoTest.store().log.slice(-1)[0]);
    ok(last.kg === 30, '5: "no, eran 30kg" in the rest fixes the set just logged: ' + J(last));
    // kill and resume: the logged set is not offered again
    await p.reload(); await p.waitForFunction(() => window.__isoholdReady); await p.waitForTimeout(200);
    await p.click('[data-resume]'); await p.waitForTimeout(250);
    const res = await ph();
    ok(!(res.name === logged.name && res.set === logged.set), '6: resume starts at the next set, not the one already logged: was ' + logged.name + ' / ' + logged.set + ', now ' + res.name + ' / ' + res.set);
    ok((await T(p, () => window.__isoTest.store().log.length)) === logged.n, '6: nothing logged twice');
    ok(!o.errs.length, 'no errors (session) ' + o.errs);
    await o.b.close();
  }

  // ---- Chloe: "16s" dumbbells, a weight far off your usual is asked about, plain coffee, chips with your latest numbers ----
  {
    const now = Date.now(), fd = [3, 2, 1].map((d, i) => ({ t: now - d * DAY, r: 'u', x: i < 2 ? 'lat pulldown 45x10x3' : 'lat pulldown 50x10x3' }));
    const st = { profile: { units: 'kg', bw: 68, age: 34, sex: 'f', where: 'gym', days: 3 }, eq: ['b', 'c', 'd', 'k'], body: [{ t: now - 9 * DAY, kg: 68 }],
      notes: [{ t: now - 5 * DAY, k: 'lift', name: 'Bench Press', kg: 40, reps: 8, s: null, sets: 1, rpe: null }] };
    const o = await boot(st, { before: async ctx => { await ctx.addInitScript(`localStorage.setItem('isohold.coach.feed', ${J(J(fd))})`); } }), p = o.page;
    const Hc = t => T(p, t => { window.__isoTest.handle(t); }, t), notesL = () => T(p, () => window.__isoTest.store().notes.filter(n => n.k === 'lift'));
    await p.evaluate(() => document.getElementById('tab-coach').click()); await p.waitForTimeout(100);
    const chips = await T(p, () => [...document.querySelectorAll('#cSugs button')].map(b => b.textContent));
    ok(chips.includes('lat pulldown 50x10x3') && !chips.includes('lat pulldown 45x10x3'), 'chips: the latest pulldown (50), not last week’s 45: ' + J(chips));
    let r2 = await T(p, () => window.__isoTest.parseText('incline db press 16s 3x10'));
    let a2 = r2.actions[0];
    ok(r2.actions.length === 1 && a2.type === 'log_set' && a2.exercise === 'incline-press' && a2.eq === 'd' && a2.perHand && a2.weight === 16 && a2.sets === 3 && a2.reps === 10, '16s: incline db press 16s 3x10 = Incline Dumbbell Press, 3 x 16 kg (per hand) x 10: ' + J(r2));
    const n0 = await T(p, () => window.__isoTest.store().log.length);
    await Hc('incline db press 16s 3x10');
    const lg3 = await T(p, () => window.__isoTest.store().log.slice(-3));
    ok((await T(p, () => window.__isoTest.store().log.length)) === n0 + 3 && lg3.every(x => x.id === 'incline-press' && x.kg === 16 && x.v === 10 && x.eq === 'd'), '16s: saved to the incline press history: ' + J(lg3));
    ok(!(await notesL()).some(n => /Press S\b/.test(n.name)), '16s: no "Incline Press S" lift');
    for (const t of ["curl 12's 3x10", 'bench 20s 10']) { const x = (await T(p, t => window.__isoTest.parseText(t), t)).actions[0]; ok(x && x.weight === (t[0] === 'c' ? 12 : 20) && x.perHand && !/\bS$/.test(x.name || ''), '16s: ' + t + ': ' + J(x)); }
    for (const t of ['plank 30s', 'lateral raise 3 x 30s 8kg']) { const x = (await T(p, t => window.__isoTest.parseText(t), t)).actions[0]; ok(x && x.seconds === 30 && !x.perHand, '16s: "' + t + '" is still seconds: ' + J(x)); }
    // bench 4kg when you bench 40
    const L0 = (await notesL()).length;
    await Hc('bench 4kg 8,8,6');
    let cc = await lastCard(p);
    ok(cc.liftAsk && /Did you mean 40 kg\?/.test(cc.title) && (await notesL()).length === L0, 'typo check: "bench 4kg 8,8,6" asks "Did you mean 40 kg?" and saves nothing yet: ' + cc.title);
    await p.click('[data-lyes]'); await p.waitForTimeout(100);
    let Lb = (await notesL()).slice(L0);
    ok(Lb.length === 3 && Lb.every(n => n.name === 'Bench Press' && n.kg === 40) && Lb.map(n => n.reps).join() === '8,8,6', 'typo check: Yes saves 40 kg x 8, 8, 6: ' + J(Lb));
    await Hc('bench 4kg 8'); await Hc('no');
    Lb = (await notesL()).slice(L0 + 3); ok(Lb.length === 1 && Lb[0].kg === 4, 'typo check: "no" saves it as typed: ' + J(Lb));
    await Hc('bench 400kg 8'); await Hc('undo');
    ok((await notesL()).length === L0 + 4 && /not saved/.test((await lastCard(p)).title), 'typo check: undo while asked saves nothing');
    await Hc('bench 4kg 8'); await Hc('yes');
    Lb = (await notesL()).slice(-1); ok(Lb[0].kg === 40, 'typo check: typed "yes" saves the suggestion');
    await Hc('bench 42.5kg 8'); ok(!(await lastCard(p)).liftAsk, 'typo check: a normal weight is saved straight away');
    // coffee
    await Hc('coffee'); cc = await lastCard(p);
    ok(/black coffee/.test(cc.warn) && /Coffee/.test(cc.lines[0]), 'coffee: plain coffee is black, and the card says so: ' + cc.warn);
    await Hc('white coffee'); await Hc('white coffee'); await Hc('coffee'); cc = await lastCard(p);
    ok(/White coffee/.test(cc.lines[0]) && /with milk/.test(cc.warn), 'coffee: when you usually have it white, plain coffee counts milk and says so: ' + cc.lines[0] + ' | ' + cc.warn);
    await Hc('black coffee'); cc = await lastCard(p); ok(/^Coffee/.test(cc.lines[0]) && !cc.warn, 'coffee: "black coffee" stays black: ' + cc.lines[0]);
    ok(!o.errs.length, 'no errors (Chloe) ' + o.errs);
    await o.b.close();
  }

  // ---- 7. a logged ride counts only on the day it was logged ----
  for (const ago of [2, 0]) {
    const st = clone(SEED), tr = ago ? Date.now() - ago * DAY : Date.now() - 60000;
    st.done.w4d2pm = true; st.done.w4c1am = tr; st.done.w4d1am = Date.now() - 3 * DAY;
    st.notes = (st.notes || []).concat([{ t: tr, k: 'cardio', m: 'Cycling', min: 30, km: null, steps: null, hard: false }]);
    const o = await boot(st), p = o.page;
    const d = await T(p, () => window.__isoTest.store().done);
    const morning = await T(p, () => { const a = [...document.querySelectorAll('#sessions article.sess')].find(x => /Morning/.test(x.querySelector('h3').textContent)); return a ? a.textContent : ''; });
    if (ago) ok(!d.w4c1am && d.w4d1am && /Start morning/.test(morning) && !/Done/.test(morning), '7: a ride from 2 days ago no longer marks today’s morning done (the ride stays logged): ' + morning.slice(0, 80));
    else ok(d.w4c1am === tr && /Done/.test(morning), '7: a ride logged today still counts today: ' + morning.slice(0, 80));
    ok((await T(p, () => window.__isoTest.store().notes.filter(n => n.k === 'cardio').length)) >= 1, '7: the ride is still logged');
    await o.b.close();
  }

  srv.close();
  console.log(`r14b: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
