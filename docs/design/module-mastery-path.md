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

Sufficient and strong both count as shown for readiness. Six ordinary right answers (learning questions, weight 1)
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
how forgetting an item shows (see Retention). Callers should always pass the item id; an answer without one cannot be
told apart from a repeat and is treated as a new item.

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

### Retention (brief; replaces a fixed number of days)

Retention stays with the memory model in `memory.ts`. Each answered item has a card memory at the supplied clock.
When the average predicted recall of a level's cards falls under 80% (brief), the level **drops one status** until it
is reviewed, and the next step is a review: it picks a card already answered at that level, the most faded first, and
says "due for review". Averaging over the level's cards is an unverified reading of "an LO's cards fall below 80%".
Only where a level has no card memory (answers recorded without an item id) a fixed fallback applies: a newest
direct answer more than 14 days old drops one status (unverified).

### Interleaving (brief)

When the next step would be the same concept for a third time in a row, another concept that needs work goes first.

## The diagnostic and calibration

The quiz after practice is ordinary evidence, recorded the same way as any answer. Calibration then reads it: each
concept starts adaptive practice at the lowest level it has not shown. A concept the quiz did not reach starts at
remember. A student who shows every concept through apply on the quiz goes straight to "ready".

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
Each has a hidden true level per concept (none, remember, understand, apply), answers with probabilities that depend
on that level, the technique (recognition can be guessed) and a slip rate, learns a little from practice, forgets a
little over time and half of them take one long break; a day holds 10 steps. The path is a diagnostic of six items
per concept, then adaptive steps until "done" or the cap of 600. "Old" is the equal-weight rule that never forgets
(kept in the script only). The third column is the new rule with the retention drop switched off, to show which gate
holds students back. Every probability in the model is an unverified assumption, so read the table as a comparison,
not a measurement. Counts come with their denominators.

The table below is from 300 students, seed 7 (the first four rows are measured right after the diagnostic, before any
adaptive practice, so they say whether the diagnostic itself placed learners too high or too low; the "ready" row is
measured at the moment the path says done; the "final" rows after the finish).

| Measure (unverified model; levels or students counted) | Old rule | New rule | New rule, no retention drop |
| --- | ---: | ---: | ---: |
| After the diagnostic: placed shown, truly not mastered (too high) | 6.9% (175 of 2535) | 0 of 0 | 0 of 0 |
| After the diagnostic: placed developing or higher, truly not mastered | 28.9% (1185 of 4102) | 23.9% (902 of 3775) | 23.9% (902 of 3775) |
| After the diagnostic: truly mastered, not placed shown (too low) | 21.3% (638 of 2998) | 100.0% (2998 of 2998) | 100.0% (2998 of 2998) |
| After the diagnostic: truly mastered, placed at gap | 2.7% (81 of 2998) | 4.2% (125 of 2998) | 4.2% (125 of 2998) |
| During practice: level first marked shown, truly not mastered | 7.2% (373 of 5206) | 0.0% (0 of 1723) | 0.1% (4 of 3686) |
| At the moment of "ready": students with a level truly not mastered | 66.0% (132 of 200) | 0 of 0 | 8.3% (1 of 12) |
| Final: shown, truly not mastered | 13.3% (695 of 5206) | 0.2% (1 of 617) | 7.5% (276 of 3686) |
| Final: truly mastered, not shown (too low) | 0.2% (7 of 4518) | 82.4% (2883 of 3499) | 18.5% (774 of 4184) |
| Median steps to done (students who finished) | 99 | none | 242 |
| Never done within the cap | 33.3% (100 of 300) | 100.0% (300 of 300) | 96.0% (288 of 300) |
| Techniques met per student (mean) | 5.52 | 5.15 | 5.73 |


What it says, in words:

- The new rule is much more careful about calling a level shown: during practice almost no level is marked shown
  that the student has not mastered, and the old rule's students are called ready while a level is truly not
  mastered in two cases out of three.
- It is far too strict at these starting values. After the diagnostic no level is yet sufficient (six items per
  concept cannot reach the 0.70 lower bound), so the diagnostic can only separate gap from developing. Over 600
  steps no simulated student reached done at all, and with the retention drop off only 4% did. The two gates that
  hold students back are the lower bound of 0.70 combined with half-weight flashcards and matching (many answers),
  and the retention drop (a card answered once has a 3-day half-life, so a level is below 80% recall the day after
  it was practised, which keeps the readiness gate from ever holding for all levels at once).
- These are Christian's and the brief's starting values, not the engine's final ones. Tuning candidates: a lower
  bound near 0.60 for sufficient, fewer evidence units for matching, or reading the 80% line over the cards still
  being reviewed. Each needs his say, because the brief fixes them.

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

## Needs Christian

- **Database change.** Storing module evidence for signed-in students needs new tables and policies, which is his to
  approve. Nothing here touches the database yet.
- **Privacy page.** The streak and module evidence are study progress, already named on `/privacy`; any new wording is
  his to approve.
- **Content tags.** Each module batch needs concept, thinking level and technique on every item.
- **Wording of the moments.** The short lines shown at a clean set, a comeback and "good place to stop".
- **The numbers.** Sets of five, four sets before a break, two rest days a week: say if any feel wrong on staging.
