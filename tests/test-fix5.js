// Figure motion: transitions change gradually, the support foot stays planted, holds breathe, less motion stays still,
// and the session player keeps time while its figure animates.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok', m); } else { fail++; console.log('FAIL', m); } };
const PORT = 8580, URL = `http://localhost:${PORT}/index.html`;
const STATE = { profile: { units: 'kg', bw: 70, age: 40, sex: 'm' }, eq: ['k', 'd'] };
async function boot(kind, extra = {}) {
  const st = JSON.parse(JSON.stringify(STATE)); Object.assign(st.profile, extra.profile || {});
  // count requestAnimationFrame calls so a test can tell whether a loop is running
  const o = await open(kind, { state: st, init: () => { const r = window.requestAnimationFrame.bind(window); window.__raf = 0; window.requestAnimationFrame = f => { window.__raf++; return r(f); }; } });
  if (extra.reduce) await o.page.emulateMedia({ reducedMotion: 'reduce' });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  return o;
}
// record the sheet figure's SVG every animation frame for ms milliseconds
const record = (page, sel, ms) => page.evaluate(({ sel, ms }) => new Promise(res => {
  const fr = [], t0 = performance.now();
  (function f(now) { const s = document.querySelector(sel); fr.push([now - t0, s ? s.innerHTML : '']); if (now - t0 < ms) requestAnimationFrame(f); else res(fr); })(t0);
}), { sel, ms });
const nums = s => (s.match(/-?\d+\.\d/g) || []).map(Number);
function maxJump(fr) {
  let worst = 0, same = 0;
  for (let i = 1; i < fr.length; i++) {
    const a = nums(fr[i - 1][1]), b = nums(fr[i][1]);
    if (a.length !== b.length) continue; same++;
    const dt = Math.max(1, (fr[i][0] - fr[i - 1][0]) / 16.7); // per 60 fps frame, in case a frame was dropped
    for (let k = 0; k < a.length; k++) worst = Math.max(worst, Math.abs(a[k] - b[k]) / dt);
  }
  return [worst, same];
}
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['android', 'iphone']) {
    // ---- exercise sheet: smooth transitions ----
    let { b, page, errs } = await boot(kind);
    await page.click('#tab-exercises'); await page.waitForTimeout(250);
    for (const id of ['goblet-squat', 'lateral-raise', 'side-plank', 'incline-press']) {
      await page.click('#lib [data-ex="' + id + '"]'); await page.waitForTimeout(50);
      const fr = await record(page, '#dFig svg', 3600);
      const distinct = new Set(fr.map(x => x[1])).size, [jump, cmp] = maxJump(fr);
      ok(distinct > 40, kind + ' ' + id + ': the figure animates smoothly (' + distinct + ' distinct frames in 3.6 s)');
      ok(cmp > 40 && jump < 4, kind + ' ' + id + ': no frame-to-frame jump (max ' + jump.toFixed(2) + ' units per frame)');
      await page.click('#sheetClose'); await page.waitForTimeout(100);
    }
    // ---- every newer hold moves without a jump between its steps (no limb swinging through the body) ----
    const nj = await page.evaluate(() => ['dip-hold', 'incline-curl', 'hammer', 'pushup-plus', 'rev-nordic', 'shrug', 'wrist', 'neck-hold'].map(id => {
      const ex = EX_ADDON.find(e => e.id === id) || EX.find(e => e.id === id), K = ex._r.slice(0, 3); let prev = null, jump = 0;
      for (let i = 0; i <= 160; i++) { const o = FIG.place(FIG.move(ex, K, null, i / 60, 2.65), ex._anchor, 0), pts = Object.values(o).filter(v => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number'); if (prev) pts.forEach((q, k) => { if (prev[k]) jump = Math.max(jump, Math.hypot(q[0] - prev[k][0], q[1] - prev[k][1])); }); prev = pts; }
      return [id, jump];
    }));
    for (const [id, j] of nj) ok(j < 1.2, kind + ' ' + id + ': smooth between steps (max ' + j.toFixed(2) + ' per frame)');
    // ---- the engine: support foot planted and nothing through the floor during the squat ----
    const eng = await page.evaluate(() => {
      const ex = EX.find(e => e.id === 'goblet-squat'), K = ex._r.slice(0, 3), out = { foot: 0, toe: 0, below: 0, joint: 0, knee: 0 };
      let p0 = null, prev = null;
      for (let i = 0; i <= 160; i++) {
        const t = i / 60, r = FIG.move(ex, K, null, t, 2.65), o = FIG.place(r, ex._anchor, 0);
        if (!p0) p0 = { An: o.An, Tn: o.Tn };
        out.foot = Math.max(out.foot, Math.hypot(o.An[0] - p0.An[0], o.An[1] - p0.An[1]));
        out.toe = Math.max(out.toe, Math.hypot(o.Tn[0] - p0.Tn[0], o.Tn[1] - p0.Tn[1]));
        ['H', 'Kn', 'Kf', 'An', 'Af', 'Tn', 'Tf', 'Pn', 'head'].forEach(k => { out.below = Math.max(out.below, o[k][1]); });
        // knee never bends backwards (hyperextends): the shin stays behind or in line with the thigh
        out.knee = Math.min(out.knee, ((r.ln[0] - r.ln[1]) + 540) % 360 - 180);
        if (prev) ['S', 'H', 'Kn', 'En', 'Wn', 'head'].forEach(k => { out.joint = Math.max(out.joint, Math.hypot(o[k][0] - prev[k][0], o[k][1] - prev[k][1])); });
        prev = o;
      }
      return out;
    });
    ok(eng.foot <= 1 && eng.toe <= 1, kind + ' squat: support foot stays planted (ankle ' + eng.foot.toFixed(2) + ', toe ' + eng.toe.toFixed(2) + ')');
    ok(eng.below <= 0.5, kind + ' squat: nothing passes through the floor (' + eng.below.toFixed(2) + ')');
    ok(eng.joint < 3, kind + ' squat: joints move gradually at 60 fps (max ' + eng.joint.toFixed(2) + ')');
    ok(eng.knee >= -1, kind + ' squat: knees never hyperextend (' + eng.knee.toFixed(1) + ')');
    // breathing in the hold: the chest rises and falls a little while the feet stay put
    const br = await page.evaluate(() => {
      const ex = EX.find(e => e.id === 'goblet-squat'), r = ex._r[2], vb = ex._vb;
      const ys = [0, 0.65, 1.3].map(b => { const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); d.innerHTML = FIG.inner(ex, r, null, b); return d.innerHTML; });
      return [ys[0] !== ys[2], ys[0].length === ys[2].length];
    });
    ok(br[0] && br[1], kind + ' hold breathing changes the picture without changing its make-up');
    // thumbnails stay static: the step pictures in a sheet are never rewritten
    await page.click('#lib [data-ex="goblet-squat"]'); await page.waitForTimeout(100);
    const thumbs = await page.evaluate(() => new Promise(res => { let n = 0; const m = new MutationObserver(x => { n += x.length; }); document.querySelectorAll('.steps .sf svg').forEach(s => m.observe(s, { subtree: true, childList: true, attributes: true })); setTimeout(() => res([document.querySelectorAll('.steps .sf svg').length, n]), 1200); }));
    ok(thumbs[0] >= 3 && thumbs[1] === 0, kind + ' step thumbnails stay static (' + thumbs + ')');
    await page.click('#sheetClose'); await page.waitForTimeout(150);
    // with the sheet closed and no session, the animation loop stops
    let r0 = await page.evaluate(() => window.__raf); await page.waitForTimeout(500); let r1 = await page.evaluate(() => window.__raf);
    ok(r1 - r0 <= 2, kind + ' no animation loop while nothing animates (' + (r1 - r0) + ' frames)');
    // ---- session player: figure animates and the timer keeps time ----
    await page.click('#tab-train'); await page.waitForTimeout(150);
    await page.click('#sessions [data-start][data-part=am]'); await page.waitForTimeout(300);
    const go = await page.$('#sheetWrap:not([hidden]) #eqGo'); if (go) { await go.click(); await page.waitForTimeout(300); }
    for (let k = 0; k < 8 && !(await page.evaluate(() => /Get set/.test(document.getElementById('pPhase').textContent) && / Hold$/.test(document.getElementById('pName').textContent))); k++) { await page.click('#pSkip'); await page.waitForTimeout(250); }
    const pfr = await record(page, '#pSvg', 2500), [pj] = maxJump(pfr);
    ok(new Set(pfr.map(x => x[1])).size > 20 && pj < 4, kind + ' player figure moves into position smoothly (' + new Set(pfr.map(x => x[1])).size + ' frames, max jump ' + pj.toFixed(2) + ')');
    await page.click('#pSkip'); await page.waitForTimeout(300); // start the hold
    const t0 = +(await page.textContent('#pTime')); const w0 = Date.now(); await page.waitForTimeout(3000);
    const t1 = +(await page.textContent('#pTime')), took = (Date.now() - w0) / 1000;
    ok(Math.abs((t0 - t1) - took) <= 1.01, kind + ' hold timer keeps time while the figure breathes (' + t0 + ' -> ' + t1 + ' in ' + took.toFixed(1) + ' s)');
    const hold = await record(page, '#pSvg', 1500);
    ok(new Set(hold.map(x => x[1])).size > 5, kind + ' the figure breathes during the hold');
    ok(!errs.length, kind + ' no page errors ' + errs.join(' | '));
    await b.close();

    // ---- reduced motion (system setting) and the app's Less motion setting: no continuous animation ----
    for (const mode of ['system', 'calm']) {
      ({ b, page, errs } = await boot(kind, mode === 'system' ? { reduce: true } : { profile: { calm: true } }));
      await page.click('#tab-exercises'); await page.waitForTimeout(250);
      await page.click('#lib [data-ex="goblet-squat"]'); await page.waitForTimeout(300);
      const fr = await record(page, '#dFig svg', 1200);
      ok(new Set(fr.map(x => x[1])).size === 1, kind + ' ' + mode + ': sheet figure is a still key pose');
      await page.evaluate(() => { window.__muts = 0; new MutationObserver(x => { window.__muts += x.length; }).observe(document.getElementById('dFig'), { subtree: true, childList: true, attributes: true, characterData: true }); });
      r0 = await page.evaluate(() => window.__raf); await page.waitForTimeout(800); r1 = await page.evaluate(() => window.__raf);
      ok(r1 - r0 <= 2 && (await page.evaluate(() => window.__muts)) === 0, kind + ' ' + mode + ': no animation loop and no redraws (' + (r1 - r0) + ' frames)');
      await page.click('#sheetClose'); await page.waitForTimeout(150);
      await page.click('#tab-train'); await page.waitForTimeout(150);
      await page.click('#sessions [data-start][data-part=am]'); await page.waitForTimeout(300);
      const g2 = await page.$('#sheetWrap:not([hidden]) #eqGo'); if (g2) { await g2.click(); await page.waitForTimeout(300); }
      for (let k = 0; k < 8 && !(await page.evaluate(() => /Get set/.test(document.getElementById('pPhase').textContent) && / Hold$/.test(document.getElementById('pName').textContent))); k++) { await page.click('#pSkip'); await page.waitForTimeout(250); }
      await page.waitForTimeout(100);
      await page.evaluate(() => { window.__pm = 0; new MutationObserver(x => { window.__pm += x.length; }).observe(document.getElementById('pSvg'), { subtree: true, childList: true, attributes: true }); });
      await page.waitForTimeout(1500);
      ok((await page.evaluate(() => window.__pm)) === 0, kind + ' ' + mode + ': player figure stays still');
      ok(!errs.length, kind + ' ' + mode + ': no page errors ' + errs.join(' | '));
      await b.close();
    }
  }
  console.log(pass + ' passed, ' + fail + ' failed'); srv.close(); process.exit(fail ? 1 : 0);
})();
