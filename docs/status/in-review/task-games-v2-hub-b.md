status: in review. /play rebuilt to Christian's option B (picked 2026-11-23): left panel with the headline, the sample-puzzles line and four totals (played, solved, day streak, best streak), one row per game on the right. Stacked on #1137.

- Totals and statuses are read in the browser after load (this browser only, nothing sent); dashes until then. A browser that cannot save shows no totals and every open game as "play".
- A game closed in this build (crossword, tachyyy, hello cards in the live build) says "coming soon", with no button and no link.
- The "your stats" panel (forget buttons) stays below the rows so deleting saved results still works.
- Layout.astro gets a `wide` prop so the hub can run full width (no other page uses it).
- D-pending: the day streak counts days with any finished game (not only solved); the headline number follows how many games the page lists.
- D-pending: hub button says "play again" after a finished game until a saved-result view exists (game pages keep no finished round; only stats are saved).
