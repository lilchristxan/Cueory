// The module path (Christian, 2026-11-28): one module, start to finish.
//
//   input (video + reading) → active practice → diagnostic quiz → adaptive practice
//     → ready for the practice test → (optional) going deeper → module exam
//
// Pure rules, no browser or network code, so every choice can be explained and tested (D-36). Nothing here predicts
// an exam score: the engine reports what a student has shown, in words, at each thinking level.
// Design: docs/design/module-mastery-path.md.

import { dayNumber, type StudyClock } from './calendar';

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

/** One recorded answer. Only right or wrong is kept, never the question or the student's words. */
export interface AnswerRecord {
  correct: boolean;
  /** How much this answer shows, after technique and guessing are taken into account (see EVIDENCE_WEIGHT). */
  weight: number;
  /** The calendar day it was recorded, as a day number (calendar.ts dayNumber); absent when no clock was given. */
  day?: number;
  /** A single miss right after a strong run of right answers (see SLIP_RUN). It counts for less. */
  slip: boolean;
}

/** What a student has shown on one concept at one thinking level. */
export interface LevelEvidence {
  right: number;
  wrong: number;
  /** The most recent answers (up to RECENT_WINDOW), oldest first. Status is judged on these, so old misses fade. */
  recent: readonly AnswerRecord[];
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

/** A level is "shown" only when the last this-many answers there are all right. */
export const SHOWN_AFTER = 2;
/** How many recent answers status is judged on. */
export const RECENT_WINDOW = 6;
/** Smoothed weighted share right needed across the recent answers, so 2 of 2 counts and 2 of 4 does not. */
export const SHOWN_SHARE = 0.7;
/**
 * Weighted evidence from right answers in the recent window needed before a level can be "shown". Two ordinary
 * right answers (weight 1 each) reach it; no single answer does, because the heaviest weight is 1.5. UNVERIFIED.
 */
export const SHOWN_WEIGHT = 2;

/**
 * How much one answer shows, by technique. ALL VALUES ARE UNVERIFIED STARTING VALUES, to be tuned with the simulation
 * and real use (docs/design/module-mastery-path.md). Recognition (picking from choices shown) shows less than
 * production (pulling the answer out of memory), and a worked case shows most.
 */
export const EVIDENCE_WEIGHT: Readonly<Record<Technique, number>> = {
  flashcards: 1, // self-recalled
  'label it': 1, // typed
  'fill in the blank': 1,
  matching: 0.5, // recognition
  'learning questions': 0.6, // recognition
  'case questions': 1.5, // worked case
};
/** Weight of an answer whose technique is not given. */
export const DEFAULT_EVIDENCE_WEIGHT = 1;
/** Techniques where the answer is chosen from options shown, so a right answer can be a guess. */
export const RECOGNITION_TECHNIQUES: readonly Technique[] = ['matching', 'learning questions'];
/** Options assumed on a recognition item when the item does not say. UNVERIFIED. */
export const DEFAULT_OPTIONS = 4;
/** Run of right answers just before a miss that makes the miss a "slip". UNVERIFIED. */
export const SLIP_RUN = 4;
/** A slip counts as this share of a normal miss, so recovery is quick. UNVERIFIED. */
export const SLIP_MISS_SHARE = 0.5;
/** A "shown" level whose newest answer is more than this many days old becomes "review due". UNVERIFIED. */
export const STALE_AFTER_DAYS = 14;
/** The levels a student must show on every concept before the practice test is offered. */
export const READY_LEVELS: readonly ThinkingLevel[] = ['remember', 'understand', 'apply'];
/** The levels added by going deeper. */
export const DEEPER_LEVELS: readonly ThinkingLevel[] = ['analyze', 'evaluate'];

export function emptyProgress(): ModuleProgress {
  return { watched: false, read: false, practised: [], diagnosed: false, concepts: new Map(), wantsDeeper: false, examDone: false };
}

/** What is known about one answer besides right or wrong. All of it is optional. */
export interface AnswerDetail {
  technique?: Technique;
  /** How many options a recognition item showed. Fewer options make a right answer easier to guess. */
  options?: number;
  /** When it was answered; needed for review-due to work. */
  clock?: StudyClock;
}

/**
 * How much an answer shows. A right answer on a recognition item is scaled by how hard it is to guess: with the
 * default four options the factor is 1; with two options it is two thirds; more than four never counts extra.
 * A miss always counts at the technique's full weight.
 */
export function evidenceWeight(correct: boolean, detail: AnswerDetail = {}): number {
  const base = detail.technique ? EVIDENCE_WEIGHT[detail.technique] : DEFAULT_EVIDENCE_WEIGHT;
  if (!correct || !detail.technique || !RECOGNITION_TECHNIQUES.includes(detail.technique)) return base;
  const options = Math.max(2, Math.floor(detail.options ?? DEFAULT_OPTIONS));
  const factor = Math.min(1, (1 - 1 / options) / (1 - 1 / DEFAULT_OPTIONS));
  return base * factor;
}

export function recordLevelAnswer(previous: LevelEvidence | undefined, correct: boolean, detail: AnswerDetail = {}): LevelEvidence {
  const before = previous?.recent ?? [];
  let streak = 0;
  for (let i = before.length - 1; i >= 0 && before[i]!.correct; i--) streak++;
  const record: AnswerRecord = {
    correct,
    weight: evidenceWeight(correct, detail),
    ...(detail.clock ? { day: dayNumber(detail.clock.day) } : {}),
    slip: !correct && streak >= SLIP_RUN,
  };
  return {
    right: (previous?.right ?? 0) + (correct ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (correct ? 0 : 1),
    recent: [...before, record].slice(-RECENT_WINDOW),
  };
}

/** Records one answer on a concept at a level and returns new progress (the old one is left untouched). */
export function recordModuleAnswer(progress: ModuleProgress, concept: string, level: ThinkingLevel, correct: boolean, detail: AnswerDetail = {}): ModuleProgress {
  const concepts = new Map(progress.concepts);
  const levels = { ...(concepts.get(concept) ?? {}) };
  levels[level] = recordLevelAnswer(levels[level], correct, detail);
  concepts.set(concept, levels);
  return { ...progress, concepts };
}

export type LevelStatus = 'not started' | 'learning' | 'shown' | 'review due';

/**
 * Judges a level on weighted recent evidence. It is "shown" when the last two answers are right, the weighted right
 * answers in the window add up to at least SHOWN_WEIGHT, and the smoothed weighted share right is at least
 * SHOWN_SHARE. A slip (one miss after a strong run) counts as half a miss. If `today` is given and the newest
 * answer is more than STALE_AFTER_DAYS old, a shown level becomes "review due".
 */
export function levelStatus(evidence: LevelEvidence | undefined, today?: StudyClock): LevelStatus {
  if (!evidence || evidence.right + evidence.wrong === 0) return 'not started';
  const recent = evidence.recent;
  let rightWeight = 0;
  let total = 0;
  for (const answer of recent) {
    if (answer.correct) rightWeight += answer.weight;
    total += answer.correct ? answer.weight : answer.weight * (answer.slip ? SLIP_MISS_SHARE : 1);
  }
  const share = (rightWeight + 1) / (total + 2);
  const lastRight = recent.length >= SHOWN_AFTER && recent.slice(-SHOWN_AFTER).every((answer) => answer.correct);
  if (!(lastRight && rightWeight >= SHOWN_WEIGHT && share >= SHOWN_SHARE)) return 'learning';
  const newest = recent.at(-1)?.day;
  if (today && newest !== undefined && dayNumber(today.day) - newest > STALE_AFTER_DAYS) return 'review due';
  return 'shown';
}

/** The highest level a student has shown on a concept with every level under it shown too; undefined if none. */
export function shownThrough(levels: ConceptLevels | undefined, today?: StudyClock): ThinkingLevel | undefined {
  let top: ThinkingLevel | undefined;
  for (const level of THINKING_LEVELS) {
    if (levelStatus(levels?.[level], today) !== 'shown') break;
    top = level;
  }
  return top;
}

function allShown(shape: ModuleShape, progress: ModuleProgress, levels: readonly ThinkingLevel[], today?: StudyClock): boolean {
  return shape.concepts.length > 0 &&
    shape.concepts.every((concept) => levels.every((level) => levelStatus(progress.concepts.get(concept)?.[level], today) === 'shown'));
}

/** Where the student is in the module, from what they have done so far. Stages are suggestions, never locks. */
export function stageOf(shape: ModuleShape, progress: ModuleProgress, today?: StudyClock): Stage {
  if (progress.examDone) return 'complete';
  if (!progress.watched || !progress.read) return 'input';
  if (!progress.diagnosed) {
    return shape.practiceTechniques.every((technique) => progress.practised.includes(technique)) ? 'diagnostic' : 'practice';
  }
  if (!allShown(shape, progress, READY_LEVELS, today)) return 'adaptive';
  if (progress.wantsDeeper && !allShown(shape, progress, DEEPER_LEVELS, today)) return 'deeper';
  return progress.wantsDeeper ? 'exam' : 'ready';
}

/**
 * Where adaptive practice starts for each concept after the diagnostic quiz: the lowest level not yet shown.
 * A concept the quiz never reached starts at "remember".
 */
export function calibrate(shape: ModuleShape, progress: ModuleProgress, upTo: readonly ThinkingLevel[] = READY_LEVELS, today?: StudyClock): Map<string, ThinkingLevel | undefined> {
  const start = new Map<string, ThinkingLevel | undefined>();
  for (const concept of shape.concepts) {
    const levels = progress.concepts.get(concept);
    start.set(concept, upTo.find((level) => levelStatus(levels?.[level], today) !== 'shown'));
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
  reason: 'you missed this recently' | 'not practised yet' | 'one more to lock it in' | 'next level up' | 'due for review';
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
  today?: StudyClock,
): NextResult {
  const start = calibrate(shape, progress, upTo, today);
  const lastId = history.usedIds.at(-1);
  const run = history.recentTechniques.slice(-SAME_TECHNIQUE_RUN);
  const tired = run.length === SAME_TECHNIQUE_RUN && run.every((technique) => technique === run[0]) ? run[0] : undefined;

  const ranked = shape.concepts
    .map((concept, order) => {
      const level = start.get(concept);
      if (!level) return undefined;
      const evidence = progress.concepts.get(concept)?.[level];
      const missedLast = evidence?.recent.at(-1)?.correct === false;
      const due = levelStatus(evidence, today) === 'review due';
      const levelIndex = THINKING_LEVELS.indexOf(level);
      // Review that is due first (so the loop keeps re-locating the student), then lower levels (foundations before
      // application), a recent miss first within a level, then module order.
      return { concept, level, evidence, due, rank: [due ? 0 : 1, levelIndex, missedLast ? 0 : 1, order] as const };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.rank[3] - b.rank[3]);

  for (const { concept, level, evidence, due } of ranked) {
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
    const reason: NextStep['reason'] = due
      ? 'due for review'
      : evidence?.recent.at(-1)?.correct === false
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

export function summarize(shape: ModuleShape, progress: ModuleProgress, today?: StudyClock): ModuleSummary {
  const levels = Object.fromEntries(THINKING_LEVELS.map((level) => [level, { 'not started': 0, learning: 0, shown: 0, 'review due': 0 }])) as
    Record<ThinkingLevel, Record<LevelStatus, number>>;
  const toStrengthen: string[] = [];
  for (const concept of shape.concepts) {
    const evidence = progress.concepts.get(concept);
    for (const level of THINKING_LEVELS) levels[level][levelStatus(evidence?.[level], today)] += 1;
    if (!READY_LEVELS.every((level) => levelStatus(evidence?.[level], today) === 'shown')) toStrengthen.push(concept);
  }
  return { stage: stageOf(shape, progress, today), levels, toStrengthen };
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
export function summarizeCourse(modules: readonly { id: string; shape: ModuleShape; progress: ModuleProgress }[], today?: StudyClock): CourseSummary {
  const stages = { input: 0, practice: 0, diagnostic: 0, adaptive: 0, ready: 0, deeper: 0, exam: 0, complete: 0 } as Record<Stage, number>;
  const levels = Object.fromEntries(THINKING_LEVELS.map((level) => [level, { shown: 0, of: 0 }])) as Record<ThinkingLevel, { shown: number; of: number }>;
  let next: string | undefined;
  for (const module of modules) {
    const summary = summarize(module.shape, module.progress, today);
    stages[summary.stage] += 1;
    if (!next && summary.stage !== 'complete') next = module.id;
    for (const level of THINKING_LEVELS) {
      levels[level].shown += summary.levels[level].shown;
      levels[level].of += module.shape.concepts.length;
    }
  }
  return { modules: modules.length, stages, levels, ...(next ? { next } : {}) };
}
