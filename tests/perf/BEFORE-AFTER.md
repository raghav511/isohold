# Speed: before and after

Before = version 54 (tests/perf/BASELINE.md). After = version 56 plus the speed checks (tests/test-speed.js, last full-suite run).
Profile: mid-range Android (Chromium, CPU 4x slower, Fast 4G) unless noted; median of runs. The last "after" run happened while the machine was heavily loaded (1-minute load ~80), so after-timings are, if anything, pessimistic. iPhone numbers are Playwright WebKit with iPhone settings, without throttling. Budgets are in tests/perf/budgets.json; `npm test` fails if any is more than 10% over and prints a one-line speed summary at the end.

## Loading

| Measure | Before | After | Budget |
|---|---|---|---|
| First visit, cold: usable | 2.25 s | 2.08 s | 2.5 s |
| First visit, cold: first paint | 712 ms | 588 ms | 1 s |
| First visit, cold: largest paint | 2.16 s | 2.08 s | 2.5 s |
| Longest task during cold load | 252 ms | 219 ms | 200 ms (within the 10% margin) |
| Second launch (installed): usable | 522 ms | 391 ms | 600 ms |
| Budget phone (6x CPU, Slow 3G), cold usable | 8.34 s | 7.19 s | — |
| Budget phone, longest task during load | 727 ms | 286 ms | — |
| iPhone proxy, cold usable | 814 ms | 239 ms | — |
| index.html size (gzip) | 335 KB | 320 KB | 350 KB |
| Downloaded on a first visit | 1,332 KB (page fetched 4 times) | 344 KB (once) | 400 KB |
| Downloaded in the background on every launch | 327 KB | 0 KB | 5 KB |
| Offline copy stored on the phone | 1.95 MB | 0.98 MB | — |
| Layout shift while loading (CLS) | 0.47 | 0 | — |

## Slowest user actions

| Action | Before | After | Budget |
|---|---|---|---|
| Log the first meal by typing | 1,775 ms | 15 ms | 150 ms |
| Start a session | 382 ms | 37 ms | 200 ms |
| Open Progress | 186 ms | 96 ms | 200 ms |
| Restore a backup | 203 ms | 90 ms | 200 ms |
| Open Exercises the first time | 165 ms | 90 ms | 200 ms |
| A simple tap shows a response | heavy taps showed nothing until done (up to ~570 ms) | 55 ms (pressed look in 5–20 ms) | 100 ms |
| Typing in the weight box (key to screen) | 41 ms | 26 ms | — |

## Lots of data (1x / 10x / 100x the seed history)

| Measure | Before | After | Budget |
|---|---|---|---|
| Open Progress, 10x | 615 ms | 214 ms | 300 ms |
| Open Progress, 100x | 13,525 ms | 114 ms | 1 s |
| Restore a backup, 10x | 1,188 ms | 165 ms | 500 ms |
| Restore a backup, 100x | 19,541 ms | 458 ms | — |
| Profile → Backup tab, 10x | 281 ms | 40 ms | 100 ms |
| Search, worst keystroke, 100x | 19 ms | 17 ms | 50 ms |

Outputs are identical old vs new (tests/perf/test-identical.js: 153 outputs across seed, personas and 10x; 17 at 100x).

## AI (Gemini, simulated network)

| Measure | Before | After | Budget |
|---|---|---|---|
| "Working on it" shown after sending | 275 ms | 23 ms (32 ms under load) | 50 ms |
| App's own delay before the first word | 209 ms | 87 ms | 100 ms |
| Same question asked again | full request | answered from cache | — |
| Request size | 13.5 KB | 8.0 KB | — |
| Accuracy on 10 fixed tasks | — | identical saved data and replies (tests/perf/test-ai.js) | must not drop |

## Memory

| Measure | Before | After | Budget |
|---|---|---|---|
| JS memory after use | 27 MB after 10 min (no leak) | 6.7 MB after the 8-loop stand-in | 40 MB |
| Memory growth during use | flat | +1.2 MB | 5 MB |
| Page elements (DOM nodes) | — | 5,351 | 8,000 |

## Offline

Before: only a banner inside Search & log, and AI requests made offline were lost. After: an "Offline" label on every screen (app version, last saved time), typed logs keep working, and questions, photos and voice notes are kept and sent when you tap Send after reconnecting. A save that fails because storage is full is rolled back with a clear message.

Not measured: real iPhone hardware (WebKit proxy only), memory on WebKit, and a real 4-year-old phone (emulated with 6x CPU and Slow 3G).
