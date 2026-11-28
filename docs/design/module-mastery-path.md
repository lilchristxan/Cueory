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
going until they are advanced. So the engine does not just count answers; it weighs them. For each concept at each
level it keeps the last six answers, each with how much it shows and the day it was given. Every number below is an
**unverified starting value**, to be tuned with the simulation and real use.

A level is **shown** when all of these hold:

- the last two answers there are right (one lucky answer never counts);
- the right answers in the last six add up to at least 2 points of evidence;
- the smoothed, weighted share right across the last six is at least 70%.

If a level was shown but the newest answer there is more than 14 days old, it becomes **review due** (see
Staleness). Otherwise it is **learning** (or **not started**). Old misses fade as new answers replace them.

### How much one answer shows (unverified)

| Technique | Kind | Points per right answer |
| --- | --- | ---: |
| flashcards (self-recall) | production | 1.0 |
| label it (typed) | production | 1.0 |
| fill in the blank | production | 1.0 |
| matching | recognition | 0.5 |
| learning questions | recognition | 0.6 |
| case questions | worked case | 1.5 |

Reason: pulling an answer out of memory shows more than picking it from choices on screen, and applying it in a case
shows most. In words: two flashcards in a row are enough; matching needs four right in a row; two right cases are
plenty, but one never is. A miss counts at the technique's full points.

### Guessing (unverified)

A right answer on a recognition item (matching, learning questions) is scaled by how hard it is to guess. With four
options, the assumed default, it counts in full. With three options it counts 89%, and with two options 67%. More than
four options never counts extra. Items can state their option count; if they do not, four is assumed.

### Slips (unverified)

If a student gets one answer wrong right after four or more right in a row, that miss is called a **slip**. It still
drops the level to learning, because the last two answers must be right, but it counts as half a miss, so two right
answers afterwards bring the level back. A real run of misses, or a miss early on, needs more right answers to
recover.

### Staleness (unverified)

Each answer carries the calendar day it was given. When a shown level's newest answer is more than 14 days old, the
level becomes **review due**. Review due is not "ready": the module drops back to adaptive practice, and the next
step puts due review ahead of new material, with the reason "due for review". One right answer on the review shows
the level again; a miss makes it learning. This keeps the loop re-locating the student instead of trusting old
evidence forever.

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

`scripts/simulate-module-path.ts` runs 2,000 synthetic students (6 sample concepts each, seed 7, step cap 150). Each
has a hidden true level per concept (none, remember, understand, apply), answers with probabilities that depend on
that level, the technique (recognition can be guessed) and a slip rate, learns a little from practice, forgets a
little over time and half of them take one long break. The path is a diagnostic of six items per concept, then
adaptive steps until "done" or the cap. "Old" is the equal-weight rule that never forgets (kept in the script only).
Every probability in the model is an unverified assumption, so read the table as a comparison, not a measurement.

| Measure (unverified model) | Old rule | New rule |
| --- | ---: | ---: |
| Marked shown, truly not mastered (placed too high) | 5.5% | 3.6% |
| Shown at the finish, truly not mastered | 9.6% | 4.6% |
| Truly mastered, not shown at the finish (placed too low) | 2.1% | 6.6% |
| Median steps to done (students who finished) | 87 | 109 |
| Never done within the cap | 50.1% | 43.3% |
| Techniques met per student (mean) | 5.63 | 5.93 |

In words: the new rule trusts a level less often when it should not (and catches forgetting after a break), at the
price of asking for more evidence, so mastered levels are sometimes held back and finishing takes more steps. Whether
that trade is right is Christian's call once real students use it. Run it with esbuild and Node, as for
`simulate-adaptive-learning.ts`.

## What is built, and what is next

Built in this change (pure rules with unit tests, no screen yet):

- `src/islands/adaptive-learning/module-path.ts`: stages, levels, "shown" (weighted by technique, guess-aware,
  slip-aware, with review due), calibration, next step, module and course summaries.
- `scripts/simulate-module-path.ts`: the old-against-new simulation above.
- `src/islands/adaptive-learning/momentum.ts`: sets, moments, the break suggestion, the streak and the daily goal.

Next, in order:

1. Tune the unverified values above against real use.
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
