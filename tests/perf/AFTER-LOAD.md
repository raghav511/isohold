# Isohold load speed and offline: after (branch speed-load)

Measured 2026-10-29 with `tests/perf/baseline.js` (load and actions parts, 3 runs each, median / p90), the same harness and
profiles as BASELINE.md. "Before" is v54 as in BASELINE.md. Before and after ran back to back on the same machine.
Other test suites were running on the machine at the same time, so CPU-bound times (boot, longest task, warm load) are noisier
than in BASELINE.md, where the warm load was 396 ms. Byte counts don't depend on load and are exact.

## What changed

| Area | Change |
|---|---|
| Service worker install | index.html is saved once, under `index.html`. `./`, `index.html#…` and `index.html?…` all map to it. On the first install the open page hands the service worker its copy (`fetch(…, {cache: "force-cache"})`, then postMessage), so nothing is downloaded again. A new version's install revalidates with `cache: "no-cache"`, so the server answers 304 or sends the new page and a stale copy is never saved. Icons and manifest still use `cache: "reload"`. |
| Warm launch | The background refresh sends the saved copy's `If-None-Match` / `If-Modified-Since` with `cache: "no-store"`. The copy is replaced only on a 200. |
| Version check (4 s after launch and on every return to the app) | It used to download the whole index.html with `no-store` each time. Now it sends the saved copy's ETag, so it gets a 304 when nothing changed. It still always asks the network and is never answered from the cache. If the saved copy is already newer, it shows the banner without downloading anything. "Update now" saves one copy, with its ETag. |
| Fonts | Lexend (variable 400–800) and Atkinson 400/700 are subset to the glyphs the app uses: ASCII, Spanish accents, ¡ ¿ ° ± · ½ × ÷ õ ø, – — ‘ ’ “ ” • … −. Binary size went from 73 KB to 50 KB, and the gzip page is 23 KB smaller. Characters outside the subset fall back to the system font, as before. |
| Start-up work | Exercise figures are prepared the first time they are drawn (lazy `_r/_anchor/_vb` getters) instead of all at once. |
| Next screen | The Exercises list is built in idle time 300 ms after start-up. While another tab is open, data changes only mark it out of date, so a hidden list is never rebuilt. |
| Dead code | Removed what nothing references: `.band.lightink` / `LIGHT_INK`, `.rest-card`, `.bars-x`, `.pf-more`, `addonTxt` / `ADDON_TXT`. |
| Icons | Re-encoded losslessly and pixel-identical: 23.2 → 22.2 KB. They already match their declared sizes. |

## Before / after

### Bytes (gzip server, every request over 12 s after launch, including the version check)

| | Before | After |
|---|---|---|
| index.html gzip | 335 KB | **313 KB** |
| First visit, Android (Chromium) | 1 332 KB (index.html downloaded 4×) | **330 KB** (1×) |
| First visit, iPhone proxy (WebKit) | 1 332 KB (4×) | 637 KB (2×, see note) |
| Each warm launch, Android | 327 KB (the full page through the version check; 0 before usable) | **0 KB** (three 304s) |
| Each warm launch, iPhone proxy | 655 KB | **1.8 KB** (sw.js) |
| Cache Storage | 6 entries, 1.95 MB | **5 entries, 0.98 MB** |

Budgets: first visit < 400 KB is met on Chromium. Warm-launch background < 5 KB is met on both.
Note: Playwright's WebKit has no HTTP cache, and even `force-cache` goes to the network (checked with a test page), so the
page's copy can't be reused there. Real Safari keeps a disk cache, so the same code should reach 1×.

### Load (harness `load`, gzip; raw numbers in the same direction)

| Metric | Mid Android before | after | Budget before | after | iPhone* before | after |
|---|---|---|---|---|---|---|
| Cold FCP (ms) | 712 / 939 | **616 / 616** | 2496 / 2518 | **1912 / 1925** | 294 / 1093 | 195 / 201 |
| Cold LCP (ms) | 2156 / 2287 | **2048 / 2067** | 8104 / 8286 | **7056 / 7107** | n/a | n/a |
| Cold usable (ms) | 2245 / 2412 | **2158 / 2170** | 8337 / 8606 | **7185 / 7257** | 814 / 2185 | 239 / 277 |
| Cold longest task (ms) | 252 / 328 | 241 / 243 | 727 / 925 | **286 / 320** | n/a | n/a |
| Cold bytes, incl. precache (KB) | 1005 | **330** | 1005 | **330** | 1005 | 637 |
| Warm usable (ms) | 522 / 579 † | 610 / 642 † | 2050 / 2248 † | 735 / 757 † | 936 / 1092 | 245 / 247 |
| Warm longest task (ms) | 189 / 218 † | 210 / 233 † | 831 / 907 † | 245 / 267 † | n/a | n/a |
| Warm background bytes (KB) | 327 | **0** | 0–327 | **0** | 328 | **1.8** |

\* WebKit at full speed with no shaping.
† Noise. The machine's load average was far above normal during these runs. A quieter "before" run in the same session gave 440 ms (Mid)
and 723 ms (Budget) warm usable, and in BASELINE.md it was 396 / 548 ms. Warm launch has no network and runs the same script,
minus the figure preparation, so it should be equal or slightly faster. Budget cold load improves by about 1.1 s because it is
bandwidth-bound: 22 KB less page and no precache downloads competing with it.

### Actions (Mid Android, harness `actions`)

| Action | Before | After |
|---|---|---|
| Open Exercises (first time) | 139 / 144 ms, 82 ms long task | **82 / 92 ms, no long task** |
| Start a session | 265 / 276 | 211 / 225 |
| Open Progress | 198 / 208 | 185 / 185 |
| Log a set by text | 104 / 112 | 115 / 119 (within noise) |
| All other actions | unchanged within ±5 ms | |

## Checked and not done, with reasons

- **Splitting index.html into per-screen files.** Not done. Cold load is bandwidth-bound: on Budget, 313 KB at 50 KB/s is about 6.3 s of 7.2 s. Splitting doesn't reduce bytes before usable, because Today needs the shared state, figures and plan code. Each extra file costs at least one round trip (150 ms Mid, 400 ms Budget) and makes the offline shell several files instead of one. V8 compile of the inline script is about 35 ms (BASELINE.md).
- **Preloading Progress.** Not done. Progress is recomputed on every open (`show('progress')` → `renderProgress`), so prerendering it can't shorten the first open. That cost belongs to the strength-index and Progress work on another branch.
- **More dead code.** `bodySvg` / `ZONES`, `openSearch`, `openAISettings`, `saveChat`, `weekSessions`, `.app-pad`, `#cChat`, `.bk-confirm` and `.mapkey` are also unreferenced. They are left in place because they sit in the coach/AI and Progress code that other branches are changing, and together they are under 2 KB gzip.

## Offline

After the first visit, a cold offline launch opens the app (Chromium). index.html, manifest.json and all three icons come from the saved
copy (`test-android.js`, plus a custom check of each file offline). Text rendering is pixel-identical before and after on Today,
Exercises, the exercise sheet, Progress, Search with Spanish and symbol text, and the Guide, in Android and iPhone, light and dark
(24 screenshots, 0 differing pixels).
