// Food lines: every named food is logged, and a stated amount goes to the right food.
const { serve, open } = require('./lib');
let failed = 0;
(async () => {
  const srv = await serve(8249);
  for (const loc of ['en-US', 'es-ES']) {
    const { b, page } = await open('android', { state: { profile: { units: 'kg', bw: 70, age: 30, sex: 'm' }, eq: ['d'] }, locale: loc });
    await page.goto('http://localhost:8249/index.html'); await page.waitForFunction(() => window.__isoholdReady);
    const res = await page.evaluate((loc) => {
      const F = loc === 'es-ES' ? [['pollo', 'Chicken breast'], ['arroz', 'Rice'], ['lentejas', 'Lentils'], ['merluza', 'White fish'], ['macarrones', 'Pasta'], ['ensalada', 'Salad'], ['patatas', 'Potato'], ['huevos', 'Egg'], ['ternera', 'Beef'], ['atun', 'Tuna'], ['yogur', 'Yogurt'], ['pan', 'Bread'], ['garbanzos', 'Chickpeas'], ['salmon', 'Salmon'], ['pavo', 'Turkey']]
        : [['chicken', 'Chicken breast'], ['rice', 'Rice'], ['lentils', 'Lentils'], ['salmon', 'Salmon'], ['pasta', 'Pasta'], ['salad', 'Salad'], ['potatoes', 'Potato'], ['eggs', 'Egg'], ['beef', 'Beef'], ['tuna', 'Tuna'], ['yogurt', 'Yogurt'], ['bread', 'Bread'], ['chickpeas', 'Chickpeas'], ['paneer', 'Paneer'], ['tofu', 'Tofu'], ['oats', 'Oats'], ['dal', 'Dal']];
      const AND = loc === 'es-ES' ? ' y ' : ' and ', WITH = loc === 'es-ES' ? ' con ' : ' with ', ATE = loc === 'es-ES' ? 'comí ' : 'i had ', DIN = loc === 'es-ES' ? 'cena: ' : 'dinner: ';
      const bad = []; let n = 0;
      const chk = (txt, want) => { n++; const r = window.__isoTest.parseText(txt), items = [].concat(...r.actions.filter(a => a.type === 'log_food').map(a => a.items));
        const okAll = want.every(w => items.some(i => i.n === w[0] && (w[1] == null || i.g === w[1]))) && items.length === want.length;
        if (!okAll || r.unknown.length) bad.push(txt + ' -> ' + items.map(i => i.n + ':' + i.g).join(', ') + (r.unknown.length ? ' unknown:' + r.unknown : '')); };
      F.forEach(([a, A], i) => {
        const [b2, B] = F[(i + 3) % F.length];
        chk(`${a} 200g`, [[A, 200]]); chk(`200g ${a}`, [[A, 200]]); chk(`${ATE}${a} 250g`, [[A, 250]]);
        chk(`${a}${AND}${b2}`, [[A], [B]]); chk(`${a} 150g${AND}${b2} 100g`, [[A, 150], [B, 100]]);
        chk(`${DIN}${a}${WITH}${b2}`, [[A], [B]]); chk(`${a}${WITH}${b2} 300g`, [[A, 300], [B]]); chk(`${ATE}${a} 180g${WITH}${b2}`, [[A, 180], [B]]);
      });
      return { n, bad };
    }, loc);
    console.log(loc, res.n, 'lines,', res.bad.length, 'bad'); failed += res.bad.length; res.bad.slice(0, 30).forEach(x => console.log('  ' + x));
    await b.close();
  }
  srv.close(); process.exit(failed ? 1 : 0);
})();
