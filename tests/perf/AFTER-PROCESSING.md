# Isohold processing speed: before and after (branch speed-processing)

Measured with `tests/perf/baseline.js` (Mid Android: Chromium Pixel 7, CPU 4x, Fast 4G). Old build = `origin/main` (v54), new build = this branch, each served from its own copy, runs interleaved (3 rounds for actions, 2 for scale). Values are median / p90 of tap or key → next paint (ms).
The machine was shared with other jobs, so absolute numbers are a little higher than in BASELINE.md. Compare the old and new columns.

## User actions (seed data)

| Action | Old | New | Longest task old → new |
|---|---|---|---|
| Log the first meal by text | 1775 / 1943 | **63 / 66** | 1741 → 27 |
| Log a set by text | 112 / 124 | 99 / 112 | 99 → 83 |
| Open Progress (Strength) | 186 / 208 | **110 / 115** | 182 → 107 |
| Progress: Strength graph | 70 / 80 | 33 / 38 | 64 → 0 |
| Restore a backup | 203 / 222 | **110 / 124** | 180 → 89 |
| Start a session | 382 / 517 | **32 / 32** | see note |
| Open Exercises (first time) | 165 / 175 | 135 / 145 | 92 → 84 |
| Search typing, worst key | 19 / 20 | 16 / 17 | 0 → 0 |

Start a session: the tap now paints at once, and in Chromium the sound (AudioContext) is made one frame later. Headless Chromium has no sound device, so making the AudioContext is a 370–840 ms task in both builds. On a phone it takes a few tens of ms. Safari and Firefox still make it inside the tap, as they require.

## Data scaling (1x / 10x / 100x)

| Metric | 1x old → new | 10x old → new | 100x old → new |
|---|---|---|---|
| Open Progress (Strength) | 215 → **103** | 615 → **166** | 13 525 → **98** |
| Progress: Strength graph | 77 → 31 | 314 → 34 | 8 803 → 57 |
| Strength index `dailyIdx()` | 14 → 0 (ready) | 143 → 0 | 4 911 → 0 |
| Log a set by text | 106 → 86 | 152 → 99 | 694 → 240 |
| Profile → Backup tab | 41 → 43 | 281 → **37** | 3 268 → 210 |
| Restore a backup | 232 → **137** | 1 188 → **165** | 19 541 → **458** |
| Search typing, worst key | 12 → 13 | 12 → 13 | 14 → 15 |

Longest single task at 100x in the new build:

- Open Progress: 77 ms
- Strength graph: 0 ms
- Backup tab: 192 ms
- Log a set: 195 ms
- Restore: 274 ms

Restoring the 5.9 MB code is now two tasks, one to read it and one to apply it. The old build did it in one 19 s task. At 100x the state is over the localStorage quota, so each save still serialises 6.4 MB, and the app says the data isn't saved.

## What changed (index.html only)

- **Typed food.** Each food pattern is compiled the first time it is needed. A pattern is tried only when the text contains the literal start of its food's name, because it can't match without it. The first meal now compiles a handful of patterns instead of 600. The patterns and the date formats are also warmed in idle time after opening, and the exercise-name patterns are compiled once.
- **Strength index.**
  - The log is read once per data change. The result is kept under a save counter plus each array's identity and length.
  - Each exercise keeps a running 6-week maximum. The old code re-scanned every exercise for every day, which was quadratic.
  - The day boundary is reused while entries fall in the same day, and each date format is built once (`Intl.DateTimeFormat`).
  - Sets are indexed by exercise and lifts by name, once per change. `exSetsOf`, `liftSetsOf`, the strength map and Exercise history use these indexes.
  - "Blood pressure today" is kept until the data changes. It used to re-filter all notes for every planned exercise.
- **Very long logs (over 20 000 sets).**
  - The strength index is worked out in slices of up to 30 ms, in idle time and while Progress shows "Working out…".
  - Progress draws one card per task, cards for the open section first.
  - When an Other lifts entry has more than 60 records, its "All N entries" list is built only when opened.
- **Backup and restore.**
  - Base64 goes through TextEncoder/TextDecoder, which gives the same bytes. Malformed text falls back to the old path.
  - The backup code is built once per data change.
  - A code over 200 KB is kept in a hidden box. Laying out megabytes of text in a visible box froze the screen.
  - After a restore, a hidden Progress is redrawn once in idle time instead of twice straight away.
  - The undo copy keeps the parts the restore replaced instead of deep-copying them.
  - When storage is full, the retry reuses the text already built.
- **Web Worker: not used.** After these changes, every remaining main-thread step at 100x on Mid Android is under 200 ms except restoring a 5.9 MB code (274 ms). Handing the 6.4 MB state to a worker would itself need a structured clone of that size each way.

## Same output

`node perf/test-identical.js [--100x]` loads the same states in the old and the new build, with a fixed clock and seeded random numbers:

- seed-week4
- the 1x generator
- every persona fixture
- 10x, and 100x with `--100x`

It then compares these outputs as JSON:

- strengthData, dailyIdx and strChange
- curMax for every exercise, kind and equipment, and for every other lift
- covDone, covPlan and bodyWeek
- buildQueue for every day × part × phase
- parseText for 342 typed lines
- the rendered text of Today, Exercises and every Progress tab, also with every details section opened

Result: **all 153 outputs identical**, and 17/17 at 100x. To check that the test catches differences, a deliberate 0.001% change to the index and a one-entry change to the lazy list were both reported as failures.

Suites run on this build (ports 8950–8951):

| Suite | Result |
|---|---|
| test-parse | 200/200 |
| test-foods | 0 bad lines |
| test-lifts | 0 bad lines |
| test-fix3 | 67/67 |
| test-fix4 | 66/66 |
| test-r12c | 43/43 |
| test-r13d | 64/64 |
| test-r14a | 46/46 |
| test-checks | 49/49 |
| test-progress2 | 39/39 |
| test-profile | 176/176 |
| test-security | 103/103 (one WebKit cross-tab timing failure on the loaded machine passed on re-run) |
| test-redteam | 72/72 |
| test-people | 114/114 |
