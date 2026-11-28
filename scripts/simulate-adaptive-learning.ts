/** Run with the existing esbuild binary and Node. All IDs and outcomes are synthetic. */
import { calendarDay, DAY_MS, dayNumber } from '../src/islands/adaptive-learning/calendar';
import {
  cardMastered, recordAnswer, recordConceptAnswer, type CardMemory, type ConceptEvidence,
} from '../src/islands/adaptive-learning/memory';
import { reviewDue } from '../src/islands/adaptive-learning/scheduler';
import { selectPractice, SESSION_LIMIT, type PracticeItem } from '../src/islands/adaptive-learning/selector';
import { nextReview, type Review } from '../src/islands/review';
import { syntheticRecallOn } from './adaptive-simulation-recall';

const STUDENTS = 2_000;
const DAYS = 45;
const FOLLOW_UP_DAY = DAYS - 1 + 7;
const CARDS = 24;
const FIRST_DAY = dayNumber('2028-01-01');
const preferredLevels = new Map<string, PracticeItem['level']>();

interface SyntheticCard {
  item: PracticeItem;
  history: Review[];
  memory?: CardMemory;
  trueHalfLife: number;
  lastDay?: number;
}

interface Totals {
  probeRecall: number;
  reviews: number;
  masteryDays: number;
  mastered: number;
}

function draw(seed: number, day: number, card: number): number {
  let word = seed * 1_000_003 + day * 31_337 + card * 101;
  word = Math.imul(word ^ (word >>> 16), 0x7feb352d);
  word = Math.imul(word ^ (word >>> 15), 0x846ca68b);
  return ((word ^ (word >>> 16)) >>> 0) / 2 ** 32;
}

function clock(day: number) {
  const calendar = FIRST_DAY + day;
  return { day: calendarDay(calendar), now: (calendar + 0.5) * DAY_MS };
}

type Scheme = 'adaptive' | 'before-relearning' | 'ladder';

function dueFor(card: SyntheticCard, scheme: Scheme, today: ReturnType<typeof clock>) {
  if (!card.memory) return;
  if (scheme === 'ladder') return nextReview(card.history);
  if (scheme === 'adaptive') return reviewDue(card.memory, today);
  // Frozen comparison: the no-exam policy on staging at 897f493c.
  const interval = card.memory.lastCorrect
    ? Math.min(14, Math.max(1, Math.ceil(-Math.log2(0.8) * card.memory.halfLifeDays)))
    : 1;
  return calendarDay(dayNumber(card.memory.lastDay) + interval);
}

/** Yield the eligible card count before each attended session, then accept its answer budget. */
function* runStudent(student: number, scheme: Scheme, totals: Totals): Generator<number, void, number> {
  const initialStrength = 1.75 + 4.5 * draw(student, -1, 0);
  const deck: SyntheticCard[] = Array.from({ length: CARDS }, (_, index) => ({
    item: { id: String(index), concept: String(Math.floor(index / 4)), level: 2 },
    history: [],
    trueHalfLife: initialStrength * (0.65 + 0.7 * draw(student, -1, index + 1)),
  }));
  const evidence = new Map<string, ConceptEvidence>();
  let dayMastered: number | undefined;

  for (let day = 0; day < DAYS; day++) {
    // Students keep the same attendance and recall draws under both policies.
    if (draw(student, day, -1) < 0.18) continue;
    const today = clock(day);
    // The next scheduled review is always at least tomorrow after an answer.
    const items = deck.flatMap(card => {
      const dueDay = dueFor(card, scheme, today);
      return dueDay && dueDay > today.day ? [] : [{ ...card.item, dueDay }];
    });
    const dailyLimit = yield items.length;
    let previousId: string | undefined;
    for (let selections = 0; selections < dailyLimit; selections++) {
      const next = selectPractice(
        items, { selections, previousId, evidence, preferredLevels }, today,
        () => draw(student, day, CARDS + selections),
      );
      if (!next) break;
      const index = Number(next.id);
      const card = deck[index]!;
      const delay = day - (card.lastDay ?? day);
      const correct = draw(student, day, index) < syntheticRecallOn(card, day);
      card.memory = recordAnswer(card.memory, correct, today);
      card.history.push({ day: today.day, result: correct ? 'knew' : 'missed' });
      evidence.set(card.item.concept, recordConceptAnswer(evidence.get(card.item.concept), correct, today));
      // This latent model is deliberately different from the engine's fixed update.
      // Retrieval growth varies with elapsed time; a miss still provides exposure.
      const growth = correct ? 1.26 + Math.min(0.38, delay * 0.065) : 1.09;
      card.trueHalfLife = Math.min(90, card.trueHalfLife * growth);
      card.lastDay = day;
      totals.reviews++;
      previousId = next.id;
      items.splice(items.findIndex(item => item.id === next.id), 1);
    }
    if (dayMastered === undefined && deck.every(card => card.memory && cardMastered(card.memory, today))) {
      dayMastered = day + 1;
    }
  }
  for (const card of deck) totals.probeRecall += syntheticRecallOn(card, FOLLOW_UP_DAY);
  if (dayMastered !== undefined) {
    totals.masteryDays += dayMastered;
    totals.mastered++;
  }
}

const matchWork = process.argv.includes('--matched-work');
const comparison: Scheme = matchWork ? 'before-relearning' : 'ladder';
const adaptive: Totals = { probeRecall: 0, reviews: 0, masteryDays: 0, mastered: 0 };
const control: Totals = { ...adaptive };
for (let student = 1; student <= STUDENTS; student++) {
  const current = runStudent(student, 'adaptive', adaptive);
  const baseline = runStudent(student, comparison, control);
  let currentDay = current.next();
  let baselineDay = baseline.next();
  while (!currentDay.done && !baselineDay.done) {
    const limit = matchWork ? Math.min(SESSION_LIMIT, currentDay.value, baselineDay.value) : SESSION_LIMIT;
    currentDay = current.next(limit);
    baselineDay = baseline.next(limit);
    if (matchWork && adaptive.reviews !== control.reviews) throw new Error('Daily answer counts differ.');
  }
  if (currentDay.done !== baselineDay.done) throw new Error('Attendance differs.');
}
for (const [scheme, totals] of [['adaptive', adaptive], [comparison, control]] as const) {
  console.log(JSON.stringify({
    scheme,
    students: STUDENTS,
    calendarDays: DAYS,
    totalAnswers: totals.reviews,
    recallAtSevenDayFollowUp: (totals.probeRecall / (STUDENTS * CARDS)).toFixed(4),
    answersPerCalendarDay: (totals.reviews / (STUDENTS * DAYS)).toFixed(2),
    daysToMasteryAmongThoseReachingIt: totals.mastered ? (totals.masteryDays / totals.mastered).toFixed(2) : null,
    shareNotAtMastery: (1 - totals.mastered / STUDENTS).toFixed(4),
  }));
}
