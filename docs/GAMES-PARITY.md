# Cueory games: gameplay parity spec

D-pending, Christian approved 2026-11-14.

## Rule

Match the gameplay, settings, help tools, scoring, stats and controls of leading daily puzzle games. Never copy their names, terms, look, colors, tile shapes, layout or colored-square share grids. `forbiddenGameWords` stays, and the forbidden word is added to it. Our own share stays a plain one-line result, or symbols in our own style. Brand colors only.

Public repo: write everything in neutral words. No competitor names in code, tests, docs or commits.

## pillo (id pulse): before Monday

Rules already match. Add only what is missing (check first, do not rebuild):

- Settings: Hard Mode (letters already shown in place and in the word must be reused), high contrast, on-screen keyboard only, Light/Evening (already site-wide).
- Hard Mode can be turned on only before the first guess of the day.
- Invalid words don't use up a guess. Show a clear message.
- Repeated letters are marked by count (already required; keep the tests).
- Stats: played, win %, current streak, longest streak, guess distribution 1–6 with today's row marked.
- Streak: the daily puzzle counts only on its own local day. Practice or archive play never extends the streak.
- The finish screen shows the result, stats, the plain one-line share and the time until the next puzzle.

## word path (id suture): after launch

- Board of 6 columns × 8 rows (48 letters). Every letter belongs to exactly one answer, and answers never overlap.
- Paths may go up, down, sideways or diagonally, and may turn. A path can't use the same cell twice.
- One theme clue for the whole board, plus one special answer that names the theme and touches two opposite edges. Use our own term for it. Theme answers and the special answer get two distinct brand states, each shown with a symbol, not by color alone.
- Selecting: drag, OR tap letters one by one and then press a visible Submit button (also: double-tap the last letter). Add keyboard selection and a Clear button.
- Hints: each 3 valid non-theme words of 4 letters or more earn one hint. A hint marks the letters of one unsolved answer. A second hint on that same answer shows their order. There is no guess limit.
- Stats: completed, solve %, current and longest streak, “special answer found first”, “solved without hints”.
- Content validator: board size, adjacency, no reused cells, full board coverage, and the special answer touching two opposite edges.

## sudoku (id triage): after launch

- Easy, mid and hard, with one puzzle per level per day. Each puzzle has exactly one solution (the validator checks this).
- Modes: Normal and Candidate. Space toggles between them, and holding Shift switches for that moment. Auto-candidate can be turned on and off.
- Undo, and a Clear cell button. Check puzzle.
- Settings: check guesses as entered, error counter, highlight box, highlight row and column, highlight same number, sound on solve. Givens, your entries, candidates, conflicts and wrong answers each look different, never by color alone.
- Timer with show/hide and pause.
- Stats per level: solved, best time, average time, streak.

## crossword (id cueword): after launch

- Pen and Pencil modes (pencil entries look tentative, and not only by color).
- Check and Reveal, each by square, by word or for the whole puzzle. Autocheck as a setting.
- Keyboard: arrows move (pressing against the current direction switches it first), Tab and Shift+Tab move to the next or previous clue, Space switches direction, Backspace deletes, Escape enters multiple letters in one square (only if puzzles need it).
- Cursor settings: skip filled squares, jump back to the first blank, jump to the next clue.
- Timer with show/hide and pause. Clue text size. Sound on solve.
- Phone: the grid scrolls inside its own box (the page never scrolls sideways), plus a clue-list view.
- Streak: an unassisted solve within 48 hours of the puzzle date counts. Check or Reveal still counts as solved, but shows a different badge (with a text label) and doesn't extend the streak. Warn before the first Check or Reveal.
- A filled grid with no success message must tell the player “something's not right yet”.
- Sizes: the three choices are named small, medium and large (Christian, 23 Nov 2026), with one puzzle per size per day. The internal ids stay easy, mid and hard so saved progress keeps working. The crossword's size picker is a segmented control, not the board's slider.

## All games

- Shared settings: theme, high contrast, reduced motion, sound. Each game also has its own settings panel.
- Autosave every move. Signed-in progress is tied to the account and never shown to another account (keep the `expected_user_id` pattern).
- Help screen with the rules on first visit, then reachable from a “?” button.
- 44 × 44 px corner buttons, full keyboard play, screen-reader announcements for every result, and no meaning shown by color alone.
