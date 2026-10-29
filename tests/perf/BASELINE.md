# Isohold speed baseline (version 54)

Measured 2026-10-29 on an Apple M1 with Playwright 1.56.1. Nothing in the app was changed.
Re-run: `cd tests && node perf/baseline.js > perf/baseline-results.json` (about 40 minutes; `--only=bundle,load,actions,scale,ai,memory`, `--runs=5`, `--profiles=mid,budget,iphone`, `--mem-minutes=10`).
Raw numbers from this run: `tests/perf/baseline-results.json`.

## How it was measured

| Profile | Engine | CPU | Network |
|---|---|---|---|
| Mid Android | Chromium, Pixel 7 viewport and user agent | 4x slower (CDP `Emulation.setCPUThrottlingRate`) | Fast 4G: 150 ms latency, 1.6 Mbps down, 750 kbps up |
| Budget phone | Chromium, Pixel 7 | 6x slower | Slow 3G: 400 ms latency, 400 kbps both ways |
| iPhone Safari (proxy) | Playwright WebKit, iPhone 13 | **not throttled** (WebKit has no CPU throttling) | **not shaped** (WebKit has no network emulation) |

- The iPhone column is the M1's full speed on localhost, so it shows only what WebKit does differently. It does not predict a real iPhone. WebKit also reports no LCP, no long tasks, no trace and no heap size, so those cells are "n/a". Memory was measured on Mid Android only.
- Server: a local server on ports 8910 (plain files) and 8911 (gzip level 6, like GitHub Pages). Both send `Cache-Control: max-age=600`, an ETag and Last-Modified, and answer `If-None-Match` with 304. Byte counts are response bodies counted by the server, so they include the service worker's own downloads. Headers are not counted.
- Every load uses the `seed-week4.json` state, which is a returning user with 654 logged sets.
- **Cold**: new browser profile, so the HTTP cache is empty and no service worker is installed. **Warm**: a second visit in the same profile after the service worker has installed.
- **Usable**: at the first free task after the app finishes booting (`__isoholdReady`), the test taps the first tab (Today) and times until that tap is painted (rAF, then setTimeout). The tab switch was confirmed on every run.
- **JS compile+run**: Chromium trace `EvaluateScript` for the 770 KB inline script. "V8 compile" is the `v8.compile` part inside it. Long tasks come from the Long Tasks API.
- **Tap or key latency (INP-style)**: from the event's own timestamp (pointerdown, or keydown for typing) to the next paint after the app's handlers have run (rAF, then setTimeout). The Event Timing API value is reported next to it as a check, and the two agree within a few ms.
- Each metric is the **median / p90** of 5 runs, interpolated. With 5 runs the p90 is close to the worst run.

## 1. First load

### Cold (empty cache, no service worker)

| Metric | Mid Android gzip | Mid Android raw | Budget gzip | Budget raw | iPhone* gzip | iPhone* raw |
|---|---|---|---|---|---|---|
| FCP (ms) | 672 / 677 | 1144 / 1148 | 2356 / 2363 | 4296 / 4312 | 130 / 145 | 143 / 165 |
| LCP (ms) | 2024 / 2029 | 5260 / 5274 | 7412 / 7412 | 20452 / 20510 | n/a | n/a |
| App boot done (ms) | 1980 / 1987 | 5223 / 5235 | 7352 / 7354 | 20389 / 20435 | 68 / 128 | 67 / 82 |
| **Usable: first tap painted (ms)** | **2083 / 2094** | 5307 / 5322 | **7491 / 7499** | 20535 / 20605 | 170 / 211 | 184 / 205 |
| Main script compile+run (ms) | 141 / 142 | 128 / 135 | 211 / 217 | 216 / 268 | n/a | n/a |
| … of which V8 compile (ms) | 35 / 36 | 32 / 34 | 53 / 53 | 52 / 64 | n/a | n/a |
| HTML parse incl. script (ms) | 236 / 242 | 281 / 292 | 377 / 383 | 512 / 684 | n/a | n/a |
| Layout / style recalc (ms) | 51 / 18 | 46 / 18 | 80 / 29 | 82 / 36 | n/a | n/a |
| Long tasks during load | 1, 145 ms | 1, 128 ms | 2, 271 ms | 2, 280 ms | n/a | n/a |
| Longest task (ms) | 145 / 149 | 128 / 139 | 221 / 225 | 229 / 276 | n/a | n/a |
| Bytes on first visit, incl. SW precache (KB) | **1005** | 2915 | 1005 | 2915 | 1005 | 2916 |
| index.html downloaded | **3 times** | 3 | 3 | 3 | 3 | 3 |

### Warm (service worker installed, second visit)

| Metric | Mid Android gzip | Mid Android raw | Budget gzip | Budget raw | iPhone* gzip | iPhone* raw |
|---|---|---|---|---|---|---|
| FCP (ms) | 128 / 130 | 108 / 112 | 160 / 171 | 164 / 188 | 125 / 153 | 136 / 160 |
| LCP (ms) | 128 / 130 | 108 / 112 | 472 / 494 | 216 / 251 | n/a | n/a |
| App boot done (ms) | 274 / 279 | 233 / 244 | 434 / 486 | 437 / 511 | 56 / 66 | 60 / 70 |
| **Usable: first tap painted (ms)** | **396 / 403** | 343 / 355 | **548 / 622** | 569 / 670 | 146 / 184 | 156 / 177 |
| Main script compile+run (ms) | 146 / 148 | 125 / 131 | 216 / 264 | 218 / 257 | n/a | n/a |
| Longest task (ms) | 149 / 152 | 127 / 133 | 226 / 269 | 225 / 264 | n/a | n/a |
| Bytes before usable (KB) | 0 | 0 | 0 | 0 | 327 | 964 |
| Bytes in the background refresh (KB) | **327** | 963 | 327 | 963 | 328 | 966 |

\* iPhone means WebKit at full M1 speed on localhost, with no throttling or shaping.

Notes:
- Cache Storage after install holds 6 entries and 1.95 MB. index.html is stored twice, once as `./` and once as `index.html`.
- The V8 code cache does not help the warm load. Compile is 35 ms both cold and warm, because the script is inline.
- On a warm visit Chromium serves from the service worker with no bytes before usable. Its background refresh still downloads the whole index.html once on every launch.

## 2. Slowest user actions (Mid Android, seed data, 5 fresh loads)

| # | Action | Tap/key → next paint, median / p90 (ms) | Longest task (ms) |
|---|---|---|---|
| 1 | **Log the first meal of the session by text** ("2 eggs and a bowl of oatmeal", Enter) | **1499 / 1709** | 1470 |
| 2 | Start a session (Today → Start) | 190 / 321 | 182 |
| 3 | Open Progress (Strength graph) | 176 / 218 | 172 |
| 4 | Restore a backup (Profile → Backup → Restore) | 176 / 225 | 155 |
| 5 | Open Exercises the first time | 122 / 135 | 76 |

The other actions measured:

| Action | median / p90 (ms) |
|---|---|
| Log a set by text (Enter) | 98 / 112 |
| Progress: Strength graph (in-page tab) | 66 / 79 |
| Open exercise sheet (Goblet squat) | 63 / 66 |
| End session (confirm) | 47 / 65 |
| Profile: Backup tab | 32 / 36 |
| Open Today | 27 / 37 |
| Progress: Muscles (coverage map) | 25 / 33 |
| Open Search & log (top-bar Search) | 23 / 25 |
| Session: next step (1st / 2nd / 3rd) | 19 / 22 / 16 |
| Close exercise sheet | 20 / 21 |
| Open Profile | 18 / 22 |
| Open Help (Guide) | 17 / 22 |
| Search typing, worst key of "squat" | 16 / 21 |
| Progress: Body | 15 / 17 |

The meal cost is paid once per page load. Later meals take about 2 ms of parsing, as the CPU profile below shows.

## 3. Data scaling (Mid Android)

1x is seed-week4 plus four weeks of realistic meals (3 a day), cardio and lift notes, and weigh-ins. The seed itself has no meals. 10x and 100x repeat that four-week block further back in time.

| Metric (median / p90, ms) | 1x | 10x | 100x |
|---|---|---|---|
| Data: sets / meals / notes / JSON | 654 / 84 / 27 / 66 KB | 6 540 / 840 / 270 / 645 KB | 65 400 / 8 400 / 2 700 / **6.4 MB** |
| Boot done (cold JS, warm network) | 2018 / 2034 | 2031 / 2112 | 2294 / 2404 |
| Search & log: open | 61 / 73 | 64 / 100 | 186 / 198 |
| Search typing: median key | 9 / 11 | 9 / 14 | 16 / 27 |
| Search typing: worst key of "squat" | 15 / 17 | 12 / 20 | 26 / 45 |
| Log a set by text (Enter) | 114 / 142 | 145 / 226 | **1141 / 1455** |
| Open Progress (Strength) | 204 / 250 | **548 / 862** | **24 427 / 27 233** |
| Progress: Strength graph | 78 / 85 | 285 / 394 | **14 961 / 17 059** |
| Progress: Muscles (coverage map) | 28 / 33 | 26 / 45 | 60 / 67 |
| Coverage calculation `covDone()` alone | 0.3 | 1 | 6 / 9 |
| Strength index `dailyIdx()` alone | 14 / 14 | 130 / 200 | **9 024 / 10 793** |
| Profile: Backup tab | 41 / 48 | 262 / 348 | **4 705 / 5 477** |
| Restore a backup | 247 / 270 | **1 068 / 1 384** | **25 131 / 27 159** |
| Backup code size | 62 KB | 596 KB | 5.9 MB |

At 100x the state no longer fits in localStorage (`QuotaExceededError`). The app says so correctly ("Not saved: this device's storage is full…"). For this case the test loaded the state through `__ISOHOLD_STATE`.

## 4. AI reply (Mid Android, mocked Gemini)

The test replaces `fetch` for `streamGenerateContent` with a real `ReadableStream`. The stream waits a fixed **600 ms before the first byte**, then sends 16 SSE chunks 60 ms apart (a 120-word answer). `mockGemini` provides the key and model. The network profile does not apply to this mock, so the 600 ms is the whole simulated network.

**The app streams.** It reads the stream with `getReader()` and paints the reply once per animation frame (`paintReply`).

| Metric | median / p90 (ms) |
|---|---|
| Enter → the sent message painted | 114 / 193 |
| Enter → fetch issued (history, system prompt, render) | 70 / 125 |
| First byte → first words painted | 25 / 29 |
| **Enter → first words painted** | **698 / 760** |
| **App overhead to first words** (above minus the 600 ms) | **98 / 160** |
| Last chunk → last words painted | 15 / 20 |
| Enter → whole reply painted (stream lasts 907 ms) | 1598 / 1654 |
| Longest task during the reply | 97 / 172 |

## 5. Bundle

| Part | Raw | gzip | brotli (q11) |
|---|---|---|---|
| **index.html total** | **986 KB** | **335 KB** | 284 KB |
| Inline JS (one 771 KB script) | 771 KB | 235 KB | 190 KB |
| … code | 554 KB | 175 KB | 143 KB |
| … data literals (top-level object, array and string constants) | 218 KB | 61 KB | 49 KB |
| … of which exercise data (EX, EQTX*, EQV, GYM, GROW, PRE, EVID, REFS) | 146 KB | 36 KB | 28 KB |
| … of which foods and parsing tables (FOODS, ES, LIFTNAME) | 19 KB | 6.5 KB | 5.9 KB |
| … SVG markup in JS strings | 65 KB | 20 KB | 18 KB |
| CSS without fonts | 90 KB | 18 KB | 15 KB |
| **Fonts** (Lexend variable plus Atkinson Hyperlegible 400 and 700, base64 woff2 in CSS) | 98 KB (73 KB binary) | **74 KB** | 73 KB |
| HTML markup (inline SVG 7 KB) | 26 KB | 7 KB | 6 KB |
| sw.js / manifest.json | 1.9 / 1.1 KB | 0.8 / 0.4 KB | |
| Icons 180 / 192 / 512 | 5.1 / 5.3 / 12.9 KB | (PNG) | |
| **Service worker precache** | **1.95 MB** (index.html twice) | | |

The biggest data blocks are EX at 41 KB (11 KB gzip), EQTX 22 KB, REFS 19 KB, FOODS 16 KB, EQTX_NEW 15 KB, GROW 14 KB and EVID 10 KB. GitHub Pages serves gzip, so brotli would save 51 KB only on a host that serves it.

## 6. Memory (Mid Android, 10 minutes, 70 loops)

Each loop: switch tabs, open and close an exercise sheet, view Progress (Muscles, Strength and Body), log a set or a meal by text, start a session, step through 6 steps, end it, open Profile → Backup every third loop, and open Help.

| | Start (after GC) | End, before GC | End, after GC |
|---|---|---|---|
| JS heap used (CDP `Runtime.getHeapUsage`) | 2.5 MB | 27.9 MB | **26.6 MB** |
| DOM nodes in the document | 1 722 | 5 752 | 5 752 |
| DOM nodes including detached | 2 381 | 11 293 | 8 453 |
| Event listeners | 100 | 123 | 118 |
| Saved state | 49 KB | 66 KB | 66 KB |

The heap reaches 26 MB in the first 40 seconds, once the exercise library, Guide and Progress have been built. **After that it stays flat: 26.1 → 27.9 MB over 9 minutes, so there is no leak.** Nodes in the document grow by about 6 per loop, which is the Search & log feed getting longer. Detached nodes spike briefly (58 k at 454 s) and are collected. `performance.memory` stays at 9.54 MB the whole time because Chromium rounds it without `--enable-precise-memory-info`, so it is not usable here.

## Proposed budgets

Mid Android unless noted. A ✗ means the app is over the budget today.

| Metric | Now (median / p90) | Budget | Why |
|---|---|---|---|
| Warm load, usable | 396 / 403 ms | **< 600 ms p90** | Opening the installed app is the most common path. Today has 200 ms of headroom, and the budget stops a regression from eating it. |
| Warm load, usable, Budget phone | 548 / 622 ms | **< 800 ms p90** | It should still feel instant on a 6x slower CPU. |
| Cold load, usable (gzip) | 2083 / 2094 ms | **< 2.5 s p90** | First visit on 4G. Most of the time is the 335 KB download, so this guards the payload. |
| Cold load, usable, Budget phone | 7491 / 7499 ms | **< 8 s p90** | Bandwidth-bound (335 KB at 50 KB/s). It only improves if bytes go down. |
| Cold FCP | 672 ms | **< 1.0 s** | Something visible within 1 second on 4G. |
| Cold LCP | 2024 ms | **< 2.5 s** | The Core Web Vitals "good" line. |
| Main script compile+run | 141 / 146 ms | **< 175 ms** | One long task blocks the first tap. Allow about 25% growth, then make adding code cost something. |
| Longest task during load | 145–149 ms | **< 200 ms** | Mid Android should never freeze for more than 0.2 s while opening. |
| index.html gzip | 335 KB | **< 350 KB** | Each 50 KB is about 0.25 s cold on 4G and 1 s on Slow 3G. |
| First-visit transfer, incl. precache (gzip) | 1005 KB ✗ | **< 400 KB** | One copy of the page, not three. Data costs real money on prepaid plans. |
| Warm-launch background transfer | 327 KB ✗ | **< 5 KB** | An unchanged app should get a 304, not a full download on every launch. |
| Tap → paint, simple taps (tabs, sheets, session steps, Profile) | 15–66 ms | **< 100 ms p90** | 100 ms is where a tap stops feeling instant. |
| Tap → paint, heavy views (open Progress, start session, restore, first Exercises) | 122–190 / up to 321 ms ✗ | **< 200 ms p90** | These rebuild whole screens, but should still feel like one beat. |
| Log by text (Enter), any meal including the first | 1499 / 1709 ms ✗ | **< 150 ms p90** | Logging food is a core one-handed action. A 1.5 s freeze reads as "it didn't work". |
| Search typing, per key at 100x | 26 / 45 ms | **< 50 ms p90** | Typing must keep up with fast thumbs even for heavy users. It passes today. |
| Open Progress at 10x (≈ 10 months) | 548 / 862 ms ✗ | **< 300 ms p90** | A loyal user's main reward screen must not get slower each month. |
| Open Progress at 100x (≈ 8 years) | 24.4 s ✗ | **< 1 s** | The scaling must be roughly linear. 24 s looks like a hang. |
| Restore at 10x | 1068 / 1384 ms ✗ | **< 500 ms** | Rare, but people restore when switching phones and it must not look frozen. |
| Profile → Backup tab at 10x | 262 / 348 ms ✗ | **< 100 ms** | It is just a tab switch, and nothing should be computed until Copy is pressed. |
| AI: app overhead to first words | 98 / 160 ms | **< 100 ms median, < 150 ms p90** | The network wait already feels slow, so the app should add almost nothing. |
| AI: first byte → first words painted | 25 / 29 ms | **< 50 ms** | Streaming must keep painting each frame. |
| JS heap after 10 min (after GC) | 26.6 MB | **< 40 MB, growth after the first minute < 5 MB** | Low-end Android kills background tabs that use a lot of memory. Today growth is about 1.5 MB. |
| DOM nodes in the document after 10 min | 5 752 | **< 8 000** | Keeps style and layout cheap. The feed is the part that grows. |

## Biggest opportunities (with evidence)

1. **The first meal logged after opening the app freezes for about 1.5 s** (1470 ms long task, top action). A CPU profile puts 1 344 ms of 1 363 ms as self time in `parseFood`. The first call builds `foodIndex()`, one big `RegExp` per food alias, and runs every one of them once, so V8 compiles them all on that first tap. The second meal takes about 2 ms. Fixes: build and warm the index in idle time after boot, or match with one combined alternation or a keyword prefilter before running the per-food regexes.
2. **The strength index grows roughly with the square of the history.** `dailyIdx()` takes 14 ms at 1x, 130 ms at 10x and 9 024 ms at 100x. Opening Progress takes 204 ms → 548 ms → 24.4 s, and Restore 247 ms → 1.07 s → 25 s. The cause is in `dailyIdx` (around index.html line 4210): for every day and every exercise it re-filters `e.ds`, and `exVal` scans all the days again. A single sorted pass with a 6-week sliding max would make it linear. `dShort` (one `toLocaleDateString` per point, 46 ms self time at 10x) should reuse a single `Intl.DateTimeFormat`.
3. **The backup code is rebuilt on every save.** The `save` wrapper calls `refreshBackup()`, which runs `backupCode()` (JSON plus `b64enc` of the whole store) and writes it into the hidden `#bkOut` textarea. At 10x the Backup tab takes 262 ms (`showTab` self 140 ms for the 600 KB textarea); at 100x it takes 4.7 s. Logging a set by text grows from 114 ms to 1 141 ms at 100x. Build the code only when Copy, Save file or the Backup tab needs it.
4. **The first visit downloads index.html three times:** the page itself, then the service worker precaches `./` and `index.html` separately with `cache: "reload"`. That is 1 005 KB gzip instead of 335 KB (2.9 MB if served uncompressed), and 1.95 MB in Cache Storage. Precaching only `index.html` and matching `./` to it would remove about 670 KB per install.
5. **Every warm launch downloads the whole index.html again in the background** (327 KB gzip / 963 KB raw per open, 0 KB before usable). This happens even though the server sends an ETag and answers `If-None-Match` with 304. Find out why the service worker's `fetch(…, { cache: "no-cache" })` is not revalidating, or check for a new version with a small file, since sw.js already carries the version number.
6. **Fonts are 74 KB of the 335 KB gzip payload (22%)** because base64 woff2 does not compress. Subsetting to Latin, or dropping one Atkinson weight, would cut most of that, and cold load is bandwidth-bound on Budget phone (7.5 s).
7. **Starting a session has a 182 ms task (321 ms p90), and opening Progress a 172 ms task at 1x.** Opening Progress runs `renderProgress` → `renderDaily`/`dailyIdx` plus `strChange` every time. Caching the index until the log changes would make reopening Progress almost free.
8. **At 100x the state (6.4 MB) is over the localStorage quota.** The app warns correctly. The backup format and log are the long-term limit, so compacting old logs or moving them to IndexedDB will matter well before 8 years of data.
