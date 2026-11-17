# Content handoff: how puzzles get into each game

For Christian. This page covers the four daily games on `/play`: pillo, crossword, sudoku and word path. It says what a
puzzle file looks like, where real puzzles live, how to check a file, and how to see a puzzle on the staging site.
Every field below comes from the site's own file rules in `src/content.config.ts` and the games' own checks; nothing
here is a new field.

## The one rule: real puzzles never go in this repository

The repository is public (D-75). A real puzzle's answer is an answer key, so real puzzles never go in it (CLAUDE.md
rule 7, D-61).

| What | Where it lives |
| --- | --- |
| Real puzzles (nursing words, real clues and answers) | Your private content store (a folder on your computer or your private drive), then the database |
| Made-up everyday samples, labelled `"status": "sample"` | `content/games/<game>/` in this repository, shown on `/play` with a "sample" label |

What exists today: `/play` plays only the labelled samples in `content/games/`. The part that loads real daily
puzzles from the database is not built yet (there is no puzzle table in `supabase/migrations/`). Until it is, keep
real puzzles in your private store and check them there; Claude never copies them into the repository.

Lay out your private store like the repository's `content/` folder, so the same check works on both:

```
my-puzzles/
  games/
    pulse/      pillo
    cueword/    crossword
    suture/     word path
```

(`pulse`, `cueword` and `suture` are the games' inside names; visitors only ever see pillo, crossword and word path.)
Sudoku has no folder: see below.

## pillo (folder `games/pulse/`)

One file per puzzle, for example `games/pulse/sample-01.json`:

```json
{ "status": "sample", "word": "grace", "cue": "elegance and ease of movement." }
```

- `word`: the word to guess, in lowercase. The file rule allows 5 to 7 letters, but the game only plays
  five-letter words, so always use exactly five; a longer word is skipped.
- `cue`: one line, 1 to 120 characters. The file needs it, but the game doesn't show it today.
- Never use the names in `forbiddenGameWords` (`src/config/games.ts`) as a word or a cue.

## crossword (folder `games/cueword/`)

One file per puzzle:

```json
{
  "status": "sample",
  "level": "easy",
  "grid": ["STAR.", "O..A.", "F..I.", "APPLE"],
  "clues": {
    "across": [{ "number": 1, "text": "it twinkles in the night sky" }],
    "down": [{ "number": 1, "text": "a comfy seat for two or three people" }]
  }
}
```

(The example is cut short to show the shape; a real file has a clue for every word.)

- `level`: `easy`, `mid` or `hard`. The grid must then be a square of exactly 5 by 5, 7 by 7 or 15 by 15, its gaps
  must look the same after a half turn, and no word may be shorter than three letters. `/play` shows one puzzle per
  level, so a file without a `level` never appears in a level tab.
- `grid`: one line per row, all the same length, capital letters A to Z, and `.` for a gap.
- `clues`: an `across` list and a `down` list. Each clue has the `number` the grid gives its first square (counted
  left to right, top to bottom) and `text` of 1 to 120 characters. Every word needs exactly one clue, and no clue may
  point at a number that has no word.

## sudoku (no files)

Sudoku needs no puzzle files. The site makes each day's three boards (easy, mid, hard) itself from built-in number
templates (`src/islands/sudoku.ts`): everyone gets the same board on the same day, and each board has exactly one
solution. There is nothing to load or check for sudoku.

## word path (folder `games/suture/`)

One file per board. Use the board format (`"format": "path"`):

```json
{
  "status": "sample",
  "format": "path",
  "clue": "a calm study break",
  "grid": ["UNIGHB", "SLCTSR", "TERIEU", "AHBKAM", "EZTEDP", "ZILCOF", "UDMASR", "PENEIT"],
  "words": [
    { "answer": "BREAKTIME", "path": [[0,5],[1,5],[2,4],[3,4],[3,3],[4,2],[5,1],[6,2],[7,1]], "special": true },
    { "answer": "MUSIC", "path": [[3,5],[2,5],[1,4],[2,3],[1,2]] }
  ],
  "extras": ["CALM", "REST"]
}
```

(Cut short to show the shape. The full example is `content/games/suture/sample-01.json`.)

- `clue`: the theme clue for the whole board, 1 to 60 characters.
- `grid`: exactly 8 rows of 6 capital letters (48 letters).
- `words`: 3 to 12 answers. Each `answer` is 4 capital letters or more, and its `path` lists one `[row, column]` per
  letter, counting from 0 at the top left. Each step touches the one before (up, down, sideways or diagonally), and a
  path never uses a square twice.
- Every letter on the board belongs to exactly one answer.
- Exactly one answer has `"special": true`: it names the theme and touches two opposite edges (the top and bottom
  rows, or the left and right columns).
- `extras` (optional): other words of 4 letters or more that can be traced on the board. Every 3 a player finds earn a
  hint.

The older word search (no `format`, a `theme` instead of a `clue`, straight-line words) still loads, but new boards
should use the board format.

## Check a file

In the cueory folder, run (on your Mac, first `export PATH=~/.local/node/bin:$PATH`):

```
node scripts/check-content.mjs --content my-puzzles
```

It reads every file in the folder with the same rules the build uses and prints one line per problem, with the file
and what to fix, or "no problems found". Exit code 0 means no problems. Today this check only accepts files marked
`"status": "sample"`; a puzzle checker that also takes your real puzzles is on its way (lane 5 content check).

The build runs the games' own checks too, so a broken sample in `content/games/` stops the staging build with a plain
message instead of reaching a page.

## See a puzzle on staging

1. Ask Claude to add a made-up sample to `content/games/<game>/` in a pull request into `staging` (real puzzles never
   go there).
2. Approve the pull request when Claude asks: anything in `content/` waits for you (D-39).
3. Open the locked staging site, sign in through Cloudflare, and go to `/play`.
4. You should see the game with its "sample" label. Samples take turns, one a day: the files are sorted by name, the
   first one showed on 1 November 2026, and the list starts again after the last, so a new sample shows only on its
   turn. Crossword takes turns within each level.

Real puzzles will appear on staging once the database loader exists; this page will say how when it does.
