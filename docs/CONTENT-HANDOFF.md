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

Name each private file after the day it plays: `2026-11-20.json` for pillo and word path, `2026-11-20-easy.json` (or
`-mid`, `-hard`) for crossword. The tools below read those dates. Real files say `"status": "draft"`; only made-up
samples say `"status": "sample"`.

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
solution. There is nothing to load for sudoku. `content:calendar` (below) checks the site's own boards for the next 30
days.

If you ever want to try a hand-made board, `content:check` also checks a sudoku file in a `sudoku/` folder:
`"level"` (easy, mid or hard) and a `"grid"` of 9 rows of 9 characters, 1 to 9 or `.` for an empty square. It says
whether the board has exactly one solution. The site doesn't load these files.

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

## The puzzle tools

Three commands, run in the cueory folder (on your Mac, first `export PATH=~/.local/node/bin:$PATH`). Each works on any
folder: your private store or the repository's `content/`. They print what to fix in plain words; each line ends with
the rule's name, in case you want to ask Claude about it.

| Command | What it does |
| --- | --- |
| `npm run content:check my-puzzles` | Checks every puzzle file in the folder (or one file) with the build's own rules and the games' checks. Lines starting `fix:` must be fixed; `check:` lines are worth a look. |
| `npm run content:check -- --report my-puzzles` | The same, and saves `content-report.txt` in that folder, listing every file as ok or fix. |
| `npm run content:calendar my-puzzles` | The next 30 days for every game: which puzzle plays each day, days with no puzzle or two, and answers used on two days. Sudoku shows "ok" when the site's board for that day has exactly one solution. |
| `npm run content:csv my-sheet.csv` | Turns a spreadsheet saved as CSV into puzzle files next to it (see below). |

What `content:check` checks, beyond the file format: pillo words are exactly five lowercase letters and never contain a
name in `forbiddenGameWords`; crossword clues are at most 120 characters and no answer is in the grid twice; a word
path theme clue is at most 60 characters, every letter belongs to exactly one answer, and exactly one special answer
touches two opposite edges; a sudoku board has exactly one solution. A file inside the repository must be a labelled
sample; one in your private store doesn't have to be. `npm test` runs `content:check -- --all` on the repository's
`content/` folder, so a broken sample never reaches staging.

## Write puzzles in Google Sheets

You can write puzzles in a spreadsheet instead of JSON: one row per word or clue. The templates are in
`content/samples/templates/` (made-up everyday examples):

| Template | One row per | Columns |
| --- | --- | --- |
| `pillo.csv` | day | `date`, `word`, `cue` |
| `crossword.csv` | clue | `date`, `level`, `direction` (across or down), `row` and `column` of the first letter (counting from 1 at the top left), `answer`, `clue` |
| `word-path.csv` | answer | `date`, `type` (`clue` once, `special` once, then `answer` and `extra`), `text`, `cells` (each letter's square as row-column from 1, separated by spaces, for example `1-6 2-6 3-5`) |

The second row of each template explains its columns; any row whose first cell starts with `#` is a note and is
skipped. A blank `date` (or crossword `level`) repeats the row above, so one sheet can hold a whole week.
`content:csv` builds the grid from the answers, numbers the crossword clues itself, and saves files only when every
puzzle passes `content:check`; otherwise it saves nothing and names the spreadsheet row to fix. It refuses to save real
puzzles inside the repository.

## Add a week of puzzles

The whole job, for one game at a time. Pillo is shown; crossword and word path work the same way with their templates.

1. In Google Sheets, open a new spreadsheet.
2. Choose File > Import > Upload, pick `content/samples/templates/pillo.csv` from the cueory folder, choose "Replace
   spreadsheet" and click Import data. You should see the column names in row 1, a note row starting with `#` in
   row 2, and seven sample rows.
3. Replace the sample rows with your seven days: a date (YYYY-MM-DD), the word and its cue on each row. Keep rows 1
   and 2.
4. Choose File > Download > Comma-separated values (.csv). You should see a file such as `pillo - Sheet1.csv` in your
   Downloads folder.
5. Move that file into your private store's `games/pulse/` folder (not into the cueory folder).
6. Open Terminal.
7. Type `cd ` (with a space), drag the cueory folder onto the Terminal window, and press Return.
8. Paste `export PATH=~/.local/node/bin:$PATH` and press Return. You should see nothing printed; that's fine.
9. Type `npm run content:csv ` (with a space), drag the CSV file from step 5 onto the window, and press Return. You
   should see one `saved …2026-12-01.json` line per day and `7 pillo puzzles ready`. If you see `nothing saved`
   instead, fix the rows it names in the sheet and go back to step 4.
10. Type `npm run content:calendar ` (with a space), drag your private store's folder onto the window, and press
    Return. You should see your seven words in the pillo column, one per date, and no `MISSING` on those dates.
11. If the calendar lists "things to fix", fix them in the sheet and go back to step 4. "Things worth a look" (such as
    a repeated answer) are your call.

## See a puzzle on staging

1. Ask Claude to add a made-up sample to `content/games/<game>/` in a pull request into `staging` (real puzzles never
   go there).
2. Approve the pull request when Claude asks: anything in `content/` waits for you (D-39).
3. Open the locked staging site, sign in through Cloudflare, and go to `/play`.
4. You should see the game with its "sample" label. Samples take turns, one a day: the files are sorted by name, the
   first one showed on 1 November 2026, and the list starts again after the last, so a new sample shows only on its
   turn. Crossword takes turns within each level.

Real puzzles will appear on staging once the database loader exists; this page will say how when it does.
