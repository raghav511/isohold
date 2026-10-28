// Exercises never appear drawn with equipment the user hasn't selected: without free weights, no picture shows a dumbbell, kettlebell, barbell or plate.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8262, URL = `http://localhost:${PORT}/index.html`;
const ironFigs = p => p.evaluate(() => [...document.querySelectorAll('svg')].filter(s => s.getBoundingClientRect().width > 0 && /iron-hub/.test(s.innerHTML)).map(s => { const c = s.closest('[data-ex]'); return c ? c.dataset.ex : '?'; }));
(async () => {
  const srv = await serve(PORT);
  for (const eq of [['c'], ['r'], ['c', 'r']]) {
    const o = await open('android', { state: { profile: { units: 'kg', bw: 70, age: 30, sex: 'm', where: eq.includes('c') ? 'gym' : 'home' }, eq } });
    const p = o.page; await p.goto(URL); await p.waitForFunction(() => window.__isoholdReady);
    let bad = [];
    for (let i = 0; i < 7; i++) { await p.evaluate(i => document.querySelector('.strip button[data-i="' + i + '"]').click(), i).catch(() => {}); await p.waitForTimeout(80); bad = bad.concat(await ironFigs(p)); }
    ok(!bad.length, eq + ': no free-weight pictures on Today, any day (' + [...new Set(bad)] + ')');
    await p.click('#tab-exercises'); await p.waitForTimeout(250);
    const lib = await ironFigs(p);
    ok(!lib.length, eq + ': no free-weight pictures in Exercises (' + lib + ')');
    if (eq.join() === 'c') {
      ok(await p.locator('#lib [data-ex="ext-rot"]').count() === 0, 'cables only: side-lying external rotation is hidden in Exercises');
      ok(/Hidden because they need equipment.*External Rotation/.test(await p.locator('#lib').innerText()), 'cables only: Exercises says what is hidden and why');
      await p.click('#tab-train'); await p.evaluate(() => document.querySelector('.strip button[data-i="2"]').click()).catch(() => {}); await p.waitForTimeout(100);
      ok(/Not in this session: .*External Rotation/.test(await p.evaluate(() => (document.querySelector('[data-miss="ext-rot"]') || {}).textContent || '')), 'cables only: the plan says the external rotation was left out, without a picture');
    }
    ok(!o.errs.filter(e => !/Audio/.test(e)).length, eq + ': no errors ' + o.errs);
    await o.b.close();
  }
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
