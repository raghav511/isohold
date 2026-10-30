# AI replies, taps and offline: before / after

Measured 2026-10-30, Apple M1, Playwright 1.56.1 driving Chromium 153 headless shell. **Before** = `git show origin/main:index.html` (v54), **after** = this branch. Both builds ran on the same machine and browser in the same session.
Mid Android = 4x CPU + Fast 4G. Budget = 6x CPU + Slow 3G. Medians and p90 of 3 runs. These figures are less precise than the 5-run baseline.
Re-run with `cd tests && node perf/measure-ai-ui.js --build=old|new [--runs=5] [--only=ai,taps,typing,anim,offline]`. Raw results are in `ai-ui-before.json`, `ai-ui-after.json`, `taps-old.json` and `taps-new.json`.
The test user has 654 logged sets and a chat history of 12 earlier questions and answers.

## 1. AI (Mid Android, Gemini mocked: 600 ms to first byte, then streamed)

| | Before | After |
|---|---|---|
| Enter → "working on it" painted, first question | 275 / 377 ms | **23 / 29 ms** |
| Enter → "working on it" painted, later question | 93 / 120 ms | **16 / 17 ms** |
| Enter → "working on it" painted, first meal Gemini must read | 1940 / 2515 ms | **17 / 19 ms** |
| App overhead to first word, first question | 209 / 296 ms | **122 / 166 ms** |
| App overhead to first word, later question | 43 / 49 ms | 93 / 100 ms |
| Same question asked again (cache) | 34 / 35 ms + 600 ms network | **answered at once, no request** |
| Request size (system text + history) | 13.5 KB (6.5 + 6.9) | **8.0 KB** (5.5 + 2.4) |
| Model for typed logs | chosen model | **Flash-Lite**, when the key lists one |

In an earlier quieter run, overhead was 77 / 78 ms (first question) and 66 / 67 ms (later question). The later-question overhead is higher than before because the send now waits one frame, so that "working on it" is painted before any work starts. That trade puts acknowledgement under 30 ms in every case. Before, a first meal took up to 2.5 s to acknowledge. The first-meal parse itself (about 2 s in `parseFood`) belongs to the processing fixer.

What changed:
- **Instant acknowledgement.** On send, your words and a "working on it" bubble are painted in that frame, and the work runs right after.
- **Shorter context.** History keeps the last 4 exchanges. Older answers are cut to 400 characters, and an earlier copy of the same question is left out. In the system text, the last 30 sets are grouped by day with set counts (nothing removed), and a weekday that repeats another day's exercises in a rotated order is described that way.
- **System text cached.** It is rebuilt only after a save or when the hour changes. It is prepared ahead while you type, and the question parser is warmed once when the input box gets focus.
- **Cache.** The same question with the same data and context gets the stored answer for 10 minutes. The cache is per device (`isohold.coach.cache`, at most 20 entries). Typed-log parses are cached the same way.
- **Smaller model.** Typed logs go to a Flash-Lite model, and only one this key can list. If that model fails (404, 400, 403 or 5xx), the app falls back to the chosen model and stops using Flash-Lite. Photos, voice notes and open questions keep the chosen model.
- **Time limits.** The app waits at most 15 s for the first byte and 45 s for the whole answer (AbortController). After that it shows "Gemini is taking too long" with Try again.
- **Errors.** A failed log replaces its pending bubble with an error and Try again. Before, there was no retry.
- **Parallel work.** A photo is saved on the phone while Gemini reads it.
- **Handled on the phone.** These used to go to Gemini and now get a local reply: thanks, hi or hello, ok, yes or no with nothing pending, bye, "what did I eat today?" (read from the log, so it is exact), and the Spanish versions. That is 11 of the 55 typed inputs probed.
- **Still sent to Gemini.** "pushups 20", "yoga 30 min", "stretched 10 min" and "caminé 30 minutos" still go to Gemini because the parser misses them. Separately, "stepped on the scale: one hundred seventy nine pounds" is parsed locally as 100 kg, which is wrong. All of these belong to the parser area of the processing fixer.

**Accuracy** (`tests/perf/test-ai.js`): 10 tasks reach Gemini on both builds, and Gemini's answers are recorded per request. The tasks are a meal photo, a voice note with 3 logs, an open question, a Spanish log, a correction, BP, pain, a scale photo, cardio, and a question that needs the user's data. The last one is answered well only if the prompt still includes the knee note, profile, plan, weight and week. On both builds the saved data, the feed and the text shown are **identical** (53 checks). The test also checks that typed logs use Flash-Lite and that photos and questions use the chosen model.

## 2. Taps (Mid Android, real tap: finger down 80 ms, then up)

"Pressed look" is the time from finger down to the first frame where the control visibly changes. Pointerdown now adds a `.pressing` state: lower opacity, with no motion, so it also suits reduced motion. That state is painted before the tap's own work runs. "Result" is the time from finger lift to the tap's result being painted. The work itself was not moved.

| Tap | Pressed look, before | Pressed look, after | Result, after |
|---|---|---|---|
| Tab: Progress (heavy) | never until done (≈ 570 ms) | **9 / 12 ms** | 434 / 495 ms |
| Start a session (heavy) | 7.7 s* | **12 / 15 ms** | 750 ms* |
| One-tap log chip (first meal) | 2.8 s | **8 / 14 ms** | 17 / 24 ms, "working on it" shown, parse runs after |
| Progress chips (Muscles / Strength / Body) | 180–370 ms | **5–8 / ≤ 14 ms** | 28–179 ms |
| Profile goal chip | 294 ms | **5 / 9 ms** | 82 / 110 ms |
| Steppers (sheet weight +) | none | **14 / 19 ms** | 33 / 36 ms |
| Session next, close, end | 188–214 ms | **10–14 / ≤ 24 ms** | 38–107 ms |
| Tab: Exercises (first time) | none | 139 / 160 ms | 167 / 204 ms (before: 351 / 361 ms) |

\* Starting a session in this run included the first-meal parse that was still running, and `buildQueue` belongs to the processing fixer.

The pressed look was under 25 ms p90 on every control except the first Exercises tap, which lands while boot work is still finishing. The profile checkbox could not be timed because its label covers the input in this harness.

**Layout shift**

| | Before | After |
|---|---|---|
| CLS on load | **0.47** | **0** |
| Every tab and sheet opened | 0 | 0 |

The body map was drawn in a `setTimeout` after boot, so it pushed the sessions down 517 px. The top-bar tools also arrived late and wrapped the week button. Now the body map is drawn in the first frame, and `main` stays unpainted until that first render: `html.booted`, with a fallback on `load`. The tab bar still paints early.

**Typing (key → paint)**

| | Before | After |
|---|---|---|
| Search & log | 16 / 21 ms | **11 / 17 ms** |
| Weight box | 41 / 61 ms ✗ | **26 / 41 ms** |

Each key in the weight box used to save, which rebuilt the 62 KB backup code. Now the value changes in memory at once, and the save runs 400 ms after typing pauses. It is also flushed on change, on `pagehide` and when the page is hidden.

**Animation**

- The exercise-sheet figure and the session player hold 57–60 fps with no long tasks, before and after.
- With reduced motion the figure stays still, which was verified.

## 3. Offline (Budget phone, then offline)

| | Before | After |
|---|---|---|
| Offline indicator | Only a banner inside Search & log | **Small "Offline" pill on every screen**: fixed, no layout shift, `role="status"`. It shows "App v54, updated <date> · Saved <time>". It appears on the `offline` event or a failed request, within 14–29 ms of the event. It disappears when online again or when a request gets through. |
| Question, photo or voice note while offline | Error, and the request was lost | **Kept** in localStorage, with media in the photo IndexedDB, and kept after a reload. Back online, the app offers "Send now / Discard", or shows a toast with Review on other tabs. **Nothing is sent without a tap.** Sending runs the requests in parallel. |
| Typed log offline | Works | Works |
| Offline reload with the service worker | Works (opens in about 0.9–1.2 s) | Works, and the pill shows |
| Storage full | The entry stayed on screen as if saved | **Rolled back.** The card shows "Undone", and the message reads "Not saved: this device's storage is full …". The Today warning stays. |

Tests: `tests/test-offline-ui.js` passes 35 of 35. It covers the pill, failed requests, the queue and reload, no auto-send, Discard, the toast, Retry after a 503, the 15 s timeout (fake clock), storage-full rollback, the pressed look, and offline service-worker boot.

## Regression

These suites all passed on temporary copies on ports 8970–8984:

| Suite | Checks |
|---|---|
| test-r13b | 55 |
| test-timer | 30 |
| test-flows | 34 |
| test-ui1 | 34 |
| test-ui2 | 11 |
| test-ui3 | 6 |
| test-ui4 | 13 |
| test-today | 37 |
| test-trust | 58 |
| test-security | 103 |
| test-redteam | 72 |
| test-people | 114 |
| test-profile | 176 |

`APP_VERSION`, `sw.js` and `tests/package.json` are unchanged.
