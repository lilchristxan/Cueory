# Games v2: reference for the six game pages

Christian approved these designs on the design canvas on 2026-11-20. Build them on the live routes.

- `pages/<game>.html` (here in `docs/design/games-v2/`) is a static reference at 1440 × 1090. It has no scripts; open it to measure. Its image paths are site paths (`/brand/...`, `/design/...`) under `public/`.
- `public/design/games-v2/shots/<game>.jpg` is the same page as a picture, and `public/design/games-v2/assets/` holds the new logo files.
- Every word on these pages is a placeholder. Real puzzles, answers and prompts come from Christian's reviewed batches in the database, never from this folder.

| Game (brand name) | Route | Current island | Reference |
| --- | --- | --- | --- |
| vialo | `/play/pillo` | `PulseGame` | `pages/vialo.html` |
| tachyyy | `/play/stat` | `StatGame` | `pages/tachyyy.html` |
| piccline | `/play/word-path` | `SutureToday` | `pages/piccline.html` |
| crossword | `/play/crossword` | `CuewordToday` | `pages/crossword.html` |
| sudoku | `/play/sudoku` | `SudokuGame` | `pages/sudoku.html` |
| hello cards | `/play/hello-cards` | `HelloCards` | `pages/hello-cards.html` |

Keep the routes, game rules, saved progress, stats and results logic you already have. This work changes the page frame and how each board looks.

## Shared frame (the same on all six pages)

**Left panel (240 px wide, full height above the footer)**
- "‹ games" back link and the cueory logo PNG at the top. Never retype the logo.
- The game's icon and wordmark, centred.
- The game's tagline in serif ("Find today's word", "Beat the clock", "Trace today's words", "Solve today's mini", "Fill today's grid", "Start a conversation").
- The stats: % solved, current streak, best streak, played.

**Top of the page**
- The date line, centred above the board: "friday, november 20th · #312", in lowercase italic.

**The row above each board**
- Settings (gear) sits at the board's top-left corner.
- The ? sits at the board's top-right corner, on the same row, with the same gap to the board.
- The ? opens the game's steps on hover, focus or tap. Vialo's ? also shows a legend of the pill states.
- Piccline: its cue line ("TODAY'S CUE · …") sits above this row.
- Crossword: a size slider (mini · midi · full on the board; named small · medium · large, Christian, 23 Nov 2026) sits centred between the gear and the ?.
- Hello cards: a row of five progress circles sits centred between the gear and the ?.

**The board** is centred in the space between the left panel and the deck.

**Card deck (right edge)**
- A fanned stack of the other five games. Each card shows the game's name in the middle, and its icon and name in the top-left and bottom-right corners, like a playing card.
- On hover or focus a card slides out to the left so its name is fully visible. The hit area stays still while the card moves, so the card does not flicker.
- Each card links to its game. Respect reduced motion.
- Christian's open request: centre the deck vertically in the space above the footer.

**Footer (a new design)**
- Links: about us, courses, coming soon, privacy, terms, disclaimer, support cueory, contact.
- The cueory logo, centred.
- A "Flag or comment" button bottom-left and a back-to-top button bottom-right. Both are at least 44 px.
- The footer is a needs-christian path, so it waits for his typed approval.

## Boards

**vialo** (5 letters, 6 guesses)
- The board is a blister pack (`/design/pillo-blister-board.webp`). Letters are lowercase serif.
- Pill states:
  - white = the letter is not in the word
  - oxblood = in the word, wrong spot
  - dark green = right letter, right spot
  - white with a copper ring = typed but not yet scored
- Green pills have a slow shine. Turn it off for reduced motion.
- The keyboard repeats the states, and absent keys are also struck through.

**tachyyy**
- A stopwatch timer with a copper arc and a row of 10 progress dots.
- The question, four answers (A–D) and "Lock in answer".

**piccline**
- A straight 6 × 8 letter grid.
- A found word is a filled tan line. The word being traced is a teal line.
- Found-word pills and a count sit below the grid.
- Tapping letters one after another must work as well as dragging, for keyboard and touch.

**crossword**
- A grid with a clue bar, plus Check and Reveal.
- The size slider must work by keyboard (arrow keys) and have a label.

**sudoku**
- A 9 × 9 grid with highlights for the selected row, column and box.
- A 1–9 number pad, plus Pencil, Undo and Hint.

**hello cards**
- A card stack with Flip next card, Favorite and Shuffle.
- Each flip fills one of the five circles and gives the top card a short flip. Skip the flip for reduced motion.
- After the fifth flip a panel says "congrats! You made the world friendlier today." with a "Keep going" button.
- The count resets each day.

## Rules that still apply

- Colours, fonts and sizes come from tokens. Add new tokens; never hard-code them in a component.
- Every board must work by keyboard, touch and mouse at 390 × 844, 820 × 1180 and 1440 × 900, in Light and Evening, with no sideways scroll.
- Colour is never the only signal. Every state also has a text label for screen readers and a visible non-colour cue.
- Nothing may copy another puzzle game's names, look, tile shapes or coloured-square share grids (see `docs/GAMES-PARITY.md`).
- The canvas shows only desktop and landscape tablet. On phones the left panel becomes a compact top bar and the deck becomes a row under the board. Show Christian the phone layout on staging.

## Decisions waiting on Christian (D-pending)

1. **Game colours:** oxblood `#6E2019` and dark green `#0E5A3D` are outside the brand palette, though Christian picked them on the canvas. Add them as game tokens with Evening versions, and record the decision.
2. **Vialo tile font:** the canvas uses Times New Roman. That font can't be self-hosted, so it would only come from the visitor's own device. Default to Bodoni Moda (already self-hosted) until Christian decides.
3. **Non-colour cue for vialo pills:** Christian removed the symbols. Default to a different finish for each state: a solid shine for correct, an inner ring band for wrong spot, flat and matte for absent. Christian checks it on staging.
