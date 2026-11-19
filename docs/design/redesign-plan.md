# Cueory design gap: renderings vs origin/staging 163df9b6

Source: artifact BYSYbuZfQb2LcrByLa84qU ("Cueory redesign renderings"), boards project/HomeV2, Games, Pillo, Sort (= sudoku),
WordPath, PilloDone, SudokuDone, WordPathDone, About, Message (.dc.html). Builders read a board with
mcp__claude-artifacts__read_file (slug above, one path per call). Boards were NOT byte-copied to disk (about 200 KB, and
they embed /_blob images); this file is the extract. Sizes: S under 1 h, M 1-3 h, L over 3 h (one builder, including tests).
Sample module names, vial names, words, dates and "[theme]" text in the boards are placeholders: never copy as content.
Coverage caveat: the done-state boards (PilloDone, SudokuDone, WordPathDone) were read for CSS and structure only; the
SudokuDone/Sort markup body past the CSS and the top 40 lines of WordPath were skimmed, not line-by-line.

## Shared chrome (every board; build first, everything depends on it)

| # | Difference | Size |
|---|---|---|
| C1 | Top bar: staging has a hidden side-panel menu (corner button opens a dialog, SiteMenu.astro). Boards show a persistent glass pill nav: study, anatomy lab, games, support, "about" dropdown (about us, how to use cueory, coming soon + mailing list, contact us, privacy/terms/disclaimer), plus a round Search button and a copper "sign in" pill. Needs desktop bar, a phone collapse (boards show none; design needed), keyboard dropdown, focus handling. | L |
| C2 | "we're still building. more coming soon." strip above the header with small icon (staging has a building notice, different look). | S |
| C3 | Background: boards use layered radial peach gradients, drifting mesh and silk blobs behind every page, including study-like game screens. Staging has the scene/silk system (D-53). CLAUDE.md says study screens stay plain; games are borderline. | M |
| C4 | New tokens: copper gradient button (`.copper`), `.glass` nav, frosted result card, "k" caps label (12px, .22em tracking). Must be tokens, not raw values. | M |
| C5 | Result/share card (all three games): modal, "PILLO . [DATE]" caps label, big Bodoni "4 / 6", stat chips, dashed share line, share/copy plus Facebook, X, Threads, Reddit, WhatsApp links. Staging has ShareSheet and GameResultsHost with its own share set. | L |

## / (HomeV2) vs index.astro

| Difference | Size |
|---|---|
| Hero copy: board "nursing school made simpler." vs staging "nursing school is hard enough." plus accent line. Copy is Christian's call; D-pending. | S |
| Hero layout: board has hero beside a vial carousel and games stage in one first screen; staging is a centred full-screen wordmark + one button. | M |
| Vial carousel redesign (board imagery, sample vial names) vs ModesCarousel (793 lines, tested by vial-carousel.spec). | L |
| Games stage section replacing DailyGamesSection (32 lines, text + button). | M |
| HowItWorks section: board differs/absent; confirm per board. | S |
| Mailing list section anchored `#mailing`, linked from the about menu. Board has an on-page email field; staging uses the Kit hosted page (no field). Conflict, see below. | M |
| Sign-in / "start studying for free" calls to action. | S (remove) |
| Home total | about 9-12 h plus C1-C4 |

## /play (Games) vs play.astro

| Difference | Size |
|---|---|
| Staging: plain veil article, card list from PlayStatus, stats panel, "more games", "coming soon". Board: blister-pack game cards with symbols, stage layout. | L |
| Crossword and hello cards appear in board carousel; both are closed or draft at launch (crosswordOpen false). Cards must stay gated. | S |
| Sample-puzzle note, home-screen tip, stats panel placement not in board; keep (D-76). | S |
| Total | about 4-6 h |

## /play/pillo (Pillo, PilloDone) vs pillo.astro + PulseGame + GamePage

| Difference | Size |
|---|---|
| Whole-page layout: big pillo wordmark image, "?" popover how-to, tile board drawn over a blister-pack image with tiles positioned by percent. Staging: veil article, "all games" link, flag button, PilloTitle. | L |
| Tiles: green and yellow gradients with check, dot and dash symbols; keyboard colored green/yellow. BRAND.md line 129: "The brand has no red or green". Also yellow/green is the look CLAUDE.md forbids copying. CONFLICT (Christian). Symbols on every tile already satisfy the color-only rule. | M after decision |
| On-screen keyboard styling (3 rows, wide Enter and delete). | M |
| Done state: result card (C5). | counted in C5 |
| "flag or comment" and "all games" link absent from board; must stay (CLAUDE.md). | S |
| Total | about 8-10 h plus C5 |

## /play/sudoku (Sort board, SudokuDone) vs sudoku.astro + TriageGame

| Difference | Size |
|---|---|
| Board file is named "Sort" but is sudoku; confirm names. Staging game id is `triage`. | S |
| 9x9 grid restyle with CSS var cell size, candidate notes grid, highlight rules (peach row/col/box), selected cell inset copper. | M |
| Number pad: portrait grid layout, hint and gear buttons, wrap rules. | M |
| Settings overlay (radio rows, checkbox rows, segmented control) and pause with covered grid. Staging has shared settings (#734) opening from each gear; rebuild to match. | L |
| Print stylesheet (grid only). Staging prints already; keep tests. | S |
| Total | about 8-10 h plus C5 |

## /play/word-path (WordPath, WordPathDone) vs word-path.astro + SutureGame

| Difference | Size |
|---|---|
| 8x6 grid of 72px circular letters, copper path lines drawn as SVG, "cue of the day" theme card with Bodoni title. | M |
| Print button plus print stylesheet with word list. Staging has wordpath.css print; reconcile. | S |
| "?" popover rules text. Confirm wording is Christian's (original game, no NYT look). | S |
| Total | about 4-6 h plus C5 |

## /support (Message) vs support.astro; /about (About)

| Difference | Size |
|---|---|
| Message board is a contact form (message field). Staging support is a tip page; contact is email only. Form means a backend and a rate limit: new service, privacy-page change, needs Christian and Codex security review. Recommend: restyle only, send via the existing mailto/flag path. | M (restyle) or L (form) |
| Support page itself: no board for the tip/mission page; keep content, apply chrome. | S |
| About: board claims "researched, cites sources, nurse reviewer" style copy (verify against board text before use) vs staging about.astro (86 lines, tested by about.spec). Claims must be true (rule 5) and legal text is locked. | M |

## Settled defaults (1-11: Christian, 18 Nov 2026, 08:29; the rules win over the renderings)

1. Pillo uses brand colors plus symbols, never green and yellow tiles.
2. Sign-in and free-account calls to action show as coming soon while accounts are closed.
3. Crossword and hello cards show as coming soon in the games carousel.
4. Keep the current launch-updates signup method; no new on-page email field.
5. Support stays email-only; no message form yet.
6. About makes only claims that are true today; no "reviewed by" until a reviewer exists.
7. Lowercase voice everywhere, labels included.
8. The "sort" board is sudoku; vials use the real study-mode names (the board names are samples).
9. The persistent search button stays (it opens the existing site search).
10. Keep the current hero line: "nursing school is hard enough. cueory makes studying nursing simpler."
11. Game screens get a quiet background; motion off under reduced motion.
12. Proposed P2 first-slice behaviour (the lead's default, told to Christian 18 Nov 08:45; final with his approval of #875): phones and tablets keep the existing ☰ panel (the renderings draw no phone bar); about-us and contact links join the menu when their pages exist (P7/P13).

## Build plan (small PRs, in order; each replaces, never loosens, the named tests)

Phase 0, in parallel (Christian, 08:28): Worker 1 = P1, Architect = P2, Worker 2 = P3. P1 merges first; P2 and P3 follow.
1. P1 Tokens: copper button, glass nav, caps label, result card, mesh, cell sizes. S. tokens/design-values unit tests extended.
2. P2 Header and nav: persistent pill, about dropdown, phone collapse, sign-in hidden until accounts open. L, needs-christian (auth link, header). Replaces header-tuck, sticky-header-overlap, navigation-links, theme-navigation, account-corner-keyboard, tap-targets, footer-theme, large-text-reflow, a11y-sweep and dark-mode runs.
3. P3 Building strip + page background. M. dark-mode, forced-colors, reduced-motion, home-modern, daytime-contrast.

Phase 1, parallel (up to 7 builders): prepare now on branches from staging; open PRs only after all of Phase 0 (P1, P2 and P3) has merged
4. P4 Result card and share set (C5). L. share-sheet, result-brand-mark, play.spec, word-path.spec.
5. P5 Home hero. M. home-page, home-modern, promo, indexing.
6. P6 Home vial carousel. L. vial-carousel, home-modern.
7. P7 Home games stage + how it works + mailing section. M. home-page, promo, no-javascript-routes. Keep the current signup (default 4).
8. P8 /play hub. L. play.spec, no-javascript-routes, indexing (crossword stays gated).
9. P9 Pillo board and keyboard. L. play.spec, flag-button, a11y-sweep. Brand colors plus symbols (default 1).
10. P10 Sudoku grid, pad, settings, pause. L (maybe split into 2 PRs). play.spec, tap-targets.
11. P11 Word path grid, print, theme card. M. word-path.spec, print specs.
12. P12 /support restyle. S-M. support.spec.
13. P13 /about restyle. M. about.spec (true claims only, default 6).

Phase 2, serial
14. P14 Cross-engine pass (WebKit, Firefox), 320 px and 32 px sweep, 44 px targets, Evening palette check of every new component. M-L.

## Effort totals

Chrome C1-C5: about 16-20 h. Home 9-12 h. /play 4-6 h. Pillo 8-10 h. Sudoku 8-10 h. Word path 4-6 h. Support and about 4-8 h.
Grand total about 55-70 builder-hours, plus review loops (assume 1.5x) and 6-8 h final cross-engine/accessibility pass.

## Launch date

Christian set the launch for Mon 23 Nov 2026 (08:28), with every launch page matching the renderings. Daily targets:
Wed Phase 0 merged; Thu home and /play; Fri games and results; Sat support/about and the cross-engine and accessibility
pass; Sun release run and Christian's walkthrough; Mon launch.
