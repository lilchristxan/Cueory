# What's new for the launch: plain-language draft (x2)

**Draft for Christian's review. This is not permission to release.** It summarizes the
commits in `main..staging` (2632 commits when this was written, staging at `31e2b3e5ec`)
in everyday words. The commit-by-commit inventory is in
[RELEASE-2026-11-19.md](../RELEASE-2026-11-19.md) and the go/no-go gates are in
[LAUNCH-2026-11-19.md](../LAUNCH-2026-11-19.md). Counts below are rough and come from commit titles.

Thursday's launch is the daily games and the public pages. **Accounts stay closed**, so
nothing here should be described as "sign up now". No study content or clinical claims
are in this note.

## Daily games

- Four daily games, each on its own page under `/play`: pillo, sudoku, crossword and word path.
- `/play` shows today's status for each game.
- Shared settings (including a "reduce motion" switch and a sounds switch), first-visit help,
  and a finished-game result card with a plain one-line share.
- Statistics are kept on the player's own device.
- Sudoku has one tool row above the board, pause and auto-pause, and several difficulty levels.
- Crossword has levels, check and reveal together, and works with the keyboard.
- Word path has joined-up lines between letters and a printable word list.
- Games print cleanly with the cueory logo.
- Hello cards: flip-the-card conversation starters with a prompt of the day.

## Looks and feel

- A refreshed look on the public pages: a copper accent, soft peach silk folds in the background,
  a redesigned home hero and support page, and an updated building strip.
- Light and Evening themes follow the device, with the footer picker to override.
- Lighter pages on phones: logos and game areas load only when needed.
- Link previews now name the site and describe the share card; the app icon and manifest were tidied.

## Easier to use for everyone

- Everything works by touch, keyboard and mouse on phone, tablet and desktop, with no sideways scrolling.
- Tap targets are at least 44 px; the current navigation link is underlined.
- Game boards and dialogs fit a phone turned sideways and large text (up to 32 px) without cutting off buttons.
- "Reduce motion" is respected across the site and in games.
- Visible keyboard focus, arrow-key choice in radio groups, and no-JavaScript fallbacks on key pages.
- Lessons print with their own print styles.

## Study tools (in the code; check staging before promising them)

- Flashcards, matching, fill-in and "label it" practice, with save-and-resume for some of them.
- Lesson pages generated from the content folder, a course library, break ideas and a break timer.
- A short survey prompt and a finals survey component.
- The Anatomy Lab (3D) and its text-only search fallback account for a very large share of the commits.
  Treat it as work in progress unless Christian confirms it is part of Thursday.

## Accounts and privacy (not opened for launch)

- Account pages, two-factor sign-in, data export and account deletion exist in source, but
  `/signin` and `/signup` still say accounts open soon. Do not announce them.
- The privacy page was updated, including a line that the launch-updates email box sends the address straight to Kit.
  That wording is marked as needing Christian's approval.
- The "get launch updates" email box is switched on.
- Admin flag inbox and the "Flag or comment" button are in place for later.

## Behind the scenes

- Stricter security headers, dependency and code-scanning fixes, and automated checks for accessibility,
  performance budgets, and release gates.
- Many tests and status notes; none of these change what visitors see.

## Open questions for Christian

1. Is the Anatomy Lab part of Thursday, or held back?
2. Is the study-tools section in or out of the launch message?
3. Approve or change the privacy wording about the email box.
