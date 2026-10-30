// AI accuracy must not drop: 10 recorded tasks run on the old build (git show origin/main:index.html) and on this build.
// Gemini is mocked with recorded answers keyed on the request (the user's words, or the photo/voice note), never on the
// model name or prompt size, so a shorter prompt or a smaller model for logging gets the same recorded answer. The question
// that needs the user's data only gets the good answer when the prompt still carries the facts it needs.
// For each task the saved data and the text shown must be identical on both builds.
//
//   cd tests && node perf/test-ai.js            (ports 8987 old, 8988 new)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execSync } = require('child_process');
const { open, ROOT, FAKE_SPEECH } = require('../lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// ---------- the two builds ----------
const OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'isohold-ai-old-'));
for (const f of ['manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'sw.js']) fs.copyFileSync(path.join(ROOT, f), path.join(OLD, f));
fs.writeFileSync(path.join(OLD, 'index.html'), execSync('git show origin/main:index.html', { cwd: ROOT, maxBuffer: 1 << 26 }));
function serve(dir, port) { return new Promise(r => { const s = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(dir, p); if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'image/png' }); fs.createReadStream(f).pipe(res); }).listen(port, () => r(s)); }); }
const BUILDS = { old: { dir: OLD, port: 8987 }, new: { dir: ROOT, port: 8988 } };

// ---------- the user: a knee issue, a pain note, a few sets, today's breakfast ----------
const NOW = Date.now(), DAY = 864e5;
const STATE = { week: 2, done: { w2d1am: NOW - DAY, w2d1pm: NOW - DAY }, eq: ['k', 'd'], wt: {},
  profile: { units: 'kg', bw: 80, cm: 178, age: 44, sex: 'm', diet: 'any', where: 'home', issues: ['knee'] },
  log: [{ t: NOW - DAY - 3e6, w: 2, id: 'goblet-squat', eq: 'k', k: 'h', kg: 16, v: 40 }, { t: NOW - DAY - 2.9e6, w: 2, id: 'goblet-squat', eq: 'k', k: 'r', kg: 16, v: 10 }],
  notes: [{ t: NOW - 2 * DAY, k: 'pain', area: 'knee', score: 4 }], body: [{ t: NOW - 3 * DAY, kg: 80 }], food: [] };

// ---------- recorded Gemini answers, keyed on the request ----------
const food = (meal, items) => ({ type: 'log_food', meal_name: meal, items: items.map(([name, grams, p, c, f, k]) => ({ name, grams, protein_g: p, carbs_g: c, fat_g: f, kcal: k })) });
const JSON_ANSWERS = [
  // 1 meal photo with a short description
  [b => b.photo && /lunch/i.test(b.text), { reply: 'Chicken, rice and salad: logged as lunch.', actions: [food('Lunch', [['Chicken breast', 150, 46, 0, 5, 250], ['White rice', 180, 4.8, 50, 0.5, 234], ['Green salad', 80, 1, 3, 0.2, 15]])] }],
  // 2 a voice note with several logs in one go
  [b => /quinoa salad and did 3 sets of 12 lat pulldowns/i.test(b.text), { reply: 'Logged your salad, the pulldowns and your knee.', actions: [food('Lunch', [['Quinoa salad', 250, 9, 40, 8, 280]]), { type: 'log_lift', name: 'Lat Pulldown', weight: 50, unit: 'kg', reps: 12, sets: 3 }, { type: 'log_pain', area: 'knee', score: 3 }] }],
  // 4 Spanish
  [b => /camin[eé] 30 minutos y com[ií] una ensalada de quinoa/i.test(b.text), { reply: 'Registré tu caminata y tu ensalada.', actions: [{ type: 'log_cardio', machine: 'walking', minutes: 30 }, food('Comida', [['Ensalada de quinoa', 250, 9, 40, 8, 280]])] }],
  // 5 a correction: the second request is the same message with the fixed number
  [b => /bibimbap with 200 ?g beef/i.test(b.text), { reply: 'Logged.', actions: [food('Dinner', [['Bibimbap rice and vegetables', 300, 8, 60, 9, 350], ['Beef', 200, 52, 0, 30, 500]])] }],
  [b => /bibimbap with 250 ?g beef/i.test(b.text), { reply: 'Logged.', actions: [food('Dinner', [['Bibimbap rice and vegetables', 300, 8, 60, 9, 350], ['Beef', 250, 65, 0, 37.5, 625]])] }],
  // 6 blood pressure in words
  [b => /pharmacy cuff said 128 on top and 84 below/i.test(b.text), { reply: 'Blood pressure 128/84 saved.', actions: [{ type: 'log_bp', sys: 128, dia: 84 }] }],
  // 7 pain report in a sentence
  [b => /elbow aches when i do curls/i.test(b.text), { reply: 'Noted your elbow.', actions: [{ type: 'log_pain', area: 'elbow', score: 4 }] }],
  // 8 bodyweight from a scale, said loosely
  [b => b.photo && /scale/i.test(b.text), { reply: 'The scale reads 81.4 kg.', actions: [{ type: 'log_bodyweight', weight: 81.4, unit: 'kg' }] }],
  // 9 cardio on a machine the app doesn't know
  [b => /elliptical/i.test(b.text), { reply: 'Logged the elliptical.', actions: [{ type: 'log_cardio', machine: 'elliptical', minutes: 25, distance_km: 3.1 }] }]
];
const CHAT_ANSWERS = [
  // 3 an open training question
  [(q) => /why do holds help tendons/i.test(q), () => 'Holds load the tendon steadily, so it adapts without the fast stretch of quick reps.\n\n- **Five holds of 45 s** at a 7/10 effort\n- Pain up to 3/10 is fine if it settles by morning'],
  // 10 a question that needs the user's own data: only answered well when the prompt still has the knee note, the profile and the plan
  [(q) => /what should i change in my next session/i.test(q), (sys) => {
    const facts = [/take care with: knee/.test(sys), /knee 4\/10/.test(sys), /Goblet Squat/.test(sys), /Split Squat/.test(sys), /bodyweight 80 kg/.test(sys), /week 2/.test(sys)];
    return facts.every(Boolean) ? 'Your knee was 4/10 two days ago, so next session go about 20% lighter on the **Goblet Squat** and **Split Squat** (week 2), and keep the holds pain-free.' : 'MISSING FACTS ' + facts.map(Number).join('');
  }]
];
async function mock(ctx, calls) {
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await ctx.route(/generativelanguage\.googleapis\.com/, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] }] }) });
    const body = req.postDataJSON(), url = req.url(), model = (/models\/([^:]+):/.exec(url) || [])[1];
    const sys = body.systemInstruction.parts[0].text, last = body.contents[body.contents.length - 1], parts = last.parts;
    const text = parts.filter(p => typeof p.text === 'string').map(p => p.text).join(' '), photo = parts.some(p => p.inline_data && /image/.test(p.inline_data.mime_type));
    calls.push({ kind: /stream/.test(url) ? 'chat' : 'json', model, bytes: JSON.stringify(body).length, text: text.slice(0, 60) });
    if (/streamGenerateContent/.test(url)) {
      const a = CHAT_ANSWERS.find(([m]) => m(text)); const reply = a ? a[1](sys) : 'NO RECORDED ANSWER for ' + text;
      const chunks = reply.match(/[\s\S]{1,40}/g);
      return route.fulfill({ status: 200, headers: CORS, contentType: 'text/event-stream', body: chunks.map(c => 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: c }] } }] }) + '\r\n\r\n').join('') });
    }
    const a = JSON_ANSWERS.find(([m]) => m({ text, photo })); const obj = a ? a[1] : { reply: 'NO RECORDED ANSWER for ' + text, actions: [] };
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
  });
}
// ---------- the 10 tasks (each step: type, say or photograph) ----------
const TASKS = [
  ['meal photo with a description', [['photo', 'lunch']]],
  ['voice note with several logs', [['say', 'had a quinoa salad and did 3 sets of 12 lat pulldowns at 50 kg and my knee is 3 out of 10']]],
  ['open training question', [['type', 'why do holds help tendons?']]],
  ['Spanish log', [['type', 'caminé 30 minutos y comí una ensalada de quinoa']]],
  ['correction', [['type', 'a bibimbap with 200g beef'], ['type', 'actually that was 250 not 200']]],
  ['blood pressure log', [['type', 'the pharmacy cuff said 128 on top and 84 below']]],
  ['pain report', [['type', 'my left elbow aches when I do curls, maybe 4 out of 10']]],
  ['bodyweight (scale photo)', [['photo', 'my scale this morning']]],
  ['cardio', [['type', 'did 25 minutes on the elliptical, about 3.1 km']]],
  ['question needing my data', [['type', 'looking at my last two weeks, what should I change in my next session?']]]
];
// timestamps, photo ids and links between entries differ run to run; everything else must match
function norm(v) {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { if (['t', 'ref', 'ph', 'at', 'd', 'bkAt'].includes(k)) return; o[k] = norm(v[k]); }); return o; }
  if (typeof v === 'number' && v > 1e12) return 'T';
  if (typeof v === 'string') return v.replace(/\bp\d{12,}\b/g, 'P');
  return v;
}
async function runTask(build, task) {
  const B = BUILDS[build], calls = [];
  const o = await open('android', { state: STATE, init: FAKE_SPEECH, before: async ctx => {
    await ctx.addInitScript(() => { localStorage.setItem('isohold.coach.key', '"test-key"'); localStorage.setItem('isohold.coach.model', '"gemini-3.8-flash"'); localStorage.setItem('isohold.coach.models', JSON.stringify([{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }, { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' }])); });
    await mock(ctx, calls);
  } });
  const page = o.page;
  await page.goto(`http://localhost:${B.port}/index.html#coach`); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
  const settle = async () => { await page.waitForTimeout(300); await page.waitForFunction(() => !document.querySelector('#cMsgs .typing, #cMsgs .echo'), null, { timeout: 20e3, polling: 50 }).catch(() => {}); await page.waitForTimeout(300); };
  for (const [how, what] of task[1]) {
    if (how === 'type') { await page.fill('#cIn', what); await page.keyboard.press('Enter'); }
    else if (how === 'say') { await page.evaluate(t => { window.__say = t; }, what); await page.fill('#cIn', ''); await page.click('#cSend'); }
    else if (how === 'photo') { await page.fill('#cIn', what); await page.setInputFiles('#cFile', path.join(__dirname, '..', 'fixtures', 'meal.jpg')); }
    await settle();
  }
  const out = await page.evaluate(() => {
    const s = window.__isoTest.store(), keep = {}; ['log', 'food', 'notes', 'body', 'wt', 'done', 'week', 'eq', 'profile'].forEach(k => keep[k] = s[k]);
    const shown = [...document.querySelectorAll('#cMsgs > *')].filter(e => !e.classList.contains('qoff')).map(e => e.innerText.replace(/\s+/g, ' ').trim());
    const feed = window.__isoTest.feed().map(m => ({ r: m.r, x: m.x, title: m.title, lines: m.lines, sub: m.sub, undone: !!m.undone }));
    return { store: keep, shown, feed };
  });
  out.calls = calls; out.errs = o.errs.slice(0, 3);
  await o.b.close();
  return out;
}
(async () => {
  const servers = [await serve(OLD, 8987), await serve(ROOT, 8988)];
  const rows = [];
  for (const t of TASKS) {
    const a = await runTask('old', t), b = await runTask('new', t);
    const sameStore = JSON.stringify(norm(a.store)) === JSON.stringify(norm(b.store)), sameShown = JSON.stringify(norm(a.shown)) === JSON.stringify(norm(b.shown)), sameFeed = JSON.stringify(norm(a.feed)) === JSON.stringify(norm(b.feed));
    ok(sameStore, t[0] + ': saved data identical');
    ok(sameShown && sameFeed, t[0] + ': reply text shown identical' + (sameShown ? '' : '\n   old: ' + JSON.stringify(a.shown).slice(0, 600) + '\n   new: ' + JSON.stringify(b.shown).slice(0, 600)));
    ok(!/NO RECORDED ANSWER|MISSING FACTS/.test(JSON.stringify(b.shown)), t[0] + ': the new build\'s request matched a recorded answer and kept the facts it needs ' + JSON.stringify(b.shown).slice(0, 200));
    ok(a.calls.length > 0 && b.calls.length > 0, t[0] + ': the task reaches Gemini on the old build (' + a.calls.length + ' calls)');
    ok(!a.errs.length && !b.errs.length, t[0] + ': no page errors ' + a.errs.concat(b.errs).join(' | '));
    rows.push({ task: t[0], oldCalls: a.calls.map(c => c.kind + ':' + c.model + ':' + c.bytes).join(' '), newCalls: b.calls.map(c => c.kind + ':' + c.model + ':' + c.bytes).join(' '), identical: sameStore && sameShown && sameFeed, reply: (b.shown.slice(-1)[0] || '').slice(0, 70) });
  }
  console.table(rows);
  // Logging-type requests use the smaller model on the new build; open questions keep the chosen model
  const newCalls = rows.map(r => r.newCalls).join(' ');
  ok(/json:gemini-3\.5-flash-lite/.test(newCalls) && /chat:gemini-3\.8-flash/.test(newCalls) && !/chat:gemini-3\.5-flash-lite/.test(newCalls), 'new build: Flash-Lite for typed logs, the chosen model for questions');
  ok(/^json:gemini-3\.8-flash:/.test(rows[0].newCalls) && /^json:gemini-3\.8-flash:/.test(rows[7].newCalls), 'new build: photos use the chosen model');
  ok(/^json:.*json:/.test(rows[4].newCalls), 'the correction re-asks Gemini with the fixed number on both builds');
  servers.forEach(s => s.close()); fs.rmSync(OLD, { recursive: true, force: true });
  console.log(`test-ai: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
