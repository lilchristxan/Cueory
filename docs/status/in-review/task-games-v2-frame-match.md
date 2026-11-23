status: in review. Game pages: the Games v2 frame (no site header or building strip, left panel with the game and its four stats, fanned deck of the other open games, compact phone layout).

D-pending: game pages have no site header or building strip (Christian, 23 Nov; CLAUDE.md line about every page needs his edit)

Tests changed on purpose (this round)
- tests/e2e/play.spec.ts "private stats": the full stats panel (forget, forget all) is on /play now, so these tests play on /play/vialo and read the panel on /play. Both race tests are kept: "a round waiting for the stats panel to load is dropped when another tab forgets stats" and "a round finished before the stats panel has loaded still counts" hold the same `GameStatsPanel` chunk on the game page (it also carries the game page's saving), then check storage and the hub's panel. The back/forward cache test still holds the chunk too.
- The two announcements the panel's `stats-live` line gave ("today's first game is already in your stats", "this browser won't keep stats, so this game wasn't kept") are now asserted on the game page's frame status line (`game-frame-stats-status`, role status), which is what a screen-reader user hears there.
- tests/e2e/game-pages.spec.ts: the four stats are in the frame's left panel; the full panel is only on the hub, and the finished-vialo test reads it there.
- tests/e2e/play-phone-parity.spec.ts: on phones and tablets the top row is "games", logo, flag (was "games", flag, logo).
- tests/e2e/sudoku-toolbar.spec.ts, word-path-board.spec.ts: follow the frame (verified by running).

D-pending: game pages show no site header, as on the Games v2 boards; needs Christian's line in CLAUDE.md.
