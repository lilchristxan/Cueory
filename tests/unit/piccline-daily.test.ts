import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayNumber, puzzleForDay } from '../../src/islands/pulse';
import { boardPuzzles, isPathPuzzle, parseWordPath, type WordPathPuzzle } from '../../src/islands/suturepath';

/** The daily piccline rotates through board-format puzzles only (the older 11 by 11 word search is left out). */
const folder = new URL('../../content/games/suture/', import.meta.url);
const samples: WordPathPuzzle[] = readdirSync(folder)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => parseWordPath({ id: name.replace('.json', ''), sample: true, ...JSON.parse(readFileSync(new URL(name, folder), 'utf8')) }));

describe('piccline daily rotation', () => {
  it('keeps the older word search in the samples but out of the daily list', () => {
    expect(samples.some((puzzle) => !isPathPuzzle(puzzle))).toBe(true);
    const daily = boardPuzzles(samples);
    expect(daily.length).toBeGreaterThanOrEqual(5);
    expect(daily.every(isPathPuzzle)).toBe(true);
    expect(daily).toHaveLength(samples.filter(isPathPuzzle).length);
  });

  it('plays a board-format puzzle on every date in a 60-day span from 1 November 2026, including 24 November', () => {
    const daily = boardPuzzles(samples);
    const seen = new Set<string>();
    for (let offset = 0; offset < 60; offset++) {
      const date = new Date(2026, 10, 1 + offset);
      const puzzle = puzzleForDay(daily, dayNumber(date));
      expect(puzzle && isPathPuzzle(puzzle), `day ${offset}`).toBe(true);
      seen.add(puzzle!.id);
    }
    expect(seen.size).toBe(daily.length);
    const today = puzzleForDay(daily, dayNumber(new Date(2026, 10, 24)))!;
    expect(isPathPuzzle(today)).toBe(true);
  });

  it('the piccline page asks for the board-only rotation', () => {
    const page = readFileSync(new URL('../../src/pages/play/piccline.astro', import.meta.url), 'utf8');
    expect(page).toMatch(/<SutureToday[^>]*\bboardOnly\b/);
  });
});
