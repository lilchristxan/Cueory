import { describe, expect, it } from 'vitest';
import { breakSuggestion, dailyGoalSets, momentsAfterSet, REST_DAYS_PER_WEEK, SETS_BEFORE_BREAK, streak } from '../../src/islands/adaptive-learning/momentum';

const set = (right: number, asked = 5) => ({ right, asked });

describe('momentum: honest stopping points', () => {
  it('offers a break after the planned number of sets', () => {
    expect(breakSuggestion([set(4), set(4), set(4)])).toBeUndefined();
    expect(breakSuggestion(Array.from({ length: SETS_BEFORE_BREAK }, () => set(4)))).toBe('sets done');
  });

  it('offers a break early when results slide two sets running', () => {
    expect(breakSuggestion([set(5), set(4), set(3)])).toBe('tiring');
    expect(breakSuggestion([set(3), set(4), set(5)])).toBeUndefined();
    expect(breakSuggestion([set(5), set(3), set(4)])).toBeUndefined();
  });
});

describe('momentum: moments are tied to what the student did', () => {
  it('marks a clean set, a comeback and a level shown, biggest first', () => {
    const moments = momentsAfterSet([set(5)], { comebacks: ['sample-a'], levelsShown: [{ concept: 'sample-a', level: 'apply' }], nowReady: true });
    expect(moments.map((moment) => moment.kind)).toEqual(['ready for the practice test', 'level shown', 'comeback', 'clean set']);
  });

  it('an ordinary set still gets its finish line, and nothing is invented for an empty one', () => {
    expect(momentsAfterSet([set(3)], {})).toEqual([{ kind: 'set done', right: 3, asked: 5 }]);
    expect(momentsAfterSet([], {})).toEqual([]);
    expect(momentsAfterSet([set(0, 0)], { nowReady: true })).toEqual([]);
  });
});

describe('momentum: a forgiving streak', () => {
  it('counts days studied and forgives rest days', () => {
    expect(streak(['2026-11-24', '2026-11-25', '2026-11-27'], '2026-11-27')).toEqual({ days: 3, restUsed: 1, studiedToday: true });
  });

  it('today not studied yet does not break or use up anything', () => {
    expect(streak(['2026-11-26', '2026-11-27'], '2026-11-28')).toEqual({ days: 2, restUsed: 0, studiedToday: false });
  });

  it(`ends after more than ${REST_DAYS_PER_WEEK} rest days in a week`, () => {
    expect(streak(['2026-11-20', '2026-11-27'], '2026-11-27').days).toBe(1);
    expect(streak(['2026-11-24', '2026-11-27'], '2026-11-27').days).toBe(2);
    expect(streak([], '2026-11-27')).toEqual({ days: 0, restUsed: 0, studiedToday: false });
  });

  it('rejects a malformed day', () => {
    expect(() => streak(['yesterday'], '2026-11-27')).toThrow();
  });
});

describe('momentum: the daily goal stays finishable', () => {
  it('starts at one set and grows slowly up to the break point', () => {
    expect(dailyGoalSets(0)).toBe(1);
    expect(dailyGoalSets(7)).toBe(2);
    expect(dailyGoalSets(365)).toBe(SETS_BEFORE_BREAK);
    expect(dailyGoalSets(-3)).toBe(1);
  });
});
