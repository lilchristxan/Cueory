status: in review · task-games-v2/piccline-board-stack · piccline matched to Christian's games-v2 board (cue, pills, status line, board values)
decision: D-pending · kept the board's extras that the board does not draw but the game needs: print button, submit/clear/cue row with the three-pip meter, theme-word dots and thread diamonds (non-colour signals), help text under the board. Say if any should go.
decision: D-pending · the found-word pill stays taupe (#d3b7a1) because an existing test pins it to the trace colour; the board draws it Linen (#eadccf). The active pill now matches the board (Linen, ink text).

Supersedes #1025 (same branch, stacked on a now-stale base); retarget to staging.

## Gap table (board value vs built, 1440 x 900 and 1180 x 820, Light and Evening)
| Element | Board | Built | Verdict |
| --- | --- | --- | --- |
| Cue line | 13 px, 700, 1.5 px tracking, teal, caps | same (tokens) | matches |
| Gear and "?" row | as wide as the circle grid (362 px) | spans the whole game box (720 px), gear left, "?" right, plus a print button | GAP: tests/e2e/game-header.spec.ts pins gear/"?" to the game box edges; needs Christian or a spec change |
| Letter circles | 52 px, 10 px gap, 62 px pitch | 52 px, 62 px pitch | matches |
| Active trace | teal, 14 px | teal, 14 px | matches |
| Completed trace | taupe, 18 px | taupe, 18 px | matches |
| Word pills | 14 px 700, 8 x 14 px padding | same | matches |
| Active pill | Linen, ink text | Linen, ink text (was teal) | fixed |
| Found pill | Linen | taupe, pinned by test | gap, asked above |
| Empty pills | dashed "?" | dashed "?" | matches |
| Status line | 13 px "n of N words found" | 13 px, same wording | matches |
| Submit/clear/cue, pips, help text | not drawn | present (gameplay, unchanged) | kept |
| Circle marks (dots, diamonds) | not drawn | present | kept (not colour alone) |
| Left rail, deck, wordmark, footer, backdrop | board | shared frame / deck | not this PR |
| Vertical position | centred in 1090 px | content starts at the top; at 820 px high the controls sit below the fold and the page scrolls | frame behaviour, not changed |

Pictures: /home/claude/game-match/piccline/ (sbs-*, after-*, before/).
