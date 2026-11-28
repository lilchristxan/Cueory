# The module path: from the video to the course picture

Christian, 2026-11-28: connect a module's video and reading (the input) to active practice, use the quiz after it as
the diagnostic, calibrate adaptive practice until the student is ready for a practice test, offer a deeper round of
analysis and evaluation, finish with the module exam, and roll every module up into the course. Make studying something
students want to come back to instead of burning out. Adaptive quizzing is for students with an account.

This builds on [adaptive-learning.md](adaptive-learning.md): that document's memory model decides *when a card comes
back*; this one decides *what a student does next inside a module* and *what the module and course pages can say*.
Everything is rule-based and explainable, and nothing predicts an exam score or a chance of passing (D-36).

## The path

| Stage | What the student does | What ends it |
| --- | --- | --- |
| 1. input | watches the video and reads the reading | both marked done |
| 2. practice | one round of each active technique the module has: flashcards, label it (image occlusion), matching, fill in the blank, learning questions | each technique finished once |
| 3. diagnostic | the quiz after practice: a few questions per concept across thinking levels | quiz finished |
| 4. adaptive | practice chosen for them, weakest foundations first | every concept shown at remember, understand and apply |
| 5. ready | the practice test is offered, with a choice: take it now, or go deeper first | their choice |
| 6. deeper (optional) | analysis and evaluation questions, mostly cases | every concept shown at analyze and evaluate |
| 7. exam | the module practice exam | exam finished |

Stages are recommendations, never locks (Christian, 2026-11-03): a student can open any part of a module at any time,
and what they do there still counts as evidence.

## Thinking levels

Every practice item carries one thinking level: **remember, understand, apply, analyze, evaluate**. "Real-world
application" is the apply level and above, asked through patient cases.

Each technique suits some levels better than others, and the engine only offers a technique where it fits:

| Level | Techniques, best fit first |
| --- | --- |
| remember | flashcards, label it, matching |
| understand | fill in the blank, matching, learning questions |
| apply | learning questions, case questions |
| analyze | case questions, learning questions |
| evaluate | case questions |

## What counts as "shown"

Christian's direction (2026-11-28): use every learning method to find where a student really is, and keep the loop
going until they are advanced. So the engine weighs evidence instead of counting answers. Where a number comes from
brief #1281 (section 2) it is marked **brief**; every other number is an **unverified** starting value, to be tuned
with the simulation and real use. Nothing here is ever shown to a student as a percentage (D-36): students see the
status word, an icon and the evidence count.

For each concept at each level the engine keeps the last 20 direct answers (unverified window) with how each was
given. It forms a belief that starts as Beta(1,1) and adds the weighted right answers and the weighted misses
(brief). The five **status words** (brief) are:

| Status | Rule |
| --- | --- |
| not started | nothing answered here yet |
| gap | not sufficient, and the belief's mean is under one half (unverified) |
| developing | not sufficient, mean at least one half |
| **sufficient** | all of: the 10th percentile of the belief is at least 0.70 (brief); at least 3 of direct weighted evidence (brief); at least one first-try right answer on an item not seen before, with no cue (brief); the last two direct answers right |
| strong | sufficient, and the 10th percentile is at least 0.80 (unverified) |

Sufficient and strong both count as shown. Readiness (brief section 3.5) needs **understand and apply** sufficient for every objective; remember stays available for practice and is never required for the gate. Six ordinary right answers (learning questions, weight 1)
reach sufficient and ten reach strong; flashcard flips need eleven and nineteen because each counts half.

### How much one answer shows

| Technique | Points per right answer | Source |
| --- | ---: | --- |
| flashcards (self-recall), matching | 0.5 | brief |
| label it, fill in the blank | 0.75 | brief |
| learning questions, diagnostic items | 1.0 | brief |
| practice exam items | 1.25 | brief |
| case questions | 1.25 | unverified (the brief has no case technique) |
| no technique given | 1.0 | unverified |

A cue halves a right answer (brief). A timeout counts as a miss (brief). A miss counts at the technique's full
points.

### Independent evidence

Each answer records the item, whether it was a first try on an item not seen before at that level, the format, and
whether a cue or timeout was involved. Answering the same item again adds nothing to the evidence in either direction:
two self-ratings of one flashcard never make a level sufficient. The repeat still feeds that card's memory, which is
how forgetting an item shows (see Retention). An answer without an item id cannot be told apart from a replay, so it is kept as history (it still counts in the
right and wrong totals) but contributes nothing to the belief, the first-try test or transfer. Callers must pass the item
id.

### Guessing (unverified)

A right answer on a recognition item (matching, learning questions) is scaled by how hard it is to guess. With four
options, the assumed default, it counts in full. With three options it counts 89%, and with two options 67%. More than
four options never counts extra. Items can state their option count.

### Slips (unverified)

If a student gets one answer wrong right after four or more right in a row, that miss is a **slip**. It still stops
the level being sufficient, because the last two answers must be right, but it counts as half a miss in the belief, so
a couple of right answers bring the level back. A real run of misses, or a miss early on, takes many more.

### Transfer (brief)

A right answer at a higher level gives every lower level of the same concept half of its weight as **transferred
credit**. It counts in the belief but is kept apart from direct evidence: it cannot supply the 3 units of direct
evidence, the first-try answer or the last two answers, so transferred credit alone can never make a level
sufficient and can never unlock the practice exam. A miss gives nothing downward, and a repeated item gives no
credit. Only the latest 6 transferred records are kept (unverified), so credit cannot crowd out direct evidence.

### Retention (brief, calibrated; replaces a fixed number of days)

Retention stays with the memory model in `memory.ts` and the scheduler in `scheduler.ts`; neither is changed. Each
answered item has a card memory. A card is **overdue** when the scheduler's review day for it (`reviewDue`) has
passed: that is the day its predicted recall reached the 80% line (brief), so an overdue card has crossed it and was
not reviewed in time. A card studied yesterday is not overdue yet. This matters: a first right answer has a 3-day
half-life, which is 79.4% recall after 24 hours, one hair under 80%, so judging raw recall revoked every level the day
after it was shown. When **all** the level's cards are overdue (FADE_SHARE = 1, unverified, from the sweep below) the
level **drops one status** until it is reviewed, and the next step is a review: a card already answered at that level,
the most faded first, with the reason "due for review". A level that is still shown after the drop (strong falling to
sufficient) is still offered for review: readiness and review priority are separate.

A failed or timed-out review never refreshes a card: its clock stays put, its half-life halves and it stays overdue
until a later success, so a wrong review cannot restore readiness. Event order is tracked apart from that retention
anchor (the newest event time per item): an event older than the newest one for the item, success or failure, is
ignored for retention, so a late-arriving old success cannot erase a newer failure. It is still counted as an answer
and takes the newest day seen, and a device clock that goes backward never aborts the call.

Overdue cards stay eligible for review even while the tier-lowering policy is being trialled, so one successful review
never hides failed ones. They are reviewed ahead of new material when the tier was lowered; otherwise they come back
when the remaining work has nothing to offer, and on "done" as an optional `reviewDue` list that never blocks "done"
(blocking made the simulated path unfinishable). Outside a review, only items not yet answered at that level are
offered: a repeat carries no weight, so when none are left the answer is "no content" and names the level
(`exhausted`), instead of looping on "one more to lock it in".

### Interleaving (brief)

When the next step would be the same concept for a third time in a row, another concept that needs work goes first.

## The diagnostic and calibration

The quiz after practice is ordinary evidence at full diagnostic weight (1.0, brief). The authored policy (brief
section 3.3, course map section 4) is one understand item per objective at difficulty 2, with one follow-up after a
right answer: 6 to 12 items for six objectives. Calibration reads it: each concept starts adaptive practice at the
lowest gate level it has not shown.

**What the diagnostic can and cannot establish.** It sets a *starting status* (gap or developing) for each objective.
It cannot make a level sufficient: that takes about six direct right answers per level, and the brief allows at most
two diagnostic items per objective. The brief's numbers cannot all hold at once: "sufficient needs a 0.70 lower bound
and 3 evidence units" against "the diagnostic is one item and one follow-up" means a prepared student could never
skip adaptive practice.

**Optional departure (for Christian's decision): the fast track, off by default.** The default follows the brief:
"ready" needs every objective sufficient at understand and apply, and a diagnostic cannot give that. The fast track is
a named option on the module (`diagnosticFastTrack`), not a default. When on: if, in every objective, both gate levels
have a first-try right diagnostic answer, nothing was missed, and nothing is overdue, the practice test is recommended
without adaptive practice (the practice exam is never locked either way). The status words stay honest (they still
say developing). To cover both gate levels in 12 items, the follow-up climbs from understand to apply instead of from
difficulty 2 to difficulty 3 at the same tier. A student who answers everything right with a slip rate of 8% passes
about 37% of the time, so most prepared students still do some adaptive practice. A diagnostic of about 36 items would
make the skip unnecessary but is too long.

## Choosing the next step

0. Review that is due comes first.
1. Rank concepts by the level they are working on, lowest first: foundations before application.
2. Within a level, a concept whose last answer was a miss goes first; then module order.
3. Pick an item for that concept and level that was not just shown, preferring ones unused this session.
4. Use the best-fitting technique, but never the same technique more than twice in a row when another fits.
5. Tell the student why: "you missed this recently", "not practised yet", "one more to lock it in", "next level up" or "due for review".

When every concept is shown at the ready levels the engine answers "done" and the student is ready. If concepts are
still learning but the module has no item to offer for them (too little content, or its only item was just shown), it
answers "no content" and names them; that is never treated as ready. The 20-item session cap and spaced review from
adaptive-learning.md still apply around this.

## What the pages can say

- **Module page:** the stage, and per thinking level how many concepts are shown, learning or not started, plus the
  list of concepts to strengthen. Words and icons, never color alone, never a percentage score.
- **Course page:** how many modules are at each stage; per thinking level, concepts shown out of all concepts in the
  course; and the next module to open. This is the course-level picture of understanding, analysis, evaluation and
  application. It is a count of what has been shown, never a predicted grade.

## Wanting to come back

Christian asked for studying that pulls students back instead of burning them out. The design rewards real progress
and gives honest stopping points. It does not use tricks that work against the student.

What it does:

- **Short sets.** Practice comes in sets of five with a small finish line each time, so there is always a win close by.
- **Wins tied to what they did.** A clean set, a comeback on something missed earlier, a level shown on a concept,
  and "ready for the practice test" are each marked. Nothing is awarded at random.
- **Variety.** Techniques rotate, so a sitting never feels like one long drill.
- **Visible progress.** The concept map fills in; the course picture grows.
- **A forgiving streak.** It counts days studied and absorbs two rest days in any week. A missed day costs nothing.
- **A finishable daily goal.** One set on day one, growing slowly, never more than four sets.
- **A good place to stop.** After four sets, or when results slide two sets in a row (a sign of tiredness), the page
  says this is a good place to stop and shows what comes back tomorrow. Stopping on a win is what brings people back.

What it will not do: no countdown pressure outside tachyyy mode, no "you will lose your streak" warnings, no guilt
notifications, no hiding how much is left, no rewards for time spent instead of things learned, no public shaming
on leaderboards. These raise short-term use and cause the burnout Christian wants to avoid.

## Accounts

Adaptive quizzing (stages 3 to 7 and the course picture) is for signed-in students. Guests keep the video, reading
and the active techniques, with an invitation to make an account at the diagnostic. Signed-in means the evidence must
live in the database, checked on the server (D-33, D-86): the browser never receives answer keys, and the engine
receives only right or wrong.

## What each content item must carry

For the engine to work, every item in a module batch needs: a module id, a concept id, a thinking level, and a
technique. Christian's Excel template gets those four columns. Concept names, questions, answers and rationales come
only from his reviewed batches; this repository holds labeled samples only.

## Simulation: old rule against new rule

`scripts/simulate-module-path.ts` runs synthetic students (6 sample concepts each, 12 items per technique and level).
20% are prepared (every concept truly mastered at the start); the rest have a hidden true level per concept (remember,
understand, apply; everyone has done the input stage, so nobody starts below remember). They answer with probabilities that depend on that level, the technique (recognition can
be guessed) and a slip rate of 8%, learn a little from practice, forget a little over time, and half of them take one
long break; a day holds 10 steps. The path is the authored diagnostic above (about 10 items, the same for every rule),
then adaptive steps until "done" or the cap of 600. "Old" is the equal-weight rule that never forgets, with no fast
track (kept in the script only). The new rule is shown with the fast track off (the default) and on (opt-in). Every
probability in the model is an unverified assumption, so read the table as a comparison. Counts come with their
denominators. The first four rows are measured right after the diagnostic, before any adaptive practice; the "ready"
row at the moment the path says done; the "final" rows after the finish. Three different groups are reported
separately: students **prepared at the start**, students who **mastered everything by exit**, and the **learners among
those who acquired mastery during practice** (not mastered at the end of the diagnostic, mastered at exit).

<!-- simulation:start -->
300 synthetic students, 6 concepts, step cap 600, seed 7

| Measure (unverified model; levels or students counted) | Old rule | New rule (default, fast track off) | New rule, fast track on |
| --- | ---: | ---: | ---: |
| After the diagnostic: placed shown, truly not mastered (too high) | 0 of 0 | 0 of 0 | 0 of 0 |
| After the diagnostic: placed developing or higher, truly not mastered | 18.0% (376 of 2094) | 18.0% (376 of 2094) | 18.0% (376 of 2094) |
| After the diagnostic: truly mastered, not placed shown (too low) | 100.0% (1995 of 1995) | 100.0% (1995 of 1995) | 100.0% (1995 of 1995) |
| After the diagnostic: truly mastered, placed at gap | 13.9% (277 of 1995) | 13.9% (277 of 1995) | 13.9% (277 of 1995) |
| During practice: level first marked shown, truly not mastered | 9.2% (324 of 3507) | 0.0% (0 of 2546) | 0.0% (0 of 2184) |
| At the moment of "ready": students with a level truly not mastered | 49.4% (117 of 237) | 11.3% (9 of 80) | 10.3% (9 of 87) |
| Final: shown, truly not mastered | 14.1% (493 of 3507) | 1.5% (34 of 2219) | 1.8% (33 of 1870) |
| Final: truly mastered, not shown (too low) | 0.0% (1 of 3015) | 30.5% (961 of 3146) | 41.7% (1312 of 3149) |
| Prepared students (all mastered) ready from the diagnostic alone | 0.0% (0 of 64) | 0.0% (0 of 64) | 48.4% (31 of 64) |
| Prepared students who reach done within the cap | 100.0% (64 of 64) | 81.3% (52 of 64) | 92.2% (59 of 64) |
| Mastered every gate level at exit (of all students) | 40.0% (120 of 300) | 40.7% (122 of 300) | 41.3% (124 of 300) |
|   of those, declared done | 100.0% (120 of 120) | 58.2% (71 of 122) | 62.9% (78 of 124) |
|   of those who had not mastered everything after the diagnostic (acquired during practice), declared done | 100.0% (57 of 57) | 33.8% (22 of 65) | 32.8% (21 of 64) |
| Ready from the diagnostic alone, but a level not mastered | 0 of 0 | 0 of 0 | 3.1% (1 of 32) |
| Diagnostic items asked per student (mean) | 10.2 | 10.2 | 10.2 |
| Median steps to done (students who finished) | 69 | 429 | 357 |
| Never done | 21.0% (63 of 300) | 73.3% (220 of 300) | 71.0% (213 of 300) |
|   because the step cap was reached | 21.0% (63 of 300) | 73.3% (220 of 300) | 71.0% (213 of 300) |
|   because no content remained | 0.0% (0 of 300) | 0.0% (0 of 300) | 0.0% (0 of 300) |
| Techniques met per student (mean) | 3.99 | 3.94 | 3.51 |

Across seeds 13, 31, 67, 109, 173, 257, 383 (300 students each, default rule, fast track off):

| Measure | Count |
| --- | ---: |
| Declared ready but below criterion | 62 of 516 |
| Never reached done | 1584 of 2100 (cap reached 1584 of 2100, no content remained 0 of 2100) |
| Mastered at exit and declared done | 454 of 864 |
| Gained mastery after the diagnostic and declared done | 146 of 493 |
<!-- simulation:end -->

The block above is generated: `scripts/simulate-module-path.ts` prints it, and its `--check` option fails if this
doc has drifted (run it with the pinned Node from `.node-version`). Node 22 and Node 24 print the same block: the one operation that
differed between them was `2 **` with a fractional exponent in `memory.ts` (V8's power function changed its last digits),
so `predictedRecall` now uses `Math.exp`, which is identical on both. A unit test checks the block's labels and percentages.

**Finding: the adaptive path has no remember-level step.** The picker offers only the gate levels (understand, apply), so a
student who truly knows nothing about a concept cannot learn it from adaptive practice, and an earlier version of the
model that started students at "none" could never finish for them (188 of 300 students had such a concept). The product
does have the video and reading input stage before practice, so the model now gives every student at least "remember"
after it and does not invent a remember step. Effect on seed 7, new rule, fast track off: students who mastered
everything by exit rose from 78 to 122 and declared done fell from 76.9% to 58.2%; falsely ready at done went from
5 of 65 (7.7%) to 9 of 80 (11.3%); never done went from 78.3% to 73.3%. The earlier headline numbers were flattered by a
small, mostly pre-prepared population of finishers. Whether a student at "none" should get a remember-level step is a
product decision for Christian.

**Targets and result** (300 students, seed 7, UNVERIFIED model; fast track off unless stated):

| Target | Result |
| --- | --- |
| A prepared student can be ready from the diagnostic | only with the opt-in: 31 of 64 prepared (48%); the engine test covers the perfect path |
| Most students who truly master the material reach done | 71 of 122 (58.2%) who mastered everything by exit; 52 of 64 (81.3%) of the prepared group; 22 of 65 (33.8%) of those who had not mastered everything after the diagnostic but did by exit |
| Falsely ready at the moment of done stays low | 9 of 80 (11.3%); old rule 117 of 237 (49.4%) |
| Final shown-but-not-mastered well below the old rule's | 1.5% (34 of 2219); old rule 14.1% |

The 33.8% for learners who acquire mastery during practice is the weak point: they learn partway through, and the
evidence and retention gates take time to catch up with them. The 73% "never done" students are mostly students who
have not mastered some concept by the cap. Every one of the 220 stopped because the step cap was reached; none stopped because content ran out (the synthetic module has 12 items per technique and level), so the next tuning trial can attribute never-done to the gates, not to missing items.

Across seven other seeds the picture is the same: 62 of 516 declared ready were below criterion, 1584 of 2100 never reached done, 454 of 864 who mastered everything by exit were declared done, and 146 of 493 who gained mastery after the diagnostic were declared done.

**Sweep behind the retention numbers** (an earlier design: new rule only, 120 students, cap 400; prepared students who
reach done / falsely ready at done / final shown-but-not-mastered). Judging only scheduler-overdue cards, and fading a
level only when all its cards are overdue, met the targets while keeping the brief's 0.70 lower bound; the table is
kept as the evidence for that choice (the later findings changed review eligibility, not the fade share).

| Fade share | Lower bound | Grace days | Prepared done | Falsely ready | Final too high |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5 | 0.70 | 0 | 10 of 23 | 0 of 10 | 0 of 130 |
| 0.5 | 0.60 | 0 | 16 of 23 | 0 of 17 | 3 of 299 |
| 0.75 | 0.70 | 0 | 11 of 23 | 1 of 11 | 3 of 200 |
| 0.75 | 0.60 | 1 | 23 of 23 | 1 of 29 | 4 of 444 |
| **1.0** | **0.70** | **0** | **20 of 23** | **1 of 23** | **6 of 488** |
| 1.0 | 0.60 | 0 | 22 of 23 | 2 of 30 | 13 of 595 |

## What is built, and what is next

Built in this change (pure rules with unit tests, no screen yet):

- `src/islands/adaptive-learning/module-path.ts`: stages, levels, "shown" (weighted by technique, guess-aware,
  slip-aware, with review due), calibration, next step, module and course summaries.
- `scripts/simulate-module-path.ts`: the old-against-new simulation above.
- `src/islands/adaptive-learning/momentum.ts`: sets, moments, the break suggestion, the streak and the daily goal.

Next, in order:

1. Tune the starting values above against real use; the simulation says the brief's defaults are slow to reach ready.
2. A hidden sample preview on locked staging that walks one labeled sample module through all seven stages.
3. The content columns in the Excel template and the seed-file check.
4. Database tables for module evidence and the course rollup, with row-level security, export and delete.
5. The module page and course page.

## Departures from brief #1281, for Christian's decision

All unverified, all chosen as the smallest change that meets the targets above. Everything not listed uses the brief's
numbers (0.70 lower bound, 3 direct evidence units, a first-try right answer, weights 0.5 / 0.75 / 1.0 / 1.25, cue
halves, timeout is a miss, transfer 0.5, five status words, understand and apply for readiness).

1. **Retention judged on the scheduler.** A level fades only when all of its cards are past the scheduler's review day
   (brief: "an LO's cards fall below 80% recall"). Raw recall revoked levels the day after they were shown.
2. **Diagnostic follow-up climbs a tier** (understand, then apply) instead of difficulty 3 at the same tier (course map
   section 4), so one short diagnostic touches both gate levels.
3. **Diagnostic fast track, optional and off by default** (`diagnosticFastTrack`). A perfect diagnostic recommends the
   practice test without adaptive practice, because the brief's diagnostic cannot reach "sufficient" on its own. The
   practice exam stays open regardless. Turn it on only if you want it.
4. **Other starting values the brief does not fix:** window of 20 answers, "strong" at a 0.80 lower bound, "gap" under
   a posterior mean of one half, case questions 1.25, transfer window of 6, guess scaling by option count, slip rule.

## Needs Christian

- **Database change.** Storing module evidence for signed-in students needs new tables and policies, which is his to
  approve. Nothing here touches the database yet.
- **Privacy page.** The streak and module evidence are study progress, already named on `/privacy`; any new wording is
  his to approve.
- **Content tags.** Each module batch needs concept, thinking level and technique on every item.
- **Wording of the moments.** The short lines shown at a clean set, a comeback and "good place to stop".
- **The numbers.** Sets of five, four sets before a break, two rest days a week: say if any feel wrong on staging.
