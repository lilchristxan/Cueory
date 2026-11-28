// The module path (Christian, 2026-11-28): one module, start to finish.
//
//   input (video + reading) → active practice → diagnostic quiz → adaptive practice
//     → ready for the practice test → (optional) going deeper → module exam
//
// Pure rules, no browser or network code, so every choice can be explained and tested (D-36). Nothing here predicts
// an exam score: the engine reports what a student has shown, in words, at each thinking level.
// Design: docs/design/module-mastery-path.md.

/** Thinking levels, lowest first (Bloom's revised taxonomy, without "create"). */
export const THINKING_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** The ways to study an item. Each trains some thinking levels better than others. */
export const TECHNIQUES = ['flashcards', 'label it', 'matching', 'fill in the blank', 'learning questions', 'case questions'] as const;
export type Technique = (typeof TECHNIQUES)[number];

/** Which techniques can carry which thinking level, best fit first. */
export const TECHNIQUES_FOR_LEVEL: Readonly<Record<ThinkingLevel, readonly Technique[]>> = {
  remember: ['flashcards', 'label it', 'matching'],
  understand: ['fill in the blank', 'matching', 'learning questions'],
  apply: ['learning questions', 'case questions'],
  analyze: ['case questions', 'learning questions'],
  evaluate: ['case questions'],
};

export type Stage = 'input' | 'practice' | 'diagnostic' | 'adaptive' | 'ready' | 'deeper' | 'exam' | 'complete';

/** What a student has shown on one concept at one thinking level. Only right and wrong counts are kept. */
export interface LevelEvidence {
  right: number;
  wrong: number;
  /** The most recent results (up to RECENT_WINDOW), oldest first. Status is judged on these, so old misses fade. */
  recent: readonly boolean[];
}

export type ConceptLevels = Partial<Record<ThinkingLevel, LevelEvidence>>;

export interface ModuleProgress {
  /** Both parts of the input: the video and the reading. */
  watched: boolean;
  read: boolean;
  /** Techniques finished once in the active-practice stage. */
  practised: readonly Technique[];
  /** Set when the quiz after practice has been taken. */
  diagnosed: boolean;
  /** Evidence per concept id. */
  concepts: ReadonlyMap<string, ConceptLevels>;
  /** The student chose to go on to analysis and evaluation before the exam. */
  wantsDeeper: boolean;
  /** The module practice exam has been finished (its result lives with the exam, not here). */
  examDone: boolean;
}

/** One thing a module can offer: an item of content tagged with its concept, level and technique. */
export interface ModuleItem {
  id: string;
  concept: string;
  level: ThinkingLevel;
  technique: Technique;
}

export interface ModuleShape {
  /** Every concept id in the module. */
  concepts: readonly string[];
  /** Techniques this module has content for in the active-practice stage. */
  practiceTechniques: readonly Technique[];
}

/** A concept is "shown" at a level after this many answers there, with the last two both right. */
export const SHOWN_AFTER = 2;
/** How many recent answers status is judged on. */
export const RECENT_WINDOW = 6;
/** Smoothed share right needed across the recent answers, so 2 of 2 counts and 2 of 4 does not. */
export const SHOWN_SHARE = 0.7;
/** The levels a student must show on every concept before the practice test is offered. */
export const READY_LEVELS: readonly ThinkingLevel[] = ['remember', 'understand', 'apply'];
/** The levels added by going deeper. */
export const DEEPER_LEVELS: readonly ThinkingLevel[] = ['analyze', 'evaluate'];

export function emptyProgress(): ModuleProgress {
  return { watched: false, read: false, practised: [], diagnosed: false, concepts: new Map(), wantsDeeper: false, examDone: false };
}

export function recordLevelAnswer(previous: LevelEvidence | undefined, correct: boolean): LevelEvidence {
  const recent = [...(previous?.recent ?? []), correct].slice(-RECENT_WINDOW);
  return {
    right: (previous?.right ?? 0) + (correct ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (correct ? 0 : 1),
    recent,
  };
}

/** Records one answer on a concept at a level and returns new progress (the old one is left untouched). */
export function recordModuleAnswer(progress: ModuleProgress, concept: string, level: ThinkingLevel, correct: boolean): ModuleProgress {
  const concepts = new Map(progress.concepts);
  const levels = { ...(concepts.get(concept) ?? {}) };
  levels[level] = recordLevelAnswer(levels[level], correct);
  concepts.set(concept, levels);
  return { ...progress, concepts };
}

export type LevelStatus = 'not started' | 'learning' | 'shown';

export function levelStatus(evidence: LevelEvidence | undefined): LevelStatus {
  if (!evidence || evidence.right + evidence.wrong === 0) return 'not started';
  const recent = evidence.recent;
  const share = (recent.filter(Boolean).length + 1) / (recent.length + 2);
  const lastRight = recent.length >= SHOWN_AFTER && recent.slice(-SHOWN_AFTER).every(Boolean);
  return lastRight && share >= SHOWN_SHARE ? 'shown' : 'learning';
}

/** The highest level a student has shown on a concept with every level under it shown too; undefined if none. */
export function shownThrough(levels: ConceptLevels | undefined): ThinkingLevel | undefined {
  let top: ThinkingLevel | undefined;
  for (const level of THINKING_LEVELS) {
    if (levelStatus(levels?.[level]) !== 'shown') break;
    top = level;
  }
  return top;
}

function allShown(shape: ModuleShape, progress: ModuleProgress, levels: readonly ThinkingLevel[]): boolean {
  return shape.concepts.length > 0 &&
    shape.concepts.every((concept) => levels.every((level) => levelStatus(progress.concepts.get(concept)?.[level]) === 'shown'));
}

/** Where the student is in the module, from what they have done so far. Stages are suggestions, never locks. */
export function stageOf(shape: ModuleShape, progress: ModuleProgress): Stage {
  if (progress.examDone) return 'complete';
  if (!progress.watched || !progress.read) return 'input';
  if (!progress.diagnosed) {
    return shape.practiceTechniques.every((technique) => progress.practised.includes(technique)) ? 'diagnostic' : 'practice';
  }
  if (!allShown(shape, progress, READY_LEVELS)) return 'adaptive';
  if (progress.wantsDeeper && !allShown(shape, progress, DEEPER_LEVELS)) return 'deeper';
  return progress.wantsDeeper ? 'exam' : 'ready';
}

/**
 * Where adaptive practice starts for each concept after the diagnostic quiz: the lowest level not yet shown.
 * A concept the quiz never reached starts at "remember".
 */
export function calibrate(shape: ModuleShape, progress: ModuleProgress, upTo: readonly ThinkingLevel[] = READY_LEVELS): Map<string, ThinkingLevel | undefined> {
  const start = new Map<string, ThinkingLevel | undefined>();
  for (const concept of shape.concepts) {
    const levels = progress.concepts.get(concept);
    start.set(concept, upTo.find((level) => levelStatus(levels?.[level]) !== 'shown'));
  }
  return start;
}

/**
 * What adaptive practice can do next: a step to take; nothing because every concept is shown at these levels
 * ("done"); or nothing because the concepts still learning have no item to offer right now ("no content": the
 * module is short of items there, or its only item was just shown). "no content" is never readiness.
 */
export type NextResult =
  | ({ kind: 'step' } & NextStep)
  | { kind: 'done' }
  | { kind: 'no content'; concepts: readonly string[] };

export interface NextStep {
  id: string;
  concept: string;
  level: ThinkingLevel;
  technique: Technique;
  /** Shown to the student, so they know why this came up. */
  reason: 'you missed this recently' | 'not practised yet' | 'one more to lock it in' | 'next level up';
}

export interface StepHistory {
  /** Ids already used this session, most recent last. */
  usedIds: readonly string[];
  /** Techniques of the most recent steps, most recent last. */
  recentTechniques: readonly Technique[];
}

/** No technique is offered more than this many times in a row when another one fits. */
export const SAME_TECHNIQUE_RUN = 2;

/**
 * Picks the next adaptive step: the concept with the most ground to cover first (a recent miss ahead of ties),
 * at the lowest level it has not shown, in a technique that fits that level, changing technique so practice
 * stays varied. See NextResult for what comes back when there is no step.
 */
export function nextStep(
  shape: ModuleShape,
  progress: ModuleProgress,
  items: readonly ModuleItem[],
  history: StepHistory,
  random: () => number,
  upTo: readonly ThinkingLevel[] = READY_LEVELS,
): NextResult {
  const start = calibrate(shape, progress, upTo);
  const lastId = history.usedIds.at(-1);
  const run = history.recentTechniques.slice(-SAME_TECHNIQUE_RUN);
  const tired = run.length === SAME_TECHNIQUE_RUN && run.every((technique) => technique === run[0]) ? run[0] : undefined;

  const ranked = shape.concepts
    .map((concept, order) => {
      const level = start.get(concept);
      if (!level) return undefined;
      const evidence = progress.concepts.get(concept)?.[level];
      const missedLast = evidence?.recent.at(-1) === false;
      const levelIndex = THINKING_LEVELS.indexOf(level);
      // Lower levels first (foundations before application), a recent miss first within a level, then module order.
      return { concept, level, evidence, rank: [levelIndex, missedLast ? 0 : 1, order] as const };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2]);

  for (const { concept, level, evidence } of ranked) {
    const fitting = TECHNIQUES_FOR_LEVEL[level];
    const pool = items.filter((item) => item.concept === concept && item.level === level && item.id !== lastId && fitting.includes(item.technique));
    if (pool.length === 0) continue;
    // Variety first: drop the technique that has just run twice whenever another one fits, and only then prefer
    // items not used this session.
    const varied = pool.filter((item) => item.technique !== tired);
    const candidates = varied.length > 0 ? varied : pool;
    const fresh = candidates.filter((item) => !history.usedIds.includes(item.id));
    const choices = fresh.length > 0 ? fresh : candidates;
    // Best-fitting technique first; ties broken by the caller's randomness.
    const best = Math.min(...choices.map((item) => fitting.indexOf(item.technique)));
    const top = choices.filter((item) => fitting.indexOf(item.technique) === best);
    const pick = top[Math.min(top.length - 1, Math.floor(random() * top.length))]!;
    const asked = (evidence?.right ?? 0) + (evidence?.wrong ?? 0);
    const reason: NextStep['reason'] = evidence?.recent.at(-1) === false
      ? 'you missed this recently'
      : asked === 0
        ? (level === upTo[0] || level === 'remember' ? 'not practised yet' : 'next level up')
        : 'one more to lock it in';
    return { kind: 'step', id: pick.id, concept, level, technique: pick.technique, reason };
  }
  // A module with no concepts has shown nothing, so it is never "done" (stageOf keeps it out of "ready" too).
  if (shape.concepts.length === 0) return { kind: 'no content', concepts: [] };
  return ranked.length === 0 ? { kind: 'done' } : { kind: 'no content', concepts: ranked.map((entry) => entry.concept) };
}

export interface ModuleSummary {
  stage: Stage;
  /** Per thinking level: how many of the module's concepts are shown, learning or not started. */
  levels: Readonly<Record<ThinkingLevel, Readonly<Record<LevelStatus, number>>>>;
  /** Concepts still short of the practice-test levels, in module order. */
  toStrengthen: readonly string[];
}

export function summarize(shape: ModuleShape, progress: ModuleProgress): ModuleSummary {
  const levels = Object.fromEntries(THINKING_LEVELS.map((level) => [level, { 'not started': 0, learning: 0, shown: 0 }])) as
    Record<ThinkingLevel, Record<LevelStatus, number>>;
  const toStrengthen: string[] = [];
  for (const concept of shape.concepts) {
    const evidence = progress.concepts.get(concept);
    for (const level of THINKING_LEVELS) levels[level][levelStatus(evidence?.[level])] += 1;
    if (!READY_LEVELS.every((level) => levelStatus(evidence?.[level]) === 'shown')) toStrengthen.push(concept);
  }
  return { stage: stageOf(shape, progress), levels, toStrengthen };
}

export interface CourseSummary {
  modules: number;
  /** How many modules are at each stage. */
  stages: Readonly<Record<Stage, number>>;
  /** Per thinking level, concepts shown out of all concepts in the course. */
  levels: Readonly<Record<ThinkingLevel, { shown: number; of: number }>>;
  /** The earliest module in course order that is not complete; where to go next. */
  next?: string;
}

/** Rolls every module up into the course picture. Counts only: no score, no prediction (D-36). */
export function summarizeCourse(modules: readonly { id: string; shape: ModuleShape; progress: ModuleProgress }[]): CourseSummary {
  const stages = { input: 0, practice: 0, diagnostic: 0, adaptive: 0, ready: 0, deeper: 0, exam: 0, complete: 0 } as Record<Stage, number>;
  const levels = Object.fromEntries(THINKING_LEVELS.map((level) => [level, { shown: 0, of: 0 }])) as Record<ThinkingLevel, { shown: number; of: number }>;
  let next: string | undefined;
  for (const module of modules) {
    const summary = summarize(module.shape, module.progress);
    stages[summary.stage] += 1;
    if (!next && summary.stage !== 'complete') next = module.id;
    for (const level of THINKING_LEVELS) {
      levels[level].shown += summary.levels[level].shown;
      levels[level].of += module.shape.concepts.length;
    }
  }
  return { modules: modules.length, stages, levels, ...(next ? { next } : {}) };
}
