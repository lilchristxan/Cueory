# word path: how to play

For Christian's videos. Written from the code on staging (`src/islands/SuturePathBoard.tsx`,
`src/islands/suturepath.ts`). The game's id in the code is `suture`; players see the name word path.

## The goal

Find every answer on a board of 6 columns by 8 rows (48 letters). Every letter belongs to exactly one answer, so the
board is complete when every letter is used.

## The theme and the thread

- One theme clue sits above the board ("today's theme").
- One special answer, **the thread**, names the theme and runs from one side of the board to the opposite side.
- Found theme words get a **dot** and the thread gets a **diamond**, each with its own look, so color is never the only
  signal.

## How to play

1. Answers run through touching letters: up, down, sideways or diagonally, and they can turn. A path never uses the
   same letter twice.
2. Drag across the letters, or tap them one by one and press **submit**. Tapping the last letter again also submits.
   **clear** starts the word over.
3. Keyboard: arrows move, Enter or Space adds a letter, Enter on the last letter submits, Backspace takes one back and
   Escape clears.
4. There is no limit on guesses.

## Cues

Every 3 other words of 4 letters or more earn a cue. These are words each puzzle lists as extras: real words on the
board that aren't answers. A cue marks the letters
of one unsolved answer with a dashed outline. A second cue on that same answer numbers its letters in order.

## Help

This is the help added by pull request #801 (in review at the time of writing):

- First visit: the rules show in a card above the board, with a **got it** button.
- After that: the **?** at the top right opens the rules in a dialog. Escape closes it. The button beside it prints the
  puzzle.

## Settings

Word path has no settings of its own. The gear at the top left of the game holds the shared settings for every game.

## Scoring and stats

- The share line reads like `cueory word path, <day>: found 7 of 7 answers, the thread 2nd, 1 cue.`
- Stats (only when the player keeps stats, in that browser only): completed, solve rate, current and longest streak,
  how often the thread was found first, and how many boards were solved without cues.

## The older format

One sample is still an older themed word search (words run up, down, left or right; tap a word's first letter, then
its last). It gets the same "?" help with its own rules.
