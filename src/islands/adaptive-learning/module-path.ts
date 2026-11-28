// The module path (Christian, 2026-11-28): one module, start to finish.
//
//   input (video + reading) → active practice → diagnostic quiz → adaptive practice
//     → ready for the practice test → (optional) going deeper → module exam
//
// Pure rules, no browser or network code, so every choice can be explained and tested (D-36). Nothing here predicts
// an exam score: the engine reports what a student has shown, in words, at each thinking level.
// Design: docs/design/module-mastery-path.md.

import { dayNumber, type StudyClock } from './calendar';
import { recordAnswer, predictedRecall, type CardMemory } from './memory';
import { reviewDue } from './scheduler';

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
  /** The answer carried an item id. Answers without one are kept as history but never count toward the gate. */
  identified: boolean;
  /** A right answer on an item never seen before at this level, with no cue and no timeout (a first-try success). */
  fresh: boolean;
  /** The item answered again. It adds nothing to the evidence either way (retention, not understanding, is what it shows). */
  repeat: boolean;
  /** Set when the answer came from the diagnostic or the practice exam. */
  source?: AnswerSource;
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
  /** Newest event time per item (ms). A late-arriving older event can never replace a newer one, success or failure. */
  lastEventAt: Readonly<Record<string, number>>;
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
  /**
   * Explicit opt-in, default off: recommend the practice test after a perfect diagnostic without adaptive practice
   * (the "fast track", a departure from brief #1281 awaiting Christian's decision; see diagnosticFastTrack).
   */
  diagnosticFastTrack?: boolean;
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
/** Share of a level's cards that must be overdue before the level drops one status. UNVERIFIED (see the sweep in the design doc). */
export const FADE_SHARE = 1;
/** Days past the scheduler's review day before a card counts as overdue. UNVERIFIED. */
export const OVERDUE_GRACE_DAYS = 0;
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
/** The levels practised adaptively by default end here: remember is practised and shown but is not part of the gate. */
export const PRACTICE_LEVELS: readonly ThinkingLevel[] = ['remember', 'understand', 'apply'];
/** The levels a student must show on every concept before the practice test is recommended (brief #1281 section 3.5). */
export const GATE_LEVELS: readonly ThinkingLevel[] = ['understand', 'apply'];
/** Same as PRACTICE_LEVELS; the name earlier callers use. Readiness is judged on GATE_LEVELS. */
export const READY_LEVELS: readonly ThinkingLevel[] = PRACTICE_LEVELS;
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

/**
 * The card memory after one more answer to an item. Two rules keep retention honest:
 * - a failed or timed-out review never refreshes the card: its clock stays where it was, its half-life halves and it
 *   stays overdue until a later success (so a wrong review cannot restore a faded level);
 * - an event older than the card's newest answer (a device clock that went backward) is ignored for retention.
 */
function recordCard(previous: CardMemory | undefined, ok: boolean, clock: StudyClock, newestEvent: number | undefined): CardMemory | undefined {
  if (!Number.isFinite(clock.now)) return previous;
  // Event order is tracked apart from the last successful review: after a failure the card's clock stays at its last
  // success, so an older success arriving late must be compared with the failure's time, not with that clock.
  if (newestEvent !== undefined && clock.now < newestEvent) return previous;
  if (previous && (clock.now < previous.lastAt || dayNumber(clock.day) < dayNumber(previous.lastDay))) return previous;
  if (previous && !ok) return { ...previous, lastCorrect: false, halfLifeDays: Math.max(1, previous.halfLifeDays / 2), spacedSuccesses: 0 };
  return recordAnswer(previous, ok, clock);
}

export function recordLevelAnswer(previous: LevelEvidence | undefined, answered: boolean, detail: AnswerDetail = {}): LevelEvidence {
  const correct = answered && !detail.timedOut;
  const before = previous?.recent ?? [];
  const identified = detail.itemId !== undefined;
  const repeat = identified && (previous?.seen ?? []).includes(detail.itemId!);
  let streak = 0;
  const direct = before.filter((record) => record.direct && record.identified);
  for (let i = direct.length - 1; i >= 0 && direct[i]!.correct; i--) streak++;
  const cued = detail.cued === true;
  // A clock that moves backward cannot make the newest evidence older: the record takes the newest day seen so far.
  const newestDay = direct.filter((record) => record.day !== undefined).at(-1)?.day;
  const day = detail.clock ? Math.max(dayNumber(detail.clock.day), newestDay ?? Number.NEGATIVE_INFINITY) : undefined;
  const record: AnswerRecord = {
    correct,
    weight: repeat ? 0 : evidenceWeight(correct, detail),
    ...(day !== undefined ? { day } : {}),
    slip: !correct && streak >= SLIP_RUN,
    direct: true,
    identified,
    // Only an identified item can be shown to be unseen: an event without an item id is never a first-try success.
    fresh: correct && identified && !repeat && !cued,
    repeat,
    ...(detail.source ? { source: detail.source } : {}),
    ...(detail.technique ? { technique: detail.technique } : {}),
    cued,
    timedOut: detail.timedOut === true,
  };
  const cards = { ...(previous?.cards ?? {}) };
  const events = { ...(previous?.lastEventAt ?? {}) };
  if (identified && detail.clock) {
    // Cued or timed-out right answers do not strengthen memory.
    const card = recordCard(cards[detail.itemId!], correct && !cued, detail.clock, events[detail.itemId!]);
    if (card) cards[detail.itemId!] = card;
    if (Number.isFinite(detail.clock.now)) events[detail.itemId!] = Math.max(events[detail.itemId!] ?? Number.NEGATIVE_INFINITY, detail.clock.now);
  }
  return {
    right: (previous?.right ?? 0) + (correct ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (correct ? 0 : 1),
    // A repeated item is not independent evidence either way, so it takes no place in the window. It still feeds the
    // item's memory, which is how forgetting an item shows (see levelAssessment).
    // Answers without an item id are history (the right and wrong totals) only: they take no slot, so they can never
    // push identified evidence out of the window.
    recent: repeat || !identified ? before : trimmed([...before, record]),
    seen: identified && !repeat ? [...(previous?.seen ?? []), detail.itemId!] : previous?.seen ?? [],
    cards,
    lastEventAt: events,
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
    direct: false, identified: true, fresh: false, repeat: false, cued: false, timedOut: false,
  };
  return {
    right: previous?.right ?? 0,
    wrong: previous?.wrong ?? 0,
    recent: trimmed([...(previous?.recent ?? []), record]),
    seen: previous?.seen ?? [],
    cards: previous?.cards ?? {},
    lastEventAt: previous?.lastEventAt ?? {},
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
  const record = levels[level]!.recent.at(-1);
  if (record && record !== previousLast && record.correct && record.weight > 0 && !record.repeat && record.identified) {
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
    // Answers without an item id are history only: replays cannot be told from new evidence, so they count for nothing.
    if (!record.identified) continue;
    if (record.correct) right += record.weight;
    else missed += record.weight * (record.slip ? SLIP_MISS_SHARE : 1);
    if (record.direct) directWeight += record.weight;
    if (record.fresh) hasFresh = true;
  }
  const direct = (evidence?.recent ?? []).filter((record) => record.direct && record.identified);
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
  /** True when fading lowered the status (the tier-lowering policy, still being trialled). */
  due: boolean;
  /** How many of the level's cards are overdue. Any overdue card is eligible for review, whatever the status does. */
  overdue: number;
}

/**
 * A card is overdue when the existing scheduler's review day for it (scheduler.ts reviewDue) is already behind us.
 * That day is when predicted recall reaches the 80% line, so an overdue card is one that has crossed it and was
 * not reviewed in time. A card that is merely due today or tomorrow has not faded yet: this is the grace that keeps a
 * level studied yesterday from being revoked today (a first right answer has a 3-day half-life, 79.4% recall after
 * 24 hours, one hair under the line).
 */
export function cardOverdue(memory: CardMemory, today: StudyClock): boolean {
  // A card whose last response failed stays overdue until a later success.
  if (!memory.lastCorrect) return true;
  if (dayNumber(today.day) < dayNumber(memory.lastDay)) return false;
  return dayNumber(today.day) > dayNumber(reviewDue(memory, today)) + OVERDUE_GRACE_DAYS;
}

/** Cards of a level, newest evidence first, that are overdue for review at `today`. */
export function overdueCards(evidence: LevelEvidence, today: StudyClock): string[] {
  return Object.entries(evidence.cards).filter(([, memory]) => cardOverdue(memory, today)).map(([id]) => id);
}

/**
 * True when a level's cards have faded: at least FADE_SHARE of its cards are overdue (brief: "below 80% recall").
 * Judged on the scheduler's overdue test, not on raw recall, so studying across days does not revoke a level.
 */
function faded(evidence: LevelEvidence, overdue: number): boolean {
  const total = Object.keys(evidence.cards).length;
  return total > 0 && overdue / total >= FADE_SHARE;
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
const assessmentCache = new WeakMap<LevelEvidence, Map<string, LevelAssessment>>();

export function levelAssessment(evidence: LevelEvidence | undefined, today?: StudyClock): LevelAssessment {
  // Evidence is never changed once built, so an assessment depends only on it and on the day. Cached because the
  // next-step picker asks about every level many times.
  if (!evidence) return assess(evidence, today);
  const key = today?.day ?? '';
  let byDay = assessmentCache.get(evidence);
  if (!byDay) assessmentCache.set(evidence, (byDay = new Map()));
  let result = byDay.get(key);
  if (!result) byDay.set(key, (result = assess(evidence, today)));
  return result;
}

function assess(evidence: LevelEvidence | undefined, today?: StudyClock): LevelAssessment {
  if (!evidence || (evidence.right + evidence.wrong === 0 && evidence.recent.length === 0)) {
    return { earned: 'not started', status: 'not started', due: false, overdue: 0 };
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
  const overdue = today ? overdueCards(evidence, today).length : 0;
  if (!today || !faded(evidence, overdue)) return { earned, status: earned, due: false, overdue };
  const lowered = LEVEL_STATUSES[Math.max(1, LEVEL_STATUSES.indexOf(earned) - 1)]!;
  return { earned, status: lowered, due: lowered !== earned, overdue };
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

/**
 * DEPARTURE FROM THE BRIEF (for Christian's decision): the diagnostic is 6 to 12 items, and a level cannot reach
 * "sufficient" on that little evidence (that needs about six direct answers). So a prepared student could never skip
 * adaptive practice. Smallest fix: a **fast track** at student level, leaving every status word honest. If, in every
 * concept, both gate levels have a first-try right answer from the diagnostic, no direct miss, and nothing overdue,
 * the practice test is recommended without adaptive practice. The practice exam is never locked either way.
 */
export function diagnosticFastTrack(shape: ModuleShape, progress: ModuleProgress, today?: StudyClock): boolean {
  if (!shape.diagnosticFastTrack || !progress.diagnosed || shape.concepts.length === 0) return false;
  return shape.concepts.every((concept) => GATE_LEVELS.every((level) => {
    const evidence = progress.concepts.get(concept)?.[level];
    const direct = evidence?.recent.filter(isDirect) ?? [];
    return direct.some((record) => record.source === 'diagnostic' && record.fresh) && direct.every((record) => record.correct) &&
      levelAssessment(evidence, today).overdue === 0;
  }));
}

/** Where the student is in the module, from what they have done so far. Stages are suggestions, never locks. */
export function stageOf(shape: ModuleShape, progress: ModuleProgress, today?: StudyClock): Stage {
  if (progress.examDone) return 'complete';
  if (!progress.watched || !progress.read) return 'input';
  if (!progress.diagnosed) {
    return shape.practiceTechniques.every((technique) => progress.practised.includes(technique)) ? 'diagnostic' : 'practice';
  }
  if (!allShown(shape, progress, GATE_LEVELS, today) && !diagnosticFastTrack(shape, progress, today)) return 'adaptive';
  if (progress.wantsDeeper && !allShown(shape, progress, DEEPER_LEVELS, today)) return 'deeper';
  return progress.wantsDeeper ? 'exam' : 'ready';
}

/**
 * Where adaptive practice starts for each concept after the diagnostic quiz: the lowest level not yet shown.
 * A concept the quiz never reached starts at "remember".
 */
export function calibrate(shape: ModuleShape, progress: ModuleProgress, upTo: readonly ThinkingLevel[] = GATE_LEVELS, today?: StudyClock): Map<string, ThinkingLevel | undefined> {
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
  /** `reviewDue` is present only when cards are overdue: optional reviews, never a block on "done". */
  | { kind: 'done'; reviewDue?: readonly { concept: string; level: ThinkingLevel; cards: readonly string[] }[] }
  /** `exhausted` is present when a level has no unseen item left: every item there was already answered. */
  | { kind: 'no content'; concepts: readonly string[]; exhausted?: readonly { concept: string; level: ThinkingLevel }[] };

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
  upTo: readonly ThinkingLevel[] = GATE_LEVELS,
  today?: StudyClock,
): NextResult {
  // A perfect diagnostic that has not lapsed needs no adaptive practice (opt-in departure, see diagnosticFastTrack).
  // Compared by content, never by array identity.
  if (sameLevels(upTo, GATE_LEVELS) && diagnosticFastTrack(shape, progress, today)) return { kind: 'done' };
  const context: PickContext = { items, lastId: history.usedIds.at(-1), history, random, upTo, today };
  const start = calibrate(shape, progress, upTo, today);

  // Phase 1: completion is decided from the calibrated unfinished levels only.
  const complete = isComplete(shape, start);
  // Phase 2: eligible due cards (answered, overdue, in the pool) on levels whose tier was lowered.
  const due = orderCandidates(dueCandidates(shape, progress, upTo, today), history);
  // Phase 3: new material for the calibrated levels (a level's own overdue cards come at its turn).
  const calibrated = orderCandidates(calibratedCandidates(shape, progress, start, today), history);
  // Phase 4: due cards first, then new material.
  const dueStep = firstDueCard(due, context);
  if (dueStep) return dueStep;
  const exhausted: { concept: string; level: ThinkingLevel }[] = [];
  const newStep = firstNewMaterial(calibrated, context, exhausted);
  if (newStep) return newStep;
  // Overdue cards on other levels come back when the remaining work has nothing to offer, but only while work remains.
  if (!complete) {
    const optional = optionalReviewCandidates(shape, progress, start, due, upTo, today);
    const optionalStep = firstDueCard(optional, context);
    if (optionalStep) return optionalStep;
  }
  // Phase 5: nothing usable. A module with no concepts has shown nothing, so it is never "done".
  if (shape.concepts.length === 0) return { kind: 'no content', concepts: [] };
  if (complete) {
    const reviewDue = today ? shape.concepts.flatMap((concept) => upTo.flatMap((level) => {
      const evidence = progress.concepts.get(concept)?.[level];
      const cards = evidence ? overdueCards(evidence, today) : [];
      return cards.length > 0 ? [{ concept, level, cards }] : [];
    })) : [];
    return reviewDue.length > 0 ? { kind: 'done', reviewDue } : { kind: 'done' };
  }
  return {
    kind: 'no content',
    concepts: [...new Set(calibrated.map((entry) => entry.concept))],
    ...(exhausted.length > 0 ? { exhausted } : {}),
  };
}

// --- The phases of nextStep, each a small pure function. -------------------------------------------------------

interface PickContext {
  items: readonly ModuleItem[];
  lastId: string | undefined;
  history: StepHistory;
  random: () => number;
  upTo: readonly ThinkingLevel[];
  today: StudyClock | undefined;
}

/** A concept at a level that might be offered, with what ranks it. */
interface Candidate {
  concept: string;
  level: ThinkingLevel;
  evidence: LevelEvidence | undefined;
  rank: readonly [levelIndex: number, missedLast: number, order: number];
}

/** Level lists are compared by content: the same levels in any order mean the same policy. */
function sameLevels(a: readonly ThinkingLevel[], b: readonly ThinkingLevel[]): boolean {
  return a.length === b.length && a.every((level) => b.includes(level)) && b.every((level) => a.includes(level));
}

/** Phase 1. Complete means every concept has no calibrated unfinished level (and there is at least one concept). */
function isComplete(shape: ModuleShape, start: ReadonlyMap<string, ThinkingLevel | undefined>): boolean {
  return shape.concepts.length > 0 && shape.concepts.every((concept) => start.get(concept) === undefined);
}

function candidate(progress: ModuleProgress, shape: ModuleShape, concept: string, level: ThinkingLevel): Candidate {
  const evidence = progress.concepts.get(concept)?.[level];
  const missedLast = evidence?.recent.filter(isDirect).at(-1)?.correct === false;
  return { concept, level, evidence, rank: [THINKING_LEVELS.indexOf(level), missedLast ? 0 : 1, shape.concepts.indexOf(concept)] };
}

/** Every (concept, level) whose tier was lowered by fading, so a due card at any of them is found, not only the lowest. */
function dueCandidates(shape: ModuleShape, progress: ModuleProgress, upTo: readonly ThinkingLevel[], today: StudyClock | undefined): Candidate[] {
  if (!today) return [];
  return shape.concepts.flatMap((concept) => upTo
    .filter((level) => levelAssessment(progress.concepts.get(concept)?.[level], today).due)
    .map((level) => candidate(progress, shape, concept, level)));
}

/** For each concept, the level calibration says is still unfinished. */
function calibratedCandidates(shape: ModuleShape, progress: ModuleProgress, start: ReadonlyMap<string, ThinkingLevel | undefined>, today: StudyClock | undefined): Candidate[] {
  void today;
  return shape.concepts.flatMap((concept) => {
    const level = start.get(concept);
    return level ? [candidate(progress, shape, concept, level)] : [];
  });
}

/** Levels holding overdue cards that are neither lowered nor the calibrated one: reviewed only when nothing else is usable. */
function optionalReviewCandidates(
  shape: ModuleShape, progress: ModuleProgress, start: ReadonlyMap<string, ThinkingLevel | undefined>,
  due: readonly Candidate[], upTo: readonly ThinkingLevel[], today: StudyClock | undefined,
): Candidate[] {
  if (!today) return [];
  return shape.concepts.flatMap((concept) => upTo.flatMap((level) => {
    const evidence = progress.concepts.get(concept)?.[level];
    const taken = level === start.get(concept) || due.some((entry) => entry.concept === concept && entry.level === level);
    return evidence && !taken && levelAssessment(evidence, today).overdue > 0 ? [candidate(progress, shape, concept, level)] : [];
  }));
}

/** Foundations first, a recent miss first within a level, then module order; then the interleave rule. */
function orderCandidates(candidates: readonly Candidate[], history: StepHistory): Candidate[] {
  const sorted = [...candidates].sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2]);
  // Interleave (brief #1281): a concept that has just had two steps in a row waits behind the others that need work.
  const run = (history.recentConcepts ?? []).slice(-SAME_CONCEPT_RUN);
  const streak = run.length === SAME_CONCEPT_RUN && run.every((c) => c === run[0]) ? run[0] : undefined;
  if (streak === undefined || !sorted.some((entry) => entry.concept !== streak)) return sorted;
  return [...sorted.filter((entry) => entry.concept !== streak), ...sorted.filter((entry) => entry.concept === streak)];
}

/** Items of a level that fit its techniques, other than the one just shown. */
function levelPool(entry: Candidate, context: PickContext): ModuleItem[] {
  const fitting = TECHNIQUES_FOR_LEVEL[entry.level];
  return context.items.filter((item) => item.concept === entry.concept && item.level === entry.level && item.id !== context.lastId && fitting.includes(item.technique));
}

/** A review step from the level's answered, overdue cards present in the pool, the most faded first. */
function reviewStep(entry: Candidate, context: PickContext): NextStep | undefined {
  const { today } = context;
  const cards = entry.evidence?.cards;
  if (!today || !cards) return undefined;
  const eligible = levelPool(entry, context).filter((item) => cards[item.id] !== undefined && cardOverdue(cards[item.id]!, today));
  if (eligible.length === 0) return undefined;
  const weakest = eligible.reduce((a, b) => (predictedRecall(cards[a.id]!, today) <= predictedRecall(cards[b.id]!, today) ? a : b));
  return { id: weakest.id, concept: entry.concept, level: entry.level, technique: weakest.technique, reason: 'due for review' };
}

/** Phase 2/4: the first candidate with an eligible due card. */
function firstDueCard(candidates: readonly Candidate[], context: PickContext): ({ kind: 'step' } & NextStep) | undefined {
  for (const entry of candidates) {
    const step = reviewStep(entry, context);
    if (step) return { kind: 'step', ...step };
  }
  return undefined;
}

/**
 * Phase 3/4: new material for the first calibrated candidate that has any. A level's own overdue cards come first at
 * its turn; outside a review only items not yet answered there are offered, because a repeat carries no weight.
 * Levels that have items but none unseen are recorded in `exhausted`.
 */
function firstNewMaterial(candidates: readonly Candidate[], context: PickContext, exhausted: { concept: string; level: ThinkingLevel }[]): ({ kind: 'step' } & NextStep) | undefined {
  const { history, random, upTo } = context;
  const run = history.recentTechniques.slice(-SAME_TECHNIQUE_RUN);
  const tired = run.length === SAME_TECHNIQUE_RUN && run.every((technique) => technique === run[0]) ? run[0] : undefined;
  for (const entry of candidates) {
    const review = reviewStep(entry, context);
    if (review) return { kind: 'step', ...review };
    const all = levelPool(entry, context);
    const answered = new Set(entry.evidence?.seen ?? []);
    const pool = all.filter((item) => !answered.has(item.id));
    if (pool.length === 0) {
      if (all.length > 0 && !exhausted.some((e) => e.concept === entry.concept && e.level === entry.level)) exhausted.push({ concept: entry.concept, level: entry.level });
      continue;
    }
    // Variety first: drop the technique that has just run twice whenever another one fits, and only then prefer
    // items not used this session.
    const varied = pool.filter((item) => item.technique !== tired);
    const choices0 = varied.length > 0 ? varied : pool;
    const fresh = choices0.filter((item) => !history.usedIds.includes(item.id));
    const choices = fresh.length > 0 ? fresh : choices0;
    const fitting = TECHNIQUES_FOR_LEVEL[entry.level];
    // Best-fitting technique first; ties broken by the caller's randomness.
    const best = Math.min(...choices.map((item) => fitting.indexOf(item.technique)));
    const top = choices.filter((item) => fitting.indexOf(item.technique) === best);
    const pick = top[Math.min(top.length - 1, Math.floor(random() * top.length))]!;
    const asked = (entry.evidence?.right ?? 0) + (entry.evidence?.wrong ?? 0);
    const reason: NextStep['reason'] = entry.evidence?.recent.filter(isDirect).at(-1)?.correct === false
      ? 'you missed this recently'
      : asked === 0
        ? (entry.level === upTo[0] || entry.level === 'remember' ? 'not practised yet' : 'next level up')
        : 'one more to lock it in';
    return { kind: 'step', id: pick.id, concept: entry.concept, level: entry.level, technique: pick.technique, reason };
  }
  return undefined;
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
    if (!GATE_LEVELS.every((level) => isShown(levelStatus(evidence?.[level], today)))) toStrengthen.push(concept);
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
