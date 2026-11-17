# crossword: how to play

For Christian's videos. Written from the code on staging (`src/islands/CuewordGame.tsx`, `src/islands/cueword.ts`).
The game's id in the code is `cueword`; players see the name crossword.

## The goal

Fill the grid so every across and down answer matches its clue.

## Levels

**easy** (5 by 5), **mid** (7 by 7) and **hard** (15 by 15). On a phone the hard grid scrolls inside its own box; the
page never scrolls sideways.

## How to play

1. Tap a square and type, or use the on-screen letter buttons.
2. Tap the selected square again, or press Space, to switch between across and down. An arrow against the current
   direction switches direction first, then moves.
3. Tab and Shift+Tab go to the next or previous clue. Backspace deletes. Tab on the last clue, Shift+Tab on the first,
   or Escape leaves the grid.
4. **pen** letters are firm. **pencil** letters are lighter and boxed with a dashed line, for unsure guesses.
5. **check** and **reveal** each work on a square, a word or the whole puzzle. The game warns before the first one.
6. If every square is filled but a letter is wrong, the game says "something's not right yet".
7. **pause** hides the letters and stops the timer. **show clue list** lists every clue.
8. The **print** button makes a blank grid with the complete clue list.

## Help

This is the help added by pull request #801 (in review at the time of writing):

- First visit: the rules show in a card above the grid, with a **got it** button.
- After that: the **?** button in the toolbar opens the rules and every setting in a dialog. Escape closes it.

## Settings

The gear button in the toolbar opens the crossword settings (kept on the device):

- **autocheck**: marks each letter right or wrong while typing. It counts as help.
- **skip squares that already have a letter**
- **jump back** to a word's first blank square at its end.
- **jump to the next clue** with a blank square when a word is full.
- **show the timer**
- **play a sound when solved**
- **clue text size**: small, medium or large.

Shared settings for every game are in **game settings** at the top of /play.

## Scoring and stats

- A solve without check, reveal or autocheck gets the **◆ solved without help** badge. A solve with them still counts
  as solved, with the **◇ solved with help** badge.
- The share line reads like `easy · solved in 3:05`, with ` with help` added after a helped solve.
- Streak: only an unassisted solve within 48 hours of the puzzle's date extends it. The stats panel shows it as
  "streak: N days solved without help."
