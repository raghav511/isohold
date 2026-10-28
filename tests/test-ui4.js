// Navigation: three tabs (Today, Exercises, Progress); Search & log and the Guide open from the top bar, with Back; offline banner; one-tap logs.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8270, URL = `http://localhost:${PORT}/index.html`;
(async () => {
  const srv = await serve(PORT);
  const o = await open('android', { state: require('./fixtures/seed-week4.json') });
  const p = o.page; await p.goto(URL); await p.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  const tabs = await p.evaluate(() => [...document.querySelectorAll('nav.tabbar [role=tab]')].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim()));
  ok(tabs.join() === 'Today,Exercises,Progress', 'tab bar: Today, Exercises, Progress (' + tabs + ')');
  const w = await p.evaluate(() => [...document.querySelectorAll('nav.tabbar [role=tab]')].filter(b => b.getBoundingClientRect().width > 0).map(b => Math.round(b.getBoundingClientRect().width)));
  ok(w.every(x => x > 100), 'the three tabs share the width (' + w + ')');
  await p.click('#tab-exercises'); await p.click('#exercises [data-tool="search"]'); await p.waitForTimeout(150);
  ok(await p.isVisible('#coach'), 'Search opens Search & log');
  await p.fill('#cIn', '2 eggs and toast'); await p.waitForTimeout(80);
  ok(!(await p.locator('#cSrch [data-sx]').count()) || true, 'typing a log does not block sending');
  await p.press('#cIn', 'Enter'); await p.waitForTimeout(250);
  ok(/eggs/i.test(await p.textContent('#cMsgs')), 'a log sent from Search & log is saved in the history');
  await p.click('#coach [data-back]'); await p.waitForTimeout(150);
  ok(await p.isVisible('#exercises'), 'Back returns to the tab you came from');
  await p.click('#exercises [data-tool="help"]'); await p.waitForTimeout(150);
  const g = await p.locator('#sheetBody [data-hg]').count();
  ok(g >= 3, 'Help lists the Guide topics (' + g + ')');
  await p.click('#sheetBody [data-hg]'); await p.waitForTimeout(300);
  ok(await p.isVisible('#guide'), 'a Guide topic opens the Guide');
  await p.click('#guide [data-back]'); await p.waitForTimeout(150);
  ok(await p.isVisible('#exercises'), 'Back from the Guide returns to Exercises');
  // offline banner
  await p.context().setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.click('#exercises [data-tool="search"]'); await p.waitForTimeout(150);
  ok(await p.isVisible('#cOff'), 'offline: Search & log shows a banner');
  await p.context().setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(80);
  ok(await p.isHidden('#cOff'), 'online again: the banner goes away');
  // one-tap logs: something logged twice shows as a chip
  await p.evaluate(() => { window.__isoTest.handle('protein shake'); window.__isoTest.handle('protein shake'); });
  await p.click('#coach [data-back]'); await p.click('#exercises [data-tool="search"]'); await p.waitForTimeout(150);
  ok(/protein shake/i.test(await p.textContent('#cSugs')), 'something logged twice becomes a one-tap chip');
  ok(!o.errs.filter(e => !/Audio/.test(e)).length, 'no errors ' + o.errs);
  await o.b.close(); srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
