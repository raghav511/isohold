// Back and stabilizer add-on: on by default on the cardio days, each day its own pairs, band versions, and it can be turned off.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8260, URL = `http://localhost:${PORT}/index.html`;
async function boot(state, opts = {}) {
  const o = await open('android', Object.assign({ state }, opts));
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
const T = (page, f, a) => page.evaluate(f, a);
const ids = (page, day) => T(page, d => { const t = window.__isoTest, dy = t.allDays().find(x => x.id === d); return t.buildQueue(dy, 'pm', t.phaseOf(1)).filter(i => i.id).map(i => i.id); }, day);
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 40, sex: 'm' }, eq: ['d'] });
  let q = await ids(page, 'c1');
  ok(['sa-row', 'rear-fly', 'ext-rot', 'prone-y'].every(id => q.includes(id)), 'cardio day 1: rows, rear delts, rotator cuff, lower traps (' + [...new Set(q)] + ')');
  q = await ids(page, 'c2');
  ok(['sa-row', 'rear-fly', 'ham-bridge', 'tib-hold'].every(id => q.includes(id)) && !q.includes('ext-rot'), 'cardio day 2: rows, rear delts, knee-bend hamstrings, shins');
  ok(await T(page, () => { const t = window.__isoTest, dy = t.allDays().find(x => x.id === 'c1'); const qq = t.buildQueue(dy, 'pm', t.phaseOf(1)); return qq.some(i => i.kind === 'cardio'); }), 'the cardio still follows the add-on');
  await page.evaluate(() => document.querySelector('.strip button[data-i="2"]').click()).catch(() => {}); await page.waitForTimeout(150);
  const txt = await page.locator('#sessions').innerText();
  ok(/Back and stabilizers/.test(txt) || /rotator cuff/.test(txt), 'the plan names the add-on');
  await page.click('#sessions [data-start][data-part="pm"]'); await page.waitForTimeout(300);
  ok(await page.isVisible('#player') && /Row|Delt|Rotation|Y Raise/.test(await page.textContent('#player')), 'the add-on starts in the session player');
  await page.click('#pClose'); await page.click('#pEndYes').catch(() => {}); await page.waitForTimeout(150);
  await page.click('#tab-exercises'); await page.waitForTimeout(250);
  ok(/Back and stabilizer add-on/.test(await page.locator('body').innerText()), 'Exercises lists the add-on');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors on the cardio day ' + errs);
  await b.close();

  // turned off
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 70, age: 40, sex: 'm', stab: false }, eq: ['d'] }));
  q = await ids(page, 'c1'); ok(!q.includes('ext-rot') && !q.includes('sa-row'), 'turned off: no add-on');
  await b.close();

  // bands only: band names and band instructions
  ({ b, page, errs } = await boot({ profile: { units: 'kg', bw: 60, age: 52, sex: 'f' }, eq: ['r'] }));
  const names = await T(page, () => { const t = window.__isoTest, dy = t.allDays().find(x => x.id === 'c1'); return t.buildQueue(dy, 'pm', t.phaseOf(1)).filter(i => i.id).map(i => i.ex && i.ex.name); });
  ok(names.includes('Band External Rotation Hold') && names.includes('Band Rear-Delt Fly Hold') && names.includes('Band Row Hold'), 'bands: band names (' + [...new Set(names)] + ')');
  const steps = await T(page, () => { const t = window.__isoTest, dy = t.allDays().find(x => x.id === 'c1'); const it = t.buildQueue(dy, 'pm', t.phaseOf(1)).find(i => i.id === 'ext-rot' && i.kind === 'hold'); return it ? JSON.stringify(it.ex.steps || it.steps || '') : ''; });
  ok(/Pin one end of a light band/.test(steps), 'bands: external rotation uses band instructions');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors ' + errs);
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
