status: in review · task-blockers/firefox-engine-tests · the Firefox-only release failures that are left, with what is known about each.
decision: D-pending · Christian decides whether measurements may allow a rounding fraction (items 2 and 3); nothing here changes a test until he does.

All from release run 45612431640 on staging bb973fe; none could be reproduced by the lead (no Firefox available).

1. `tests/e2e/vial-platter.spec.ts:157` ("touch screen (no hovering pointer) …") hangs at `page.setViewportSize` in the spec's `open()` helper (line 32) until the 90 s test timeout, on every Firefox run. Suspected: the describe block's `test.use({ hasTouch: true, isMobile: true })`; Playwright's `isMobile` may not be supported in Firefox. Unverified. Wanted: confirm against Playwright's documentation and a real Firefox run, and say whether product code is involved at all.
2. `tests/e2e/vial-platter.spec.ts:228` (phone landscape 844 × 390): an arrow button measures 43.99998 px against a strict `>= 44`. The CSS is 44 px (`--platter-arrow`). Looks like float arithmetic in Firefox's box measurement.
3. `tests/e2e/footer-theme-slider.spec.ts:113`: the open footer panel's height is 567.0000610351562 before and 567.0000305175781 after changing the theme choice, compared with strict equality. The layout is whole pixels since #1184.
4. Intermittent in Firefox, seen once or twice each, not on the last run: `vial-platter.spec.ts:76` (hover lift stays 0), `:121` (front vial centre 722.16 vs 720), `home-social.spec.ts:53` (icon tops round to two different rows), `home-games-carousel.spec.ts:92`, `home-phone-sections.spec.ts:139` (dot pager).
5. One-off in WebKit phone on the same run: `tests/e2e/sudoku-parity.spec.ts:95` timed out clicking a cell (line 112); the job took 26 minutes where it usually takes about 15.

Wanted: for each item, "real for users" or "test assumption", with evidence from a real Firefox (or WebKit for item 5). Product fixes are welcome on this branch. Do not skip, loosen or retry-wrap a test, and do not raise a timeout; where a test's assumption is wrong for an engine, describe the exact change you would make and wait for Christian.
