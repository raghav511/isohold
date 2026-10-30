// Sound: soft sine cues through one master gain, the Look → Sound settings (effects volume / off, spoken cues / voice volume),
// the silent switch (audioSession 'ambient'), no AudioContext while effects are off, and settings that survive reload and backup.
const { serve, open, FAKE_SPEECH } = require('./lib');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const PORT = 8990, URL = 'http://localhost:' + PORT + '/index.html';
const MOCK = () => {
  const A = window.__ac = { made: 0, osc: [], gains: [] };
  class Param { constructor(v) { this.value = v; this.ev = []; } setValueAtTime(v, t) { this.ev.push(['set', v, t]); } linearRampToValueAtTime(v, t) { this.ev.push(['lin', v, t]); } exponentialRampToValueAtTime(v, t) { this.ev.push(['exp', v, t]); } }
  class FakeAC {
    constructor() { A.made++; this.currentTime = 0; this.state = 'running'; this.destination = { dest: 1 }; }
    createOscillator() { const o = { type: 'sine', frequency: new Param(440), connect() { }, start(t) { o.t0 = t; }, stop(t) { o.t1 = t; } }; A.osc.push(o); return o; }
    createGain() { const g = { gain: new Param(1), connect(d) { g.to = d; } }; A.gains.push(g); return g; }
    resume() { return Promise.resolve(); }
  }
  window.AudioContext = window.webkitAudioContext = FakeAC;
  const sp = window.speechSynthesis && window.speechSynthesis.speak; if (sp) window.speechSynthesis.speak = u => { (window.__vol = window.__vol || []).push(u.volume); sp(u); };
  try { Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); } catch (e) { }
};
const S = page => page.evaluate(() => { const A = window.__ac, m = A.gains.find(g => g.to && g.to.dest); return { made: A.made, master: m ? m.gain.value : null, n: A.osc.length, types: A.osc.map(o => o.type), dur: A.osc.map(o => o.t1 - o.t0), f: A.osc.map(o => o.frequency.value), peaks: A.gains.filter(g => g !== m).map(g => Math.max(...g.gain.ev.map(e => e[1]))), starts0: A.gains.filter(g => g !== m).every(g => g.gain.ev[0] && g.gain.ev[0][1] === 0), spoken: (window.__spoken || []).length, vol: window.__vol || [], sess: navigator.audioSession && navigator.audioSession.type }; });
const setRange = (page, id, v) => page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
(async () => {
  const srv = await serve(PORT);
  for (const kind of ['iphone', 'android']) {
    const { b, page, errs } = await open(kind, { state: { profile: { units: 'kg', cues: true }, eq: ['k', 'd'] }, init: '(' + FAKE_SPEECH + ')();(' + MOCK + ')();' });
    await page.clock.install();
    await page.goto(URL); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    let s = await S(page);
    ok(s.sess === 'ambient', kind + ' audioSession set to ambient (silent switch mutes, music keeps playing): ' + s.sess);
    // tab taps make no sound at all
    for (const t of ['exercises', 'progress', 'coach', 'guide', 'train']) { if (await page.isVisible('#tab-' + t)) await page.click('#tab-' + t); await page.clock.runFor(100); }
    s = await S(page); ok(s.made === 0 && s.n === 0, kind + ' tab taps make no sound and create no AudioContext');
    // a session: soft sine cues only, through the master gain at the default 60%
    await page.click('#sessions [data-start][data-part=am]');
    for (let i = 0; i < 12; i++) await page.clock.runFor(10000);
    s = await S(page);
    ok(s.made === 1 && Math.abs(s.master - 0.6) < 1e-9, kind + ' one AudioContext, master gain 0.6 by default: ' + s.made + ' ' + s.master);
    ok(s.n > 0 && s.types.every(t => t === 'sine'), kind + ' session cues are sine only: ' + s.types.join());
    ok(s.peaks.length && s.peaks.every(p => p <= 0.1), kind + ' every cue peaks at or below 0.1: ' + s.peaks.join());
    ok(s.starts0 && s.dur.every(d => d <= 0.45), kind + ' cues fade in from silence and are short: ' + s.dur.join());
    ok(s.f.every((f, i) => f !== 1600 || s.dur[i] <= 0.06), kind + ' rep ticks last 60 ms or less');
    ok(s.spoken > 0 && s.vol.every(v => v === 1), kind + ' spoken cues play when on, at the voice volume: ' + s.vol.join());
    // the Look tab: Sound group
    await page.goto(URL); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    await page.click('#profBtn'); await page.click('#pfTab-look');

    for (const id of ['#pfSfx', '#pfSfxVol', '#pfVoice', '#pfVoiceVol']) ok(await page.locator('#pfP-look ' + id).count() === 1, kind + ' Look has ' + id);
    ok(await page.evaluate(() => ['pfSfx', 'pfSfxVol', 'pfVoice', 'pfVoiceVol'].every(id => { const e = document.getElementById(id), l = e.closest('label'); return l && l.textContent.trim().length > 3 && l.getBoundingClientRect().height >= 44; })), kind + ' sound controls are labelled and 44 px tall');
    ok(await page.textContent('#pfSfxV') === '60%' && await page.getAttribute('#pfSfxVol', 'aria-valuetext') === '60%', kind + ' effects volume shows 60%');
    await setRange(page, 'pfSfxVol', 30);
    s = await S(page);
    ok(s.made === 1 && Math.abs(s.master - 0.3) < 1e-9 && await page.textContent('#pfSfxV') === '30%', kind + ' slider scales the master gain: ' + s.master);
    ok(s.n === 1 && s.dur[0] <= 0.06 && s.peaks[0] <= 0.1, kind + ' slider plays one soft preview tick');
    await setRange(page, 'pfVoiceVol', 40);
    await page.click('#pfVoice');
    await page.click('#pfSfx');
    s = await S(page);
    let p = await page.evaluate(() => window.__isoTest.store().profile);
    ok(p.sfx === 30 && p.voice === 40 && p.sfxOff === true && p.cues === false && s.master === 0, kind + ' settings saved, off mutes the master: ' + JSON.stringify([p.sfx, p.voice, p.sfxOff, p.cues, s.master]));
    ok(await page.isDisabled('#pfSfxVol') && !(await page.isChecked('#pfCues')), kind + ' off disables the slider; Training cues follow');
    // reload: settings stay; with effects off no AudioContext, with cues off nothing is spoken
    await page.goto(URL); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    await page.click('#profBtn'); await page.click('#pfTab-look');
    ok(!(await page.isChecked('#pfSfx')) && await page.inputValue('#pfSfxVol') === '30' && await page.inputValue('#pfVoiceVol') === '40' && !(await page.isChecked('#pfVoice')), kind + ' sound settings survive a reload');
    // changing a Training setting keeps the sound settings
    await page.click('#pfTab-train'); await page.click('.pchips[data-set="len"] button[data-v="25"]'); await page.waitForTimeout(80);
    p = await page.evaluate(() => window.__isoTest.store().profile);
    ok(p.sfx === 30 && p.voice === 40 && p.sfxOff === true, kind + ' Training edits keep sound settings');
    await page.click('#pfSave'); await page.waitForTimeout(150);
    await page.click('#sessions [data-start][data-part=am]');
    for (let i = 0; i < 12; i++) await page.clock.runFor(10000);
    s = await S(page);
    ok(s.made === 0 && s.n === 0, kind + ' effects off: no AudioContext, no sound');
    ok(s.spoken === 0, kind + ' spoken cues off: nothing spoken');
    // backup and restore carry the sound settings
    await page.goto(URL); await page.waitForFunction(() => window.__isoholdReady, null, { polling: 100 });
    await page.click('#profBtn'); await page.click('#pfTab-backup'); await page.click('#bkFile'); await page.waitForTimeout(100);
    const code = await page.evaluate(() => document.getElementById('bkOut').value);
    await page.evaluate(() => { const s = window.__isoTest.store(); s.profile.sfx = 90; s.profile.voice = 100; delete s.profile.sfxOff; });
    await page.fill('#bkIn', code); await page.click('#bkRestore'); await page.waitForTimeout(150);
    p = await page.evaluate(() => window.__isoTest.store().profile);
    ok(p.sfx === 30 && p.voice === 40 && p.sfxOff === true, kind + ' restore brings the sound settings back: ' + JSON.stringify([p.sfx, p.voice, p.sfxOff]));
    ok(!errs.length, kind + ' no errors ' + errs);
    await b.close();
  }
  console.log(pass + ' passed, ' + fail + ' failed'); srv.close(); process.exit(fail ? 1 : 0);
})();
