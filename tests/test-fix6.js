// Muscle-part add-ons: lower chest (dip), long-head biceps (incline curl), brachialis (hammer), serratus (push-up plus),
// middle quad (reverse Nordic), upper traps (shrug), forearm extensors (wrist), neck. Steps, rep partners, band/bodyweight
// versions, papers, cardio-day placement, cable-only versions, body-map tags, Search, safety notes.
const { serve, open } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8600, URL = `http://localhost:${PORT}/index.html`;
const C1 = ['dip-hold', 'incline-curl', 'hammer', 'pushup-plus'], C2 = ['rev-nordic', 'shrug', 'wrist', 'neck-hold'], ALL = C1.concat(C2);
const BODY_TAGS = ['Lower chest', 'Biceps', 'Forearms', 'Serratus', 'Quads', 'Traps', 'Neck', 'Upper chest', 'Triceps'];
async function boot(eq, extra = {}) {
  const o = await open('android', { state: { profile: Object.assign({ units: 'kg', bw: 70, age: 40, sex: 'm' }, extra), eq } });
  await o.page.goto(URL); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 }); return o;
}
// the newest pairs alternate by week, so look at weeks 1 and 2 together unless a week is given
const q = (page, day, wk) => page.evaluate(([d, wk]) => { const t = window.__isoTest, s = t.store(), w0 = s.week, dy = t.allDays().find(x => x.id === d), out = []; (wk ? [wk] : [1, 2]).forEach(w => { s.week = w; t.buildQueue(dy, 'pm', t.phaseOf(1)).filter(i => i.id).forEach(i => out.push({ id: i.id, name: i.ex.name, eq: i.ex.eq, kind: i.kind, mod: i.mod || '' })); }); s.week = w0; return out; }, [day, wk || 0]);
const ironFigs = p => p.evaluate(() => [...document.querySelectorAll('svg')].filter(s => s.getBoundingClientRect().width > 0 && /iron-hub/.test(s.innerHTML)).map(s => { const c = s.closest('[data-ex]'); return c ? c.dataset.ex : '?'; }));
(async () => {
  const srv = await serve(PORT);
  let { b, page, errs } = await boot(['d', 'r']);
  // data: steps, rep partner, band or bodyweight version with its own text, evidence with real links
  const info = await page.evaluate(ids => ids.map(id => {
    const t = window.__isoTest, h = t.V(id, 'h'), g = t.V(id, 'g'), spec = window.EQV[id], ev = window.EVID[id];
    const alt = spec.h.split(' ').map(x => x.split(':')[0]).find(x => x === 'r' || x === 'w');
    const av = alt ? t.V(id, 'h', { eq: alt, style: '' }) : null;
    const refs = ev ? ev.refs.map(r => (window.REFS[r] || {}).u || '') : [];
    return { id, hs: h.steps.length, htxt: h.steps.every(s => s.txt && s.txt.length > 20), gs: g.steps.length, gname: g.name, alt, altName: av && av.name, altTxt: av && av.steps.map(s => s.txt).join(' '), r: ev && ev.r, refs, tags: h.tags };
  }), ALL);
  for (const x of info) {
    ok(x.hs === 3 && x.htxt, x.id + ': three hold steps with instructions');
    ok(x.gs === 2 && x.gname, x.id + ': rep partner ' + x.gname);
    ok(x.alt && x.altName && x.altTxt.length > 40, x.id + ': band or bodyweight version (' + x.altName + ')');
    ok(['Strong', 'Moderate', 'Limited'].includes(x.r), x.id + ': evidence rating ' + x.r);
    ok(x.refs.length >= 1 && x.refs.every(u => /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|pmc\.ncbi\.nlm\.nih\.gov)\//.test(u)), x.id + ': papers with DOI or PubMed links (' + x.refs + ')');
    ok(!x.refs.some(u => /youtube|youtu\.be/i.test(u)), x.id + ': no video links');
    ok(BODY_TAGS.includes(x.tags[0]), x.id + ': main muscle tag first (' + x.tags + ')');
  }
  // band versions use band wording
  const bandTxt = await page.evaluate(() => ['incline-curl', 'hammer', 'shrug', 'wrist', 'rev-nordic', 'pushup-plus'].map(id => window.__isoTest.V(id, 'h', { eq: 'r', style: '' }).steps.map(s => s.txt).join(' ')));
  ok(bandTxt.every(t => /band/i.test(t)), 'band versions say how to use the band');
  // placement on the cardio days: upper body on day 1, the rest on day 2
  let a = await q(page, 'c1'), ids = a.map(x => x.id);
  ok(C1.every(id => ids.includes(id)) && !C2.some(id => ids.includes(id)), 'cardio day 1 adds dip, incline curl, hammer curl, push-up plus (' + [...new Set(ids)] + ')');
  ok(['sa-row', 'incline-press', 'pallof'].every(id => ids.includes(id)), 'cardio day 1 keeps its earlier pairs');
  a = await q(page, 'c2'); ids = a.map(x => x.id);
  ok(C2.every(id => ids.includes(id)) && !C1.some(id => ids.includes(id)), 'cardio day 2 adds reverse Nordic, shrug, wrist, neck (' + [...new Set(ids)] + ')');
  // the two newest pairs take turns, so a cardio day is only one pair longer than before
  for (const [d, odd, even] of [['c1', ['dip-hold', 'incline-curl'], ['hammer', 'pushup-plus']], ['c2', ['rev-nordic', 'shrug'], ['wrist', 'neck-hold']]]) {
    const w1 = (await q(page, d, 1)).map(x => x.id), w2 = (await q(page, d, 2)).map(x => x.id), w3 = (await q(page, d, 3)).map(x => x.id);
    ok(odd.every(i => w1.includes(i)) && !even.some(i => w1.includes(i)), d + ' week 1 has ' + odd + ' only');
    ok(even.every(i => w2.includes(i)) && !odd.some(i => w2.includes(i)), d + ' week 2 has ' + even + ' only');
    ok(odd.every(i => w3.includes(i)), d + ' week 3 goes back to ' + odd);
  }
  // strength days unchanged
  const sd = await page.evaluate(ids => { const t = window.__isoTest; return t.allDays().filter(d => !d.cardio).some(d => ['am', 'pm'].some(p => t.buildQueue(d, p, t.phaseOf(1)).some(i => ids.includes(i.id)))); }, ALL);
  ok(!sd, 'strength days do not get the new holds');
  // Exercises tab lists them, with chips for the new parts
  await page.click('#tab-exercises'); await page.waitForTimeout(300);
  const lib = await page.evaluate(() => [...document.querySelectorAll('#lib [data-ex]')].map(e => e.dataset.ex));
  ok(ALL.every(id => lib.includes(id)), 'Exercises lists every new hold (' + ALL.filter(id => !lib.includes(id)) + ')');
  const chips = await page.evaluate(() => [...document.querySelectorAll('#chips [data-f]')].map(c => c.dataset.f));
  ok(['Lower chest', 'Serratus', 'Neck'].every(c => chips.includes(c)), 'filter chips for lower chest, serratus and neck (' + chips + ')');
  await page.click('#chips [data-f="Lower chest"]'); await page.waitForTimeout(150);
  const vis = await page.evaluate(() => [...document.querySelectorAll('#lib [data-ex]')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(e => e.dataset.ex));
  ok(vis.includes('dip-hold') && !vis.includes('neck-hold'), 'Lower chest chip shows the dip hold (' + vis + ')');
  await page.click('#chips [data-f="All"]'); await page.waitForTimeout(100);
  // info sheet links to the trial
  await page.click('#lib [data-ex="incline-curl"]'); await page.waitForTimeout(250); await page.click('#dInfo').catch(() => {}); await page.waitForTimeout(150);
  const links = await page.evaluate(() => [...document.querySelectorAll('#sheetBody a[href]')].map(x => x.href).join(' '));
  ok(/10\.1080\/02640414\.2026\.2741751/.test(links), 'incline curl info links to the MRI trial');
  await page.click('#sheetClose'); await page.waitForTimeout(100);
  // Search finds them
  await page.click('#exercises [data-tool="search"]'); await page.waitForTimeout(150);
  for (const [w, id] of [['dip', 'dip-hold'], ['incline curl', 'incline-curl'], ['reverse nordic', 'rev-nordic'], ['serratus', 'pushup-plus'], ['neck', 'neck-hold'], ['shrug', 'shrug']]) {
    await page.fill('#cIn', w); await page.waitForTimeout(150);
    const found = await page.evaluate(() => [...document.querySelectorAll('#cSrch [data-sx]')].map(e => e.dataset.sx).join(' '));
    ok(found.includes(id), 'Search "' + w + '" finds ' + id + ' (' + found + ')');
  }
  await page.fill('#cIn', '');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'no errors ' + errs);
  await b.close();

  // cables only: cable/machine names or bodyweight, never a free-weight picture
  ({ b, page, errs } = await boot(['c'], { where: 'gym' }));
  const cq = (await q(page, 'c1')).concat(await q(page, 'c2')).filter(x => ALL.includes(x.id));
  ok(cq.every(x => x.eq === 'c' || x.eq === 'w'), 'cables: only cable, machine or bodyweight versions (' + [...new Set(cq.map(x => x.name))] + ')');
  const cn = cq.map(x => x.name);
  ok(['Behind-the-Body Cable Curl Hold', 'Cable Rope Hammer Curl Hold', 'Leg Extension Hold', 'Cable Shrug Hold', 'Cable Wrist Extension Hold', 'Cable High-to-Low Press Hold'].every(n => cn.includes(n)), 'cables: gym names (' + [...new Set(cn)] + ')');
  let bad = [];
  for (const i of [2, 5]) { await page.evaluate(i => document.querySelector('.strip button[data-i="' + i + '"]').click(), i).catch(() => {}); await page.waitForTimeout(120); bad = bad.concat(await ironFigs(page)); }
  await page.click('#tab-exercises'); await page.waitForTimeout(250); bad = bad.concat(await ironFigs(page));
  ok(!bad.length, 'cables: no free-weight pictures (' + [...new Set(bad)] + ')');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'cables: no errors ' + errs);
  await b.close();

  // bands only: band versions, nothing missing
  ({ b, page, errs } = await boot(['r'], { where: 'home' }));
  const bq = (await q(page, 'c1')).concat(await q(page, 'c2'));
  ok(ALL.every(id => bq.some(x => x.id === id)), 'bands: every new hold is in (' + ALL.filter(id => !bq.some(x => x.id === id)) + ')');
  ok(bq.filter(x => ALL.includes(x.id)).every(x => x.eq === 'r' || x.eq === 'w'), 'bands: band or bodyweight versions');
  await b.close();

  // safety: neck flag gets the neck note, sore shoulders skip dips, sore knees skip the kneeling reverse Nordic; osteopenia stays gentle
  ({ b, page, errs } = await boot(['d'], { issues: ['neck', 'shoulder', 'knee', 'bones'], age: 66 }));
  const s1 = await q(page, 'c1'), s2 = await q(page, 'c2');
  ok(!s1.some(x => x.id === 'dip-hold'), 'sore shoulders: dip hold left out');
  ok(!s2.some(x => x.id === 'rev-nordic'), 'sore knees: reverse Nordic left out');
  const nk = s2.find(x => x.id === 'neck-hold' && x.kind === 'hold');
  ok(nk && /third of your effort/.test(nk.mod) && /dizziness/.test(nk.mod), 'neck: hold carries the safety note');
  ok(await page.evaluate(() => /pain, dizziness, or tingling/.test(window.__isoTest.V('neck-hold', 'h').avoid)), 'neck hold always says when to stop');
  ok(!errs.filter(e => !/Audio/.test(e)).length, 'safety: no errors ' + errs);
  await b.close();
  srv.close(); console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
