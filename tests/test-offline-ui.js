// Offline indicator, requests kept while offline (sent only on your tap), failures that roll back clearly, and taps that show at once.
// Runs on the Budget phone profile (6x CPU, Slow 3G) where it matters, and fully offline with the service worker installed.
const { serve, open, FAKE_SPEECH } = require('./lib'); const path = require('path'), http = require('http'), fs = require('fs');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8985, SWPORT = 8986, URL = `http://localhost:${PORT}/index.html`;
const BASE = { profile: { units: 'kg', bw: 80, cm: 178, age: 40, sex: 'm', diet: 'any' }, eq: ['k', 'd'], log: [], food: [] };
const T = (p, f, a) => p.evaluate(f, a);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
// a Gemini stand-in whose behaviour each test sets: 'ok', 'fail' (503), 'drop' (network error), 'hang' (never answers)
async function gem(ctx, st) {
  await ctx.addInitScript(() => { localStorage.setItem('isohold.coach.key', '"test-key"'); localStorage.setItem('isohold.coach.model', '"gemini-3.8-flash"'); });
  await ctx.route(/generativelanguage\.googleapis\.com/, async route => {
    const req = route.request(); if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{"models":[]}' });
    st.calls.push(/stream/.test(req.url()) ? 'chat' : (req.postData() || '').includes('inline_data') ? 'photo' : 'json');
    if (st.mode === 'drop') return route.abort('internetdisconnected');
    if (st.mode === 'hang') return; // never answers
    if (st.mode === 'fail') return route.fulfill({ status: 503, headers: CORS, contentType: 'application/json', body: '{"error":{"message":"overloaded"}}' });
    if (/stream/.test(req.url())) return route.fulfill({ status: 200, headers: CORS, contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Holds keep the tendon under steady load.' }] } }] }) + '\n\n' });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Logged.', actions: [{ type: 'log_food', meal_name: 'Lunch', items: [{ name: 'Quinoa salad', grams: 250, protein_g: 9, carbs_g: 40, fat_g: 8, kcal: 280 }] }] }) }] } }] }) });
  });
}
async function budget(page) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50e3, uploadThroughput: 50e3 }); return cdp; }
async function boot(st, o2 = {}) {
  const o = await open('android', Object.assign({ state: BASE, before: ctx => gem(ctx, st) }, o2));
  if (o2.throttle !== false) await budget(o.page);
  await o.page.goto(URL + (o2.hash || ''), { timeout: 120e3 }); await o.page.waitForFunction(() => window.__isoholdReady, null, { polling: 100, timeout: 120e3 });
  return o;
}
const pill = p => T(p, () => { const b = document.getElementById('netPill'); return { shown: !!b && !b.hidden && b.getClientRects().length > 0, text: b ? b.textContent : '', label: b ? b.getAttribute('aria-label') || '' : '', role: b && b.getAttribute('role') }; });
const settle = async p => { await p.waitForTimeout(250); await p.waitForFunction(() => !document.querySelector('#cMsgs .typing, #cMsgs .echo'), null, { timeout: 30e3, polling: 50 }).catch(() => {}); await p.waitForTimeout(200); };
const say = async (p, t) => { await p.fill('#cIn', t); await p.keyboard.press('Enter'); await settle(p); };
const lastMsg = p => T(p, () => { const m = [...document.querySelectorAll('#cMsgs > .msg, #cMsgs > .lgc')].filter(e => !e.classList.contains('qoff')).pop(); return m ? m.innerText.replace(/\s+/g, ' ').trim() : ''; });

(async () => {
  const srv = await serve(PORT);
  let st = { calls: [], mode: 'ok' }, o, p;

  // ---- 1 the Offline pill: shows when offline, on every screen, and goes away online ----
  o = await boot(st); p = o.page;
  ok(!(await pill(p)).shown, '1 online: no Offline pill');
  await o.ctx.setOffline(true); await p.waitForTimeout(400);
  let pl = await pill(p);
  ok(pl.shown && /^Offline/.test(pl.text) && /App v\d+, updated/.test(pl.text) && pl.role === 'status', '1 offline: a small Offline pill with the app version and when it was updated (' + pl.text + ')');
  ok(/Typed logs still work/.test(pl.label), '1 the pill says what still works');
  const box = await p.locator('#netPill').boundingBox(), prof = await p.locator('#profBtn').boundingBox();
  ok(box && box.height <= 30 && (!prof || box.x + box.width <= prof.x || box.y >= prof.y + prof.height || box.y + box.height <= prof.y), '1 the pill is small and does not cover the Profile button ' + JSON.stringify(box));
  await p.click('#tab-progress'); await p.waitForTimeout(300); ok((await pill(p)).shown, '1 the pill stays on other tabs');
  await p.click('#tab-train'); await p.waitForTimeout(200);
  await o.ctx.setOffline(false); await p.waitForTimeout(400);
  ok(!(await pill(p)).shown, '1 back online: the pill goes away');
  // layout: the pill never moves the page (fixed)
  const cls = await T(p, () => new Promise(r => { let v = 0; new PerformanceObserver(l => l.getEntries().forEach(e => v += e.value)).observe({ type: 'layout-shift', buffered: false }); setTimeout(() => r(v), 600); window.dispatchEvent(new Event('offline')); }));
  ok(cls === 0, '1 the pill appearing moves nothing on the page (layout shift ' + cls + ')');
  await o.b.close();

  // ---- 2 a request that fails while "online" also shows Offline; the next one that gets through clears it ----
  st = { calls: [], mode: 'drop' }; o = await boot(st, { hash: '#coach' }); p = o.page;
  await say(p, 'why do holds help tendons?');
  ok((await pill(p)).shown, '2 a request that can\'t get out shows the Offline pill');
  ok(/Couldn’t reach Gemini/.test(await lastMsg(p)) && await p.locator('#cMsgs [data-retry]').count() === 1, '2 the failed question shows an error with Try again');
  st.mode = 'ok'; await p.click('#cMsgs [data-retry]'); await settle(p);
  ok(/Holds keep the tendon/.test(await lastMsg(p)) && !(await pill(p)).shown, '2 Try again answers it and the pill goes away');
  await o.b.close();

  // ---- 3 offline: typed logs work; photos and questions are kept, nothing is sent until you tap Send ----
  st = { calls: [], mode: 'ok' }; o = await boot(st, { hash: '#coach' }); p = o.page;
  await o.ctx.setOffline(true); await p.waitForTimeout(300);
  ok(await p.isVisible('#cOff'), '3 the Search & log banner says what works offline');
  await say(p, '2 eggs and toast');
  ok((await T(p, () => window.__isoTest.store().food.length)) === 1 && /Breakfast|eggs?/i.test(await p.locator('#cMsgs .lgc').last().innerText()), '3 a typed meal logs offline');
  await say(p, 'why do holds help tendons?');
  ok(/kept this on your phone/.test(await T(p, () => [...document.querySelectorAll('#cMsgs .msg.m')].map(e => e.innerText).join(' '))), '3 an open question is kept, and it says so');
  await p.fill('#cIn', 'lunch'); await p.setInputFiles('#cFile', path.join(__dirname, 'fixtures', 'meal.jpg')); await settle(p);
  let q = await T(p, () => document.querySelector('#cMsgs .qoff') ? document.querySelector('#cMsgs .qoff').innerText : '');
  ok(/1 photo, 1 question/.test(q) && !/Send now/.test(q), '3 while offline: "1 photo, 1 question" waiting, no Send button yet (' + q.replace(/\s+/g, ' ') + ')');
  ok(st.calls.length === 0, '3 nothing went to Gemini while offline');
  // back online, and the app closed and opened again: still kept (photos in the phone's photo store), still not sent
  await o.ctx.setOffline(false); await p.reload(); await p.waitForFunction(() => window.__isoholdReady, null, { polling: 100, timeout: 60e3 }); await p.waitForTimeout(1500);
  ok(/1 photo, 1 question/.test(await T(p, () => (document.querySelector('#cMsgs .qoff') || {}).innerText || '')), '3 the waiting requests survive closing the app');
  q = await T(p, () => document.querySelector('#cMsgs .qoff') ? document.querySelector('#cMsgs .qoff').innerText : '');
  ok(/back online/i.test(q) && await p.locator('[data-qsend]').count() === 1, '3 back online: it offers to send them');
  ok(st.calls.length === 0, '3 nothing is sent on its own (no auto-send of photos)');
  await p.click('[data-qsend]'); await settle(p); await p.waitForTimeout(800); await settle(p);
  ok(st.calls.filter(c => c === 'photo').length === 1 && st.calls.filter(c => c === 'chat').length === 1, '3 Send sends the photo and the question (' + st.calls + ')');
  const txt = await T(p, () => document.getElementById('cMsgs').innerText);
  ok(/Holds keep the tendon/.test(txt) && /Quinoa salad/.test(txt), '3 both answers are shown');
  ok(!(await p.locator('[data-qsend]').count()) && (await T(p, () => window.__isoTest.store().food.length)) === 2, '3 the queue is empty and the photo meal was logged');
  await o.b.close();

  // ---- 4 Discard sends nothing ----
  st = { calls: [], mode: 'ok' }; o = await boot(st, { hash: '#coach', throttle: false }); p = o.page;
  await o.ctx.setOffline(true); await p.waitForTimeout(200);
  await say(p, 'why do holds help tendons?'); await o.ctx.setOffline(false); await p.waitForTimeout(500);
  await p.click('[data-qdrop]'); await p.waitForTimeout(300);
  ok(/Discarded 1 waiting request/.test(await lastMsg(p)) && st.calls.length === 0 && !(await p.locator('.qoff').count()), '4 Discard drops it and sends nothing');
  // back online on another tab: a toast points to it
  await o.ctx.setOffline(true); await p.waitForTimeout(200); await say(p, 'why do holds help tendons?');
  await p.click('#cMsgs ~ * [data-back], section.view:not([hidden]) [data-back]').catch(() => {}); await p.waitForTimeout(300);
  await o.ctx.setOffline(false); await p.waitForTimeout(500);
  ok(/Back online\. 1 question waiting/.test(await p.textContent('#toast')) && st.calls.length === 0, '4 back online on another tab: a toast says what is waiting, nothing sent');
  await o.b.close();

  // ---- 5 Gemini fails: the "working on it" bubble becomes an error with Try again ----
  st = { calls: [], mode: 'fail' }; o = await boot(st, { hash: '#coach', throttle: false }); p = o.page;
  await say(p, 'a bibimbap with 200g beef');
  ok(/Gemini is having trouble/.test(await lastMsg(p)) && await p.locator('#cMsgs [data-retry]').count() === 1 && !(await p.locator('#cMsgs .typing').count()), '5 a failed log shows an error with Try again in place of the pending bubble');
  st.mode = 'ok'; await p.click('#cMsgs [data-retry]'); await settle(p);
  ok(/Lunch: about 9 g protein/.test(await p.locator('#cMsgs .lgc').last().innerText()) && !(await p.locator('#cMsgs [data-retry]').count()), '5 Try again logs it');
  // ---- 6 no answer: stop waiting after 15 s with a clear message ----
  await p.clock.install(); st.mode = 'hang';
  await p.fill('#cIn', 'why do holds help tendons?'); await p.keyboard.press('Enter'); await p.clock.runFor(500);
  ok(await p.locator('#cMsgs .typing').count() === 1, '6 waiting: the working-on-it bubble shows');
  await p.clock.runFor(15500); await p.waitForTimeout(100); await p.clock.runFor(100);
  ok(/Gemini is taking too long/.test(await lastMsg(p)) && await p.locator('#cMsgs [data-retry]').count() === 1 && !(await p.locator('#cMsgs .typing').count()), '6 no first byte in 15 s: a clear message with Try again (' + (await lastMsg(p)).slice(0, 80) + ')');
  await o.b.close();

  // ---- 7 storage full: the entry is taken back with a clear message, not left looking saved ----
  st = { calls: [], mode: 'ok' }; o = await boot(st, { hash: '#coach', throttle: false }); p = o.page;
  await T(p, () => { Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }; });
  await say(p, '2 eggs and toast');
  ok((await T(p, () => window.__isoTest.store().food.length)) === 0, '7 storage full: the meal is not kept in memory as if saved');
  ok(/Not saved: this device’s storage is full/.test(await lastMsg(p)) && /Undone/.test(await p.locator('#cMsgs .lgc').last().innerText()), '7 a clear message, and the card shows it was taken back');
  await p.click('section.view:not([hidden]) [data-back]'); await p.waitForTimeout(300);
  ok(/Storage is full/.test(await p.textContent('#extras')), '7 Today still warns that storage is full');
  await o.b.close();

  // ---- 8 a tap shows at once: pressed look on pointerdown, before the tap's work ----
  st = { calls: [], mode: 'ok' }; o = await boot(st); p = o.page;
  const b0 = await p.locator('#tab-progress').boundingBox();
  await T(p, () => { window.__pf = null; document.getElementById('tab-progress').addEventListener('pointerdown', () => requestAnimationFrame(() => { window.__pf = document.getElementById('tab-progress').classList.contains('pressing'); }), { once: true }); });
  await p.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2); await p.mouse.down(); await p.waitForTimeout(80);
  ok(await T(p, () => window.__pf) === true, '8 the pressed look is on in the first frame after the finger lands');
  await p.mouse.up(); await p.waitForTimeout(400);
  ok(!(await T(p, () => document.getElementById('tab-progress').classList.contains('pressing'))) && !(await p.isHidden('#progress')), '8 it clears after the tap, and the tap did its work');
  await o.b.close();

  // ---- 9 fully offline with the service worker: the app opens, says Offline, and typed logs work ----
  const SW = http.createServer((r, w) => { let f = decodeURIComponent(r.url.split('?')[0]); if (f === '/') f = '/index.html'; const fp = path.join(__dirname, '..', f); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { w.writeHead(404); return w.end(); } w.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.json') ? 'application/json' : 'image/png', 'Cache-Control': f === '/sw.js' ? 'no-cache' : 'max-age=600' }); fs.createReadStream(fp).pipe(w); }).listen(SWPORT);
  st = { calls: [], mode: 'ok' };
  o = await open('android', { state: BASE, sw: true, before: ctx => gem(ctx, st) }); p = o.page; await budget(p);
  await p.goto(`http://localhost:${SWPORT}/index.html`, { timeout: 120e3 }); await p.waitForFunction(() => window.__isoholdReady, null, { timeout: 120e3 });
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 120e3, polling: 200 });
  await o.ctx.setOffline(true); await p.reload({ timeout: 60e3 }); await p.waitForFunction(() => window.__isoholdReady, null, { timeout: 60e3 }); await p.waitForTimeout(300);
  ok((await pill(p)).shown, '9 offline reload (service worker): the app opens and shows Offline');
  await p.click('section.view:not([hidden]) .view-head [data-tool="search"]'); await p.waitForTimeout(400);
  await say(p, 'I weigh 81 kg');
  ok(/Bodyweight 81 kg/.test(await p.locator('#cMsgs .lgc').last().innerText()), '9 a typed log works fully offline');
  ok(o.errs.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|net::/.test(e)).length === 0, '9 no page errors ' + o.errs.join(' | ').slice(0, 200));
  await o.b.close(); SW.close();

  srv.close();
  console.log(`test-offline-ui: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
