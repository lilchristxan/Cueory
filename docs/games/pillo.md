# pillo: how to play

For Christian's videos. Written from the code on staging (`src/islands/PulseGame.tsx`, `src/islands/pulse.ts`). The
game's id in the code is still `pulse`; players only ever see the name pillo.

## The goal

Guess the 5-letter word in 6 guesses. There is one word a day, the same for everyone, and it changes at midnight on
the player's own device. For now the words are labelled samples.

## How to play

1. Type a 5-letter word and press enter, or tap the letters on the on-screen keyboard and tap **enter**.
2. After each guess every letter gets a mark, shown as a symbol as well as a look, so color is never the only signal:
   - **●** the letter is in its place.
   - **○** the letter is in the word, somewhere else.
   - **·** the letter is not in the word.
3. The on-screen keys show the same marks, so you can see which letters are left.
4. A letter you use twice is marked twice only if the word has it twice.
5. A word that isn't in the word list doesn't use up a guess. The game says so in plain words.
6. The strip of pill pockets next to "guess the 5-letter word" shows how many guesses are left: a used guess leaves an
   empty pocket.

## Help

This is the help added by pull request #801 (in review at the time of writing):

- First visit: the rules show in a card above the board, with a **got it** button.
- After that: the **?** button at the top of the game opens the rules and every setting in a dialog. Escape closes it.

## Settings

pillo settings are under the board (they last for this visit):

- **hard mode**: letters shown in place or in the word must be used in every later guess. It can be turned on or off
  only before the first guess of the day.
- **high contrast**: bolder edges and larger marks.
- **on-screen keyboard only**: only the on-screen letter keys type, so a phone's own keyboard stays closed.

Shared settings for every game (the **game settings** button at the top of /play): theme (light, evening or follow the
device), motion (follow the device or always reduce), high contrast and game sounds.

## Scoring and stats

- The finish screen shows the result, a plain one-line share, the stats (when the player keeps stats) and the time
  until the next word.
- The share line reads like `cueory pillo, <day>: solved in 3 of 6`, or `not solved this time`. Hard mode adds
  `, hard mode`. There is no grid of colored squares.
- Stats (only when the player turns on "keep my stats", kept in that browser only): played, win %, current streak,
  longest streak, and how many guesses each win took (1 to 6), with today's row marked.
- The streak counts only the daily word played on its own day.
