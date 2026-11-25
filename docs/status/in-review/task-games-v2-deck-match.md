status: in review · task-games-v2/deck-match · The card deck at the right edge of every game page now matches Christian's board (220 x 308 cards, one fixed spot, "next game ›" label). Uses the merged game shell on staging.

- The front card is the next game in the loop vialo, hello cards, sudoku, crossword, piccline, tachyyy (closed games skipped) and is the fixed point: top 372 px, 142 px in from the right edge, 15 degrees. Cards behind it are 18 px further out, 42 px higher and 2.5 degrees less tilted.
- Hover or keyboard focus moves the card 170 px left, straightens it to -2 degrees and deepens the shadow; the hit area does not move.
- Below 70rem (1120 px) the other games stay a plain row of cards under the stats.

- The deck needs 1112 px beside vialo's keys, so it shows from 70rem (1120 px, token `--breakpoint-deck`); below that the other games are the plain row. The spec covers 1024, 1056, 1100 and 1119 (row, deck hidden) and 1120, 1280, 1440 (deck, no overlap, no sideways scroll even when scripted).

- Game navigation labels and tile glyphs follow the Lato interface rule. In the compact row long names wrap and wordmarks scale inside their cards.
