/**
 * Simulation of the module path over synthetic students. Run with the existing esbuild binary and Node, or import
 * `simulate` (the unit test does). All ids and outcomes are synthetic: no content, questions or answer keys.
 *
 * Every probability below is an UNVERIFIED modelling assumption, chosen to be plausible, not measured.
 * Each student has a hidden TRUE level per concept (1 = remember, the least a student has after the input stage; the draw's 0 is raised to 1, 2 = understand, 3 = apply). The path runs
 * a diagnostic, then adaptive steps until "done" or the step cap. Two rules are compared on the same students:
 *   - old: every answer counts equally and nothing is ever forgotten (the baseline, kept here only);
 *   - new: weighted by technique, guess-aware, slip-aware, with review due (the rule in module-path.ts).
 */
import { readFileSync } from 'node:fs';
import { calendarDay, DAY_MS, dayNumber, type StudyClock } from '../src/islands/adaptive-learning/calendar';
import {
  emptyProgress, GATE_LEVELS, isShown, levelStatus, nextStep, READY_LEVELS, recordModuleAnswer, RECOGNITION_TECHNIQUES, TECHNIQUES_FOR_LEVEL,
  type AnswerRecord, type LevelEvidence, type ModuleItem, type ModuleProgress, type ModuleShape, type NextResult, type Technique, type ThinkingLevel,
} from '../src/islands/adaptive-learning/module-path';

export type RuleName = 'old' | 'new';

export interface SimulationOptions {
  students: number;
  seed: number;
  /** New rule only: false switches off the retention drop (the rule is then judged on evidence alone). Default true. */
  retention?: boolean;
  /** Adaptive steps allowed per student. Default STEP_CAP. */
  stepCap?: number;
  /** New rule only: the opt-in diagnostic fast track (ModuleShape.diagnosticFastTrack). Default off. */
  fastTrack?: boolean;
}

/** A count with its denominator, so a share is never reported without what it is a share of. */
export interface Count { n: number; of: number }

export interface RuleReport {
  rule: RuleName;
  retention: boolean;
  fastTrack: boolean;
  students: number;
  /** Right after the diagnostic, before any adaptive practice: placed shown but truly not mastered (levels). */
  diagnosticTooHigh: Count;
  /** Right after the diagnostic: truly mastered but not placed shown (levels). */
  diagnosticTooLow: Count;
  /** Right after the diagnostic: placed developing or higher but truly not mastered (levels). */
  diagnosticDevelopingTooHigh: Count;
  /** Right after the diagnostic: truly mastered but placed at gap or not started (levels). */
  diagnosticMasteredAtGap: Count;
  /** At the moment each level first became shown during practice: truly not mastered (levels). */
  placedTooHigh: Count;
  /** At the moment the path said "done" (ready): students with at least one level truly not mastered. */
  falselyReady: Count;
  /** After the finish (done or the cap): shown but truly not mastered (levels). */
  finalTooHigh: Count;
  /** After the finish: truly mastered but not shown (levels). */
  finalTooLow: Count;
  /** Median steps among students who reached "done". */
  medianStepsToDone: number | null;
  /** Students who never reached "done" within the cap. */
  neverDone: Count;
  /** Never done because the step cap was reached (the path still had something to offer). */
  neverDoneCapped: Count;
  /** Never done because no content remained (no usable item for the levels still to show). */
  neverDoneNoContent: Count;
  /** Prepared students (every concept truly mastered) declared ready by the diagnostic alone, with no adaptive step. */
  preparedSkipped: Count;
  /** Prepared students who reached "done" within the cap. */
  preparedDone: Count;
  /** Students who, at exit (done or the cap), truly mastered every gate level of every concept. */
  masteredAtExit: Count;
  /** Of those, how many the path declared done. */
  masteredAtExitDone: Count;
  /** Of those who had not mastered everything at the end of the diagnostic (so mastery was acquired during practice), how many the path declared done. */
  acquiredDone: Count;
  /** Students declared ready by the diagnostic alone who had a level truly not mastered. */
  falselyReadyAtDiagnostic: Count;
  /** Mean number of diagnostic items a student was asked (the authored policy asks 6 to 12 for six concepts). */
  diagnosticItems: number;
  /** The lowest true level any concept had at any point after the input stage; never below REMEMBER_FLOOR. */
  lowestTrueLevel: number;
  /** Mean number of different techniques a student met in the adaptive steps. */
  techniqueVariety: number;
}

// Unverified modelling assumptions.
export const CONCEPTS = 6;
export const STEP_CAP = 600;
export const STEPS_PER_DAY = 10;
const SLIP_RATE = 0.08; // a mastered level answered wrong anyway
const PRODUCTION_GUESS = 0.05;
const CASE_GUESS = 0.1;
const RECOGNITION_EXTRA = 0.05; // on top of 1 / options
const NEAR_BONUS = 0.15; // partly knowing the next level up
const LEARN_CHANCE = 0.12; // per answer at the level just above the true level
/** The video and reading stage has been done, so neither the starting draw nor forgetting goes below "remember". */
export const REMEMBER_FLOOR = 1;
const FORGET_PER_DAY = 0.005; // chance per day that a concept slips down one level
const BREAK_CHANCE = 0.5; // share of students who take one long break
const OPTIONS_CYCLE = [3, 4, 4, 5];
/** Share of synthetic students who truly master every concept from the start (known ability). */
export const PREPARED_SHARE = 0.2;
/** Items the synthetic module has for each concept, level and technique. Assumption: real modules may have fewer. */
export const ITEMS_PER_TECHNIQUE = 12;

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
const FAST_SHAPE: ModuleShape = { ...SHAPE, diagnosticFastTrack: true };
export const ITEMS: readonly ModuleItem[] = conceptIds.flatMap((concept) =>
  READY_LEVELS.flatMap((level) => TECHNIQUES_FOR_LEVEL[level].flatMap((technique) =>
    Array.from({ length: ITEMS_PER_TECHNIQUE }, (_, n) => n + 1).map((n) => ({ id: `${concept}:${level}:${technique}:${n}`, concept, level, technique })))));
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

/** The baseline's own placement: shown, or (like the new rule's gap line) learning with a share right under half. */
function baselineRank(results: readonly boolean[]): 0 | 1 | 2 {
  const status = baselineStatus(results);
  if (status === 'shown') return 2;
  if (status === 'not started') return 0;
  return (results.slice(-6).filter(Boolean).length + 1) / (Math.min(6, results.length) + 2) >= 0.5 ? 1 : 0;
}

const synthetic = (correct: boolean): AnswerRecord => ({
  correct, weight: 1, slip: false, direct: true, identified: true, fresh: correct, repeat: false, cued: false, timedOut: false,
});

/** Shows the engine's own next-step picker what the baseline thinks, by building evidence that says exactly that. */
function baselineProgress(results: ReadonlyMap<string, boolean[]>): ModuleProgress {
  const concepts = new Map<string, Partial<Record<ThinkingLevel, LevelEvidence>>>();
  for (const [key, list] of results) {
    const [concept, level] = key.split('|') as [string, ThinkingLevel];
    const status = baselineStatus(list);
    const view = status === 'shown' ? Array.from({ length: 8 }, () => true) : status === 'learning' ? [list.at(-1) ?? true] : [];
    const entry = concepts.get(concept) ?? {};
    entry[level] = { right: view.filter(Boolean).length, wrong: view.filter((c) => !c).length, recent: view.map(synthetic), seen: [], cards: {}, lastEventAt: {} };
    concepts.set(concept, entry);
  }
  return { ...emptyProgress(), concepts };
}

function clockFor(day: number, first: number): StudyClock {
  return { day: calendarDay(first + day), now: (first + day + 0.5) * DAY_MS };
}

interface Tally { n: number; of: number }
interface StudentRun {
  stepsToDone: number | undefined;
  stop: 'done' | 'cap' | 'no content';
  diagnostic: Record<'high' | 'low' | 'developingHigh' | 'masteredGap', Tally>;
  placed: Tally;
  ready: Tally;
  final: Record<'high' | 'low', Tally>;
  prepared: boolean;
  masteredAfterDiagnostic: boolean;
  masteredAtExit: boolean;
  skipped: boolean;
  skippedWrong: boolean;
  diagnosticItems: number;
  lowestTrueLevel: number;
  techniques: number;
}
const tally = (): Tally => ({ n: 0, of: 0 });
const add = (target: Tally, hit: boolean, counted = true): void => { if (counted) target.of += 1; if (counted && hit) target.n += 1; };

function runStudent(rule: RuleName, seed: number, retention: boolean, stepCap: number, fastTrack: boolean): StudentRun {
  const random = seededRandom(seed); // the same seed gives both rules the same student and the same luck stream
  const draw = seededRandom(seed ^ 0x9e3779b9);
  const first = dayNumber('2028-01-01');
  const prepared = random() < PREPARED_SHARE;
  // Every student has done the input stage (video and reading) before the diagnostic, which teaches the terms: nobody
  // starts below "remember". The product offers no remember-level step in the adaptive path (it picks understand and
  // apply items only), so a student who knows nothing could otherwise never learn anything here.
  const trueLevel = new Map(conceptIds.map((concept) => [concept, prepared ? 3 : Math.max(REMEMBER_FLOOR, Math.floor(random() * 4))]));
  const breakAt = random() < BREAK_CHANCE ? 3 + Math.floor(random() * 5) : -1;
  const breakDays = 20 + Math.floor(random() * 30);

  let progress = emptyProgress();
  const results = new Map<string, boolean[]>();
  let day = 0;
  const wasShown = new Set<string>();
  const run: StudentRun = {
    stepsToDone: undefined,
    stop: 'cap',
    diagnostic: { high: tally(), low: tally(), developingHigh: tally(), masteredGap: tally() },
    placed: tally(), ready: tally(), final: { high: tally(), low: tally() }, prepared: false, masteredAfterDiagnostic: false, masteredAtExit: false, skipped: false, skippedWrong: false, diagnosticItems: 0, lowestTrueLevel: 3, techniques: 0,
  };
  run.lowestTrueLevel = Math.min(...trueLevel.values());

  // 0 = gap or not started, 1 = developing, 2 = shown (sufficient or strong).
  const rank = (concept: string, level: ThinkingLevel, today: StudyClock): 0 | 1 | 2 => {
    if (rule === 'old') return baselineRank(results.get(`${concept}|${level}`) ?? []);
    const status = levelStatus(progress.concepts.get(concept)?.[level], retention ? today : undefined);
    return isShown(status) ? 2 : status === 'developing' ? 1 : 0;
  };
  const mastered = (concept: string, level: ThinkingLevel): boolean => trueLevel.get(concept)! >= levelNumber(level);

  const ask = (item: ModuleItem, source?: 'diagnostic'): boolean => {
    const today = clockFor(day, first);
    const options = optionsOf(item.id);
    const level = trueLevel.get(item.concept)!;
    const correct = draw() < chanceRight(level, item.level, item.technique, options);
    if (rule === 'new') {
      progress = recordModuleAnswer(progress, item.concept, item.level, correct, {
        technique: item.technique, options, itemId: item.id, clock: today, ...(source ? { source } : {}),
      });
    } else {
      const key = `${item.concept}|${item.level}`;
      results.set(key, [...(results.get(key) ?? []), correct]);
    }
    // The student learns a little from every answer at the level just above what they truly know.
    if (levelNumber(item.level) === level + 1 && draw() < LEARN_CHANCE) trueLevel.set(item.concept, level + 1);
    // Judge the placement at the moment a level first becomes shown.
    const key = `${item.concept}|${item.level}`;
    if (!wasShown.has(key) && rank(item.concept, item.level, today) === 2) {
      wasShown.add(key);
      add(run.placed, !mastered(item.concept, item.level));
    }
    return correct;
  };

  // Diagnostic (course map section 4 step 3, authored policy): one understand item per objective at difficulty 2; a
  // right answer opens one follow-up (here at the apply tier, difficulty 3). That is 6 to 12 items for six concepts.
  conceptIds.forEach((concept, index) => {
    for (const level of GATE_LEVELS) {
      const fitting = TECHNIQUES_FOR_LEVEL[level];
      const technique = fitting[index % fitting.length]!;
      const item = ITEMS.find((candidate) => candidate.concept === concept && candidate.level === level && candidate.technique === technique && candidate.id.endsWith(':1'))!;
      run.diagnosticItems += 1;
      if (!ask(item, 'diagnostic')) break;
    }
  });
  run.prepared = prepared;
  // Observed mastery at the boundary between the diagnostic and adaptive practice (learning during the diagnostic counts).
  run.masteredAfterDiagnostic = conceptIds.every((concept) => GATE_LEVELS.every((level) => mastered(concept, level)));
  // Placement right after the diagnostic, before any adaptive practice has had a chance to correct it.
  const afterDiagnostic = clockFor(day, first);
  for (const concept of conceptIds) {
    for (const level of GATE_LEVELS) {
      const placed = rank(concept, level, afterDiagnostic);
      const truly = mastered(concept, level);
      add(run.diagnostic.high, !truly, placed === 2);
      add(run.diagnostic.low, placed !== 2, truly);
      add(run.diagnostic.developingHigh, !truly, placed >= 1);
      add(run.diagnostic.masteredGap, placed === 0, truly);
    }
  }

  const usedIds: string[] = [];
  const recentTechniques: Technique[] = [];
  const recentConcepts: string[] = [];
  const seen = new Set<Technique>();
  let steps = 0;
  const next = (today: StudyClock): NextResult => nextStep(
    fastTrack && rule === 'new' ? FAST_SHAPE : SHAPE, rule === 'new' ? { ...progress, diagnosed: true } : baselineProgress(results), ITEMS, { usedIds, recentTechniques, recentConcepts }, random, GATE_LEVELS, rule === 'new' && retention ? today : undefined);

  for (;;) {
    const today = clockFor(day, first);
    const result = next(today);
    if (result.kind === 'done') {
      run.stepsToDone = steps;
      run.stop = 'done';
      // The moment of readiness: is every level truly mastered right now?
      const wrong = conceptIds.some((concept) => GATE_LEVELS.some((level) => !mastered(concept, level)));
      add(run.ready, wrong);
      if (steps === 0) { run.skipped = true; run.skippedWrong = wrong; }
      break;
    }
    if (result.kind === 'no content') { run.stop = 'no content'; break; }
    if (steps >= stepCap) break;
    ask(ITEMS.find((item) => item.id === result.id)!);
    usedIds.push(result.id);
    recentTechniques.push(result.technique);
    recentConcepts.push(result.concept);
    seen.add(result.technique);
    steps += 1;
    if (steps % STEPS_PER_DAY === 0) {
      const gap = steps / STEPS_PER_DAY === breakAt ? breakDays : 1;
      for (let d = 0; d < gap; d++) {
        for (const concept of conceptIds) {
          if (trueLevel.get(concept)! > REMEMBER_FLOOR && draw() < FORGET_PER_DAY) trueLevel.set(concept, trueLevel.get(concept)! - 1);
          run.lowestTrueLevel = Math.min(run.lowestTrueLevel, trueLevel.get(concept)!);
        }
      }
      day += gap;
    }
  }

  const finish = clockFor(day, first);
  for (const concept of conceptIds) {
    for (const level of GATE_LEVELS) {
      const truly = mastered(concept, level);
      const shown = rank(concept, level, finish) === 2;
      add(run.final.high, !truly, shown);
      add(run.final.low, !shown, truly);
    }
  }
  run.masteredAtExit = conceptIds.every((concept) => GATE_LEVELS.every((level) => mastered(concept, level)));
  run.techniques = seen.size;
  return run;
}

export function simulate(rule: RuleName, { students, seed, retention = true, stepCap = STEP_CAP, fastTrack = false }: SimulationOptions): RuleReport {
  const runs = Array.from({ length: students }, (_, index) => runStudent(rule, seed * 100_003 + index + 1, retention, stepCap, fastTrack));
  const total = (pick: (run: StudentRun) => Tally): Count => ({
    n: runs.reduce((sum, run) => sum + pick(run).n, 0),
    of: runs.reduce((sum, run) => sum + pick(run).of, 0),
  });
  const done = runs.flatMap((run) => (run.stepsToDone === undefined ? [] : [run.stepsToDone])).sort((a, b) => a - b);
  return {
    rule,
    retention: rule === 'new' ? retention : false,
    fastTrack: rule === 'new' && fastTrack,
    students,
    diagnosticTooHigh: total((run) => run.diagnostic.high),
    diagnosticTooLow: total((run) => run.diagnostic.low),
    diagnosticDevelopingTooHigh: total((run) => run.diagnostic.developingHigh),
    diagnosticMasteredAtGap: total((run) => run.diagnostic.masteredGap),
    placedTooHigh: total((run) => run.placed),
    falselyReady: total((run) => run.ready),
    finalTooHigh: total((run) => run.final.high),
    finalTooLow: total((run) => run.final.low),
    medianStepsToDone: done.length === 0 ? null : done[Math.floor((done.length - 1) / 2)]!,
    neverDone: { n: students - done.length, of: students },
    neverDoneCapped: { n: runs.filter((r) => r.stop === 'cap').length, of: students },
    neverDoneNoContent: { n: runs.filter((r) => r.stop === 'no content').length, of: students },
    preparedSkipped: { n: runs.filter((r) => r.prepared && r.skipped).length, of: runs.filter((r) => r.prepared).length },
    preparedDone: { n: runs.filter((r) => r.prepared && r.stepsToDone !== undefined).length, of: runs.filter((r) => r.prepared).length },
    masteredAtExit: { n: runs.filter((r) => r.masteredAtExit).length, of: students },
    masteredAtExitDone: { n: runs.filter((r) => r.masteredAtExit && r.stepsToDone !== undefined).length, of: runs.filter((r) => r.masteredAtExit).length },
    acquiredDone: { n: runs.filter((r) => r.masteredAtExit && !r.masteredAfterDiagnostic && r.stepsToDone !== undefined).length, of: runs.filter((r) => r.masteredAtExit && !r.masteredAfterDiagnostic).length },
    falselyReadyAtDiagnostic: { n: runs.filter((r) => r.skippedWrong).length, of: runs.filter((r) => r.skipped).length },
    diagnosticItems: runs.reduce((sum, run) => sum + run.diagnosticItems, 0) / students,
    lowestTrueLevel: Math.min(...runs.map((run) => run.lowestTrueLevel)),
    techniqueVariety: runs.reduce((sum, run) => sum + run.techniques, 0) / students,
  };
}

const label = (r: RuleReport): string => (r.rule === 'old' ? 'Old rule' : !r.retention ? 'New rule, no retention drop' : r.fastTrack ? 'New rule, fast track on' : 'New rule (default, fast track off)');

export function markdownTable(reports: readonly RuleReport[]): string {
  const share = ({ n, of }: Count): string => (of === 0 ? `0 of 0` : `${((n / of) * 100).toFixed(1)}% (${n} of ${of})`);
  const rows: [string, (report: RuleReport) => string][] = [
    ['After the diagnostic: placed shown, truly not mastered (too high)', (r) => share(r.diagnosticTooHigh)],
    ['After the diagnostic: placed developing or higher, truly not mastered', (r) => share(r.diagnosticDevelopingTooHigh)],
    ['After the diagnostic: truly mastered, not placed shown (too low)', (r) => share(r.diagnosticTooLow)],
    ['After the diagnostic: truly mastered, placed at gap', (r) => share(r.diagnosticMasteredAtGap)],
    ['During practice: level first marked shown, truly not mastered', (r) => share(r.placedTooHigh)],
    ['At the moment of "ready": students with a level truly not mastered', (r) => share(r.falselyReady)],
    ['Final: shown, truly not mastered', (r) => share(r.finalTooHigh)],
    ['Final: truly mastered, not shown (too low)', (r) => share(r.finalTooLow)],
    ['Prepared students (all mastered) ready from the diagnostic alone', (r) => share(r.preparedSkipped)],
    ['Prepared students who reach done within the cap', (r) => share(r.preparedDone)],
    ['Mastered every gate level at exit (of all students)', (r) => share(r.masteredAtExit)],
    ['  of those, declared done', (r) => share(r.masteredAtExitDone)],
    ['  of those who had not mastered everything after the diagnostic (acquired during practice), declared done', (r) => share(r.acquiredDone)],
    ['Ready from the diagnostic alone, but a level not mastered', (r) => share(r.falselyReadyAtDiagnostic)],
    ['Diagnostic items asked per student (mean)', (r) => r.diagnosticItems.toFixed(1)],
    ['Median steps to done (students who finished)', (r) => (r.medianStepsToDone === null ? 'none' : String(r.medianStepsToDone))],
    ['Never done', (r) => share(r.neverDone)],
    ['  because the step cap was reached', (r) => share(r.neverDoneCapped)],
    ['  because no content remained', (r) => share(r.neverDoneNoContent)],
    ['Techniques met per student (mean)', (r) => r.techniqueVariety.toFixed(2)],
  ];
  const head = `| Measure (unverified model; levels or students counted) | ${reports.map(label).join(' | ')} |`;
  const rule = `| --- | ${reports.map(() => '---:').join(' | ')} |`;
  return [head, rule, ...rows.map(([label, value]) => `| ${label} | ${reports.map(value).join(' | ')} |`)].join('\n');
}

/** Seeds for the multi-seed row (300 students each, default rule). */
export const MULTI_SEEDS = [13, 31, 67, 109, 173, 257, 383] as const;

/** The default (fast track off) rule across several seeds, with counts and denominators added up. */
export function simulateSeeds(seeds: readonly number[], students: number): Record<'falselyReady' | 'neverDone' | 'neverDoneCapped' | 'neverDoneNoContent' | 'masteredAtExitDone' | 'acquiredDone', Count> {
  const keys = ['falselyReady', 'neverDone', 'neverDoneCapped', 'neverDoneNoContent', 'masteredAtExitDone', 'acquiredDone'] as const;
  const total = Object.fromEntries(keys.map((key) => [key, { n: 0, of: 0 }])) as Record<(typeof keys)[number], Count>;
  for (const seed of seeds) {
    const report = simulate('new', { students, seed });
    for (const key of keys) { total[key].n += report[key].n; total[key].of += report[key].of; }
  }
  return total;
}

export const SIMULATION_START = '<!-- simulation:start -->';
export const SIMULATION_END = '<!-- simulation:end -->';

/** Everything the design doc quotes, as markdown. `--check` compares this with the doc, so the numbers cannot drift. */
export function documentBlock(): string {
  const options = { students: 300, seed: 7 };
  const reports = [simulate('old', options), simulate('new', options), simulate('new', { ...options, fastTrack: true })];
  const share = ({ n, of }: Count): string => `${n} of ${of}`;
  const many = simulateSeeds(MULTI_SEEDS, options.students);
  return [
    `${options.students} synthetic students, ${CONCEPTS} concepts, step cap ${STEP_CAP}, seed ${options.seed}`,
    '',
    markdownTable(reports),
    '',
    `Across seeds ${MULTI_SEEDS.join(', ')} (${options.students} students each, default rule, fast track off):`,
    '',
    '| Measure | Count |',
    '| --- | ---: |',
    `| Declared ready but below criterion | ${share(many.falselyReady)} |`,
    `| Never reached done | ${share(many.neverDone)} (cap reached ${share(many.neverDoneCapped)}, no content remained ${share(many.neverDoneNoContent)}) |`,
    `| Mastered at exit and declared done | ${share(many.masteredAtExitDone)} |`,
    `| Gained mastery after the diagnostic and declared done | ${share(many.acquiredDone)} |`,
  ].join('\n');
}

// Run directly: print the block, or with --check compare it with the design doc (use the pinned Node, see .node-version:
// the last digits of the numbers can differ between Node versions).
if (/simulate-module-path\.(ts|mjs|js)$/.test(process.argv[1] ?? '')) {
  const block = documentBlock();
  if (process.argv.includes('--check')) {
    const docPath = process.argv[process.argv.indexOf('--check') + 1] ?? 'docs/design/module-mastery-path.md';
    const doc = readFileSync(docPath, 'utf8');
    const from = doc.indexOf(SIMULATION_START);
    const to = doc.indexOf(SIMULATION_END);
    const quoted = from < 0 || to < 0 ? '' : doc.slice(from + SIMULATION_START.length, to).trim();
    if (quoted !== block.trim()) { console.error('The simulation block in the design doc is out of date. Regenerate it with this script.'); process.exit(1); }
    console.log('The design doc matches the simulation.');
  } else {
    console.log(`${SIMULATION_START}\n${block}\n${SIMULATION_END}`);
  }
}
