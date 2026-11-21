# Release notes draft: what's new at launch

**Draft for Christian's review. Not published, not approved.** Written from the commit subjects in
`git log origin/main..origin/staging` (2,630 commits at the time of writing) and the launch scope in
[LAUNCH-2026-11-23.md](../LAUNCH-2026-11-23.md): the daily games and public pages go live, and **accounts stay
closed**. The longer inventory is in [RELEASE-2026-11-19.md](../RELEASE-2026-11-19.md). Nothing below is a clinical
claim, and no item is promised until the release PR is merged and checked on the live site.

Wording is for a nursing-student audience. Game names are the Cueory ones: pillo, sudoku, crossword, word path,
and hello cards.

## Launching (in the games-and-public-pages release)

### Games
- Three daily games, each on its own page under `/play`: pillo, sudoku and word path. The crossword is not open yet (see "NOT launched" below).
- `/play` shows today's status for each game, so you can see what you have and have not finished.
- Finished-game result cards and a share card, so you can show a result without giving anything away.
- One shared settings dialog for all the games, including a sounds switch and a high-contrast option.
- Sudoku: one tool row above the board, a full pause, and auto-pause when you switch away.
- Word path: lines now join the letters of each word.
- Games print cleanly with the Cueory logo.
- Your game statistics stay on your own device.

### Design
- A new look for the home page and marketing pages: a soft peach "silk" background and a copper accent color.
- A Light theme and an Evening (dark) theme, both checked at large text sizes.
- A building strip sentence and refreshed support card on the home page.

### Accessibility
- Game boards and dialogs fit a 320 px phone, a phone turned sideways and a tablet, including at large text sizes
  (checked up to 32 px text).
- Keyboard alternatives and visible focus on game controls; the current page is underlined in the navigation.
- Larger tap targets for links and survey choices.
- Reduced-motion support: no animations or transitions when your device asks for that.
- Skip-to-content navigation on every page.
- Pages that work with JavaScript turned off, such as the flag-a-problem button (it opens an email).

### Speed
- Smaller images and fonts on phones, and games reserve their space so the page does not jump while loading.
- Share previews use lighter images.

### Privacy and safety
- The site stores very little in your browser, and what it does store is listed and clearable.
- Strict security headers on every page.

## NOT launched (draft, held or behind a flag)

- **Accounts.** Sign in, sign up, onboarding, export and delete are in the code but accounts stay closed.
  `/signin` and `/signup` say accounts open soon; their "get launch updates" link goes to the email box on the home
  page (`/#signup`), which sends the address straight to Kit. No separate Kit signup page opens.
- **Crossword.** Closed on the live build: `crosswordOpen` is `false` in `src/config/site.ts`, so `/play` leaves it out
  of today's games and lists it under "coming soon" (`src/pages/play.astro`). Staging, preview and test builds still
  show the sample crossword. The crossword items from the first draft of these notes reach visitors only when it
  opens: check and reveal sit together, the keyboard stays out of the way on phones, tab-key navigation works, and
  autocheck counts as a try, so it cannot be used to keep a streak.
- **Hello cards** (conversation-starter flip cards at `/play/hello-cards`): shows "coming soon" until content is approved.
- **Anatomy Lab and 3D body viewer.** Preview pages only (unlinked, noindex). Models are held for founder review
  of the BodyParts3D source and credit.
- **Study-skills sample lesson, learn pages, questions, courses, resources, breaks, progress.** Behind "coming soon" or noindex.
  Lesson flashcard sheets, concept maps, rewards, reminders and survey are preview-only.
- **Legal pages.** Terms v6, the Disclaimer and the adopted privacy notice still need a rendered-page check
  before release. Do not announce them from this list.
- **Offline use** (saving lessons for offline): present in the code, not promised for launch.

## Behind the scenes

CI and security checks, automated tests, dependency updates, performance budgets, content validation tools and
documentation. Nothing here changes what students see.

## For Christian to confirm before this is used

- Which of the "Launching" items you want named publicly; anything you cannot confirm on staging should move down.
- That the Evening theme and large-text claims match what you see on a real iPhone.
- That no line implies accounts, study content or the Anatomy Lab are available.
