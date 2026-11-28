# Bundle size, x5: JS and CSS per page

Report only (lane 10). No code changed. Measured on 2026-11-19 from `staging` at `31e2b3e`, built locally with Node
24.22.2 (`npm run build`), no account settings (the same as CI).

**How it was counted.** JS is each page's *initial* JavaScript, using the same scanner as the budget tests
(`tests/unit/perf-scan.ts`): external scripts, Astro islands and renderers, their static imports, and inline scripts.
Dynamic imports are not counted. CSS is every `<link rel="stylesheet">` on the page. "gz" is gzip, roughly what a
visitor downloads; "raw" is the file size on disk. 1 KB = 1024 bytes.

## Summary

- Every page ships at least **85.7 KB gz of JS** and **23.2 KB gz of CSS**, even plain text pages like `/privacy`.
- Of that JS, **63.4 KB gz is React** (`client.js`), loaded on every page only to mount the footer's "flag or comment"
  form (`FlagMount`, `client:only`). On 31 of 53 pages it is the only React island.
- One shared stylesheet (`Layout.css`, 125 KB raw / 23.2 KB gz) goes to every page and carries the home page's
  carousel, vials, hero and silk scenes, and the sudoku board, wherever the visitor is.
- Heaviest pages: `/account` (131.9 KB gz JS), the three daily games (120 to 123 KB gz JS, 24 to 27 KB gz CSS).

## The 5 largest wins

Estimates are gzip, per page view, from the numbers below. Each is its own small pull request with tests; none needs
a paid service.

| # | Change | Saves | Where |
| --- | --- | --- | --- |
| 1 | Load the flag form's React only on the first tap of "flag or comment": a plain button in the footer, then a dynamic `import()` of `FlagMount`. | about **72 KB JS** | the 31 pages whose only island is the flag (privacy, terms, support, about, 404, learn, lesson hubs and more) |
| 2 | Move the home-only styles (study-mode carousel, vials, hero, illustrations, silk scenes) out of `global.css` into the home components' own `<style>`, so Astro ships them only with the home page. | about **4 to 5 KB CSS** (about 25 KB raw) | every page except `/` |
| 3 | Move the sudoku and triage board styles out of `global.css` into the sudoku page's stylesheet. | about **2 KB CSS** (about 10 KB raw) | every page except `/play/sudoku` |
| 4 | Load the game settings dialog's code when the gear is first pressed (`GameSettings`, 11.6 KB gz), and the results/share code (`gameresults`, `ShareSheet`, 9 KB gz) when a game ends. | about **12 to 20 KB JS** | `/play/pillo`, `/play/sudoku`, `/play/word-path` |
| 5 | Split `/account`: keep the profile form in the first load and load export, delete-account and two-factor sections on demand (`AccountSettings` 13.6 KB gz, `twofactor` 3.1 KB gz). | about **10 KB JS** | `/account` |

Notes on the wins:

1. Win 1 is the big one: it takes those pages from about 86 KB to about 14 KB of initial JS. The flag must still
   work without JavaScript (the email link stays) and with the keyboard; the first tap may take a moment on a slow
   connection, so the button should show it is loading. Pages that use React anyway (games, sign-in, account) gain
   nothing from it but lose nothing either. `tests/unit/build-output.test.ts` budgets would then be lowered to lock
   the saving in.
2. Wins 2 and 3 change no look; the risk is a style that another page quietly relied on. `dark-mode.spec.ts`,
   `daytime-contrast.spec.ts` and the screenshot specs would catch that.
3. `client.js` stays the largest single file. Replacing React (for example with Preact) would save more, but it is a
   framework change, not a quick win, and is left out on purpose.

## Largest shared files

JS (gzip, how many of the 53 pages load it):

| File | Pages | Raw KB | Gzip KB |
| --- | --- | --- | --- |
| `client.BzraFoOi.js` | 53 | 204.2 | 63.4 |
| `SignIn.CEE0TtzI.js` | 5 | 24.6 | 14.9 |
| `AccountSettings.DTEJVlNm.js` | 1 | 43.7 | 13.6 |
| `GameSettings.B5KJ80qD.js` | 3 | 36.4 | 11.6 |
| `QuestionsPlayer.DEuqT_lx.js` | 1 | 17.2 | 6.4 |
| `SutureToday.CYFaKotS.js` | 1 | 20.3 | 6.3 |
| `SudokuGame.CphJ_VJ3.js` | 1 | 16.5 | 5.7 |
| `gameresults.73gr32Ft.js` | 5 | 13.5 | 5.5 |
| `AdminFlags.C5gpORQi.js` | 2 | 15.4 | 5.1 |
| `ModesCarousel.astro_astro_type_script_index_0_lang.CimZ8PvG.js` | 1 | 11.4 | 3.9 |

CSS:

| File | Pages | Raw KB | Gzip KB |
| --- | --- | --- | --- |
| `Layout.BY56FXLr.css` | 53 | 125.0 | 23.2 |
| `PulseGame.DNPxT1OA.css` | 1 | 9.4 | 1.9 |
| `CuewordToday.C4Pfgkuz.css` | 1 | 8.5 | 1.9 |
| `GameSettings.DoN76_zN.css` | 4 | 6.2 | 1.3 |
| `SutureToday.DwXGTmJv.css` | 1 | 4.9 | 1.3 |
| `index.CO6vRmgE.css` | 1 | 1.5 | 0.4 |

What is inside `Layout.css` (raw, the largest parts): theme tokens 9.6 KB, sudoku board 8.6 KB, study-mode carousel
and vials about 15 KB together, base reset 4.5 KB, home hero 3.7 KB, ☰ menu 3.7 KB, print rules 3.1 KB, silk scenes
about 4.5 KB.

## Every page

Sorted by initial JS. Preview pages (`/preview/...`) are removed from the live deploy build (`scripts/prune-preview.mjs`)
but are listed because they are in this build.

| Page | JS files | JS raw KB | JS gzip KB | CSS files | CSS raw KB | CSS gzip KB |
| --- | --- | --- | --- | --- | --- | --- |
| `/account` | 37 | 358.8 | 131.9 | 1 | 125.0 | 23.2 |
| `/play/word-path` | 39 | 349.9 | 122.5 | 5 | 136.5 | 26.1 |
| `/play/sudoku` | 38 | 345.0 | 121.3 | 3 | 131.2 | 24.6 |
| `/play/pillo` | 38 | 340.6 | 120.2 | 5 | 141.0 | 26.8 |
| `/account/two-factor` | 26 | 290.9 | 106.9 | 1 | 125.0 | 23.2 |
| `/reset-password` | 27 | 288.9 | 106.9 | 1 | 125.0 | 23.2 |
| `/signin` | 25 | 283.2 | 104.3 | 1 | 125.0 | 23.2 |
| `/signup` | 25 | 283.2 | 104.3 | 1 | 125.0 | 23.2 |
| `/play` | 36 | 288.0 | 103.0 | 1 | 125.0 | 23.2 |
| `/progress` | 29 | 282.3 | 98.9 | 1 | 125.0 | 23.2 |
| `/` | 34 | 276.0 | 97.3 | 2 | 125.1 | 23.3 |
| `/learn/questions` | 24 | 274.8 | 95.5 | 1 | 125.0 | 23.2 |
| `/admin/flags` | 24 | 273.2 | 93.9 | 1 | 125.0 | 23.2 |
| `/preview/admin-flags` | 24 | 273.2 | 93.9 | 1 | 125.0 | 23.2 |
| `/preview/body-viewer` | 29 | 264.7 | 92.5 | 1 | 125.0 | 23.2 |
| `/preview/share` | 25 | 264.5 | 92.2 | 1 | 125.0 | 23.2 |
| `/breaks` | 26 | 260.4 | 90.6 | 1 | 125.0 | 23.2 |
| `/auth/callback` | 25 | 260.8 | 90.2 | 1 | 125.0 | 23.2 |
| `/about` | 27 | 256.9 | 89.3 | 1 | 125.0 | 23.2 |
| `/coming-soon` | 27 | 256.9 | 89.3 | 1 | 125.0 | 23.2 |
| `/courses` | 27 | 256.9 | 89.3 | 1 | 125.0 | 23.2 |
| `/disclaimer` | 27 | 256.9 | 89.3 | 2 | 126.3 | 23.5 |
| `/privacy` | 27 | 256.9 | 89.3 | 2 | 126.3 | 23.5 |
| `/support` | 27 | 256.9 | 89.3 | 1 | 125.0 | 23.2 |
| `/terms` | 27 | 256.9 | 89.3 | 2 | 126.3 | 23.5 |
| `/learn` | 25 | 257.3 | 89.3 | 2 | 126.4 | 23.6 |
| `/preview/survey` | 23 | 253.6 | 87.4 | 1 | 125.0 | 23.2 |
| `/preview/reminders` | 24 | 253.0 | 87.4 | 1 | 125.0 | 23.2 |
| `/learn/video-sample` | 23 | 252.2 | 86.9 | 1 | 125.0 | 23.2 |
| `/404` | 23 | 251.3 | 86.9 | 1 | 125.0 | 23.2 |
| `/preview/states` | 23 | 251.2 | 86.5 | 1 | 125.0 | 23.2 |
| `/message` | 22 | 249.5 | 86.0 | 1 | 125.0 | 23.2 |
| `/play/crossword` | 22 | 249.5 | 86.0 | 5 | 140.1 | 26.7 |
| `/play/hello-cards` | 22 | 249.5 | 86.0 | 1 | 125.0 | 23.2 |
| `/play/stat` | 22 | 249.5 | 86.0 | 1 | 125.0 | 23.2 |
| `/preview/email` | 22 | 249.5 | 86.0 | 1 | 125.0 | 23.2 |
| `/preview/prose` | 22 | 249.5 | 86.0 | 2 | 126.3 | 23.5 |
| `/resources` | 22 | 249.5 | 86.0 | 1 | 125.0 | 23.2 |
| `/subscribed` | 22 | 249.5 | 86.0 | 1 | 125.0 | 23.2 |
| `/learn/study-skills/cards` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/learn/study-skills/fill-in` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/learn/study-skills/label-it` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/learn/study-skills/learn-mode` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/learn/study-skills/matching` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/learn/study-skills/organizer` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/learn/study-skills/print-cards` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/learn/study-skills/questions` | 22 | 249.5 | 85.7 | 2 | 125.1 | 23.3 |
| `/learn/study-skills` | 22 | 249.5 | 85.7 | 2 | 125.2 | 23.3 |
| `/preview/anatomy-lab` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/preview/anatomy-text` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/preview/concept-map` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/preview/rewards` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
| `/start` | 22 | 249.5 | 85.7 | 1 | 125.0 | 23.2 |
