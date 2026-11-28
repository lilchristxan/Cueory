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

For each concept at each level the engine keeps only right and wrong counts and the last six results. A level is
**shown** when the last two answers there are right and the smoothed share right across the recent answers is at least
70%. So two right in a row from a fresh start counts, one lucky answer does not, and a miss puts the level back to
**learning** until the student recovers. Old misses fade as new answers replace them.

These numbers (two, six, 70%) are Cueory's unverified starting values, to be tuned with the simulation and real use.

## The diagnostic and calibration

The quiz after practice is ordinary evidence, recorded the same way as any answer. Calibration then reads it: each
concept starts adaptive practice at the lowest level it has not shown. A concept the quiz did not reach starts at
remember. A student who shows every concept through apply on the quiz goes straight to "ready".

## Choosing the next step

1. Rank concepts by the level they are working on, lowest first: foundations before application.
2. Within a level, a concept whose last answer was a miss goes first; then module order.
3. Pick an item for that concept and level that was not just shown, preferring ones unused this session.
4. Use the best-fitting technique, but never the same technique more than twice in a row when another fits.
5. Tell the student why: "you missed this recently", "not practised yet", "one more to lock it in" or "next level up".

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

## What is built, and what is next

Built in this change (pure rules with unit tests, no screen yet):

- `src/islands/adaptive-learning/module-path.ts`: stages, levels, "shown", calibration, next step, module and course
  summaries.
- `src/islands/adaptive-learning/momentum.ts`: sets, moments, the break suggestion, the streak and the daily goal.

Next, in order:

1. A simulation of the whole path over synthetic students (how many steps to ready, how often the technique changes,
   whether anyone gets stuck), like the one in adaptive-learning.md.
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
