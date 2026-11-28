import { describe, expect, it } from 'vitest';
import type { AdaptiveAttempt, AdaptiveQuestion } from '../../src/islands/adaptive';
import { calendarDay, DAY_MS, dayNumber } from '../../src/islands/adaptive-learning/calendar';
import { estimateLevel, selectLevelQuestion } from '../../src/islands/adaptive-learning/level-test';
import {
  cardMastered, conceptMastered, predictedRecall, recordAnswer, recordConceptAnswer,
} from '../../src/islands/adaptive-learning/memory';
import { reviewDue } from '../../src/islands/adaptive-learning/scheduler';
import { selectPractice, SESSION_LIMIT } from '../../src/islands/adaptive-learning/selector';

function clock(offset: number) {
  const day = dayNumber('2028-02-27') + offset;
  return { now: day * DAY_MS + DAY_MS / 2, day: calendarDay(day) };
}

describe('adaptive card memory', () => {
  it('uses elapsed time, credits distinct calendar days, and resets on a miss', () => {
    const introduced = recordAnswer(undefined, true, clock(0));
    expect(predictedRecall(introduced, clock(3))).toBe(0.5);
    const sameDay = recordAnswer(introduced, true, { ...clock(0), now: clock(0).now + 1000 });
    expect(sameDay.halfLifeDays).toBe(3);
    expect(sameDay.spacedSuccesses).toBe(0);
    const first = recordAnswer(sameDay, true, clock(1));
    const second = recordAnswer(first, true, clock(2));
    expect(cardMastered(first, clock(2))).toBe(false);
    expect(cardMastered(second, clock(2))).toBe(true);
    expect(cardMastered(second, clock(8))).toBe(false);
    expect(conceptMastered(new Map([['a', second]]), clock(2))).toBe(false);
    expect(conceptMastered(new Map([['a', first], ['b', second]]), clock(2))).toBe(false);
    expect(conceptMastered(new Map([['a', second], ['b', second]]), clock(2))).toBe(true);
    const missed = recordAnswer(second, false, clock(3));
    expect(missed.halfLifeDays).toBe(second.halfLifeDays / 2);
    expect(recordAnswer(missed, true, clock(3)).spacedSuccesses).toBe(0);
    expect(() => recordAnswer(second, true, clock(0))).toThrow(/chronological/);
  });

  it('records concept results without answer material', () => {
    const right = recordConceptAnswer(undefined, true, clock(0));
    expect(recordConceptAnswer(right, false, clock(1))).toEqual({
      right: 1, wrong: 1, lastCorrect: false, lastDay: '2028-02-28',
    });
  });
});

describe('adaptive review scheduling', () => {
  it('anchors overdue work, handles leap days and uses the day before a future exam', () => {
    const answered = { ...recordAnswer(undefined, true, clock(0)), halfLifeDays: 60, spacedSuccesses: 2 };
    expect(reviewDue(answered, clock(0))).toBe('2028-03-12');
    expect(reviewDue(answered, clock(25))).toBe('2028-03-12');
    expect(reviewDue(answered, clock(0), '2028-03-01')).toBe('2028-02-29');
    expect(reviewDue(answered, clock(0), '2028-02-28')).toBe('2028-03-12');
    expect(reviewDue(answered, clock(5), '2028-03-01')).toBe('2028-03-12');
    expect(() => reviewDue(answered, clock(0), '2027-02-29')).toThrow(RangeError);
  });

  it('rebuilds the interval after a lapse on a well-practiced card', () => {
    let mature = recordAnswer(undefined, true, clock(0));
    for (let day = 1; day <= 10; day++) mature = recordAnswer(mature, true, clock(day));
    expect(reviewDue(mature, clock(10))).toBe(clock(24).day);

    const missed = recordAnswer(mature, false, clock(24));
    const nextDayRecall = recordAnswer(missed, true, clock(25));
    expect(reviewDue(nextDayRecall, clock(25))).toBe(clock(28).day);
    const corrected = recordAnswer(missed, true, clock(24));
    expect(reviewDue(missed, clock(24))).toBe(clock(25).day);
    expect(reviewDue(corrected, clock(24))).toBe(clock(25).day);

    const firstRecall = recordAnswer(corrected, true, clock(25));
    expect(cardMastered(firstRecall, clock(25))).toBe(false);
    expect(reviewDue(firstRecall, clock(25))).toBe(clock(28).day);
    expect(reviewDue(firstRecall, clock(26))).toBe(clock(28).day);
    expect(reviewDue(firstRecall, clock(25), clock(27).day)).toBe(clock(26).day);

    const missedAgain = recordAnswer(firstRecall, false, clock(28));
    expect(reviewDue(missedAgain, clock(28))).toBe(clock(29).day);
    const secondRecall = recordAnswer(firstRecall, true, clock(28));
    expect(cardMastered(secondRecall, clock(28))).toBe(true);
    expect(reviewDue(secondRecall, clock(28))).toBe(clock(42).day);
  });

  it('keeps the earlier model date for a card that needs review before the recovery cap', () => {
    const missed = recordAnswer(undefined, false, clock(0));
    const firstRecall = recordAnswer(missed, true, clock(1));
    expect(reviewDue(firstRecall, clock(1))).toBe(clock(2).day);
  });

  it('never makes the correct branch due sooner than the missed branch', () => {
    let memory = recordAnswer(undefined, true, clock(0));
    for (let day = 1; day <= 500; day++) {
      const today = clock(day);
      const correct = recordAnswer(memory, true, today);
      const missed = recordAnswer(memory, false, today);
      for (const examDay of [undefined, today.day, clock(day + 1).day, clock(day + 9).day]) {
        expect(reviewDue(correct, today, examDay) >= reviewDue(missed, today, examDay)).toBe(true);
        expect(reviewDue(missed, today, examDay)).toBe(clock(day + 1).day);
      }
      memory = day % 23 < 17 ? correct : missed;
      expect(memory.halfLifeDays).toBeGreaterThanOrEqual(1);
      expect(memory.halfLifeDays).toBeLessThanOrEqual(120);
    }
  });
});

describe('adaptive selection', () => {
  const evidence = new Map([['a', recordConceptAnswer(undefined, false, clock(0))]]);
  const preferredLevels = new Map();
  const items = [
    { id: 'new', concept: 'b', level: 2 },
    { id: 'weak', concept: 'a', level: 2 },
    { id: 'fresh-due', concept: 'a', level: 2, dueDay: clock(1).day },
    { id: 'old-due', concept: 'a', level: 2, dueDay: clock(0).day },
    { id: 'future', concept: 'a', level: 2, dueDay: clock(2).day },
  ] as const;

  it('prioritizes old due reviews, then weak concepts, then new material', () => {
    const choose = (remaining: typeof items[number][]) =>
      selectPractice(remaining, { selections: 0, evidence, preferredLevels }, clock(1), () => 0.5);
    expect(choose([...items])).toEqual({ id: 'old-due', reason: 'due review' });
    expect(choose(items.slice(0, 2))).toEqual({ id: 'weak', reason: 'weak concept' });
    expect(choose([items[0], items[4]])).toEqual({ id: 'new', reason: 'new material' });
    expect(choose([items[4]])).toBeUndefined();
  });

  it('offers an unseen concept before more cards from a strong concept', () => {
    const strong = { right: 9, wrong: 0, lastCorrect: true, lastDay: clock(0).day };
    const session = { selections: 0, evidence: new Map([['a', strong]]), preferredLevels };
    const sameConcept = { id: 'more', concept: 'a', level: 2 } as const;
    const unseen = { id: 'unseen', concept: 'b', level: 3 } as const;
    expect(selectPractice([sameConcept, unseen], session, clock(1), () => 0))
      .toEqual({ id: 'unseen', reason: 'new material' });
    expect(selectPractice([sameConcept], session, clock(1), () => 0))
      .toEqual({ id: 'more', reason: 'new material' });
  });

  it('terminates across many deck sizes and excludes the last item even in a one-card deck', () => {
    for (let size = 0; size < 60; size++) {
      const deck = Array.from({ length: size }, (_, index) => ({ ...items[0], id: String(index) }));
      let previousId: string | undefined;
      let selections = 0;
      while (selections <= SESSION_LIMIT) {
        const next = selectPractice(
          deck, { selections, previousId, evidence, preferredLevels }, clock(0),
          () => ((size * 17 + selections * 13) % 97) / 97,
        );
        if (!next) break;
        expect(next.id).not.toBe(previousId);
        previousId = next.id;
        selections++;
      }
      expect(selections).toBe(size < 2 ? size : SESSION_LIMIT);
    }
  });
});

describe('unit check evidence', () => {
  const questions: AdaptiveQuestion[] = [
    { id: 'a2', concept: 'a', level: 2 }, { id: 'a3', concept: 'a', level: 3 },
    { id: 'b1', concept: 'b', level: 1 }, { id: 'b3', concept: 'b', level: 3 },
  ];

  it('asks one per concept before revisiting and ignores duplicate or unknown answers', () => {
    const attempts: AdaptiveAttempt[] = [];
    expect(selectLevelQuestion([], attempts, () => 0.5)).toBeUndefined();
    expect(estimateLevel([], attempts)).toEqual([]);
    expect(estimateLevel(questions, attempts)[0]?.descriptiveRange).toBeUndefined();
    for (const [id, right] of [['a2', true], ['b1', false], ['a3', true]] as const) {
      expect(selectLevelQuestion(questions, attempts, () => 0.5)).toBe(id);
      attempts.push({ questionId: id, right });
    }
    expect(selectLevelQuestion(questions, attempts, () => 0.5)).toBeUndefined();
    attempts.push({ questionId: 'a2', right: false }, { questionId: 'unknown', right: true });
    const [a, b] = estimateLevel(questions, attempts);
    expect(a).toMatchObject({ status: 'got it', asked: 2, right: 2, levels: [2, 3], harderAvailable: true });
    expect(a?.descriptiveRange?.lower).toBeCloseTo(0.342, 2);
    expect(b).toMatchObject({ status: 'learning', asked: 1, right: 0, levels: [1] });
    expect(b?.descriptiveRange?.upper).toBeCloseTo(0.793, 2);
  });
});
