// Every lifter line (all weights x set formats x lifts, lb and kg) keeps its weight and reps: weights x formats x lifts.
const { serve, open } = require('./lib');
let failed = 0;
(async () => {
  const srv = await serve(8247);
  for (const units of ['lb', 'kg']) {
    const { b, page } = await open('android', { state: { profile: { units, bw: 90, age: 30, sex: 'm', where: 'gym' }, eq: ['b', 'c', 'd'] } });
    await page.goto('http://localhost:8247/index.html'); await page.waitForFunction(() => window.__isoholdReady);
    const res = await page.evaluate((units) => {
      const W = units === 'lb' ? [95, 135, 185, 225, 245, 315, 335, 365, 375, 405, 455, 505, 605] : [20, 32.5, 40, 60, 62.5, 80, 100, 102.5, 120, 140, 160, 180, 200, 220];
      const lifts = ['squat', 'bench', 'deadlift', 'ohp', 'leg press', 'lat pulldown', 'goblet squat', 'rdl', 'curl', 'hip thrust'];
      const F = [
        (l, w) => [`${l} ${w} for 5`, w, [5]], (l, w) => [`${l} ${w}x5`, w, [5]], (l, w) => [`${l} ${w} x 8`, w, [8]],
        (l, w) => [`${l} ${w}x5x3`, w, [5, 5, 5]], (l, w) => [`${l} ${w} for 3 3`, w, [3, 3]], (l, w) => [`${l} ${w} for 5 5 4`, w, [5, 5, 4]],
        (l, w) => [`${l} ${w} for 8, 8, 6`, w, [8, 8, 6]], (l, w) => [`${l} ${w} ${units} x 6 @8`, w, [6]], (l, w) => [`${l} ${w} for 2 2 1 @9`, w, [2, 2, 1]],
        (l, w) => [`${l} ${w}x3, ${w}x3`, w, [3, 3]], (l, w) => [`${l} ${w} for a double`, w, [2]], (l, w) => [`${l} ${w} 3 sets of 5`, w, [5, 5, 5]]];
      const bad = [];
      for (const l of lifts) for (const w of W) for (const f of F) {
        const [txt, ew, er] = f(l, w), r = window.__isoTest.parseText(txt), A = r.actions.filter(a => a.type === 'log_set' || a.type === 'log_lift');
        const sets = []; A.forEach(a => { const n = a.sets || 1; for (let i = 0; i < n; i++) sets.push([a.weight, a.reps]); (a.more || []).forEach(x => sets.push([a.weight, x])); });
        const okW = sets.length && sets.every(s => s[0] === ew), okR = JSON.stringify(sets.map(s => s[1])) === JSON.stringify(er);
        if (!okW || !okR || r.unknown.length) bad.push(txt + ' -> ' + JSON.stringify(sets) + (r.unknown.length ? ' unknown:' + r.unknown : ''));
      }
      return { n: lifts.length * W.length * F.length, bad };
    }, units);
    console.log(units, res.n, 'lines,', res.bad.length, 'bad'); failed += res.bad.length; res.bad.slice(0, 25).forEach(x => console.log('  ' + x));
    await b.close();
  }
  srv.close(); process.exit(failed ? 1 : 0);
})();
