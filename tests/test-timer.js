// Timer: the move-on button says what it does, the ring does the same, self-paced rests wait, and mis-taps aren't logged.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
(async () => {
  const srv = await serve(8210);
  for (const kind of ['iphone', 'android']) for (const pace of ['auto', 'self']) {
    const { b, page, errs } = await open(kind, { state: { profile: { units: 'kg', pace }, eq: ['k', 'd'] } });
    await page.clock.install();
    await page.goto('http://localhost:8210/index.html'); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    await page.click('#sessions [data-start][data-part=am]'); await page.clock.runFor(300);
    const lab = () => page.evaluate(() => [document.getElementById('pPhase').textContent, document.getElementById('pSkip').textContent, document.getElementById('pRingCap').textContent]);
    let l = await lab(); ok(l[1] === 'Skip warm-up', kind + pace + ' warm-up label ' + l);
    await page.click('#pRingBtn'); await page.clock.runFor(300);
    l = await lab(); ok(/Get set/.test(l[0]) && l[1] === 'Start now' && l[2] === 'tap: start', kind + pace + ' ring skipped warm-up, get set label ' + l);
    await page.click('#pSkip'); await page.clock.runFor(1000);
    l = await lab(); ok(l[1] === 'End hold', kind + pace + ' hold label ' + l);
    await page.click('#pSkip'); await page.clock.runFor(300);
    ok((await page.evaluate(() => window.__isoTest.store().log.length)) === 0, kind + pace + ' a 1-second hold is not logged');
    l = await lab(); ok(/Move to next|Rest|Switch/.test(l[0]) && /Skip rest|Start next|Switch now/.test(l[1]), kind + pace + ' rest label ' + l);
    const name0 = await page.textContent('#pName');
    await page.clock.runFor(60000);
    const moved = (await page.textContent('#pName')) !== name0 || !/Move to next|Rest/.test((await lab())[0]);
    ok(pace === 'self' ? !moved : moved, kind + pace + (pace === 'self' ? ' self-paced rest waits' : ' automatic rest moves on'));
    if (pace === 'self') { const t = await page.textContent('#pTime'); ok(+t >= 59 || /1:0/.test(t), kind + ' self-paced rest counts up (' + t + ')'); }
    ok(!errs.length, kind + pace + ' no errors ' + errs);
    await b.close();
  }
  console.log(pass + ' passed, ' + fail + ' failed'); srv.close();
})();
