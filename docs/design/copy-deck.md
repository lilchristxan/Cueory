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
| all | main nav label | aria "Main" | "main" | lowercase voice |
| all | nav | study | study | same |
| all | nav | anatomy lab | anatomy lab | same, shown only where the lab page ships (draft gate); otherwise omit the link rather than point at a held page |
| all | nav | games | games | same (the page itself stays "daily games") |
| all | nav | support | support | same |
| all | nav | about ▾ | about ▾ | same |
| all | about menu | about us | about us | same |
| all | about menu | how to use cueory | how to use cueory | label same; show only when /resources is live (it is a held placeholder page now) |
| all | about menu | coming soon + mailing list | coming soon + launch updates | "mailing list" is not our word; Kit signup is called "get launch updates" (SignupForm) |
| all | about menu | contact us | contact us | same; goes to /message, which says the form is not open yet and shows email (default 5) |
| all | about menu | privacy, terms + disclaimer | privacy, terms + disclaimer | same; links to /privacy, /terms, /disclaimer unchanged |
| all | search button | aria "Search" | "search the site" | lowercase; existing site search label (SiteMenu) (default 9) |
| all | sign in pill | sign in | sign in, coming soon | default 2: accounts are closed (`accountsOpen` false). Shown disabled, not a link. After accounts open: "sign in" |
| all | footer | about us, privacy, terms, disclaimer, contact | about us, privacy, terms, disclaimer, support cueory | existing footer links (`site.ts` footer list); "contact" lives under about |
| all | modal close | aria "Close" | "close" | lowercase |
| all | previous/next buttons | previous study method, next study method, previous game, next game | same | already lowercase |

## / (HomeV2)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| hero eyebrow | by nursing students, for nursing students | by nursing students, for nursing students | KEEP: Christian's own motto (stated 30 Oct). default (lead, 18 Nov), Christian may change |
| hero h1 | nursing school made simpler. | nursing school is hard enough. | default 10, current hero line (index.astro) |
| hero accent | (none drawn; the curve is a graphic) | cueory makes studying nursing simpler. | default 10; `index.astro` accent line is "cueory makes studying simpler." today: the default's longer wording wins, update both |
| hero button | start studying for free → | play today's games | accounts closed (default 2). Current hero button (`index.astro`) |
| hero quiet link | (none) | join the launch list | `accountLaunch` promoJoinLabel while accounts are closed |
| value row 1 | structured learning / from basics to med-surg | structured learning / from basics to med-surg | same, true today (courses.ts) |
| value row 2 | multiple ways to study / learn the way that works for you | same | same, true (11 study modes) |
| value row 3 | adhd friendly / less overwhelm, more focus | hold (not shipped) | default (lead, 18 Nov), Christian may change |
| support card | support on Ko-fi | support on ko-fi | lowercase voice, brand name kept lowercase |
| support card body | support our mission to expand our resources, help nursing students struggling in class, and keep building ways we can help students and nurses. | your support helps us maintain the domain, keep the website available, and build more lessons. | "help students struggling in class" promises something not built; use the approved support-page line (support.astro, D-94) |
| explore label | EXPLORE | explore | lowercase |
| explore heading | start with what you need. | same | same |
| explore tile | lessons | lessons | same |
| explore tile | study materials | study materials | same |
| explore tile | daily games | daily games | same |
| explore tile | resources | resources | show only when /resources is live |
| explore tile | give us suggestions | message us | there is no suggestion form; "message us" is the page name (message.astro) |
| study section h2 | one lesson, multiple ways to study | one lesson, many ways to study | wording keeps "ways to study" (existing section name); "many" reads cleaner. Optional; "same" is also fine |
| study section line | pick the method that fits your brain today. | pick the way that fits how you study today. | avoids "fits your brain" (reads like a learning-style claim) |
| vial carousel label | study methods | ways to study | existing section name (ModesCarousel) |
| vials (10 names) | study guides, mind maps, practice questions, notes, flashcards, video lessons, quizzes, case studies, practice exams, spaced review | video, cards, learn, fill-in, matching, organizer, questions, review, label it, adaptive quiz, level test | default 8: real study-mode names from `modes.ts` (11 modes). Board names are samples; some (study guides, mind maps, case studies, practice exams) do not exist |
| vial label | [name]: open a sample lesson | [name]: try it | the vial links to the real mode page (`modes.ts` link labels: "try the cards", "try learn mode" ...). Use each mode's own `link.label`; modes with no link get no link |
| vial live line | [name] · tap the vial to try it | [name] · tap the vial to try it | same |
| vial dots | show [name] | show [name] | same |
| games eyebrow | DAILY GAMES | daily games | lowercase |
| games h2 | a few minutes, every day. | same | same |
| games line | a new set of nursing games each day. play one, or all five. | a new puzzle every day. play one, or all of them. | "nursing games" overstates (the puzzles use everyday words, per sample note); five games is wrong (3 live). Source: play.astro "a new puzzle every day." |
| games counter | 01 / 05 · DAILY GAME | 01 / 03 · daily game | three live games; count follows the shown cards. Crossword/hello cards are coming soon (default 3) |
| game 1 | pillo: guess the five-letter word in six tries. | pillo: guess the five-letter word in six tries. | games.ts line, shortened to its first sentence (same words) |
| game 2 | crossword: a mini crossword from this week's lessons. | crossword: coming soon. | closed (`crosswordOpen` false); "from this week's lessons" is untrue |
| game 3 | sort: sort ten terms into their groups. | sudoku: fill every row, column and box with the numbers one through nine. | default 8: it is sudoku (games.ts). First sentence of its line |
| game 4 | word path: trace hidden words through the letters. | word path: trace the theme words through a board of letters. | games.ts line, first part |
| game 5 | hello cards: flip a card, start a conversation. | hello cards: coming soon. | draft game, default 3 |
| games button | play today's → | play today's games | existing button text |
| games demo | "small talk" / "[a question]" | none | demo is decorative; no question text ships in a demo |
| mailing h2 | coming soon | coming soon | same |
| mailing body | Mental Health I and Med Math are next. Get one email when they open. | mental health and med math are next. get launch updates by email. | lowercase; "one email" is a promise about Kit we cannot verify. KEEP the order: Christian's stated plan. default (lead, 18 Nov), Christian may change |
| mailing field | label email, placeholder your email, button join the list | button only: get launch updates (opens in a new tab) | default 4: no on-page email field; SignupForm uses the Kit hosted page |
| courses modal title | choose a course | choose a course | same |
| courses modal line | Faded courses are on the way, so you can see what we're building. | faded courses are on the way, so you can see what we're building. | lowercase |
| course cards | Med-Surg I, Fundamentals, Mental Health I, Med Math, Med-Surg II, Maternity + Peds | titles shown lowercase: med-surg i (open now), med-surg ii (coming soon), mental health (coming soon), med math (coming soon) | identities and statuses come from `src/config/courses.ts` (available / coming-soon); only the display case changes (lowercase voice). Board extras with no data row (fundamentals, mental health i, maternity + peds) do not ship. Board blurbs need Christian's OK |
| course badges | OPEN NOW / COMING SOON | open now / coming soon | lowercase |
| course link | start → | start | arrow is an icon |
| games modal | today's games / A new set every day. Each one takes a couple of minutes. | today's games / a new puzzle every day. each one takes a few minutes. | lowercase; same claim as the home line. "a couple" shortened is fine; both are time claims, keep soft |
| support modal h2 | support our mission. | supporting our mission | page title in `support.astro` |
| support modal body | Cueory is free because students already pay enough. Every donation goes back into the platform: | cueory is free for every nursing student. your support helps us maintain the domain, keep the website available, and build more lessons. | approved support wording (D-94). "every donation goes back into the platform" is a promise of use of funds, not in approved copy |
| support modal 3 cards | expand our resources / help students who are struggling / build what's next, with blurbs | drop (not shipped) | default (lead, 18 Nov), Christian may change |
| support modal button | support us on Ko-fi ↗ | support our mission (opens in a new tab) | existing button (support.astro) |
| support modal note | Opens Ko-fi in a new tab. Ko-fi handles the payment; we never see your card. | opens in a new tab. | "we never see your card" is true of a payment page but a promise about a third party; keep only the new-tab note unless Christian approves. Needs Christian |
| support modal card | work with us / Schools, educators, nurses and brands that fit our students: partner or advertise with us. / get in touch | drop | advertising and partnerships are not launched; no process behind it. Needs Christian |

## /play (Games hub board)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| breadcrumb | / daily games · [date] | / daily games · [today's date, local] | date is generated; format is the page's existing date line |
| pillo card h1 | pillo | pillo | same |
| pillo line | Guess the five-letter word in six tries. | guess the five-letter word in six tries. | lowercase; games.ts |
| pack key heading | how to read the pack | how to read the pack | same |
| pack key | ✓ filled right letter, right spot | ✓ filled: right letter, right spot | same words, punctuation added |
| pack key | • half in the word, wrong spot | • half: in the word, wrong spot | same |
| pack key | × empty not in the word | × empty: not in the word | same |
| share note | Share line: "pillo [date] · 4/6" in plain words. No colored squares. | none (design note, not page copy) | do not print builder notes. The shipped share line stays the existing plain line from `pulse.ts` `shareText` |
| other cards | crossword / A mini crossword from this week's lessons. / not started | crossword / coming soon | closed |
| other cards | sort / Sort ten terms into the right groups. Three slips and the round ends. / not started | sudoku / fill every row, column and box with the numbers one through nine. / not started | default 8 |
| other cards | word path / Trace hidden words through the letters. / done · 6 of 6 words | word path / trace the theme words through a board of letters. / [status from PlayStatus] | status words come from PlayStatus ("done", "not started") |
| page notes (not on board, keep) | | for now these are sample puzzles with everyday words. | `play.astro` sample note stays (CLAUDE.md rule 5 and 7) |

## /play/pillo (Pillo, PilloDone)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| title | pillo (image wordmark) | pillo (existing PilloTitle) | same |
| help button | aria "How to play" | "how to play" | lowercase |
| help heading | HOW TO PLAY | how to play | lowercase |
| help row 1 | ✓ Correct letter, correct position | ✓ filled: right letter, right spot | default 1 and the blister-pack wording (Games board). Also drops the green/yellow look |
| help row 2 | ● Correct letter, wrong position | • half: in the word, wrong spot | same |
| help row 3 | – Letter not in the word | × empty: not in the word | same; symbols are the board's own pack key |
| help note | Every tile also carries a symbol, so color is never the only clue. Words here are placeholders. | every letter also has a symbol, so color is never the only clue. for now the words are samples. | lowercase; "placeholders" becomes our word "samples" |
| keyboard | Q W E R T Y U I O P / A S D F G H J K L / ⌫ Z X C V B N M Enter | same keys, aria "delete" and "enter" | lowercase aria; letter keys stay capital by convention |
| result label | PILLO · [DATE] | pillo · [date] | lowercase; date generated |
| result big | 4 / 6 | [guesses used] / 6 | generated; "not solved" case: "not solved this time" (pulse.ts) |
| result sub | you found today's word. | you found today's word. | same; unsolved: "not solved this time." |
| result stat | today's word / [word] | today's word / [word] | same, shown only after play, never from the page source |
| result stat | guesses / 4 of 6 | guesses / [n] of 6 | same |
| share line | pillo · [date] · 4/6 · cueory.app | cueory pillo, [day]: solved in [n] of 6 | use the existing one-line share (`shareText`, `pulse.ts`); the board's line differs. Either is plain text; keep ours so tests and the one-line share rule stay as is. Needs Christian only if he wants the board's line |
| share buttons | share, copy, facebook, x, threads, reddit, whatsapp | share, copy | HOLD the five social links; ship the device share and copy only. default (lead, 18 Nov), Christian may change |
| share note | on a phone, share also opens instagram, tiktok and messages. a new pillo comes out tomorrow. | same | lowercase already; "instagram, tiktok" depends on the phone's share sheet, keep as written only if tested |
| close | aria "close and see the board" | same | same |
| dialog | aria "today's result" | same | same |
| print | aria "print this puzzle", title "print" | same | same |

## /play/sudoku (Sort, SudokuDone)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| title | sudoku | sudoku | same |
| tagline | NUMBER PUZZLE | number puzzle | lowercase |
| help heading | HOW TO PLAY | how to play | lowercase |
| help 1 | Fill every row, column and 3x3 box with the numbers 1 to 9, no repeats. | fill every row, column and 3x3 box with the numbers 1 to 9, no repeats. | lowercase |
| help 2 | Tap a square, then tap a number or type one. Arrow keys move between squares. | tap a square, then tap a number or type one. arrow keys move between squares. | lowercase |
| help 3 | Tap x to leave your own mark on a square. | tap x to leave your own mark on a square. | lowercase |
| help 4 | Tick hints to show the possible numbers in every empty square. | tick hints to show the possible numbers in every empty square. | lowercase |
| help 5 | The clock shows time elapsed, and error counts wrong numbers. There is no time limit. | the clock shows time elapsed, and error counts wrong numbers. there is no time limit. | lowercase |
| help 6 | Tap the pause button next to the time to pause. The squares fill with x until you resume. | tap the pause button next to the time to pause. the squares fill with x until you resume. | lowercase |
| help 7 | Tap the printer button above the board to print a clean copy. | tap the printer button above the board to print a clean copy. | lowercase |
| status bar | time: 00:00 / error: 0 | same | same |
| level control | easy, medium, hard | easy, medium, hard | same; shipped game has the same three levels (games.ts: "choose a level") |
| pause | aria pause / resume | same | same |
| pad | 1-9, x | same | same |
| hints | hints | hints | same |
| settings button | settings | settings | same |
| settings title | settings | settings | same |
| setting | dark mode / ignore your device setting and always use dark mode. | same | the theme switch exists (footer); wording already lowercase |
| setting | light mode / ignore your device setting and always use light mode. | same | same |
| section label | GAMEBOARD SETTINGS | gameboard settings | lowercase |
| settings rows | check guesses when entered; start in auto candidate mode; show error counter; show timer; highlight conflicts; highlight row and column; highlight box; highlight identical numbers; play sound on solve | same | already lowercase. Builders: only ship a setting that works. HOLD the sound row (not shipped). default (lead, 18 Nov), Christian may change |
| close | aria "close settings" | same | same |
| result label | SUDOKU · MEDIUM · [DATE] | sudoku · medium · [date] | lowercase |
| result big | solved | solved | same |
| result sub | every row, column and box is complete. | same | same |
| result stats | time / [time], errors / 0 | same | generated |
| share line | sudoku · [date] · medium · [time] · 0 errors · cueory.app | the existing sudoku share line from `src/islands/` | keep what ships; not changed by this deck |
| share note | on a phone, share also opens instagram, tiktok and messages. a new sudoku comes out tomorrow. | same | same |

## /play/word-path (WordPath, WordPathDone)

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| title | word path | word path | same |
| tagline | LETTER PATH GAME | letter path game | lowercase |
| help 1 | Tap letters that touch to build a path, across, down or diagonal. | find every word in the list. words run up, down, left or right. | verbatim from `gamehelpcontent.ts` ('suture-search'). The board's diagonal path is wrong for the shipped game: words run straight, never diagonally (suture.ts). Builders must draw straight paths |
| help 2 | Submit when the path spells a word on the list. | tap a word's first letter, then its last letter. tap the first letter again to start over. | verbatim from `gamehelpcontent.ts`. There is no submit step: the pick is checked as soon as the last letter is tapped |
| help 3 | Found words are ticked off. | on a keyboard, arrows move, enter or space picks, and escape clears. | verbatim from `gamehelpcontent.ts`. Found-word ticking is behaviour, not help text; the page already shows the word list (aria "words to find") |
| help 4 | Tap the last letter again to undo a step. | (drop) | no undo step exists; tapping the first letter again clears the pick (covered by help 2) |
| help 5 | Tap the printer button above the board to print a clean copy. | tap the printer button above the board to print a clean copy. | lowercase. Keep only if the print button ships on the page; it is not in the verbatim help text |
| theme card | CUE OF THE DAY / [theme of today's words] | [the day's theme from the puzzle file] | `SutureGame.tsx` shows the theme alone as a heading (data-testid suture-theme); the "cue of the day" label is new, lowercase if Christian wants it. Theme text comes from `/content`, never typed in the page |
| print list | WORDS TO FIND / NURSE, [word two] (5 letters) ... | words to find / [from the puzzle file] | existing `words to find` label (SutureGame.tsx); "NURSE" and all words are samples, never hardcoded. The "(5 letters)" hints are not in the shipped list: omit |
| result | (no Done card text beyond the shared structure) | share line from `shareLine` in `suture.ts`: "cueory word path, [date]: found [n] of [total] words with [m] wrong picks." The rest of the result card reuses the shared pattern (label "word path · [date]", note "a new word path comes out tomorrow.") | the shipped share line wins. Result strings other than the share line are still drafting, confirm in P4 |

## /support (Message board + support.astro)

The renderings have no board for the tip page. /support ships as is (approved D-94 wording). The Message board is the
contact page; default 5 keeps it email-only.

| Route | Section | Rendering text | Ship | Reason / source |
|---|---|---|---|---|
| /message | breadcrumb | / message us | / message us | same (message.astro) |
| /message | h1 | tell us what to fix. | tell us what to fix. | same |
| /message | intro | Something broken, confusing or missing? An idea that would help? We read every message. | something broken, confusing or missing? an idea that would help? email us and we will read it. | lowercase. "we read every message" is a promise Christian can keep or not; wording stays soft. The page's own intro is a placeholder awaiting Christian ([Christian writes this]); this is a proposal. Needs Christian |
| /message | form labels (what's this about?, which page?, your message, email, send message) | none: no form. Use the existing blocks "message form: coming soon", "the message form isn't open yet. for now, please email us directly." and "flag or comment on a page" | default 5 |
| /message | select options | none | no form |
| /message | note | Please don't include any patient information. | the existing `PATIENT_INFO_WARNING` string | reuse; it must stay on the page |
| /message | field hints | paste the link; what happened, or what you'd like to see; you@example.com | none | no form |

## /about (About)

Default 6: only true claims. The page today holds `[Christian writes this]` placeholders and is noindex.

| Section | Rendering text | Ship | Reason / source |
|---|---|---|---|
| breadcrumb | / about us | / about us | same |
| eyebrow | by nursing students, for nursing students | by nursing students, for nursing students | KEEP: Christian's motto. default (lead, 18 Nov), Christian may change |
| h1 | we know nursing school is hard. | we know nursing school is hard. | use this About heading. default (lead, 18 Nov), Christian may change |
| story | [Christian's story: why Cueory exists, in his own words.] | [Christian writes this] | only Christian writes it |
| our mission h2 | our mission | our mission | same |
| mission text | To make studying for nursing school simpler, and to give nursing students the materials they need to succeed and become great nurses at an affordable price. | to make studying for nursing school simpler. / to give nursing students the materials they need to succeed and become great nurses at an affordable price. | approved mission lines in `support.astro` (D-94), lowercase |
| lessons h2 | how we make our lessons | how we make our lessons | same (about.astro) |
| bullet 1 | Every lesson is researched and cites its sources. | hold (not shipped) | rule 5. `site.ts` contentNotice says "content may not have citations or licensed-nurse review". Not true for every lesson (default (lead, 18 Nov), Christian may change) |
| bullet 2 | Higher-risk topics wait for a nurse reviewer before they go live. | hold (not shipped) | default 6: no "reviewed by" claim until a reviewer exists (default (lead, 18 Nov), Christian may change) |
| bullet 3 | Spot a mistake? The flag button is on every page, and we fix it. | spot a mistake? the flag button is on every page. | the flag exists on game pages and lessons ("flag or comment"); "we fix it" is a promise, so cut. Verify the button is on every public page before shipping "every page" (otherwise "on every lesson and game") |
| coming h2 | what's coming | what's coming | same |
| coming text | Mental Health I and Med Math are next, then Med-Surg II. | mental health and med math are next, then med-surg ii. | KEEP the order (Christian's stated plan); lowercase. default (lead, 18 Nov), Christian may change |
| coming link | join the mailing list | get launch updates | SignupForm wording, link to /#signup |
| support aria | Support our mission | support our mission | lowercase |
| support h2 | help keep cueory free. | help keep cueory free. | same (about.astro) |
| support text | Support our mission to expand our resources, help nursing students struggling in class, and keep building ways we can help students and nurses. | your support helps us maintain the domain, keep the website available, and build more lessons. | approved support wording (D-94) |
| support button | support on Ko-fi ↗ | support our mission | existing label on about.astro; Ko-fi stays lowercase "ko-fi" wherever named |

## Needs Christian (carried to the PR)

Defaults below are "default (lead, 18 Nov), Christian may change":
1. KEEP the motto "by nursing students, for nursing students" (home, about).
2. HOLD "adhd friendly" and the About research, sources and reviewer bullets.
3. KEEP "mental health and med math are next"; About h1 is "we know nursing school is hard."
4. HOLD the social share buttons (facebook, x, threads, reddit, whatsapp) and the solve sound.
5. DROP the three support-modal cards, plus the "work with us" card, the "every donation goes back" line and the "we never see your card" note.
7. Course blurbs on the board describe content (not clinical facts) but are his words to approve.
