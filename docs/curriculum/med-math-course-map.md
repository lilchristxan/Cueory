# Med math course map

Status: draft skeleton for Christian's review. Nothing here is teaching content.

## 1. Purpose, scope and the rule

This is the plan for Cueory's nursing math course: which units, modules and lessons exist, what a student should be
able to do after each, and how each skill is practised and tested. It follows the module path in
`docs/design/module-mastery-path.md` and the adaptive rules in `docs/design/adaptive-learning.md`.

- **Scope.** Adult and geriatric nursing only for now. Children and newborns are left out until Christian says
  otherwise.
- **Disclaimer line (shown on every page of the course).** Not medical advice. Still developing. Please support us.
  Exact wording and placement are Christian's to approve.
- **Course shape (Christian's order).** Unit 1 conversions, then unit 2 programming infusions, then unit 3 ICU-level
  math. A cross-cutting strand, spotting an unsafe order, runs alongside all three.

**The rule, in plain words.** This repository is public. It must never hold a clinical fact. So this file has no
conversion factors, no equivalences, no formulas with numbers, no drug names, no doses, no rates, no ranges, no drop
factors, no worked examples with real values and no "safe" or "unsafe" limits. Every one of those comes only from
Christian's reviewed content batches and lives in the private content store and the database. Where a value or example
would go, this file says `[from Christian's reviewed batch]`. Objectives are written as skills ("converts between two
units of mass using the factor from the reviewed table"), never as facts. Anything doubtful is left out and listed in
section 7.

Ids use the prefix `MMU1`, `MMU2`, `MMU3` and `MMS` so they cannot clash with the Draft 4 block ids in the crosswalk
(for example `MM1-L03`). See question 1 in section 7.

## 2. Course outline

- 3 units plus 1 strand, 18 modules, 56 lessons, 94 objectives.
- Id scheme: unit `MMU1`, module `MMU1-M01`, lesson `MMU1-M01-L01`, objective `MMU1-M01-O01`.
- The same lesson list is in `med-math-course-map.csv`. Every lesson starts as `planned`.
- Titles are skill names. Ids never change once published; new lessons go at the end of a module.
- **Public label and machine id.** The ids above are the stable public labels. The adaptive content schema (module
  content, PR #1283) accepts only lowercase letters, digits and single dashes, so the machine id is the public label
  in lowercase, with nothing else changed. Example: `MMU1-M01-O01` becomes `mmu1-m01-o01` in the `lo` field, and
  `MMU1-M01-L01` becomes `mmu1-m01-l01` as the lesson id. The rule is one-to-one in both directions, so authors write
  the label and the batch tool lowercases it. Anchor ids are authored in the machine form directly (for example
  `mmu1-m01-l01-a01`, following the same rule).

| unit | modules | lessons | objectives |
| --- | --- | --- | --- |
| MMU1 conversions | 6 | 19 | 33 |
| MMU2 programming infusions | 5 | 16 | 24 |
| MMU3 ICU-level math | 4 | 12 | 22 |
| MMS spotting an unsafe order | 3 | 9 | 15 |

## 3. Units, modules, lessons and objectives

Every objective is a skill statement. Level is one of remember, understand, apply, analyze, evaluate. The practice
techniques are the ones that fit the level (flashcards, label it, matching, fill in the blank, learning questions,
case questions). Evidence is what the student's answers show; it is recorded as right or wrong only.

Teaching text, tables, values and worked examples for every lesson below: `[from Christian's reviewed batch]`.

### MMU1: Conversions

#### MMU1-M01: Reading orders and labels

Lessons:

- `MMU1-M01-L01` Parts of a medication order
- `MMU1-M01-L02` Parts of a medication label
- `MMU1-M01-L03` Abbreviations and units written safely

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU1-M01-O01 | L01 | Names each part of a medication order on a sample order | remember | label it, flashcards | right or wrong on recall items |
| MMU1-M01-O02 | L01 | Explains what each part of the order tells the nurse to do | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU1-M01-O03 | L02 | Finds the strength, amount and form on a sample label | remember | label it, matching | right or wrong on recall items |
| MMU1-M01-O04 | L02 | Explains how the label and the order are read together | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU1-M01-O05 | L03 | Recognizes the abbreviations and unit symbols from the reviewed list | remember | flashcards, matching | right or wrong on recall items |
| MMU1-M01-O06 | L03 | Explains why some written forms are avoided, using the reviewed list | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |

#### MMU1-M02: Units and measurement systems

Lessons:

- `MMU1-M02-L01` The units nurses use
- `MMU1-M02-L02` Prefixes and what they tell you
- `MMU1-M02-L03` Other measuring systems

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU1-M02-O01 | L01 | Names the units used for mass, volume and length from the reviewed table | remember | flashcards, matching | right or wrong on recall items |
| MMU1-M02-O02 | L02 | Matches each prefix to its meaning using the reviewed table | remember | matching, flashcards | right or wrong on recall items |
| MMU1-M02-O03 | L02 | Explains how a prefix changes the size of a unit | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU1-M02-O04 | L03 | Recognizes household and other systems named in the reviewed table | remember | flashcards, matching | right or wrong on recall items |
| MMU1-M02-O05 | L03 | Explains when each system is likely to appear | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |

#### MMU1-M03: Converting between units

Lessons:

- `MMU1-M03-L01` Setting up a conversion
- `MMU1-M03-L02` Converting inside one system
- `MMU1-M03-L03` Converting across systems
- `MMU1-M03-L04` Checking a conversion

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU1-M03-O01 | L01 | Sets up a conversion as a chain of fractions so units cancel | apply | learning questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M03-O02 | L01 | Explains why the units must cancel | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU1-M03-O03 | L02 | Converts between two units of mass using the factor from the reviewed table | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M03-O04 | L02 | Converts between two units of volume using the factor from the reviewed table | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M03-O05 | L03 | Converts between two systems using the factor from the reviewed table | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M03-O06 | L04 | Judges whether a converted answer is the right size | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMU1-M03-O07 | L04 | Finds the step where a conversion went wrong | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |

#### MMU1-M04: Decimals and rounding

Lessons:

- `MMU1-M04-L01` Writing decimals safely
- `MMU1-M04-L02` Rounding rules
- `MMU1-M04-L03` Estimating first

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU1-M04-O01 | L01 | Reads and writes decimals the way the reviewed policy requires | understand | fill in the blank, matching | right or wrong on matching and blank items |
| MMU1-M04-O02 | L01 | Explains the risk of a misread decimal | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU1-M04-O03 | L02 | Rounds an answer to the place the reviewed policy requires | apply | learning questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M04-O04 | L03 | Estimates an answer before calculating to catch a slip | apply | learning questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M04-O05 | L03 | Compares the estimate with the final answer and explains any gap | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |

#### MMU1-M05: Calculating doses from orders

Lessons:

- `MMU1-M05-L01` Dose from order and label
- `MMU1-M05-L02` Tablets and oral liquids
- `MMU1-M05-L03` Injectable amounts
- `MMU1-M05-L04` Multi-step dose problems

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU1-M05-O01 | L01 | Sets up the dose calculation using the method from the reviewed batch | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M05-O02 | L01 | Explains what each quantity in the setup stands for | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU1-M05-O03 | L02 | Calculates the amount to give for a solid oral form | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M05-O04 | L02 | Calculates the amount to give for an oral liquid | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M05-O05 | L03 | Calculates the amount to draw up for an injectable | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M05-O06 | L04 | Chains a conversion and a dose calculation in one problem | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M05-O07 | L04 | Finds the step where a multi-step answer went wrong | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |

#### MMU1-M06: Time and schedules

Lessons:

- `MMU1-M06-L01` The 24-hour clock
- `MMU1-M06-L02` Frequency and daily totals

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU1-M06-O01 | L01 | Converts between clock styles | apply | fill in the blank, learning questions | right or wrong on worked questions, answer entered by the student |
| MMU1-M06-O02 | L02 | Reads an order frequency and states how often it is given | understand | matching, fill in the blank | right or wrong on matching and blank items |
| MMU1-M06-O03 | L02 | Works out the total in a day from an order | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |

### MMU2: Programming infusions

#### MMU2-M01: Infusion basics

Lessons:

- `MMU2-M01-L01` Kinds of infusion and equipment
- `MMU2-M01-L02` Reading an infusion order
- `MMU2-M01-L03` Reading the bag label and pump screen

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU2-M01-O01 | L01 | Names the kinds of infusion and the equipment each uses | remember | flashcards, label it, matching | right or wrong on recall items |
| MMU2-M01-O02 | L02 | Names each part of an infusion order on a sample order | remember | label it | right or wrong on recall items |
| MMU2-M01-O03 | L02 | Explains what each part tells the nurse to set up | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU2-M01-O04 | L03 | Finds the volume, contents and strength on a sample bag label | remember | label it | right or wrong on recall items |
| MMU2-M01-O05 | L03 | Finds each setting on a sample pump screen | remember | label it | right or wrong on recall items |

#### MMU2-M02: Pump rates

Lessons:

- `MMU2-M02-L01` Volume over time to a pump rate
- `MMU2-M02-L02` Time to finish
- `MMU2-M02-L03` Checking the pump against the order

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU2-M02-O01 | L01 | Calculates a pump rate from a volume and a time using the method from the reviewed batch | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU2-M02-O02 | L02 | Calculates how long an infusion runs from its volume and rate | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU2-M02-O03 | L02 | Explains why the answer needs checking against the clock | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU2-M02-O04 | L03 | Compares pump settings with the order and states whether they match | analyze | case questions | right or wrong on cases: finds where the order or work goes wrong |

#### MMU2-M03: Gravity drip rates

Lessons:

- `MMU2-M03-L01` The drop factor on the set
- `MMU2-M03-L02` Drops per minute
- `MMU2-M03-L03` Adjusting a running drip

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU2-M03-O01 | L01 | Finds the drop factor on a sample set package | remember | label it, flashcards | right or wrong on recall items |
| MMU2-M03-O02 | L02 | Calculates a drip rate using the method from the reviewed batch | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU2-M03-O03 | L02 | Counts and compares a drip against the calculated rate | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU2-M03-O04 | L03 | Works out the change needed when a drip is running ahead or behind | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |

#### MMU2-M04: Intermittent and piggyback infusions

Lessons:

- `MMU2-M04-L01` Reading the preparation and run instructions
- `MMU2-M04-L02` Rates for timed small volumes
- `MMU2-M04-L03` Tracking what has run and what remains

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU2-M04-O01 | L01 | Finds the dilution and run-time instructions in the reviewed reference | remember | matching, label it | right or wrong on recall items |
| MMU2-M04-O02 | L01 | Explains how the instructions affect the rate | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU2-M04-O03 | L02 | Calculates the rate for a timed small-volume infusion | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU2-M04-O04 | L03 | Tracks volume infused and volume remaining over a shift | apply | learning questions | right or wrong on worked questions, answer entered by the student |

#### MMU2-M05: Concentration and weight-based dosing

Lessons:

- `MMU2-M05-L01` Concentration from the label
- `MMU2-M05-L02` Weight-based dose to pump rate
- `MMU2-M05-L03` Pump rate back to dose
- `MMU2-M05-L04` Which weight, and in what unit

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU2-M05-O01 | L01 | Reads the concentration of a premixed or prepared bag | remember | label it | right or wrong on recall items |
| MMU2-M05-O02 | L01 | Explains how concentration links dose to volume | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU2-M05-O03 | L02 | Converts a weight-based dose to a pump rate using the method from the reviewed batch | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU2-M05-O04 | L03 | Works backward from a running rate to the dose delivered | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU2-M05-O05 | L03 | Compares the delivered dose with the order and explains any gap | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMU2-M05-O06 | L04 | States which patient weight the order uses, following the reviewed policy | understand | fill in the blank, matching | right or wrong on matching and blank items |
| MMU2-M05-O07 | L04 | Converts the weight to the unit the order needs | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |

### MMU3: ICU-level math

#### MMU3-M01: Titrated infusions

Lessons:

- `MMU3-M01-L01` Reading a titration order
- `MMU3-M01-L02` Stepwise rate changes
- `MMU3-M01-L03` Dose per time unit and per weight

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU3-M01-O01 | L01 | Names the parts of a titration order: starting amount, step, limit and target | remember | label it, matching | right or wrong on recall items |
| MMU3-M01-O02 | L01 | Explains how each part limits what the nurse may change | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU3-M01-O03 | L02 | Calculates a new rate after one step of a titration | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU3-M01-O04 | L02 | Records each step so the next nurse can follow it | understand | fill in the blank | right or wrong on matching and blank items |
| MMU3-M01-O05 | L03 | Converts between dose per time units using the factor from the reviewed table | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU3-M01-O06 | L03 | Converts between dose with weight and dose without weight | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |

#### MMU3-M02: Multi-step and mixed-unit problems

Lessons:

- `MMU3-M02-L01` Chaining conversions with a rate
- `MMU3-M02-L02` When the bag strength changes
- `MMU3-M02-L03` Checking with a second method

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU3-M02-O01 | L01 | Chains several conversions with a rate in one setup | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU3-M02-O02 | L01 | Finds the step where a long calculation went wrong | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMU3-M02-O03 | L02 | Recalculates a rate when the available concentration differs from the order | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU3-M02-O04 | L02 | Judges whether the new rate matches the intent of the order | evaluate | case questions | right or wrong on cases: decides what to do and why |
| MMU3-M02-O05 | L03 | Solves the same problem by a second method and compares | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMU3-M02-O06 | L03 | Decides which answer to trust and why | evaluate | case questions | right or wrong on cases: decides what to do and why |

#### MMU3-M03: Pump limits and safety systems

Lessons:

- `MMU3-M03-L01` Drug library and limits
- `MMU3-M03-L02` Responding to a pump alert
- `MMU3-M03-L03` Independent double check

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU3-M03-O01 | L01 | Explains what a drug library and its limits are for | understand | matching, fill in the blank | right or wrong on matching and blank items |
| MMU3-M03-O02 | L02 | Names the steps to take when a pump alerts, per the reviewed procedure | remember | flashcards, matching | right or wrong on recall items |
| MMU3-M03-O03 | L02 | Decides the next step in a sample alert case | evaluate | case questions | right or wrong on cases: decides what to do and why |
| MMU3-M03-O04 | L03 | Explains what an independent double check is and is not | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMU3-M03-O05 | L03 | Judges whether a sample double check was truly independent | evaluate | case questions | right or wrong on cases: decides what to do and why |

#### MMU3-M04: Fluid balance math

Lessons:

- `MMU3-M04-L01` Totals for intake and output
- `MMU3-M04-L02` Hourly goals and shortfalls
- `MMU3-M04-L03` Weight change and fluid

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMU3-M04-O01 | L01 | Adds intake and output from several sources into running totals | apply | learning questions | right or wrong on worked questions, answer entered by the student |
| MMU3-M04-O02 | L02 | Works out an hourly goal and the shortfall at a point in the shift | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU3-M04-O03 | L02 | Explains when a shortfall should be reported | evaluate | case questions | right or wrong on cases: decides what to do and why |
| MMU3-M04-O04 | L03 | Converts a weight change to a fluid amount using the reviewed table | apply | learning questions, case questions | right or wrong on worked questions, answer entered by the student |
| MMU3-M04-O05 | L03 | Analyzes whether the totals and the weight change tell the same story | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |

### MMS: Spotting an unsafe order (cross-cutting strand)

#### MMS-M01: Checks before giving

Lessons:

- `MMS-M01-L01` The order is complete
- `MMS-M01-L02` Order, label and record agree
- `MMS-M01-L03` Order against the reviewed reference

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMS-M01-O01 | L01 | Finds a missing or unclear part in a sample order | analyze | case questions | right or wrong on cases: finds where the order or work goes wrong |
| MMS-M01-O02 | L02 | Compares an order, a label and a record and finds a mismatch | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMS-M01-O03 | L03 | Compares an order with the reviewed reference limits and states whether it falls outside | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMS-M01-O04 | L03 | Decides whether to give, hold or clarify | evaluate | case questions | right or wrong on cases: decides what to do and why |

#### MMS-M02: Does the answer make sense

Lessons:

- `MMS-M02-L01` Reasonableness checks
- `MMS-M02-L02` Spotting a calculation slip
- `MMS-M02-L03` Spotting a unit mix-up

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMS-M02-O01 | L01 | Judges whether a calculated amount is plausible for the order | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMS-M02-O02 | L02 | Finds a slip in a worked calculation | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMS-M02-O03 | L02 | Explains how the slip would change what the patient receives | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMS-M02-O04 | L03 | Finds a unit mix-up in an order or a calculation | analyze | case questions, learning questions | right or wrong on cases: finds where the order or work goes wrong |
| MMS-M02-O05 | L03 | Decides what to do about it | evaluate | case questions | right or wrong on cases: decides what to do and why |

#### MMS-M03: What to do about it

Lessons:

- `MMS-M03-L01` Clarify before acting
- `MMS-M03-L02` Chain of command and escalation
- `MMS-M03-L03` Documenting and reporting

| objective | lesson | skill | level | practice techniques | evidence |
| --- | --- | --- | --- | --- | --- |
| MMS-M03-O01 | L01 | States what to clarify and with whom, per the reviewed policy | understand | fill in the blank, matching | right or wrong on matching and blank items |
| MMS-M03-O02 | L01 | Decides whether to hold the medication in a sample case | evaluate | case questions | right or wrong on cases: decides what to do and why |
| MMS-M03-O03 | L02 | Describes the escalation path when an order stays unclear | understand | fill in the blank, matching, learning questions | right or wrong on matching and blank items |
| MMS-M03-O04 | L02 | Chooses the right next step in a sample case | evaluate | case questions | right or wrong on cases: decides what to do and why |
| MMS-M03-O05 | L03 | Describes what to document and report after a concern | understand | fill in the blank | right or wrong on matching and blank items |
| MMS-M03-O06 | L03 | Evaluates a sample note for what is missing | evaluate | case questions | right or wrong on cases: decides what to do and why |


## 4. The module path applied to this course

Stages follow `module-mastery-path.md` and issue #1281. They are recommendations, never locks. The module exam is
always open.

1. **Input.** One video and one reading per lesson, each cut into anchors (a video time range or a reading section id).
   Both come from reviewed scripts and tables: `[from Christian's reviewed batch]`.
2. **Active practice round.** One round of each technique the module has. Remember objectives use flashcards, label it
   and matching. Understand objectives use fill in the blank, matching and learning questions. Apply objectives use
   learning questions. Label it works on sample orders, labels, pump screens and drip sets, using labeled sample
   images only. Learning questions are account-only (see section 5, accounts).
3. **Diagnostic quiz.** One item per objective at the understand or apply thinking level, as the objective carries.
   Difficulty is a separate setting from thinking level. Each objective's item starts at difficulty 2, and a correct
   answer opens one follow-up at difficulty 3, following the existing level-test rule. The quiz sets each objective's
   starting status. If an objective has no item for the diagnostic, the module shows "diagnostic coverage missing" and
   names the objective. It is never skipped quietly. Objectives at analyze or evaluate are covered in the deeper round.
4. **Adaptive practice.** Chosen by the engine, weakest foundations first, with a reason shown for each item.
5. **Readiness rule.** The "ready for the practice test" recommendation needs sufficient evidence at both understand
   and apply for every objective, as defined in the module path. No objective is exempt, and no application evidence
   means no ready. When that evidence cannot be assessed yet (for example the objective has no apply item, or too few
   responses), the module shows "cannot be assessed yet", names the objective, and the student can still open the
   exam. The rule is a starting value (question 9).
6. **Optional deeper round.** Analyze and evaluate items, mostly cases about unsafe orders: find the mismatch, find the
   slip, decide to give, hold or clarify, and explain why. Every case is written and reviewed by Christian:
   `[from Christian's reviewed batch]`.
7. **Module exam.** The module practice exam. Starting blueprint per objective: 1 item at remember, 1 at understand,
   2 at apply, 1 at analyze, 1 at evaluate, for the levels the objective carries. Exam items are fresh: never reused
   from practice, the diagnostic or the deeper round. The exam shows the number right and a status per objective, never
   a score prediction.

**Item plan carried by every item (authoring columns).** Every item carries: the targeted objective id (`lo`, in the lowercase machine form from section 2), the
thinking level (`bloom`), the difficulty (`level`, 1 to 3), the technique, and the anchor (the video time range or
reading section id that teaches it). Thinking level and difficulty are two columns and are never merged. A gap links
the student back to the anchor. Missing anchor, missing diagnostic item or an item pointing to a missing objective
should fail the content check.

**Item pool each objective needs (starting values).** The brief warns when an objective has fewer than 3 unused items
for the practice exam, so the pool must leave at least 3 fresh exam items per objective after the other stages. That
is about 3 for the active round, 2 for the diagnostic, 4 for adaptive practice, 2 for the deeper round and at least 3
fresh for the exam. These are starting values and can change after the simulation.

**Numbers are always practice values.** Sample items in the repo are labeled samples with no real clinical values. Real
numbers live only in the private store and the database, and the browser never receives answer keys (CLAUDE.md rule 1).

## 5. Unit tests and the course picture

- **Unit test.** One test per unit, built from the module exams' objectives but with its own fresh items (never reused
  from any module). Blueprint: 1 or 2 items per objective, weighted toward apply and above. A unit test is recommended
  once the unit's modules have reached the module exam stage, and is never locked.
- **Strand check.** The unsafe-order strand is also tested inside each unit test as a set of cases, so the skill is
  checked where the math happens.
- **Module roll-up.** Each module page shows, per thinking level, how many objectives are shown, learning or not
  started, and the list to strengthen. Words, icons and evidence counts, never color alone.
- **Course roll-up.** The course page shows how many modules are at each stage and, per thinking level (understanding,
  application, analysis, evaluation), objectives shown out of all objectives in the course, plus the next module to
  open. These four tier totals cannot supply real-world application.
- **Real-world application.** This is a separate dimension: a reviewed cumulative-case set where each case draws on
  objectives from at least two modules (and, where it fits, the unsafe-order strand). Coverage and evidence are
  deduplicated separately. Coverage: an objective is covered once, however many approved cases exercise it. Evidence:
  each distinct approved case is its own response, so two different cases on the same objective are one covered
  objective and two responses; replaying the same response is still one response. Repeated practice and a later miss
  are never hidden: the latest response always counts. Until the set exists, the course page shows "case set not
  built yet" for this dimension. Course readiness requires this dimension as well as every module, so a course can
  never be marked ready while the set is missing. All cases are `[from Christian's reviewed batch]`.
- **Never a score.** Every roll-up is a count and a status word. Never a score, never a prediction of an exam or a
  chance of passing (D-36).
- **Accounts.** Learning questions are graded question-bank checks reserved for confirmed accounts (D-86, D-130), and
  so are the diagnostic, adaptive practice, deeper round, exams and roll-ups. Guests keep the video and reading and
  continue the other permitted practice methods (flashcards, label it, fill in the blank, matching) without signing in.

## 6. Content needed from Christian

Nothing below is supplied here. Each row is what must arrive as a reviewed batch before the module can be built. Each
module also needs its video script, reading, and the item pool described in section 4.

| module | reviewed tables and values needed | worked examples needed |
| --- | --- | --- |
| MMU1-M01 Reading orders and labels | the parts of an order and a label as your program teaches them; the list of abbreviations and unit symbols to teach and to avoid | labeled sample orders and labels `[from Christian's reviewed batch]` |
| MMU1-M02 Units and measurement systems | the unit table; the prefix table; the other systems you want taught | none beyond table items |
| MMU1-M03 Converting between units | the conversion table to be used, and which factors students must memorize versus look up | sets of conversions in a stated order of difficulty |
| MMU1-M04 Decimals and rounding | your written-number policy and your rounding policy | items showing each policy rule |
| MMU1-M05 Calculating doses from orders | the dose calculation method you teach | tablet, liquid, injectable and multi-step problems |
| MMU1-M06 Time and schedules | the frequency abbreviations and the clock convention to teach | schedule and daily-total problems |
| MMU2-M01 Infusion basics | the equipment names and the order and bag label parts | sample orders, bag labels and pump screens |
| MMU2-M02 Pump rates | the rate method you teach | rate and time-to-finish problems |
| MMU2-M03 Gravity drip rates | the drop factor information and the method you teach | drip rate problems and running-drip adjustment cases |
| MMU2-M04 Intermittent and piggyback infusions | the preparation and run instructions reference | timed small-volume and tracking problems |
| MMU2-M05 Concentration and weight-based dosing | the concentration method, the weight-based method, and your policy on which weight to use | forward and backward problems |
| MMU3-M01 Titrated infusions | the titration order format and the method for stepwise changes | step-by-step titration cases |
| MMU3-M02 Multi-step and mixed-unit problems | the dose-per-time and per-weight conversion tables | long chained problems and a second-method key |
| MMU3-M03 Pump limits and safety systems | the safety-system explanations and the alert procedure to teach | alert cases and double-check cases |
| MMU3-M04 Fluid balance math | the intake and output method and the reference for weight and fluid | shift-length totals and goal cases |
| MMS-M01 Checks before giving | the reference limits students may compare against, and which reference they should use | cases with a complete order, a missing part, a mismatch, an outside-limit order |
| MMS-M02 Does the answer make sense | your reasonableness approach | cases with slips and unit mix-ups |
| MMS-M03 What to do about it | the clarify, escalation and documentation steps you teach | cases with the right and wrong next steps |

## 7. Questions for Christian

**Unresolved rows in `CROSSWALK.md` for U00-T07 (not answered here).**

1. U00-T07-L01 "dimensional analysis" is mapped to Draft 4 `MM1-L03` (retain). Do you want this course's ids
   (`MMU1`, `MMU2`, `MMU3`, `MMS`) to replace the `MM1` block ids, or should the crosswalk keep `MM1` and map into this
   course? The ids here avoid the clash until you choose.
2. U00-T07-L02 "IV drip rates and infusion pumps": unresolved. Does it map to MMU2 (programming infusions), and as a
   retain, split or merge?
3. U00-T07-L03 "weight-based dosing": unresolved. Does it map to MMU2-M05, MMU3-M01, or both?
4. U00-T07-L04 "high-alert medications": unresolved. Is this a lesson in this course, a thread in the unsafe-order
   strand, or a pharmacology topic that stays outside the math course?
5. U00-T07-L05 "rights of medication administration": unresolved. Is it a lesson here (the strand), or does it stay in
   foundations?

**Prerequisite decisions.**

6. Must students finish MMU1 before MMU2, and MMU2 before MMU3, or are these recommendations only (module path default)?
7. Should the strand's modules open at any time, or after MMU1-M03?
8. Which content should sit before this course (for example basic arithmetic, or a short check on fractions and
   decimals)? Do you want a small placement check?
9. Strand objectives mostly sit at analyze or evaluate, so the readiness rule would show "cannot be assessed yet" for them. Do you want some understand and apply objectives and items added to the strand modules?
10. Is high-alert medication content part of the reviewed batches for MMU3, and who is the qualified reviewer?
    Dosing and first-action content waits for a qualified reviewer under the content review policy.

**Tools and presentation.**

11. Are calculators assumed? If yes: which kind, and should the course teach with one, without one, or both? (This
    changes the item design.)
12. Do you want the order of units and modules above, or a different order inside a unit?
13. Is adult and geriatric only right for the first release, and when do children come in?
14. Is the disclaimer wording and placement right (every page, or on the course home and each exam)?
15. How many practice sets per module feel right? The set sizes and blueprint counts in sections 4 and 5 are starting
    values only.
16. Do you want this course's modules to share items with other courses (for example fluids and electrolytes), or keep
    separate pools?
17. Which module pairs should the cumulative cases span first, and how many cases are enough before the course can be called ready?
