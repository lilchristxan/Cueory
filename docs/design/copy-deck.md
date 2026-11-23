# Copy deck for the redesign (lane 23)

Every visible string on Christian's renderings (artifact BYSYbuZfQb2LcrByLa84qU: HomeV2, Games, Pillo, Sort = sudoku,
WordPath, PilloDone, SudokuDone, WordPathDone, About, Message), the text we ship, and why when they differ. Builders use
the "ship" column and nothing else. Settled defaults 1-12 in [redesign-plan.md](redesign-plan.md) win over the boards.

Rules applied: lowercase voice, labels included (D-47; the brand keeps proper names lowercase too); reuse the existing
words from `src/` wherever the board says the same thing (source file in the last column); no Wordle, Connections,
Strands or NYT wording; no clinical facts, answer keys or real puzzles; the legal pages' wording is untouched (only
their menu labels appear here); sample names, words, dates, times and "[...]" text on the boards are placeholders and
never ship. "same" = ship the rendering text as is. Strings that are code, not words (a CSS class, an href) are left out.

Coverage note: Pillo.dc, Sort.dc and WordPath.dc (the in-play boards) were checked for their strings; their how-to
popovers and chrome match the three Done boards, which are tabulated below, so those rows cover both. Pure-image tiles
and decorative letters in demo animations (board letters, "term" chips) are placeholders and are not listed.

## Shared chrome (all boards)

| Route | Section | Rendering text | Ship | Reason / source |
|---|---|---|---|---|
| all | building strip | we're still building. more coming soon. | same | `site.ts` showBuildingNotice text |
| all | logo | alt "cueory", aria "cueory home" | alt "cueory", aria "cueory home" | same. Logo is the PNG artwork (BRAND) |
| all | main nav label | aria "Main" | "Main" | as drawn (Christian, 11:30) |
| all | nav | study | study | same |
| all | nav | anatomy lab | anatomy lab | same, shown only where the lab page ships (draft gate); otherwise omit the link rather than point at a held page |
| all | nav | games | games | same (the page itself stays "daily games") |
| all | nav | support | support | same |
| all | nav | about ▾ | about ▾ | same |
| all | about menu | about us | about us | same |
| all | about menu | how to use cueory | how to use cueory | label same; show only when /resources is live (it is a held placeholder page now) |
| all | about menu | coming soon + mailing list | coming soon + mailing list | as drawn (Christian, 11:30) |
| all | about menu | contact us | contact us | same; goes to /message, which says the form is not open yet and shows email (default 5) |
| all | about menu | privacy, terms + disclaimer | privacy, terms + disclaimer | same; links to /privacy, /terms, /disclaimer unchanged |
| all | search button | aria "Search" | "Search" | as drawn (Christian, 11:30) |
| all | sign in pill | sign in | sign in (disabled, tagged "coming soon") | rule [A] accounts closed: the pill shows but does not lead anywhere yet; after launch it opens sign in. Label as drawn |
| all | footer | about us, privacy, terms, disclaimer, contact | about us, privacy, terms, disclaimer, contact | as drawn (Christian, 11:30); legal links keep their own pages untouched [L] |
| all | modal close | aria "Close" | "Close" | as drawn (Christian, 11:30) |
| all | previous/next buttons | previous study method, next study method, previous game, next game | same | already lowercase |

## / (HomeV2)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| hero eyebrow | by nursing students, for nursing students | by nursing students, for nursing students | KEEP: Christian's own motto (stated 30 Oct). default (lead, 18 Nov), Christian may change |
| hero h1 | nursing school made simpler. | nursing school made simpler. | as drawn (Christian, 11:30). Replaces the earlier "is hard enough" default |
| hero accent | (none drawn; the curve is a graphic) | (the curve is a graphic; no text) | as drawn. The earlier accent line is dropped |
| hero button | start studying for free → | start studying for free → (disabled, tagged "coming soon", not a link) | rule [T]: the live build's /learn has 0 "open now" lessons, so a live link would lead nowhere. Same treatment as the sign-in pill. Switch condition: once at least one real lesson is open in the live build, it becomes a live link to /learn (`lessonEntryHref()` in `draftgate.ts`). Text as drawn (lead, 18 Nov, reversing the earlier call) |
| hero quiet link | (none) | (none) | as drawn; the old quiet "join the launch list" link goes away with the new hero. The launch-updates form is lower on the page |
| value row 1 | structured learning / from basics to med-surg | structured learning / from basics to med-surg | same, true today (courses.ts) |
| value row 2 | multiple ways to study / learn the way that works for you | same | same, true (11 study modes) |
| value row 3 | adhd friendly / less overwhelm, more focus | shipped (Christian approved, 23 Nov) | D-190 resolved: Christian approved "adhd friendly / less overwhelm, more focus" on the hero |
| support card | support on Ko-fi | support on Ko-fi | as drawn (Christian, 11:30) |
| support card body | support our mission to expand our resources, help nursing students struggling in class, and keep building ways we can help students and nurses. | support our mission to expand our resources, help nursing students struggling in class, and keep building ways we can help students and nurses. | as drawn (Christian, 11:30) |
| explore label | EXPLORE | EXPLORE | as drawn (Christian, 11:30) |
| explore heading | start with what you need. | same | same |
| explore tile | lessons | lessons | same |
| explore tile | study materials | study materials | same |
| explore tile | daily games | daily games | same |
| explore tile | resources | resources | show only when /resources is live |
| explore tile | give us suggestions | give us suggestions | label as drawn (Christian, 11:30); the tile goes to /message (email-only, no form yet) [B] |
| study section h2 | one lesson, multiple ways to study | one lesson, multiple ways to study | as drawn (Christian, 11:30) |
| study section line | pick the method that fits your brain today. | pick the method that fits your brain today. | as drawn (Christian, 11:30) |
| vial carousel label | study methods | study methods | as drawn (Christian, 11:30) |
| vials (10 names) | study guides, mind maps, practice questions, notes, flashcards, video lessons, quizzes, case studies, practice exams, spaced review | video, cards, learn, fill-in, matching, organizer, questions, review, label it, adaptive quiz, level test | rule [S]: the board names are samples; vials use the real study-mode names from `modes.ts` (11 modes; the board draws 10). Names lowercase as the modes are named |
| vial label | [name]: open a sample lesson | [name]: open a sample lesson | as drawn when the vial opens a labelled sample lesson (`sampleLessonPages`); otherwise [name]: try it, or no link if the mode has none |
| vial live line | [name] · tap the vial to try it | [name] · tap the vial to try it | same |
| vial dots | show [name] | show [name] | same |
| games eyebrow | DAILY GAMES | DAILY GAMES | as drawn (Christian, 11:30) |
| games h2 | a few minutes, every day. | same | same |
| games line | a new set of nursing games each day. play one, or all five. | a new set of nursing games each day. play one, or all three. | rule [T]: three games are live, not five. Rest as drawn |
| games counter | 01 / 05 · DAILY GAME | 01 / 05 · DAILY GAME | as drawn: five cards are shown; crossword and hello cards carry a coming soon tag [C] |
| game 1 | pillo: guess the five-letter word in six tries. | pillo: guess the five-letter word in six tries. | games.ts line, shortened to its first sentence (same words) |
| game 2 | crossword: a mini crossword from this week's lessons. | crossword: coming soon. | rule [C] and [T]: closed; "from this week's lessons" is not true. Name as drawn, tagged coming soon |
| game 3 | sort: sort ten terms into their groups. | sudoku: fill every row, column and box with the numbers one through nine. | rule [T]: the game is sudoku, not sorting (default 8). Card position as drawn |
| game 4 | word path: trace hidden words through the letters. | word path: trace hidden words through the letters. | as drawn (Christian, 11:30) |
| game 5 | hello cards: flip a card, start a conversation. | hello cards: flip a card, start a conversation. | blurb as drawn; the card is tagged coming soon [C] (draft game) |
| games button | play today's → | play today's → | as drawn (Christian, 11:30) |
| games demo | "small talk" / "[a question]" | "small talk" / "[a question]" shown as sample text | rule [S]: "[a question]" is a placeholder; the coming-soon demo shows "small talk" and "coming soon" only |
| mailing h2 | coming soon | coming soon | same |
| mailing body | Mental Health I and Med Math are next. Get one email when they open. | Mental Health I and Med Math are next. Get one email when they open. | as drawn (Christian, 11:30). Order is Christian's plan; "one email" is a Kit promise: confirm with Kit before launch (default (lead, 18 Nov), Christian may change) |
| mailing field | label email, placeholder your email, button join the list | label email, placeholder your email, button join the list | as drawn, using the existing plain HTML Kit form with no Kit script (CLAUDE.md allows it; `SignupForm.astro`, `newsletter` in `site.ts`). If `newsletter.formAction` is empty there is nothing to post to: show the "get launch updates" button instead [B]. Lead to confirm |
| courses modal title | choose a course | choose a course | same |
| courses modal line | Faded courses are on the way, so you can see what we're building. | Faded courses are on the way, so you can see what we're building. | as drawn (Christian, 11:30) |
| course cards | Med-Surg I, Fundamentals, Mental Health I, Med Math, Med-Surg II, Maternity + Peds | Med-Surg I, Med-Surg II, Mental Health, Med Math (as in `courses.ts`) | rule [S]/[T]: identities and statuses come from `src/config/courses.ts` (available / coming-soon). Case as drawn (Title Case, Christian 11:30; this replaces the earlier lowercase note). Board-only courses (Fundamentals, Mental Health I, Maternity + Peds) do not ship until the data has them. Board blurbs ship only for real courses and need Christian's OK |
| course badges | OPEN NOW / COMING SOON | OPEN NOW / COMING SOON | as drawn (Christian, 11:30) |
| course link | start → | start → | as drawn (Christian, 11:30) |
| games modal | today's games / A new set every day. Each one takes a couple of minutes. | today's games / A new set every day. Each one takes a couple of minutes. | as drawn (Christian, 11:30) |
| support modal h2 | support our mission. | support our mission. | as drawn (Christian, 11:30) |
| support modal body | Cueory is free because students already pay enough. Every donation goes back into the platform: | Cueory is free because students already pay enough. Every donation supports our mission to make nursing school simpler. | Christian, 11:32, reworded the donation line; his wording tightened to match the mission text in `site.ts`. Replaces "Every donation goes back into the platform" and is no longer pending |
| support modal 3 cards | expand our resources / help students who are struggling / build what's next, with blurbs | as drawn: expand our resources (more courses, lessons and practice, so nursing school gets simpler.) / help students who are struggling (tools for the classes where students fall behind most.) / build what's next (new ways to help students and nurses.) | restored: Christian, 11:30, asked about advertisers, sponsors and premium accounts later; the three cards ship as drawn |
| support modal button | support us on Ko-fi ↗ | support us on Ko-fi ↗ | as drawn (Christian, 11:30) |
| support modal note | Opens Ko-fi in a new tab. Ko-fi handles the payment; we never see your card. | Opens Ko-fi in a new tab. Ko-fi handles the payment; we never see your card. | as drawn: Ko-fi and Stripe process the payments (lead, 18 Nov) |
| support modal card | work with us / Schools, educators, nurses and brands that fit our students: partner or advertise with us. / get in touch | as drawn | "get in touch" is a mailto link to `site.contactEmail` (hello@cueory.app, `src/config/site.ts`), not the /message page |

## /play (Games hub board)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| breadcrumb | / daily games · [date] | / daily games · [date] | as drawn; the date is generated, never typed |
| pillo card h1 | pillo | pillo | same |
| pillo line | Guess the five-letter word in six tries. | Guess the five-letter word in six tries. | as drawn (Christian, 11:30) |
| pack key heading | how to read the pack | how to read the pack | same |
| pack key | ✓ filled right letter, right spot | ✓ filled right letter, right spot | as drawn; brand colors, not green/yellow, in the pack [N] |
| pack key | • half in the word, wrong spot | • half in the word, wrong spot | as drawn |
| pack key | × empty not in the word | × empty not in the word | as drawn |
| share note | Share line: "pillo [date] · 4/6" in plain words. No colored squares. | none (design note, not page copy) | a note to builders, not visible page copy; not printed |
| other cards | crossword / A mini crossword from this week's lessons. / not started | crossword / A mini crossword from this week's lessons. / coming soon | rule [C] and [T]: closed; status "coming soon" replaces "not started" |
| other cards | sort / Sort ten terms into the right groups. Three slips and the round ends. / not started | sudoku / Fill every row, column and box with the numbers one through nine. / not started | rule [T]: it is sudoku; "Sort ten terms ... Three slips" describes a different game |
| other cards | word path / Trace hidden words through the letters. / done · 6 of 6 words | word path / Trace hidden words through the letters. / [status from PlayStatus] | as drawn; the status is generated (done, not started) |
| page notes (not on board, keep) | | for now these are sample puzzles with everyday words. | `play.astro` sample note stays (CLAUDE.md rule 5 and 7) |

## /play/pillo (Pillo, PilloDone)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| title | pillo (image wordmark) | pillo (image wordmark) | as drawn |
| help button | aria "How to play" | "How to play" | as drawn (Christian, 11:30) |
| help heading | HOW TO PLAY | HOW TO PLAY | as drawn (Christian, 11:30) |
| help row 1 | ✓ Correct letter, correct position | ✓ Correct letter, correct position | as drawn; the tiles use brand colors plus symbols [N] (never green and yellow) |
| help row 2 | ● Correct letter, wrong position | ● Correct letter, wrong position | as drawn; brand colors plus symbols [N] |
| help row 3 | – Letter not in the word | – Letter not in the word | as drawn |
| help note | Every tile also carries a symbol, so color is never the only clue. Words here are placeholders. | Every tile also carries a symbol, so color is never the only clue. Words here are samples. | as drawn, except "placeholders" is our word "samples" [S] |
| keyboard | Q W E R T Y U I O P / A S D F G H J K L / ⌫ Z X C V B N M Enter | as drawn; aria "delete" and "enter" | as drawn (Christian, 11:30) |
| result label | PILLO · [DATE] | PILLO · [DATE] | as drawn; date generated |
| result big | 4 / 6 | [guesses used] / 6 | as drawn; generated. Unsolved case: "not solved this time" (pulse.ts) |
| result sub | you found today's word. | you found today's word. | same; unsolved: "not solved this time." |
| result stat | today's word / [word] | today's word / [word] | same, shown only after play, never from the page source |
| result stat | guesses / 4 of 6 | guesses / [n] of 6 | as drawn; generated |
| share line | pillo · [date] · 4/6 · cueory.app | pillo · [date] · [n]/6 · cueory.app | as drawn. It replaces the current `shareText` line, so the tests that pin that line are replaced, not loosened. Plain one-line share, no squares [N] |
| share buttons | share, copy, facebook, x, threads, reddit, whatsapp | share, copy | rule [F]: the five social links (facebook, x, threads, reddit, whatsapp) stay out. default (lead, 18 Nov), Christian may change |
| share note | on a phone, share also opens instagram, tiktok and messages. a new pillo comes out tomorrow. | same | lowercase already; "instagram, tiktok" depends on the phone's share sheet, keep as written only if tested |
| close | aria "close and see the board" | same | same |
| dialog | aria "today's result" | same | same |
| print | aria "print this puzzle", title "print" | same | same |

## /play/sudoku (Sort, SudokuDone)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| title | sudoku | sudoku | same |
| tagline | NUMBER PUZZLE | NUMBER PUZZLE | as drawn (Christian, 11:30) |
| help heading | HOW TO PLAY | HOW TO PLAY | as drawn (Christian, 11:30) |
| help 1 | Fill every row, column and 3x3 box with the numbers 1 to 9, no repeats. | Fill every row, column and 3x3 box with the numbers 1 to 9, no repeats. | as drawn (Christian, 11:30) |
| help 2 | Tap a square, then tap a number or type one. Arrow keys move between squares. | Tap a square, then tap a number or type one. Arrow keys move between squares. | as drawn (Christian, 11:30) |
| help 3 | Tap x to leave your own mark on a square. | Tap x to leave your own mark on a square. | as drawn (Christian, 11:30) |
| help 4 | Tick hints to show the possible numbers in every empty square. | Tick hints to show the possible numbers in every empty square. | as drawn (Christian, 11:30) |
| help 5 | The clock shows time elapsed, and error counts wrong numbers. There is no time limit. | The clock shows time elapsed, and error counts wrong numbers. There is no time limit. | as drawn (Christian, 11:30) |
| help 6 | Tap the pause button next to the time to pause. The squares fill with x until you resume. | Tap the pause button next to the time to pause. The squares fill with x until you resume. | as drawn (Christian, 11:30) |
| help 7 | Tap the printer button above the board to print a clean copy. | Tap the printer button above the board to print a clean copy. | as drawn (Christian, 11:30) |
| status bar | time: 00:00 / error: 0 | same | same |
| level control | easy, medium, hard | easy, medium, hard | same; shipped game has the same three levels (games.ts: "choose a level") |
| pause | aria pause / resume | same | same |
| pad | 1-9, x | same | same |
| hints | hints | hints | same |
| settings button | settings | settings | same |
| settings title | settings | settings | same |
| setting | dark mode / ignore your device setting and always use dark mode. | same | the theme switch exists (footer); wording already lowercase |
| setting | light mode / ignore your device setting and always use light mode. | same | same |
| section label | GAMEBOARD SETTINGS | GAMEBOARD SETTINGS | as drawn (Christian, 11:30) |
| settings rows | check guesses when entered; start in auto candidate mode; show error counter; show timer; highlight conflicts; highlight row and column; highlight box; highlight identical numbers; play sound on solve | same | already lowercase. Builders: only ship a setting that works. HOLD the sound row (not shipped). default (lead, 18 Nov), Christian may change |
| close | aria "close settings" | same | same |
| result label | SUDOKU · MEDIUM · [DATE] | SUDOKU · MEDIUM · [DATE] | as drawn; generated |
| result big | solved | solved | same |
| result sub | every row, column and box is complete. | same | same |
| result stats | time / [time], errors / 0 | same | generated |
| share line | sudoku · [date] · medium · [time] · 0 errors · cueory.app | sudoku · [date] · medium · [time] · 0 errors · cueory.app | as drawn; replaces the current sudoku share line, so its pinned tests are replaced, not loosened |
| share note | on a phone, share also opens instagram, tiktok and messages. a new sudoku comes out tomorrow. | same | same |

## /play/word-path (WordPath, WordPathDone)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| title | word path | word path | same |
| tagline | LETTER PATH GAME | LETTER PATH GAME | as drawn (Christian, 11:30) |
| help 1 | Tap letters that touch to build a path, across, down or diagonal. | puzzle format "path" (sample-01 to sample-05, `SuturePathBoard`; turning and diagonal paths, select every letter, submit): help topic `suture`, six lines verbatim from `src/islands/gamehelpcontent.ts` on staging: "find every answer on the board. each letter belongs to exactly one answer." / "answers run through touching letters, up, down, sideways or diagonally, and can turn. a path never uses the same letter twice." / "one answer, the thread, names the theme and runs from one side of the board to the other. found theme words get a dot, and the thread gets a diamond." / "drag across the letters, or tap them one by one and press submit. tapping the last letter again also submits, and clear starts over." / "on a keyboard, arrows move, enter or space adds a letter, enter on the last letter submits, backspace takes one back and escape clears." / the cue line (every N other words of M letters or more earn a cue ...), whose numbers come from `WORDS_PER_HINT` and `MIN_WORD`: copy the line from the file, never retype the numbers | rule [T]: the help must match the game. Capital letter at the start of each line as drawn. The board's diagonal path is correct for this format |
| help 2 | Submit when the path spells a word on the list. | puzzle format "search" (sample-06 only, first/last-letter): help topic `suture-search`, three lines verbatim from `src/islands/gamehelpcontent.ts` on staging: "find every word in the list. words run up, down, left or right." / "tap a word's first letter, then its last letter. tap the first letter again to start over." / "on a keyboard, arrows move, enter or space picks, and escape clears." | rule [T]: no submit step in this format |
| help 3 | Found words are ticked off. | builders: show the help variant that matches the day's puzzle format, the way `SutureGame.tsx` picks the topic; never mix the two | found words are ticked off on the word list (behaviour, not help text) |
| help 4 | Tap the last letter again to undo a step. | (drop) | rule [T]: neither format has an undo line; "backspace takes one back" (path) and "tap the first letter again to start over" (search) already cover it |
| help 5 | Tap the printer button above the board to print a clean copy. | Tap the printer button above the board to print a clean copy. | as drawn (Christian, 11:30); shown only if the print button ships |
| theme card | CUE OF THE DAY / [theme of today's words] | CUE OF THE DAY / [the day's theme from the puzzle file] | label as drawn; theme text comes from `/content` [S] |
| print list | WORDS TO FIND / NURSE, [word two] (5 letters) ... | WORDS TO FIND / [words from the puzzle file] ([n] letters) | as drawn; words are never hardcoded; the sample "NURSE" row is a placeholder [S] |
| result | (no Done card text beyond the shared structure) | share line from `shareLine` in `suture.ts`: "cueory word path, [date]: found [n] of [total] words with [m] wrong picks."; the rest of the card follows the pillo/sudoku card shape (label "WORD PATH · [DATE]", note "A new word path comes out tomorrow.") | the board shows no result-card text, so the shipped share line stays; other strings are drafting, confirm in P4 |

## /support (Message board + support.astro)

The renderings have no board for the tip page. /support ships as is (approved D-94 wording). The Message board is the
contact page; default 5 keeps it email-only.

| Route | Section | Rendering text | Ship | Reason / source |
|---|---|---|---|---|
| /message | breadcrumb | / message us | / message us | same (message.astro) |
| /message | h1 | tell us what to fix. | tell us what to fix. | same |
| /message | intro | Something broken, confusing or missing? An idea that would help? We read every message. | Something broken, confusing or missing? An idea that would help? We read every message. | as drawn (Christian, 11:30) |
| /message | form labels (what's this about?, which page?, your message, email, send message) | no form: "message form: coming soon", "the message form isn't open yet. for now, please email us directly." and the existing "flag or comment on a page" block | rule [B]: a form needs a backend, rate limits and a privacy-page change that do not exist. Heading and intro as drawn |
| /message | select options | none | rule [B]: no form |
| /message | note | Please don't include any patient information. | Please don't include any patient information. | as drawn; same meaning as `PATIENT_INFO_WARNING`, which stays on the page |
| /message | field hints | paste the link; what happened, or what you'd like to see; you@example.com | none | rule [B]: no form |

## /about (About)

Default 6: only true claims. The page today holds `[Christian writes this]` placeholders and is noindex.

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| breadcrumb | / about us | / about us | same |
| eyebrow | by nursing students, for nursing students | by nursing students, for nursing students | KEEP: Christian's motto. default (lead, 18 Nov), Christian may change |
| h1 | we know nursing school is hard. | we know nursing school is hard. | use this About heading. default (lead, 18 Nov), Christian may change |
| story | [Christian's story: why Cueory exists, in his own words.] | [Christian's story: why Cueory exists, in his own words.] | rule [S]: placeholder; only Christian writes it |
| our mission h2 | our mission | our mission | same |
| mission text | To make studying for nursing school simpler, and to give nursing students the materials they need to succeed and become great nurses at an affordable price. | To make studying for nursing school simpler, and to give nursing students the materials they need to succeed and become great nurses at an affordable price. | as drawn; same words as the approved mission lines in `support.astro` (D-94) |
| lessons h2 | how we make our lessons | how we make our lessons | same (about.astro) |
| bullet 1 | Every lesson is researched and cites its sources. | hold (not shipped) | rule [T] (rule 5): `site.ts` contentNotice says "content may not have citations or licensed-nurse review". default (lead, 18 Nov), Christian may change |
| bullet 2 | Higher-risk topics wait for a nurse reviewer before they go live. | hold (not shipped) | rule [T]: no "reviewed by" claim until a reviewer exists. default (lead, 18 Nov), Christian may change |
| bullet 3 | Spot a mistake? The flag button is on every page, and we fix it. | Spot a mistake? The flag button is on every page, and we fix it. | as drawn, if the flag button is on every public page (the game and lesson pages have it); otherwise "on every lesson and game page" [T] |
| coming h2 | what's coming | what's coming | same |
| coming text | Mental Health I and Med Math are next, then Med-Surg II. | Mental Health I and Med Math are next, then Med-Surg II. | as drawn (Christian, 11:30). Order is Christian's plan (default (lead, 18 Nov), Christian may change) |
| coming link | join the mailing list | join the mailing list | as drawn (Christian, 11:30); links to /#signup |
| support aria | Support our mission | Support our mission | as drawn (Christian, 11:30) |
| support h2 | help keep cueory free. | help keep cueory free. | same (about.astro) |
| support text | Support our mission to expand our resources, help nursing students struggling in class, and keep building ways we can help students and nurses. | Support our mission to expand our resources, help nursing students struggling in class, and keep building ways we can help students and nurses. | as drawn (Christian, 11:30) |
| support button | support on Ko-fi ↗ | support on Ko-fi ↗ | as drawn (Christian, 11:30) |

## Held or changed because a rule blocks the drawing

Christian, 11:30: everything else ships as drawn. Not shipped as drawn, by rule:
1. [T] "adhd friendly" row; About bullets 1 and 2 (research, sources, nurse reviewer); "all five" games (three are live); "Sort ten terms" copy (the game is sudoku); crossword blurb ("from this week's lessons").
2. [A] sign in pill (disabled, "sign in, coming soon"). [T] hero "start studying for free →": disabled with "coming soon" until at least one real lesson is open in the live build, then a live link to /learn.
3. [C] crossword and hello cards shown as coming soon.
4. [N] pillo tiles and keys use brand colors plus symbols, never green and yellow.
5. [F] social share buttons and "play sound on solve": not brought back. (The three support-modal cards are back, as drawn, per Christian 11:30.)
6. [B] message form: email-only page until a backend exists.
7. [S] sample vial names, sample words, "NURSE", "[a question]", dates and times: replaced with real or generated data.

## Needs Christian or the lead (open)

1. The mailing section's on-page email field: needs `newsletter.formAction` to be set; otherwise the button shows.
2. "Get one email when they open" (a Kit promise).
3. Course blurbs for real courses, and whether Fundamentals should appear (it is not in `courses.ts`).
4. Share lines for pillo and sudoku follow the boards and replace the current lines; tests that pin the old lines are replaced, not loosened.
