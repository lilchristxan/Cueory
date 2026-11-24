# Lighthouse report: launch pages (task x3)

Lighthouse is Google's free page checker. It scores each page from 0 to 100 on speed, accessibility, best practices and SEO (how easily search engines can read it). 90 or above is good, 50 to 89 needs work, below 50 is poor.

## How this was measured

- **When:** 2026-11-19, on the `staging` code at commit `97bbb1a6`.
- **What:** the site built with `npm run build`, served from a laptop by a plain local file server (no compression, no caching rules, no Cloudflare).
- **Tool:** Lighthouse 13.0.1 in Chrome 157 (headless), using the mobile preset: a mid-range phone screen with a simulated slow 4G connection and a slowed-down processor. One run per page.
- **Load on the laptop:** in the second run, three pages were measured at the same time, on a laptop that was also running other builds.

**How far to trust the numbers.** Accessibility, best practices and SEO depend on the page itself, so those scores are reliable. The speed scores are probably lower than real visitors would get: the local server sends files uncompressed, and the shared, busy processor slows the timing. Use the speed column to compare pages with each other and to find the slowest ones, not as the live site's real score. Before acting on speed, check the preview or live site with PageSpeed Insights (pagespeed.web.dev).

## Scores (mobile)

| Page | Speed | Accessibility | Best practices | SEO | First paint | Largest paint | Blocking time | Layout shift |
|---|---|---|---|---|---|---|---|---|
| `/` (1) | 25 | 100 | 100 | 100 | – | – | – | – |
| `/play` (1) | 38 | 100 | 100 | 100 | – | – | – | – |
| `/play/crossword` | 43 | 100 | 100 | 66 | 3.0 s | 4.5 s | 950 ms | 0.161 |
| `/play/hello-cards` | 48 | 100 | 100 | 66 | 3.4 s | 5.1 s | 770 ms | 0 |

(1) Scores only, from the first run, which measured one page at a time. That run stalled on `/play/crossword`, so it was stopped and the pages were measured again in parallel. The second run did not reach this page before the deadline, so no timings were saved for it.

**Column guide.** First paint: when anything first appears. Largest paint: when the main content appears (aim for under 2.5 s). Blocking time: how long the page is too busy to respond to a tap (aim for under 200 ms). Layout shift: how much the page jumps while loading (aim for under 0.1).

**Averages across the 4 measured pages:** Speed 38, Accessibility 100, Best practices 100, SEO 83.

## Most common problems

Only the pages with a full result (no (1) mark) list their failed checks. They start with the check that hurt the score most, and each page lists six at most.

| Area | Check that failed | Pages |
|---|---|---|
| Speed | Total Blocking Time | 2: `/play/crossword`, `/play/hello-cards` |
| Speed | Largest Contentful Paint | 2: `/play/crossword`, `/play/hello-cards` |
| Speed | Speed Index | 2: `/play/crossword`, `/play/hello-cards` |
| Speed | First Contentful Paint | 2: `/play/crossword`, `/play/hello-cards` |
| SEO | Page is blocked from indexing | 2: `/play/crossword`, `/play/hello-cards` |
| Speed | Cumulative Layout Shift | 1: `/play/crossword` |
| Speed | Use efficient cache lifetimes | 1: `/play/hello-cards` |

**About "Page is blocked from indexing".** This is on purpose, not a bug. The code asks search engines to skip game pages that are not finished yet: the crossword while it shows "coming soon", Stat while it has sample questions, and any game page marked `noindex` (for example hello cards). Lighthouse lowers the SEO score for that. When a game is ready, take the `noindex` off and its SEO score should go back up.

## Pages not measured

- `/play/pillo`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/play/stat`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/play/sudoku`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/play/word-path`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/about`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/courses`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/start`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/resources`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/support`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/breaks`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/signin`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/signup`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/privacy`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/terms`: not reached before the 11:50 UTC deadline.
- `/disclaimer`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).
- `/coming-soon`: no result (it ran past the 110-second limit, or was still running when the run was stopped for the deadline).

## Problems with the measuring itself

- When Lighthouse launched Chrome itself, the launch timed out every time: Chrome took about 10 seconds to start. Chrome was started separately instead, and Lighthouse then connected to it.
- The first run measured one page at a time. It finished `/` and `/play`, then stalled on `/play/crossword` for over 20 minutes and was stopped.
- The second run used three Chrome copies at once, a 110-second limit per page, and a fresh Chrome after any page that failed. Only the first page on two of the three copies finished (`/play/crossword` and `/play/hello-cards`). Nearly every other page ran past the limit without reporting an error. Each copy also failed to reconnect to its restarted Chrome once. The laptop was short on disk space and busy with other builds at the time, which probably explains the slowness. It is not proven, and nothing points to a fault in the pages: all 20 pages returned normally (status 200) from the local server when checked with `curl`.
- **No score in this report is estimated or filled in.** A page without a result is listed under "Pages not measured". Those pages need a rerun on a quieter machine or against the preview URL.

## How to run it again

Build the site, serve `dist/` on a local port, then run Lighthouse against each page, for example: `npx lighthouse@13.0.1 http://localhost:4329/play --form-factor=mobile --output=html`. To get speed numbers that match real visitors, run it against the preview or live URL instead.
