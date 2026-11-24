import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../../src/scripts/storage';
import { SUDOKU_STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import {
  keepSudokuSolve,
  loadSudokuStats,
  parseSudokuSolves,
  recordSudokuSolve,
  serializeSudokuSolves,
  sudokuLevelStats,
  sudokuTime,
  type SudokuSolve,
} from '../../src/islands/sudokustats';

const today = '2026-03-10';
const solve = (day: string, seconds = 100, level: SudokuSolve['level'] = 'easy'): SudokuSolve => ({ level, day, seconds });

function memory(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('sudoku stats time text', () => {
  it.each([
    [0, '00:00'],
    [59, '00:59'],
    [60, '01:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [86_400, '24:00:00'],
  ])('writes %i seconds as %s', (seconds, text) => {
    expect(sudokuTime(seconds)).toBe(text);
  });
  it('rounds down fractions and clamps negative time to zero', () => {
    expect(sudokuTime(59.9)).toBe('00:59');
    expect(sudokuTime(-5)).toBe('00:00');
  });
});

describe('sudoku stats record validation', () => {
  it.each([
    ['unknown level', { level: 'expert', day: '2026-03-01', seconds: 10 }],
    ['impossible calendar day', { level: 'easy', day: '2026-02-30', seconds: 10 }],
    ['day with a time on it', { level: 'easy', day: '2026-03-01T00:00', seconds: 10 }],
    ['year zero', { level: 'easy', day: '0000-01-01', seconds: 10 }],
    ['fractional seconds', { level: 'easy', day: '2026-03-01', seconds: 1.5 }],
    ['negative seconds', { level: 'easy', day: '2026-03-01', seconds: -1 }],
    ['seconds past a whole day', { level: 'easy', day: '2026-03-01', seconds: 86_401 }],
    ['seconds as text', { level: 'easy', day: '2026-03-01', seconds: '10' }],
    ['NaN seconds', { level: 'easy', day: '2026-03-01', seconds: Number.NaN }],
    ['missing day', { level: 'easy', seconds: 10 }],
    ['an array', ['easy', '2026-03-01', 10]],
    ['null', null],
  ])('refuses a solve with %s', (_name, bad) => {
    expect(recordSudokuSolve([], bad)).toEqual([]);
  });

  it('accepts the exact limits of 0 and 86,400 seconds', () => {
    expect(recordSudokuSolve([], solve('2026-03-01', 0))).toHaveLength(1);
    expect(recordSudokuSolve([], solve('2026-03-01', 86_400))).toHaveLength(1);
  });

  it('accepts a real leap day and refuses a non-leap one', () => {
    expect(recordSudokuSolve([], solve('2028-02-29'))).toHaveLength(1);
    expect(recordSudokuSolve([], solve('2027-02-29'))).toEqual([]);
  });

  it('keeps a different level on the same day, and returns the same list for a repeat', () => {
    const first = recordSudokuSolve([], solve('2026-03-01', 50, 'easy'));
    const both = recordSudokuSolve(first, solve('2026-03-01', 70, 'hard'));
    expect(both).toHaveLength(2);
    expect(recordSudokuSolve(both, solve('2026-03-01', 1, 'hard'))).toBe(both);
  });

  it('does not change the list it is given', () => {
    const list: SudokuSolve[] = [solve('2026-03-01')];
    const copy = structuredClone(list);
    recordSudokuSolve(list, solve('2026-03-02'));
    expect(list).toEqual(copy);
  });

  it('drops a solve more than 400 days older than the newest one', () => {
    const old = solve('2025-01-01');
    const newest = solve('2026-03-10');
    expect(recordSudokuSolve([old], newest)).toEqual([newest]);
  });

  it('keeps the oldest day that is still inside the 400-day window', () => {
    const edge = solve('2025-02-04'); // 399 days before 2026-03-10
    expect(recordSudokuSolve([edge], solve('2026-03-10'))).toHaveLength(2);
    const outside = solve('2025-02-03'); // 400 days before
    expect(recordSudokuSolve([outside], solve('2026-03-10'))).toHaveLength(1);
  });
});

describe('sudoku stats per level', () => {
  it('reports an empty level as zero with no best or average', () => {
    expect(sudokuLevelStats([], 'medium', today)).toEqual({ solved: 0, bestSeconds: null, averageSeconds: null, streak: 0 });
  });

  it('counts only the asked level and rounds the average', () => {
    const solves = [solve('2026-03-08', 10), solve('2026-03-09', 11), solve('2026-03-10', 11, 'hard')];
    expect(sudokuLevelStats(solves, 'easy', today)).toMatchObject({ solved: 2, bestSeconds: 10, averageSeconds: 11 });
    expect(sudokuLevelStats(solves, 'hard', today)).toMatchObject({ solved: 1, bestSeconds: 11, averageSeconds: 11 });
  });

  it('keeps a streak alive from yesterday, and ends it after a whole missed day', () => {
    const solves = [solve('2026-03-07'), solve('2026-03-08'), solve('2026-03-09')];
    expect(sudokuLevelStats(solves, 'easy', '2026-03-10').streak).toBe(3);
    expect(sudokuLevelStats(solves, 'easy', '2026-03-11').streak).toBe(0);
  });

  it('breaks a streak at a gap and counts only the run that touches today', () => {
    const solves = [solve('2026-03-05'), solve('2026-03-06'), solve('2026-03-09'), solve('2026-03-10')];
    expect(sudokuLevelStats(solves, 'easy', today).streak).toBe(2);
  });

  it('counts a streak across a month and year end', () => {
    const solves = [solve('2025-12-30'), solve('2025-12-31'), solve('2026-01-01')];
    expect(sudokuLevelStats(solves, 'easy', '2026-01-01').streak).toBe(3);
  });

  it('gives a streak of zero when today is not a real date', () => {
    expect(sudokuLevelStats([solve('2026-03-10')], 'easy', 'not a day').streak).toBe(0);
  });
});

describe('sudoku stats saved text', () => {
  it.each([undefined, null, 5, '', 'not json', '[]', 'null', '{"version":2,"solves":[]}', '{"version":1}', '{"version":1,"solves":{}}'])(
    'reads %j as an empty record',
    (text) => {
      expect(parseSudokuSolves(text)).toEqual([]);
    },
  );

  it('throws away the whole record when one entry is bad', () => {
    const text = JSON.stringify({ version: 1, solves: [solve('2026-03-01'), { level: 'easy', day: 'x', seconds: 1 }] });
    expect(parseSudokuSolves(text)).toEqual([]);
  });

  it('drops a repeated level and day, keeping the first', () => {
    const text = JSON.stringify({ version: 1, solves: [solve('2026-03-01', 10), solve('2026-03-01', 20)] });
    expect(parseSudokuSolves(text, today)).toEqual([solve('2026-03-01', 10)]);
  });

  it('trims by the given today, not the newest solve', () => {
    const text = JSON.stringify({ version: 1, solves: [solve('2026-03-01')] });
    expect(parseSudokuSolves(text, '2027-12-01')).toEqual([]);
    expect(parseSudokuSolves(text, '2026-03-10')).toHaveLength(1);
  });

  it('writes an empty record when any solve is invalid, and round-trips a good one', () => {
    expect(JSON.parse(serializeSudokuSolves([{ level: 'easy', day: 'bad', seconds: 1 }]))).toEqual({ version: 1, solves: [] });
    const good = [solve('2026-03-01', 9, 'medium')];
    expect(parseSudokuSolves(serializeSudokuSolves(good), today)).toEqual(good);
  });
});

describe('sudoku stats storage', () => {
  it('starts empty and writes nothing when storage has no record', () => {
    const storage = memory();
    expect(loadSudokuStats(storage, today)).toEqual({ on: true, solves: [] });
    expect(storage.data.has(SUDOKU_STATS_STORAGE_KEY)).toBe(false);
  });

  it('removes an unreadable record instead of leaving it behind', () => {
    const storage = memory({ [SUDOKU_STATS_STORAGE_KEY]: 'garbage' });
    expect(loadSudokuStats(storage, today)).toEqual({ on: true, solves: [] });
    expect(storage.data.has(SUDOKU_STATS_STORAGE_KEY)).toBe(false);
  });

  it('is off, with nothing kept, when there is no storage', () => {
    expect(loadSudokuStats(undefined, today)).toEqual({ on: false, solves: [] });
    expect(keepSudokuSolve(undefined, today, solve('2026-03-10'))).toEqual({ on: false, solves: [] });
  });

  it('is off, and does not throw, when storage throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadSudokuStats(broken, today)).toEqual({ on: false, solves: [] });
  });

  it('keeps a new solve, and does not write again for a repeat', () => {
    const storage = memory();
    const first = keepSudokuSolve(storage, today, solve('2026-03-10', 42));
    expect(first.solves).toEqual([solve('2026-03-10', 42)]);
    const written = storage.data.get(SUDOKU_STATS_STORAGE_KEY);
    expect(written).toBeDefined();
    const again = keepSudokuSolve(storage, today, solve('2026-03-10', 5));
    expect(again.solves).toEqual(first.solves);
    expect(storage.data.get(SUDOKU_STATS_STORAGE_KEY)).toBe(written);
  });

  it('ignores an invalid solve without writing', () => {
    const storage = memory();
    keepSudokuSolve(storage, today, { level: 'easy', day: 'bad', seconds: 1 });
    expect(storage.data.has(SUDOKU_STATS_STORAGE_KEY)).toBe(false);
  });

  it('returns the earlier record when saving fails', () => {
    const storage = memory({ [SUDOKU_STATS_STORAGE_KEY]: serializeSudokuSolves([solve('2026-03-09')]) });
    storage.setItem = () => { throw new Error('full'); };
    const result = keepSudokuSolve(storage, today, solve('2026-03-10'));
    expect(result).toEqual({ on: true, solves: [solve('2026-03-09')] });
  });
});
