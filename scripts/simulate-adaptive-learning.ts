/** Run with the existing esbuild binary and Node. All IDs and outcomes are synthetic. */
import { calendarDay, DAY_MS, dayNumber } from '../src/islands/adaptive-learning/calendar';
import {
  cardMastered, recordAnswer, recordConceptAnswer, type CardMemory, type ConceptEvidence,
} from '../src/islands/adaptive-learning/memory';
import { reviewDue } from '../src/islands/adaptive-learning/scheduler';
import { selectPractice, SESSION_LIMIT, type PracticeItem } from '../src/islands/adaptive-learning/selector';
import { nextReview, type Review } from '../src/islands/review';

const STUDENTS = 2_000;
const DAYS = 45;
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

function recall(card: SyntheticCard, delay: number): number {
  return card.lastDay === undefined ? 0.55 : 2 ** (-delay / card.trueHalfLife);
}

function runStudent(student: number, scheme: 'adaptive' | 'ladder', totals: Totals): void {
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
      const dueDay = card.memory && (scheme === 'adaptive'
        ? reviewDue(card.memory, today)
        : nextReview(card.history));
      return dueDay && dueDay > today.day ? [] : [{ ...card.item, dueDay }];
    });
    let previousId: string | undefined;
    for (let selections = 0; selections < SESSION_LIMIT; selections++) {
      const next = selectPractice(
        items, { selections, previousId, evidence, preferredLevels }, today,
        () => draw(student, day, CARDS + selections),
      );
      if (!next) break;
      const index = Number(next.id);
      const card = deck[index]!;
      const delay = day - (card.lastDay ?? day);
      const correct = draw(student, day, index) < recall(card, delay);
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
  for (const card of deck) totals.probeRecall += recall(card, 7);
  if (dayMastered !== undefined) {
    totals.masteryDays += dayMastered;
    totals.mastered++;
  }
}

for (const scheme of ['adaptive', 'ladder'] as const) {
  const totals: Totals = { probeRecall: 0, reviews: 0, masteryDays: 0, mastered: 0 };
  for (let student = 1; student <= STUDENTS; student++) runStudent(student, scheme, totals);
  console.log(JSON.stringify({
    scheme,
    students: STUDENTS,
    calendarDays: DAYS,
    recallAtSevenDays: (totals.probeRecall / (STUDENTS * CARDS)).toFixed(4),
    answersPerCalendarDay: (totals.reviews / (STUDENTS * DAYS)).toFixed(2),
    daysToMasteryAmongThoseReachingIt: totals.mastered ? (totals.masteryDays / totals.mastered).toFixed(2) : null,
    shareNotAtMastery: (1 - totals.mastered / STUDENTS).toFixed(4),
  }));
}
