status: in review. Game pages: the Games v2 frame (no site header or building strip, left panel with the game and its four stats, fanned deck of the other open games, compact phone layout).

D-pending: game pages have no site header or building strip (Christian, 23 Nov; CLAUDE.md line about every page needs his edit)

Tests changed on purpose (this round)
- tests/e2e/play.spec.ts "private stats": the full stats panel (forget, forget all) is on /play now, so these tests play on /play/vialo and read the panel on /play. Both race tests are kept: "a round waiting for the stats panel to load is dropped when another tab forgets stats" and "a round finished before the stats panel has loaded still counts" hold the same `GameStatsPanel` chunk on the game page (it also carries the game page's saving), then check storage and the hub's panel. The back/forward cache test still holds the chunk too.
- The two announcements the panel's `stats-live` line gave ("today's first game is already in your stats", "this browser won't keep stats, so this game wasn't kept") are now asserted on the game page's frame status line (`game-frame-stats-status`, role status), which is what a screen-reader user hears there.
- tests/e2e/game-pages.spec.ts: the four stats are in the frame's left panel; the full panel is only on the hub, and the finished-vialo test reads it there.
- tests/e2e/play-phone-parity.spec.ts: on phones and tablets the top row is "games", logo, flag (was "games", flag, logo).
- tests/e2e/sudoku-toolbar.spec.ts, word-path-board.spec.ts: follow the frame (verified by running).

D-pending: game pages show no site header, as on the Games v2 boards; needs Christian's line in CLAUDE.md.

Tests changed on purpose (CI round 2)
- dark-mode.spec.ts: on game pages the frame stands in for the site header in the Evening colour scan.
- sticky-header-overlap.spec.ts: game pages assert they have no site header at all (nothing can cover a heading); other pages unchanged.
- header-tuck.spec.ts, header-logo-lazy.spec.ts: the header tests ran on a game page only as a tall page; they now use /privacy (a page with the header).
- pillo-focus-visible.spec.ts: a key must be fully on screen and below any header (there is none).
- stats-cleanup-routes.spec.ts: every game page shows the frame's stats; only /play shows the hub panel.
- game-results.spec.ts "an open result locks page scrolling": the desktop game page is about 100 px shorter without the header, so the needed scroll room is 150 px, not 300 (the lock, restore and styles are checked as before).
- gameframe.spec.ts and tests/unit/gameframe.test.ts: new checks for the deck/plain-row switch.

Deck breakpoint: token `--breakpoint-deck: 70rem` (Tailwind breakpoint, used as `@variant max-deck`) (1120 px) in tokens.css. Below it the other games are a plain row under the board, from it the fanned deck. Only the deck slot rules moved from the 64rem query to a new 70rem query; the sidebar and column layout still switch at 64rem. gameframe.css now starts with `@reference "./global.css"` so Tailwind processes it.
Printed title: the page title now prints through `not-print:sr-only` (global print rule hides `.sr-only`).
