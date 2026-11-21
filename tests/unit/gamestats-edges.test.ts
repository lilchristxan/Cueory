import { describe, expect, it } from 'vitest';
import {
  currentStreak, dailyStats, parseStats, recordResult, serialize, wordPathSummary, wordPathSummaryInWords,
  type GameResult, type GameStats,
} from '../../src/islands/gamestats';

const r = (game: GameResult['game'], day: string, solved: boolean, tries = 3, extra: Partial<GameResult> = {}): GameResult =>
  ({ game, day, solved, tries, ...extra });

describe('dailyStats edge cases', () => {
  it('ignores solves outside 1..maxTries in the distribution but still counts them as played', () => {
    const stats: GameStats = [r('pulse', '2026-11-01', true, 0), r('pulse', '2026-11-02', true, 7), r('pulse', '2026-11-03', true, 2)];
    const value = dailyStats(stats, 'pulse', '2026-11-03', 6);
    expect(value.distribution).toEqual([0, 1, 0, 0, 0, 0]);
    expect(value.played).toBe(3);
    expect(value.winPercent).toBe(100);
  });

  it('returns an empty distribution for maxTries 0 and never throws', () => {
    expect(dailyStats([r('pulse', '2026-11-01', true, 1)], 'pulse', '2026-11-01', 0).distribution).toEqual([]);
  });

  it('gives no current streak for an invalid today, but keeps the longest', () => {
    const stats: GameStats = [r('pulse', '2026-11-01', true), r('pulse', '2026-11-02', true)];
    for (const today of ['', 'tomorrow', '2026-13-01', '2026-02-30']) {
      expect(dailyStats(stats, 'pulse', today, 6)).toMatchObject({ currentStreak: 0, longestStreak: 2 });
    }
  });

  it('lets an off-day solve count as played and solved but never extend a streak', () => {
    const stats: GameStats = [r('pulse', '2026-11-01', true), r('pulse', '2026-11-02', true, 3, { offDay: true }), r('pulse', '2026-11-03', true)];
    const value = dailyStats(stats, 'pulse', '2026-11-03', 6);
    expect(value).toMatchObject({ played: 3, winPercent: 100, currentStreak: 1, longestStreak: 1 });
  });

  it('rounds the win percentage to a whole number', () => {
    const stats: GameStats = [r('pulse', '2026-11-01', true), r('pulse', '2026-11-02', false), r('pulse', '2026-11-03', false)];
    expect(dailyStats(stats, 'pulse', '2026-11-03', 6).winPercent).toBe(33);
    expect(dailyStats([...stats, r('pulse', '2026-11-04', true)], 'pulse', '2026-11-04', 6).winPercent).toBe(50);
  });

  it('only reads the requested game', () => {
    const stats: GameStats = [r('cueword', '2026-11-01', true), r('pulse', '2026-11-01', false)];
    expect(dailyStats(stats, 'cueword', '2026-11-01', 6)).toMatchObject({ played: 1, currentStreak: 1 });
    expect(dailyStats(stats, 'nope', '2026-11-01', 6)).toMatchObject({ played: 0, winPercent: 0, currentStreak: 0, longestStreak: 0 });
  });
});

describe('currentStreak edge cases', () => {
  it('returns 0 for an invalid today', () => {
    expect(currentStreak([r('cueword', '2026-11-01', true, 0)], 'cueword', 'not-a-day')).toBe(0);
  });

  it('honours an explicit streak:false even on a clean-looking solve, and streak:true even with tries', () => {
    expect(currentStreak([r('cueword', '2026-11-01', true, 0, { streak: false })], 'cueword', '2026-11-01')).toBe(0);
    expect(currentStreak([r('cueword', '2026-11-01', true, 4, { streak: true })], 'cueword', '2026-11-01')).toBe(1);
  });

  it('treats an old solve with tries and no streak flag as helped, and stops at a gap', () => {
    expect(currentStreak([r('cueword', '2026-11-01', true, 2)], 'cueword', '2026-11-01')).toBe(0);
    const gap: GameStats = [r('cueword', '2026-11-01', true, 0), r('cueword', '2026-11-03', true, 0)];
    expect(currentStreak(gap, 'cueword', '2026-11-03')).toBe(1);
  });

  it('counts a run across a month and year boundary', () => {
    const stats: GameStats = [r('cueword', '2026-12-31', true, 0), r('cueword', '2027-01-01', true, 0), r('cueword', '2027-01-02', true, 0)];
    expect(currentStreak(stats, 'cueword', '2027-01-02')).toBe(3);
  });
});

describe('wordPathSummary edge cases', () => {
  const s = (day: string, solved = true, extra: Partial<GameResult> = {}) => r('suture', day, solved, 1, extra);

  it('is all zeros with no word path results, ignoring other games', () => {
    expect(wordPathSummary([r('pulse', '2026-11-01', true)], '2026-11-01')).toEqual({
      played: 0, completed: 0, solvePercent: 0, currentStreak: 0, longestStreak: 0, specialFirst: 0, withoutHints: 0,
    });
  });

  it('drops the current streak once the last solve is older than yesterday, keeping the longest', () => {
    const stats: GameStats = [s('2026-11-01'), s('2026-11-02'), s('2026-11-03')];
    expect(wordPathSummary(stats, '2026-11-04')).toMatchObject({ currentStreak: 3, longestStreak: 3 });
    expect(wordPathSummary(stats, '2026-11-05')).toMatchObject({ currentStreak: 0, longestStreak: 3 });
  });

  it('measures the current run only from the latest unbroken stretch and handles out-of-order input', () => {
    const stats: GameStats = [s('2026-11-10'), s('2026-11-01'), s('2026-11-02'), s('2026-11-03'), s('2026-11-09')];
    expect(wordPathSummary(stats, '2026-11-10')).toMatchObject({ currentStreak: 2, longestStreak: 3 });
  });

  it('does not let an unsolved day or an invalid today produce a streak', () => {
    const stats: GameStats = [s('2026-11-01'), s('2026-11-02', false)];
    expect(wordPathSummary(stats, '2026-11-02')).toMatchObject({ played: 2, completed: 1, solvePercent: 50, currentStreak: 1 });
    expect(wordPathSummary(stats, '2026-11-03').currentStreak).toBe(0);
    expect(wordPathSummary(stats, 'junk').currentStreak).toBe(0);
  });

  it('counts the special answer and clean solves only on solved days', () => {
    const stats: GameStats = [
      s('2026-11-01', true, { hints: 0, specialFirst: true }),
      s('2026-11-02', true, { hints: 2, specialFirst: false }),
      s('2026-11-03', false, { hints: 0, specialFirst: true }),
      s('2026-11-04', true),
    ];
    expect(wordPathSummary(stats, '2026-11-04')).toMatchObject({ completed: 3, specialFirst: 1, withoutHints: 1 });
  });

  it('words singular and plural days in the spoken summary', () => {
    const one = wordPathSummaryInWords(wordPathSummary([s('2026-11-01')], '2026-11-01'));
    expect(one).toContain('streak: 1 day, longest 1 day.');
    const none = wordPathSummaryInWords(wordPathSummary([], '2026-11-01'));
    expect(none).toContain('completed 0, solve rate 0%. streak: 0 days, longest 0 days.');
  });
});

describe('record and parse edge cases', () => {
  it('rejects impossible calendar days, fractional or negative tries and word-path-only fields on other games', () => {
    for (const bad of [
      r('pulse', '2026-02-30', true), r('pulse', '0000-01-01', true), r('pulse', '2026-1-1', true),
      r('pulse', '2026-11-01', true, 1.5), r('pulse', '2026-11-01', true, -1), r('pulse', '2026-11-01', true, Number.NaN),
      r('pulse', '2026-11-01', true, 1, { hints: 0 }), r('pulse', '2026-11-01', true, 1, { specialFirst: true }),
      r('suture', '2026-11-01', true, 1, { hints: -1 }), r('suture', '2026-11-01', true, 1, { hints: 1.5 }),
      { ...r('pulse', '2026-11-01', true), offDay: false }, { ...r('pulse', '2026-11-01', true), streak: 'yes' },
    ]) expect(recordResult([], bad)).toEqual([]);
  });

  it('rejects a whole saved record when any entry is bad, and non-object or wrong-version JSON', () => {
    const good = r('pulse', '2026-11-01', true);
    expect(parseStats(JSON.stringify({ version: 1, results: [good, { ...good, day: 'x' }] }))).toEqual([]);
    for (const text of ['[]', 'null', '7', '{', JSON.stringify({ version: 2, results: [good] }), JSON.stringify({ version: 1, results: {} })]) {
      expect(parseStats(text)).toEqual([]);
    }
    expect(parseStats(serialize([good]))).toEqual([good]);
  });
});
