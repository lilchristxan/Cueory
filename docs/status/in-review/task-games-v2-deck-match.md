status: in review · task-games-v2/deck-match · The card deck at the right edge of every game page now matches Christian's board (220 x 308 cards, one fixed spot, "next game ›" label). Stacked on #1145.

- The front card is the next game in the loop vialo, hello cards, sudoku, crossword, piccline, tachyyy (closed games skipped) and is the fixed point: top 372 px, 142 px in from the right edge, 15 degrees. Cards behind it are 18 px further out, 42 px higher and 2.5 degrees less tilted.
- Hover or keyboard focus moves the card 170 px left, straightens it to -2 degrees and deepens the shadow; the hit area does not move.
- Below 64rem the other games stay a plain row of cards under the stats.

- Known gap (for Christian): since the new vialo keys landed, the deck fits beside vialo, sudoku and piccline only from 1112 px wide up (measured: 1108 overlaps vialo's keys, 1112 is clean). Below that the front cards reach over the board. Cards are not shrunk. Fix: the frame's plain-row layout applies up to 70rem (1120 px) instead of 64rem; that is the frame's breakpoint, so it is not changed here.
