# Adaptive learning for Cueory

Task 4b adds an explainable practice queue and a short unit check. Review mode already schedules spaced practice, and the existing adaptive and level-test rules already choose question difficulty. Keep those rules available while the new engine is tested. Tell students why they are seeing an item, such as “due for review” or “you missed this concept recently.” The engine estimates recall of specific material and never shows an exam score or a chance of passing (D-36).

## What the device remembers

- Per card, keep its deck-scoped ID and content revision, when it was last answered, a small measure of memory strength called a half-life, and a count of successful reviews on separate days. Use only the right or wrong result. The engine needs neither the student's answer nor the question text.
- Per concept, keep correct and missed counts, the latest result and its date. Question difficulty still follows the existing rule of moving up after two correct at the current level and down after a miss. Keep item skill and concept evidence separate. Knowing one card teaches us little about the rest of a concept.
- Use compact on-device progress. An absent or invalid record starts fresh for that item. A content revision invalidates old card evidence. Local persistence is a separate change and must use the existing progress export and deletion boundary before shipping.

## How answers change predicted recall

Use [Settles and Meeder's half-life model](https://aclanthology.org/P16-1174/), where recall is estimated as two raised to the power of minus elapsed time divided by half-life. After one half-life passes, the estimate is one half. Cueory uses the equation with fixed, readable rules rather than fitting the paper's regression. A card starts with a three-day half-life. A correct answer on a later calendar day increases it by 60%. A miss halves it and resets its spaced-success count. Repeating a correct answer the same day refreshes the last answer time without increasing the strength or earning additional spaced credit. Bound the half-life between one and 120 days. These are unverified Cueory starting values.

## When a card comes back

Space reviews using the relationship between delay and retention tested by [Cepeda and colleagues](https://doi.org/10.1111/j.1467-9280.2008.02209.x). Use the first whole local-calendar interval that brings predicted recall to or below 80%, with a one-day minimum and a 14-day maximum in this pilot. A missed card is due tomorrow. Keep the existing 1, 3, 7 and 14 day Review ladder as the baseline for comparison (Task 4 and D-87); keep account review rows on that ladder. The 80% target and caps are unverified product defaults.

If a future exam is set, bring long intervals forward to at most the day before it, while leaving at least one day between scheduled reviews. If no day remains between the answer and the exam, keep the ordinary due date rather than scheduling an extra exam session. After that date, normal intervals resume. Enforce the same practice-session limit near the exam and leave work visible if too many cards are due. A calendar-day input keeps time-zone changes and daylight-saving shifts out of the date rules. The design does not assume a student's exam timetable records when they are available to study.

## Which item comes next

Take first the oldest due review. Then consider the least secure studied concepts, with a recent miss ahead of ties, then new material. At the requested difficulty, prefer untried items and use the existing easier-first tie rule when a level is absent. Starting with success and failure counts for concept ranking is inspired by [Pavlik, Cen and Koedinger's Performance Factors Analysis](https://pact.cs.cmu.edu/koedinger/pubs/AIED%202009%20final%20Pavlik%20Cen%20Keodinger%20corrected.pdf). Cueory uses those counts in a transparent ordering, with no fitted coefficients. The ordering and a 20-item session cap are unverified defaults.

Pass in today's calendar day and an explicit clock reading. The caller also supplies randomness for genuine ties. Exclude the previous item before ranking, and end with a short explanation if no eligible item remains. An item can reappear after another item. Cap the number of selections, including revisits. Keep the queue local to the current session and avoid pulling in future reviews just to fill it.

## What a unit check can tell a student

Keep [the existing level-test rule](../../src/islands/leveltest.ts). Give each concept a first question at level 2, or an available neighboring level, before any follow-up. A correct first answer can open one unused level 3 question. A miss, no remaining eligible question, or a second answer finishes that concept. Stop when there is no eligible question left. Show the actual result, the difficulty tested, and open gaps such as “one question answered” or “harder question unavailable.”

For quantifying uncertainty in the small sample, use [Wilson's score interval](https://doi.org/10.1080/01621459.1927.10502953) as a descriptive range alongside the number right and number asked. Questions vary in difficulty and the second depends on the first, so the interval's nominal coverage is unverified for this design. Do not label it a measurement of the student's ability or show it as a percentage on their study screen. Surface the existing status words with an icon and a short evidence note. Keep unit-check evidence distinct from spaced mastery.

## What mastered means

In spaced practice, call a card mastered only after two correct reviews on separate days after introduction, with a current recall estimate of at least 80%. A miss resets the streak and falling recall can put a card back into review. A concept qualifies only with that evidence across at least two distinct cards, with every currently studied card for that concept meeting the threshold. If a deck has too little evidence, show that explicitly. This is Cueory's unverified operational definition, informed by the spaced retrieval model above and distinct from Learn mode's current-session meaning of “mastered.”

## Validation and release boundaries

- Unit and seeded property tests cover clock boundaries, missing items, very small decks, no immediate repeats, the session cap and the effect of a correct answer on the next interval.
- A reproducible simulation compares the engine with the existing review ladder over thousands of synthetic runs. Use simulated recall curves independent of the engine, and a separate fixed-gap recall probe. Report recall, work per calendar day, and time to the mastery rule including the share that never reaches it. See the initial synthetic results below. Simulation is a check of behavior under assumptions and says nothing about actual student outcomes.
- A hidden, non-indexed preview on the locked staging site may use the existing labeled sample deck. Keep it behind the same preview pruning rules as other draft routes. The first study-mode connection is default-off and must pass the built-answer-keys guard. The preview may use public flashcard backs. Reviewed bank items still depend on server-side checking and return only the allowed result to the engine, per D-33 and D-86.
- The engine imports no browser or network code. No database change or new dependency is needed for the standalone pilot. Account sync and using the reviewed bank stay separate from the pilot.

## Initial simulation

2,000 fixed synthetic student seeds per scheduler, each with 24 cards over 45 calendar days. The schedules share the same simulated attendance, daily cap and response draws. Their simulated memory strengthens according to a separate model that uses the time since the previous answer. The recall column is the mean probability on a shared follow-up day, seven days after the 45-day study period ends. For each card, the calculation includes all the time since that card's last practice. Workload includes first answers and reviews, averaged over every calendar day.

| Scheduler | Modeled recall at the 7-day follow-up | Answers per day | Days to first whole-deck mastery, among those who reached it | Never observed at whole-deck mastery by day 45 |
| --- | ---: | ---: | ---: | ---: |
| Adaptive | 90.14% | 5.70 | 24.15 | 26.00% |
| Existing ladder | 83.11% | 4.63 | No observations | 100.00% |

Both groups use the same Cueory mastery rule for this measurement. Requiring all cards to meet the 80% recall threshold at once favors schedules that review more frequently. The table illustrates that trade-off and cannot establish better learning or predict an exam result. These runs use no exam date; the calendar and exam rules have separate tests.

To reproduce once the engine branch lands, use the installed dependencies:

```sh
mkdir -p work/adaptive
./node_modules/.bin/esbuild scripts/simulate-adaptive-learning.ts --bundle --platform=node --outfile=work/adaptive/simulation.cjs
node work/adaptive/simulation.cjs
```

## Progress log

- `task-adaptive/design` (#1256) — proposed model, release boundaries and research references.
- `task-adaptive/engine` (#1257) — pure engine, module tests and fixed-seed simulation.
- `task-adaptive/progress` (#1258) — versioned on-device study progress and migration.

## Staging trial approval

Christian approved trying the 20-item session cap and the proposed spaced mastery rule on staging. The storage and release decisions below are separate.

## Needs Christian

- Should the exam plan include an optional lighter day before the exam? The pilot uses its usual session cap.
- If signed-in sync becomes necessary, decide what state should be shared between devices and whether the existing review rows can represent it. A new storage field, policy, or export or privacy change needs a separate approved design. The pilot needs none of these.
- Whether to enable the first default-off integration after trying the labeled sample deck remains a separate release decision.
