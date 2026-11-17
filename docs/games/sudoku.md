# sudoku: how to play

For Christian's videos. Written from the code on staging (`src/islands/SudokuGame.tsx`, `src/islands/sudoku.ts`). The
game's id in the code is `triage`; players see the name sudoku.

## The goal

Fill each row, each column and each 3 by 3 box with the numbers 1 to 9, with no repeats. Some numbers (the givens) are
already in place and can't be changed.

## Levels

**easy**, **mid** and **hard**, with one puzzle per level per day. Every puzzle has exactly one solution.

## How to play

1. Pick a square, then type a number or tap one of the number buttons. Arrow keys move between squares.
2. **normal** mode fills the square. **candidate** mode adds small candidate numbers (pencil notes). Space switches
   between the two modes, and holding Shift switches for that moment only.
3. **auto candidates** fills in the candidate numbers for you.
4. **undo** takes back the last move (Ctrl+Z or Cmd+Z works too). **clear cell** empties the square (Backspace does
   too). **x** adds your own x mark to a square.
5. **check puzzle** marks wrong squares with a slash.
6. **pause** (the Ⅱ button) hides your entries and x marks and stops the timer. The given numbers stay visible.
7. Givens, your entries, candidates, conflicts and wrong answers each look different, never by color alone.

## Help

This is the help added by pull request #801 (in review at the time of writing):

- First visit: the rules show in a card above the board, with a **got it** button.
- After that: the **?** corner button opens the rules and every setting in a dialog. Escape closes it.
- The other corner buttons are **print** (a clean copy of the puzzle) and **stats**.

## Settings

The **settings** button under the numbers opens sudoku's settings (kept on the device):

- **check guesses when entered**: marks a wrong number as soon as it is entered, and adds it to the error counter.
- **start in auto candidate mode**
- **show error counter**
- **show timer**
- **highlight conflicts**: marks numbers that repeat in a row, column or box.
- **highlight row and column** of the picked square.
- **highlight box** of the picked square.
- **highlight identical numbers**: every square with the same number as the picked one.
- **play sound on solve**

The same dialog also has the theme. Shared settings for every game are in **game settings** above the game.

## Scoring and stats

- The finish shows "solved.", the time and the number of errors.
- The share line reads like `easy · 04:12 · 0 errors`.
- Stats per level (only when the player keeps stats, in that browser only): solved, best time, average time and
  streak. The first solve of each level each day counts.
