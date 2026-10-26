// Shared test helpers: static server for the app + browser launchers.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium, webkit, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
function serve(port) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    }).listen(port, () => res(srv));
  });
}
async function open(kind, opts = {}) {
  const dev = kind === 'android' ? devices['Pixel 7'] : devices['iPhone 13'];
  const b = await (kind === 'android' ? chromium : webkit).launch();
  const ctx = await b.newContext({ ...dev, colorScheme: opts.dark ? 'dark' : 'light', serviceWorkers: opts.sw ? 'allow' : 'block', permissions: kind === 'android' ? ['microphone', 'camera'] : [] });
  if (opts.state) await ctx.addInitScript(s => { if (!localStorage.getItem('isohold.v1')) localStorage.setItem('isohold.v1', s); }, JSON.stringify(opts.state));
  if (opts.init) await ctx.addInitScript(opts.init);
  if (opts.before) await opts.before(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/AudioContext encountered an error from the audio device/.test(m.text())) errs.push('console: ' + m.text()); }); // headless browsers have no sound device
  return { b, ctx, page, errs };
}
module.exports = { serve, open, ROOT };
// Fake speech recognition: the next thing "said" is read from window.__say (set it, then tap the mic).
// For hands-free mode, call window.__speak('next') while a session runs.
const FAKE_SPEECH = () => {
  class FakeSR { constructor() { this.lang = 'en-US'; FakeSR.last = this; window.__sr = this; }
    start() { setTimeout(() => { const t = window.__say; if (t) { window.__say = ''; this.onresult && this.onresult({ results: [Object.assign([{ transcript: t }], { isFinal: true })] }); } if (!this.continuous) this.onend && this.onend(); }, 60); }
    stop() { this.onend && this.onend(); } abort() { this.onend = null; } }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.__speak = t => { const r = window.__sr; if (r && r.onresult) r.onresult({ results: [Object.assign([{ transcript: t }], { isFinal: true })] }); };
  const fakeSpeak = u => { (window.__spoken = window.__spoken || []).push(u.text); setTimeout(() => u.onend && u.onend(), 10); };
  try { if (!window.speechSynthesis) window.speechSynthesis = { speak: fakeSpeak, cancel() {} }; else { window.SpeechSynthesis && (window.SpeechSynthesis.prototype.speak = fakeSpeak); window.speechSynthesis.speak = fakeSpeak; } } catch (e) { }
  if (!window.SpeechSynthesisUtterance) window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};
// Mock Gemini: reply(bodyJson) returns the JSON object the app should receive as the model's answer.
// Also pre-connects a fake key so photo/voice flows go to Gemini.
async function mockGemini(ctx, reply) {
  await ctx.addInitScript(() => { localStorage.setItem('isohold.coach.key', '"test-key"'); localStorage.setItem('isohold.coach.model', '"gemini-3.8-flash"'); });
  await ctx.route(/generativelanguage\.googleapis\.com/, async route => {
    const req = route.request(), CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] }] }) });
    let body = null; try { body = req.postDataJSON(); } catch (e) { }
    if (/streamGenerateContent/.test(req.url())) { const txt = typeof reply === 'function' ? reply(body, 'chat') : 'Mock coach answer.'; return route.fulfill({ status: 200, headers: CORS, contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof txt === 'string' ? txt : JSON.stringify(txt) }] } }] }) + '\n\n' }); }
    const obj = typeof reply === 'function' ? reply(body, 'json') : reply;
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
  });
}
module.exports.FAKE_SPEECH = FAKE_SPEECH; module.exports.mockGemini = mockGemini;
