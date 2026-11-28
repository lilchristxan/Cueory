/**
 * Simulation of the module path over synthetic students. Run with the existing esbuild binary and Node, or import
 * `simulate` (the unit test does). All ids and outcomes are synthetic: no content, questions or answer keys.
 *
 * Every probability below is an UNVERIFIED modelling assumption, chosen to be plausible, not measured.
 * Each student has a hidden TRUE level per concept (0 = none, 1 = remember, 2 = understand, 3 = apply). The path runs
 * a diagnostic, then adaptive steps until "done" or the step cap. Two rules are compared on the same students:
 *   - old: every answer counts equally and nothing is ever forgotten (the baseline, kept here only);
 *   - new: weighted by technique, guess-aware, slip-aware, with review due (the rule in module-path.ts).
 */
import { calendarDay, DAY_MS, dayNumber, type StudyClock } from '../src/islands/adaptive-learning/calendar';
import {
  emptyProgress, levelStatus, nextStep, READY_LEVELS, recordModuleAnswer, RECOGNITION_TECHNIQUES, TECHNIQUES_FOR_LEVEL,
  type LevelEvidence, type ModuleItem, type ModuleProgress, type ModuleShape, type NextResult, type Technique, type ThinkingLevel,
} from '../src/islands/adaptive-learning/module-path';

export type RuleName = 'old' | 'new';

export interface SimulationOptions {
  students: number;
  seed: number;
}

export interface RuleReport {
  rule: RuleName;
  students: number;
  /** Levels first marked shown that the student truly had not mastered, as a share of all such marks. */
  placedTooHigh: number;
  /** Levels marked shown at the finish that the student truly has not mastered (forgotten or never learned). */
  shownButNotMasteredAtFinish: number;
  /** Truly mastered levels that are not shown at the finish, as a share of truly mastered levels. */
  placedTooLow: number;
  /** Median steps among students who reached "done". */
  medianStepsToDone: number | null;
  /** Share of students who never reached "done" within the cap. */
  neverDone: number;
  /** Mean number of different techniques a student met in the adaptive steps. */
  techniqueVariety: number;
}

// Unverified modelling assumptions.
export const CONCEPTS = 6;
export const STEP_CAP = 150;
export const STEPS_PER_DAY = 10;
const SLIP_RATE = 0.08; // a mastered level answered wrong anyway
const PRODUCTION_GUESS = 0.05;
const CASE_GUESS = 0.1;
const RECOGNITION_EXTRA = 0.05; // on top of 1 / options
const NEAR_BONUS = 0.15; // partly knowing the next level up
const LEARN_CHANCE = 0.12; // per answer at the level just above the true level
const FORGET_PER_DAY = 0.005; // chance per day that a concept slips down one level
const BREAK_CHANCE = 0.5; // share of students who take one long break
const OPTIONS_CYCLE = [3, 4, 4, 5];
const DIAGNOSTIC_PER_LEVEL = 2;

/** Small deterministic generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let word = state;
    word = Math.imul(word ^ (word >>> 15), word | 1);
    word ^= word + Math.imul(word ^ (word >>> 7), word | 61);
    return ((word ^ (word >>> 14)) >>> 0) / 2 ** 32;
  };
}

const conceptIds = Array.from({ length: CONCEPTS }, (_, index) => `sample-${String.fromCharCode(97 + index)}`);
export const SHAPE: ModuleShape = { concepts: conceptIds, practiceTechniques: [] };
export const ITEMS: readonly ModuleItem[] = conceptIds.flatMap((concept) =>
  READY_LEVELS.flatMap((level) => TECHNIQUES_FOR_LEVEL[level].flatMap((technique) =>
    [1, 2, 3].map((n) => ({ id: `${concept}:${level}:${technique}:${n}`, concept, level, technique })))));
const optionsOf = (id: string): number => OPTIONS_CYCLE[[...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % OPTIONS_CYCLE.length]!;

const levelNumber = (level: ThinkingLevel): number => READY_LEVELS.indexOf(level) + 1;

function chanceRight(trueLevel: number, level: ThinkingLevel, technique: Technique, options: number): number {
  const needed = levelNumber(level);
  if (trueLevel >= needed) return 1 - SLIP_RATE;
  const guess = RECOGNITION_TECHNIQUES.includes(technique)
    ? 1 / options + RECOGNITION_EXTRA
    : technique === 'case questions' ? CASE_GUESS : PRODUCTION_GUESS;
  return Math.min(0.95, guess + (trueLevel === needed - 1 ? NEAR_BONUS : 0));
}

/**
 * The baseline: the rule before this change. Every answer counts the same, the last two must be right, the
 * smoothed share over the last six must be 70%, and nothing is ever forgotten.
 */
export function baselineStatus(results: readonly boolean[]): 'not started' | 'learning' | 'shown' {
  if (results.length === 0) return 'not started';
  const recent = results.slice(-6);
  const share = (recent.filter(Boolean).length + 1) / (recent.length + 2);
  return recent.length >= 2 && recent.slice(-2).every(Boolean) && share >= 0.7 ? 'shown' : 'learning';
}

/** Shows the engine's own next-step picker what the baseline thinks, by building progress that says exactly that. */
function baselineProgress(results: ReadonlyMap<string, boolean[]>): ModuleProgress {
  let progress = emptyProgress();
  for (const [key, list] of results) {
    const [concept, level] = key.split('|') as [string, ThinkingLevel];
    const status = baselineStatus(list);
    const view = status === 'shown' ? [true, true] : status === 'learning' ? [list.at(-1) ?? true] : [];
    for (const correct of view) progress = recordModuleAnswer(progress, concept, level, correct);
  }
  return progress;
}

function clockFor(day: number, first: number): StudyClock {
  return { day: calendarDay(first + day), now: (first + day + 0.5) * DAY_MS };
}

interface StudentRun {
  stepsToDone: number | undefined;
  placedHigh: number;
  placedTotal: number;
  shownNotMastered: number;
  shownTotal: number;
  masteredNotShown: number;
  masteredTotal: number;
  techniques: number;
}

function runStudent(rule: RuleName, seed: number): StudentRun {
  const random = seededRandom(seed); // the same seed gives both rules the same student and the same luck stream
  const draw = seededRandom(seed ^ 0x9e3779b9);
  const first = dayNumber('2028-01-01');
  const trueLevel = new Map(conceptIds.map((concept) => [concept, Math.floor(random() * 4)]));
  const breakAt = random() < BREAK_CHANCE ? 3 + Math.floor(random() * 5) : -1;
  const breakDays = 20 + Math.floor(random() * 30);

  let progress = emptyProgress();
  const results = new Map<string, boolean[]>();
  let day = 0;
  const wasShown = new Set<string>();
  const run: StudentRun = { stepsToDone: undefined, placedHigh: 0, placedTotal: 0, shownNotMastered: 0, shownTotal: 0, masteredNotShown: 0, masteredTotal: 0, techniques: 0 };

  const isShown = (concept: string, level: ThinkingLevel, today: StudyClock): boolean => rule === 'new'
    ? levelStatus(progress.concepts.get(concept)?.[level], today) === 'shown'
    : baselineStatus(results.get(`${concept}|${level}`) ?? []) === 'shown';

  const ask = (item: ModuleItem): void => {
    const today = clockFor(day, first);
    const options = optionsOf(item.id);
    const level = trueLevel.get(item.concept)!;
    const correct = draw() < chanceRight(level, item.level, item.technique, options);
    if (rule === 'new') {
      progress = recordModuleAnswer(progress, item.concept, item.level, correct, { technique: item.technique, options, clock: today });
    } else {
      const key = `${item.concept}|${item.level}`;
      results.set(key, [...(results.get(key) ?? []), correct]);
    }
    // The student learns a little from every answer at the level just above what they truly know.
    if (levelNumber(item.level) === level + 1 && draw() < LEARN_CHANCE) trueLevel.set(item.concept, level + 1);
    // Judge the placement at the moment a level first becomes shown.
    const key = `${item.concept}|${item.level}`;
    if (!wasShown.has(key) && isShown(item.concept, item.level, today)) {
      wasShown.add(key);
      run.placedTotal += 1;
      if (trueLevel.get(item.concept)! < levelNumber(item.level)) run.placedHigh += 1;
    }
  };

  // Diagnostic: a few items per concept, across the ready levels, techniques taken in turn.
  for (const concept of conceptIds) {
    for (const level of READY_LEVELS) {
      const fitting = TECHNIQUES_FOR_LEVEL[level];
      for (let n = 0; n < DIAGNOSTIC_PER_LEVEL; n++) {
        const technique = fitting[(n + conceptIds.indexOf(concept)) % fitting.length]!;
        ask(ITEMS.find((item) => item.concept === concept && item.level === level && item.technique === technique && item.id.endsWith(`:${n + 1}`))!);
      }
    }
  }

  const usedIds: string[] = [];
  const recentTechniques: Technique[] = [];
  const seen = new Set<Technique>();
  let steps = 0;
  const next = (today: StudyClock): NextResult => nextStep(
    SHAPE, rule === 'new' ? progress : baselineProgress(results), ITEMS, { usedIds, recentTechniques }, random, READY_LEVELS, rule === 'new' ? today : undefined);

  for (;;) {
    const today = clockFor(day, first);
    const result = next(today);
    if (result.kind === 'done') { run.stepsToDone = steps; break; }
    if (result.kind === 'no content' || steps >= STEP_CAP) break;
    ask(ITEMS.find((item) => item.id === result.id)!);
    usedIds.push(result.id);
    recentTechniques.push(result.technique);
    seen.add(result.technique);
    steps += 1;
    if (steps % STEPS_PER_DAY === 0) {
      const gap = steps / STEPS_PER_DAY === breakAt ? breakDays : 1;
      for (let d = 0; d < gap; d++) {
        for (const concept of conceptIds) {
          if (trueLevel.get(concept)! > 0 && draw() < FORGET_PER_DAY) trueLevel.set(concept, trueLevel.get(concept)! - 1);
        }
      }
      day += gap;
    }
  }

  const finish = clockFor(day, first);
  for (const concept of conceptIds) {
    for (const level of READY_LEVELS) {
      const mastered = trueLevel.get(concept)! >= levelNumber(level);
      const shown = isShown(concept, level, finish);
      if (shown) { run.shownTotal += 1; if (!mastered) run.shownNotMastered += 1; }
      if (mastered) { run.masteredTotal += 1; if (!shown) run.masteredNotShown += 1; }
    }
  }
  run.techniques = seen.size;
  return run;
}

export function simulate(rule: RuleName, { students, seed }: SimulationOptions): RuleReport {
  const runs = Array.from({ length: students }, (_, index) => runStudent(rule, seed * 100_003 + index + 1));
  const sum = (pick: (run: StudentRun) => number): number => runs.reduce((total, run) => total + pick(run), 0);
  const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b);
  const done = runs.flatMap((run) => (run.stepsToDone === undefined ? [] : [run.stepsToDone])).sort((a, b) => a - b);
  return {
    rule,
    students,
    placedTooHigh: ratio(sum((run) => run.placedHigh), sum((run) => run.placedTotal)),
    shownButNotMasteredAtFinish: ratio(sum((run) => run.shownNotMastered), sum((run) => run.shownTotal)),
    placedTooLow: ratio(sum((run) => run.masteredNotShown), sum((run) => run.masteredTotal)),
    medianStepsToDone: done.length === 0 ? null : done[Math.floor((done.length - 1) / 2)]!,
    neverDone: 1 - done.length / students,
    techniqueVariety: sum((run) => run.techniques) / students,
  };
}

export function markdownTable(reports: readonly RuleReport[]): string {
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
  const rows: [string, (report: RuleReport) => string][] = [
    ['Marked shown, truly not mastered (placed too high)', (r) => percent(r.placedTooHigh)],
    ['Shown at the finish, truly not mastered', (r) => percent(r.shownButNotMasteredAtFinish)],
    ['Truly mastered, not shown at the finish (placed too low)', (r) => percent(r.placedTooLow)],
    ['Median steps to done (students who finished)', (r) => (r.medianStepsToDone === null ? 'none' : String(r.medianStepsToDone))],
    ['Never done within the cap', (r) => percent(r.neverDone)],
    ['Techniques met per student (mean)', (r) => r.techniqueVariety.toFixed(2)],
  ];
  const head = `| Measure (unverified model) | ${reports.map((r) => (r.rule === 'old' ? 'Old rule' : 'New rule')).join(' | ')} |`;
  const rule = `| --- | ${reports.map(() => '---:').join(' | ')} |`;
  return [head, rule, ...rows.map(([label, value]) => `| ${label} | ${reports.map(value).join(' | ')} |`)].join('\n');
}

// Print the table when run directly (not when imported by the unit test).
if (/simulate-module-path\.(ts|mjs|js)$/.test(process.argv[1] ?? '')) {
  const options = { students: 2_000, seed: 7 };
  const reports = (['old', 'new'] as const).map((rule) => simulate(rule, options));
  console.log(`${options.students} synthetic students, ${CONCEPTS} concepts, step cap ${STEP_CAP}, seed ${options.seed}\n`);
  console.log(markdownTable(reports));
}

// Keep the type import used for readers of the file.
export type { LevelEvidence };
