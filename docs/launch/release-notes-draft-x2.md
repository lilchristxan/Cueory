# What's new for the launch: plain-language draft (x2)

**Draft for Christian's review. This is not permission to release.** It summarizes the
commits in `main..staging` (2632 commits when this was written, staging at `31e2b3e5ec`)
in everyday words. The commit-by-commit inventory is in
[RELEASE-2026-11-19.md](../RELEASE-2026-11-19.md) and the go/no-go gates are in
[LAUNCH-2026-11-19.md](../LAUNCH-2026-11-19.md). Counts below are rough and come from commit titles.

Thursday's launch is the daily games and the public pages. **Accounts stay closed**, so
nothing here should be described as "sign up now". No study content or clinical claims
are in this note.

**Live site or preview only?** Several features only build where drafts may show: staging,
branch previews, local and test builds. The live build (a Workers Build of `main`) shows a short
"coming soon" note instead (the `draftsAllowed` gate in `src/islands/anatomylab.ts`, plus
`crosswordOpen` in `src/config/site.ts`). So a staging check can show things visitors will not get.
Each line below says which it is. Only promise the "live" items.

## Daily games

- Live: three daily games, each on its own page under `/play`: pillo, sudoku and word path.
  They run on labelled sample puzzles for now, and `/play` says so.
- Preview only: the crossword. It stays closed (`crosswordOpen = false`) until Christian opens it.
  On the live site `/play/crossword` says "coming soon", and `/play` and the home page leave it
  out of today's games. Staging and previews still show the sample crossword so it can be tested.
- Live: `/play` shows today's status for each open game.
- Live: shared settings (including a "reduce motion" switch and a sounds switch), first-visit help,
  and a finished-game result card with a plain one-line share.
- Live: statistics are kept on the player's own device.
- Live: sudoku has one tool row above the board, pause and auto-pause, and several difficulty levels.
- Preview only: crossword levels, check and reveal together, and keyboard play (they arrive with the crossword).
- Live: word path has joined-up lines between letters and a printable word list.
- Live: games print cleanly with the cueory logo.
- Live: a "flag or comment" button on each game page (an email link that opens the report panel once it loads).
- Preview only: hello cards (flip-the-card conversation starters with a prompt of the day). The cards are
  samples awaiting Christian's wording approval, so the live site does not build or link the page.
- Preview only: stat, a quick-question game running on labelled samples.

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
- Preview only: lessons print with their own print styles (the lessons themselves are preview only, below).

## Study tools (preview only; not on the live site)

The only lesson in the content folder is marked as a placeholder, and the study-skills sample lesson is
held back the same way, so the live build shows "coming soon" in their place and the home hero's
"start studying" button shows closed. Treat everything here as preview only unless Christian decides otherwise.

- Preview only: flashcards, matching, fill-in and "label it" practice, with save-and-resume for some of them,
  and the break timer that goes with study sessions.
- Preview only: lesson pages generated from the content folder. The `/learn` library page is live and says
  the first lessons are coming soon.
- Preview only: the setup questions at `/start`.
- Live but labelled as samples: the break ideas page (`/breaks`), kept out of search.
- Preview only: the finals survey, which is only on a `/preview` page.
- Preview only: the resources page, which runs on labelled placeholders.
- Preview only: the Anatomy Lab (3D) and its text-only search fallback, on `/preview` pages that are not linked
  from the site. They account for a very large share of the commits.

## Accounts and privacy (not opened for launch)

- Account pages, two-factor sign-in, data export and account deletion exist in source, but
  `/signin` and `/signup` still say accounts open soon. Do not announce them.
- The privacy page was updated, including a line that the launch-updates email box sends the address straight to Kit.
  That wording is marked as needing Christian's approval.
- The "get launch updates" email box is switched on.
- The admin flag inbox is in place for later.

## Behind the scenes

- Stricter security headers, dependency and code-scanning fixes, and automated checks for accessibility,
  performance budgets, and release gates.
- Many tests and status notes; none of these change what visitors see.

## Open questions for Christian

1. The crossword is closed (`crosswordOpen = false` in `src/config/site.ts`), so this draft counts three games and
   lists the crossword as preview only. Only if Christian opens it before Thursday should the launch message say four games.
2. The Anatomy Lab and the study tools are preview only in the live build. Keep them out of the launch message?
3. Approve or change the privacy wording about the email box.
