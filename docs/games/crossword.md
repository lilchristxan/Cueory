# crossword: how to play

For Christian's videos. Written from the code on staging (`src/islands/CuewordGame.tsx`, `src/islands/cueword.ts`).
The game's id in the code is `cueword`; players see the name crossword.

## The goal

Fill the grid so every across and down answer matches its cue.

## Levels

**easy** (5 by 5), **mid** (7 by 7) and **hard** (15 by 15), picked with the same pressed buttons as sudoku's levels.
On a phone the hard grid scrolls inside its own box; from tablet width up the page is wider and the whole hard grid fits.
The page never scrolls sideways.

## How to play

1. Tap a square and type, or use the on-screen letter buttons.
2. Tap the selected square again, or press Space, to switch between across and down. An arrow against the current
   direction switches direction first, then moves.
3. Tab and Shift+Tab go to the next or previous cue. Backspace deletes. Tab on the last cue, Shift+Tab on the first,
   or Escape leaves the grid.
4. **check** and **reveal** each work on a square, a word or the whole puzzle. The game warns before the first one.
5. If every square is filled but a letter is wrong, the game says "something's not right yet".
6. **pause** hides the letters and stops the timer. **show cue list** lists every cue. Blocked squares are striped.
7. The **print** button makes a blank grid with the complete cue list.

## Help

This is the help added by pull request #801 (in review at the time of writing):

- First visit: the rules show in a card above the grid, with a **got it** button.
- After that: the **?** at the top right of the game opens the rules and every setting in a dialog. Escape closes it.

## Settings

The gear at the top left of the game opens the crossword settings (kept on the device), with the shared settings
above them:

- **autocheck**: marks each letter right or wrong while typing. It counts as help.
- **skip squares that already have a letter**
- **jump back** to a word's first blank square at its end.
- **jump to the next cue** with a blank square when a word is full.
- **show the timer**
- **play a sound when solved**
- **cue text size**: small, medium or large.

The shared settings (theme, motion, high contrast, game sounds) are in the same dialog.

## Scoring and stats

- A solve without check, reveal or autocheck gets the **◆ solved without help** badge. A solve with them still counts
  as solved, with the **◇ solved with help** badge.
- The share line reads like `easy · solved in 3:05`, with ` with help` added after a helped solve.
- Streak: only an unassisted solve within 48 hours of the puzzle's date extends it. The stats panel shows it as
  "streak: N days solved without help."
