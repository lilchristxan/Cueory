import { describe, expect, it } from 'vitest';
import {
  SUDOKU_PATTERN,
  SUDOKU_STICKER_SIZE,
  sudokuDateLine,
  sudokuDescription,
  sudokuFileName,
  sudokuLayout,
  sudokuStats,
} from '../../src/islands/sudokusticker';

const stats = [
  { value: '4:18', label: 'solve time' },
  { value: '92%', label: 'solved' },
  { value: '5', label: 'day streak' },
];
const input = { dateLine: 'friday, november 20th · hard', stats };

describe('the sudoku stickers', () => {
  it('export at the two sizes Christian drew', () => {
    expect(SUDOKU_STICKER_SIZE).toEqual({ centered: { width: 1200, height: 1620 }, 'lower-third': { width: 1600, height: 840 } });
    for (const kind of ['centered', 'lower-third'] as const) {
      const layout = sudokuLayout(kind, input);
      expect([layout.width, layout.height]).toEqual([SUDOKU_STICKER_SIZE[kind].width, SUDOKU_STICKER_SIZE[kind].height]);
    }
  });

  it('draws one fixed nine by nine pattern of three cell kinds, the same whatever the puzzle', () => {
    expect(SUDOKU_PATTERN).toHaveLength(9);
    expect(SUDOKU_PATTERN.every((row) => row.length === 9)).toBe(true);
    expect(new Set(SUDOKU_PATTERN.flat())).toEqual(new Set([0, 1, 2]));
    // The layout takes no puzzle: only the date line and the stats can change what is drawn.
    expect(sudokuLayout('centered', input).grid).toEqual(sudokuLayout('centered', { ...input, stats: stats.slice(0, 1) }).grid);
  });

  it('keeps the grid square and centred in portrait, and left of the text in landscape', () => {
    const portrait = sudokuLayout('centered', input);
    expect(portrait.grid.width).toBe(portrait.grid.height);
    expect(portrait.grid.x + portrait.grid.width / 2).toBe(600);
    const landscape = sudokuLayout('lower-third', input);
    expect(landscape.grid.width).toBe(landscape.grid.height);
    expect(landscape.grid.x + landscape.grid.width).toBeLessThan(landscape.wordmark.x);
    expect(landscape.wordmark.text).toBe('sudoku');
  });

  it('signed in has time, solved and streak; signed out has the time only (the one switch)', () => {
    expect(sudokuStats({ seconds: 258, account: { winPercent: 92, streak: 5 } })).toEqual(stats);
    expect(sudokuStats({ seconds: 258, account: undefined })).toEqual([{ value: '4:18', label: 'solve time' }]);
    expect(sudokuLayout('centered', { ...input, stats: stats.slice(0, 1) }).dividers).toHaveLength(0);
    expect(sudokuLayout('centered', input).dividers).toHaveLength(2);
  });

  it('puts the level on the date line and the words in the description', () => {
    expect(sudokuDateLine('friday, november 20th', 'hard')).toBe('friday, november 20th · hard');
    const text = sudokuDescription(input);
    expect(text).toMatch(/sudoku sticker, friday, november 20th · hard: solve time 4:18/);
    expect(text).toMatch(/no numbers/);
    expect(text).not.toMatch(/\b[1-9]\b(?!:)/.source.length ? /never matches/ : /x/);
  });

  it('names the files by game, shape and day', () => {
    expect(sudokuFileName('centered', new Date(2026, 10, 1))).toBe('sudoku-portrait-2026-11-01.png');
    expect(sudokuFileName('lower-third', new Date(2026, 10, 20))).toBe('sudoku-landscape-2026-11-20.png');
  });
});

describe('long date lines on the landscape sticker (Codex on #1233)', () => {
  it('give the date line the width left in the text column, so a long line is drawn smaller, not clipped', () => {
    const long = sudokuLayout('lower-third', { dateLine: 'wednesday, september 30th · medium', stats: [] });
    // 732 px are left of the column; 40 px are kept clear of the right edge.
    expect(long.date.maxWidth).toBe(SUDOKU_STICKER_SIZE['lower-third'].width - long.date.x - 40);
    expect(long.date.maxWidth).toBe(692);
  });
});
