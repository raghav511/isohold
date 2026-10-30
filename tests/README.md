# Isohold tests

Real-browser tests: Chromium with a Pixel 7 profile (Android) and WebKit with an iPhone 13 profile (Safari's engine).

```
cd tests
npm install
npx playwright install chromium webkit
npm test
```

- `test-parse.js`: what people type or say → the actions logged (meals, sets, gym shorthand, units, pain, cardio, commands during a session).
- `test-flows.js`: voice logging, undo, photo → meal (with a mocked Gemini), coach questions, hands-free session commands, unit switching, backup restore.
- `test-layout.js`: no sideways scrolling on any tab at 360, 390 and 412 px.
- `test-boot.js`: every tab opens directly on a fresh load for new, long-time and gym users.
- `test-android.js`: the web app manifest is installable in Chrome, the service worker controls the page, and it reloads offline.
- `test-speed.js` (runs last in `npm test`, even when an earlier suite fails; alone: `npm run test:speed`): about 3 minutes on Mid Android (Chromium, CPU 4x, Fast 4G), medians of 3 runs, checked against `perf/budgets.json`. It prints `FAIL ...` and exits 1 when a byte budget is exceeded or a time or memory budget is more than 10% over. The last line is a one-line `speed: ...` summary, which says when the machine was under load or other suites were running. Memory uses an 8-loop stand-in for the 10-minute session.
