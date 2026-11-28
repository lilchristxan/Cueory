// The module path (Christian, 2026-11-28): one module, start to finish.
//
//   input (video + reading) → active practice → diagnostic quiz → adaptive practice
//     → ready for the practice test → (optional) going deeper → module exam
//
// Pure rules, no browser or network code, so every choice can be explained and tested (D-36). Nothing here predicts
// an exam score: the engine reports what a student has shown, in words, at each thinking level.
// Design: docs/design/module-mastery-path.md.

import { dayNumber, type StudyClock } from './calendar';
import { predictedRecall, recordAnswer, RECALL_TARGET, type CardMemory } from './memory';

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

/** One recorded answer. Only right or wrong and how it was given are kept, never the question or the student's words. */
export interface AnswerRecord {
  correct: boolean;
  /** How much this answer shows after technique, cue, guessing and repeats (see EVIDENCE_WEIGHT). */
  weight: number;
  /** The calendar day it was recorded, as a day number (calendar.ts dayNumber); absent when no clock was given. */
  day?: number;
  /** A single miss right after a strong run of right answers (see SLIP_RUN). It counts for less. */
  slip: boolean;
  /** True for an answer the student gave here. False for credit transferred down from a higher level (see TRANSFER_SHARE). */
  direct: boolean;
  /** A right answer on an item never seen before at this level, with no cue and no timeout (a first-try success). */
  fresh: boolean;
  /** The item answered again. It adds nothing to the evidence either way (retention, not understanding, is what it shows). */
  repeat: boolean;
  /** How it was asked, and whether a cue was used or the tachyyy timer ran out (a timeout is a miss). */
  technique?: Technique;
  cued: boolean;
  timedOut: boolean;
}

/** What a student has shown on one concept at one thinking level. */
export interface LevelEvidence {
  right: number;
  wrong: number;
  /** The most recent records (up to RECENT_WINDOW), oldest first. Status is judged on these, so old misses fade. */
  recent: readonly AnswerRecord[];
  /** Ids of every item answered here, so a repeated item is never counted as independent evidence. */
  seen: readonly string[];
  /** Memory state (memory.ts) of each answered item with a clock, used to see when the level's cards fade. */
  cards: Readonly<Record<string, CardMemory>>;
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

/** A level can reach "sufficient" only when the last this-many direct answers there are all right. */
export const SHOWN_AFTER = 2;
/** How many recent records status is judged on (UNVERIFIED; the brief does not fix a window, so old misses can fade). */
export const RECENT_WINDOW = 20;
/** Brief #1281 section 2: "sufficient" needs the 10th percentile of the posterior to be at least this. */
export const SUFFICIENT_LOWER_BOUND = 0.7;
/** The lower-bound percentile the brief uses: 10th. */
export const LOWER_BOUND_PERCENTILE = 0.1;
/** Brief #1281 section 2: "sufficient" needs at least this much direct weighted evidence. */
export const SUFFICIENT_EVIDENCE = 3;
/** "strong" needs the same lower bound to reach this. UNVERIFIED (the brief names the word, not the number). */
export const STRONG_LOWER_BOUND = 0.8;
/** Below this posterior mean an unsufficient level is a "gap" rather than "developing". UNVERIFIED. */
export const GAP_BELOW_MEAN = 0.5;
/** Brief #1281 section 2: a higher-tier right answer gives each lower tier this share of its own weight as credit. */
export const TRANSFER_SHARE = 0.5;
/** Brief #1281 section 2: using a cue halves the credit of a right answer. */
export const CUE_SHARE = 0.5;
/** How many transferred-credit records are kept per level, apart from the direct ones, so credit cannot crowd out direct evidence. UNVERIFIED. */
export const TRANSFER_WINDOW = 6;
/** Weights are fractions, so sums are compared with this much tolerance. */
const WEIGHT_TOLERANCE = 1e-9;

/**
 * How much one answer shows, by technique. Flashcard flips and matching 0.5, label it and fill in the blank 0.75,
 * learning questions 1.0 are the defaults of brief #1281 section 2 (themselves "unverified, tune by simulation").
 * Case questions at 1.25 is UNVERIFIED: the brief has no case technique, so it takes the practice exam item value.
 */
export const EVIDENCE_WEIGHT: Readonly<Record<Technique, number>> = {
  flashcards: 0.5, // brief
  'label it': 0.75, // brief
  'fill in the blank': 0.75, // brief
  matching: 0.5, // brief
  'learning questions': 1, // brief
  'case questions': 1.25, // UNVERIFIED
};
/** Where an answer came from, when that changes what it shows (brief: diagnostic items 1.0, practice exam items 1.25). */
export const SOURCE_WEIGHT = { diagnostic: 1, 'practice exam': 1.25 } as const;
export type AnswerSource = keyof typeof SOURCE_WEIGHT;
/** Weight of an answer whose technique is not given. UNVERIFIED. */
export const DEFAULT_EVIDENCE_WEIGHT = 1;
/** Techniques where the answer is chosen from options shown, so a right answer can be a guess. */
export const RECOGNITION_TECHNIQUES: readonly Technique[] = ['matching', 'learning questions'];
/** Options assumed on a recognition item when the item does not say. UNVERIFIED. */
export const DEFAULT_OPTIONS = 4;
/** Run of right answers just before a miss that makes the miss a "slip". UNVERIFIED. */
export const SLIP_RUN = 4;
/** A slip counts as this share of a normal miss, so recovery is quick. UNVERIFIED. */
export const SLIP_MISS_SHARE = 0.5;
/**
 * Fallback only where a level has no card memory (answers recorded without an item id or clock): a level whose newest
 * direct answer is older than this many days drops one status. UNVERIFIED.
 */
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
  /** Set for diagnostic and practice exam items, which show more than ordinary practice. */
  source?: AnswerSource;
  /** How many options a recognition item showed. Fewer options make a right answer easier to guess. */
  options?: number;
  /** The item answered. Without it an answer cannot be told apart from a repeat, so give it whenever there is one. */
  itemId?: string;
  /** A cue (hint) was used: a right answer then counts half. */
  cued?: boolean;
  /** The tachyyy timer ran out: counts as a miss whatever was answered. */
  timedOut?: boolean;
  /** When it was answered; needed for retention (card memory) to work. */
  clock?: StudyClock;
}

/**
 * How much an answer shows. A right answer on a recognition item is scaled by how hard it is to guess: with the
 * default four options the factor is 1; with two options it is two thirds; more than four never counts extra.
 * A cue halves a right answer. A miss always counts at full weight.
 */
export function evidenceWeight(correct: boolean, detail: AnswerDetail = {}): number {
  const base = detail.source ? SOURCE_WEIGHT[detail.source] : detail.technique ? EVIDENCE_WEIGHT[detail.technique] : DEFAULT_EVIDENCE_WEIGHT;
  if (!correct) return base;
  let weight = detail.cued ? base * CUE_SHARE : base;
  if (detail.technique && RECOGNITION_TECHNIQUES.includes(detail.technique)) {
    const options = Math.max(2, Math.floor(detail.options ?? DEFAULT_OPTIONS));
    weight *= Math.min(1, (1 - 1 / options) / (1 - 1 / DEFAULT_OPTIONS));
  }
  return weight;
}

const isDirect = (record: AnswerRecord): boolean => record.direct;

export function recordLevelAnswer(previous: LevelEvidence | undefined, answered: boolean, detail: AnswerDetail = {}): LevelEvidence {
  const correct = answered && !detail.timedOut;
  const before = previous?.recent ?? [];
  const repeat = detail.itemId !== undefined && (previous?.seen ?? []).includes(detail.itemId);
  let streak = 0;
  const direct = before.filter(isDirect);
  for (let i = direct.length - 1; i >= 0 && direct[i]!.correct; i--) streak++;
  const cued = detail.cued === true;
  const record: AnswerRecord = {
    correct,
    weight: repeat ? 0 : evidenceWeight(correct, detail),
    ...(detail.clock ? { day: dayNumber(detail.clock.day) } : {}),
    slip: !correct && streak >= SLIP_RUN,
    direct: true,
    fresh: correct && !repeat && !cued,
    repeat,
    ...(detail.technique ? { technique: detail.technique } : {}),
    cued,
    timedOut: detail.timedOut === true,
  };
  const cards = { ...(previous?.cards ?? {}) };
  if (detail.itemId !== undefined && detail.clock) {
    // Cued or timed-out right answers do not strengthen memory.
    cards[detail.itemId] = recordAnswer(cards[detail.itemId], correct && !cued, detail.clock);
  }
  return {
    right: (previous?.right ?? 0) + (correct ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (correct ? 0 : 1),
    // A repeated item is not independent evidence either way, so it takes no place in the window. It still feeds the
    // item's memory, which is how forgetting an item shows (see levelAssessment).
    recent: repeat ? before : trimmed([...before, record]),
    seen: detail.itemId !== undefined && !repeat ? [...(previous?.seen ?? []), detail.itemId] : previous?.seen ?? [],
    cards,
  };
}

/** Keeps the latest RECENT_WINDOW direct records and the latest TRANSFER_WINDOW transferred ones, in order. */
function trimmed(records: readonly AnswerRecord[]): readonly AnswerRecord[] {
  const directCut = records.filter(isDirect).length - RECENT_WINDOW;
  const transferCut = records.filter((record) => !record.direct).length - TRANSFER_WINDOW;
  let direct = 0;
  let transfer = 0;
  return records.filter((record) => (record.direct ? direct++ >= directCut : transfer++ >= transferCut));
}

/** Credit passed down from a right answer at a higher level. It is kept apart from direct evidence (see levelAssessment). */
function addTransfer(previous: LevelEvidence | undefined, weight: number, day: number | undefined): LevelEvidence {
  const record: AnswerRecord = {
    correct: true, weight, ...(day !== undefined ? { day } : {}), slip: false,
    direct: false, fresh: false, repeat: false, cued: false, timedOut: false,
  };
  return {
    right: previous?.right ?? 0,
    wrong: previous?.wrong ?? 0,
    recent: trimmed([...(previous?.recent ?? []), record]),
    seen: previous?.seen ?? [],
    cards: previous?.cards ?? {},
  };
}

/**
 * Records one answer on a concept at a level and returns new progress (the old one is left untouched). A right
 * answer also gives every lower level of the same concept TRANSFER_SHARE of its weight as transferred credit; a miss
 * gives nothing downward.
 */
export function recordModuleAnswer(progress: ModuleProgress, concept: string, level: ThinkingLevel, correct: boolean, detail: AnswerDetail = {}): ModuleProgress {
  const concepts = new Map(progress.concepts);
  const levels = { ...(concepts.get(concept) ?? {}) };
  const previousLast = levels[level]?.recent.at(-1);
  levels[level] = recordLevelAnswer(levels[level], correct, detail);
  const record = levels[level]!.recent.at(-1)!;
  if (record !== previousLast && record.correct && record.weight > 0 && !record.repeat) {
    for (const lower of THINKING_LEVELS.slice(0, THINKING_LEVELS.indexOf(level))) {
      levels[lower] = addTransfer(levels[lower], record.weight * TRANSFER_SHARE, record.day);
    }
  }
  concepts.set(concept, levels);
  return { ...progress, concepts };
}

/** Brief #1281 status words, lowest first. "sufficient" and "strong" both count as shown. */
export const LEVEL_STATUSES = ['not started', 'gap', 'developing', 'sufficient', 'strong'] as const;
export type LevelStatus = (typeof LEVEL_STATUSES)[number];

/** A level counts toward readiness once it is sufficient or strong. */
export const isShown = (status: LevelStatus): boolean => status === 'sufficient' || status === 'strong';

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const coefficient of c) series += coefficient / ++y;
  return -t + Math.log((2.5066282746310005 * series) / x);
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  d = 1 / (Math.abs(d) < tiny ? tiny : d);
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let term = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + term * d; d = 1 / (Math.abs(d) < tiny ? tiny : d);
    c = 1 + term / c; if (Math.abs(c) < tiny) c = tiny;
    h *= d * c;
    term = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + term * d; d = 1 / (Math.abs(d) < tiny ? tiny : d);
    c = 1 + term / c; if (Math.abs(c) < tiny) c = tiny;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return h;
}

/** P(rate < x) for a Beta(a, b) belief: the regularised incomplete beta function. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(x, a, b)) / a : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** What the evidence adds up to: a Beta(1,1) prior plus weighted right and missed counts (brief #1281 section 2). */
export interface Posterior {
  /** 1 + weighted right answers, direct and transferred. */
  alpha: number;
  /** 1 + weighted missed answers (a slip counts half). */
  beta: number;
  /** Weighted evidence the student gave directly here (right and missed). Transferred credit is not in it. */
  directWeight: number;
  /** At least one first-try right answer on an item not seen before, with no cue. Direct evidence only. */
  hasFresh: boolean;
  /** The last SHOWN_AFTER direct answers are all right. */
  lastRight: boolean;
}

export function posterior(evidence: LevelEvidence | undefined): Posterior {
  let right = 0;
  let missed = 0;
  let directWeight = 0;
  let hasFresh = false;
  for (const record of evidence?.recent ?? []) {
    if (record.correct) right += record.weight;
    else missed += record.weight * (record.slip ? SLIP_MISS_SHARE : 1);
    if (record.direct) directWeight += record.weight;
    if (record.fresh) hasFresh = true;
  }
  const direct = (evidence?.recent ?? []).filter(isDirect);
  return {
    alpha: 1 + right, beta: 1 + missed, directWeight, hasFresh,
    lastRight: direct.length >= SHOWN_AFTER && direct.slice(-SHOWN_AFTER).every((record) => record.correct),
  };
}

/** The 10th percentile of the belief (brief #1281). Internal and for tests: never shown to a student as a percentage. */
export function credibleLowerBound(alpha: number, beta: number): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (betaCdf(mid, alpha, beta) > LOWER_BOUND_PERCENTILE) high = mid; else low = mid;
  }
  return low;
}

export interface LevelAssessment {
  /** What the evidence alone says. */
  earned: LevelStatus;
  /** What it says once fading is counted: one status lower when the level's cards have faded. */
  status: LevelStatus;
  /** True when fading lowered the status, so the level is due for review. */
  due: boolean;
}

/** True when the cards behind a level have faded below the recall target (brief: "below 80% recall"). */
function faded(evidence: LevelEvidence, today: StudyClock): boolean {
  const memories = Object.values(evidence.cards);
  if (memories.length > 0) {
    const recall = memories.reduce((sum, memory) => sum + predictedRecall(memory, today), 0) / memories.length;
    return recall < RECALL_TARGET;
  }
  const newest = evidence.recent.filter(isDirect).at(-1)?.day;
  return newest !== undefined && dayNumber(today.day) - newest > STALE_AFTER_DAYS;
}

/**
 * Judges a level on weighted evidence. From the posterior (Beta(1,1) plus weighted right and missed counts):
 * "sufficient" needs at least SUFFICIENT_EVIDENCE of direct weighted evidence, a first-try right answer on an item
 * not seen before, the last two direct answers right, and a 10th percentile of at least 0.70. "strong" needs the
 * lower bound to reach STRONG_LOWER_BOUND as well. Otherwise "gap" (posterior mean under GAP_BELOW_MEAN) or
 * "developing". Credit transferred from higher levels counts toward the belief but never toward the direct
 * evidence, the first-try answer or the last two answers, so it alone can never make a level sufficient.
 * With `today`, a level whose cards have faded below 80% predicted recall drops one status until it is reviewed.
 */
export function levelAssessment(evidence: LevelEvidence | undefined, today?: StudyClock): LevelAssessment {
  if (!evidence || (evidence.right + evidence.wrong === 0 && evidence.recent.length === 0)) {
    return { earned: 'not started', status: 'not started', due: false };
  }
  const p = posterior(evidence);
  let earned: LevelStatus;
  if (
    p.directWeight + WEIGHT_TOLERANCE >= SUFFICIENT_EVIDENCE && p.hasFresh && p.lastRight &&
    betaCdf(SUFFICIENT_LOWER_BOUND, p.alpha, p.beta) <= LOWER_BOUND_PERCENTILE + WEIGHT_TOLERANCE
  ) {
    earned = betaCdf(STRONG_LOWER_BOUND, p.alpha, p.beta) <= LOWER_BOUND_PERCENTILE + WEIGHT_TOLERANCE ? 'strong' : 'sufficient';
  } else {
    earned = p.alpha / (p.alpha + p.beta) < GAP_BELOW_MEAN ? 'gap' : 'developing';
  }
  if (!today || !faded(evidence, today)) return { earned, status: earned, due: false };
  const lowered = LEVEL_STATUSES[Math.max(1, LEVEL_STATUSES.indexOf(earned) - 1)]!;
  return { earned, status: lowered, due: lowered !== earned };
}

export function levelStatus(evidence: LevelEvidence | undefined, today?: StudyClock): LevelStatus {
  return levelAssessment(evidence, today).status;
}

/** The highest level a student has shown on a concept with every level under it shown too; undefined if none. */
export function shownThrough(levels: ConceptLevels | undefined, today?: StudyClock): ThinkingLevel | undefined {
  let top: ThinkingLevel | undefined;
  for (const level of THINKING_LEVELS) {
    if (!isShown(levelStatus(levels?.[level], today))) break;
    top = level;
  }
  return top;
}

function allShown(shape: ModuleShape, progress: ModuleProgress, levels: readonly ThinkingLevel[], today?: StudyClock): boolean {
  return shape.concepts.length > 0 &&
    shape.concepts.every((concept) => levels.every((level) => isShown(levelStatus(progress.concepts.get(concept)?.[level], today))));
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
    start.set(concept, upTo.find((level) => !isShown(levelStatus(levels?.[level], today))));
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
  /** Concepts of the most recent steps, most recent last. Optional; when given, no concept runs more than twice in a row. */
  recentConcepts?: readonly string[];
}

/** Brief #1281 section 3: no more than this many items from the same concept in a row, while another concept needs work. */
export const SAME_CONCEPT_RUN = 2;
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
      const missedLast = evidence?.recent.filter(isDirect).at(-1)?.correct === false;
      const due = levelAssessment(evidence, today).due;
      const levelIndex = THINKING_LEVELS.indexOf(level);
      // Review that is due first (so the loop keeps re-locating the student), then lower levels (foundations before
      // application), a recent miss first within a level, then module order.
      return { concept, level, evidence, due, rank: [due ? 0 : 1, levelIndex, missedLast ? 0 : 1, order] as const };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.rank[3] - b.rank[3]);

  // Interleave: a concept that has just had two steps in a row waits behind the others that need work.
  const runConcepts = (history.recentConcepts ?? []).slice(-SAME_CONCEPT_RUN);
  const streakConcept = runConcepts.length === SAME_CONCEPT_RUN && runConcepts.every((c) => c === runConcepts[0]) ? runConcepts[0] : undefined;
  if (streakConcept !== undefined && ranked.some((entry) => entry.concept !== streakConcept)) {
    ranked.splice(0, ranked.length, ...ranked.filter((entry) => entry.concept !== streakConcept), ...ranked.filter((entry) => entry.concept === streakConcept));
  }

  for (const { concept, level, evidence, due } of ranked) {
    const fitting = TECHNIQUES_FOR_LEVEL[level];
    const all = items.filter((item) => item.concept === concept && item.level === level && item.id !== lastId && fitting.includes(item.technique));
    // A level that is due is reviewed with items already answered there, the most faded first, so the review is
    // what brings it back; new items come once nothing there is left to review.
    const cards = evidence?.cards ?? {};
    const reviewable = due && today ? all.filter((item) => cards[item.id] !== undefined) : [];
    if (reviewable.length > 0) {
      const weakest = reviewable.reduce((a, b) => (predictedRecall(cards[a.id]!, today!) <= predictedRecall(cards[b.id]!, today!) ? a : b));
      return { kind: 'step', id: weakest.id, concept, level, technique: weakest.technique, reason: 'due for review' };
    }
    const pool = all;
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
      : evidence?.recent.filter(isDirect).at(-1)?.correct === false
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
  const levels = Object.fromEntries(THINKING_LEVELS.map((level) => [level, { 'not started': 0, gap: 0, developing: 0, sufficient: 0, strong: 0 }])) as
    Record<ThinkingLevel, Record<LevelStatus, number>>;
  const toStrengthen: string[] = [];
  for (const concept of shape.concepts) {
    const evidence = progress.concepts.get(concept);
    for (const level of THINKING_LEVELS) levels[level][levelStatus(evidence?.[level], today)] += 1;
    if (!READY_LEVELS.every((level) => isShown(levelStatus(evidence?.[level], today)))) toStrengthen.push(concept);
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
      levels[level].shown += summary.levels[level].sufficient + summary.levels[level].strong;
      levels[level].of += module.shape.concepts.length;
    }
  }
  return { modules: modules.length, stages, levels, ...(next ? { next } : {}) };
}
