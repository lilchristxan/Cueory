import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePuzzle } from '../../src/islands/suture';
import { parsePathPuzzle, parseWordPath, PATH_COLS, PATH_ROWS, spansBoard } from '../../src/islands/suturepath';

/** How many times a word can be picked in the grid: every row and column, read either way. */
function places(grid: string[], word: string): number {
  const lines = [...grid, ...[...grid[0]!].map((_, col) => grid.map((row) => row[col]).join(''))];
  const count = (line: string) => [...line].filter((_, i) => line.startsWith(word, i)).length;
  return lines.reduce((sum, line) => sum + count(line) + count([...line].reverse().join('')), 0);
}

const folder = new URL('../../content/games/suture/', import.meta.url);
const files = readdirSync(folder).filter((name) => name.endsWith('.json'));
const read = (name: string) => JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
const boards = files.filter((name) => read(name).format === 'path');
const searches = files.filter((name) => read(name).format === undefined);

describe('word path samples (D-71, Task 97, #722)', () => {
  it('has labeled samples: at least five boards (the preferred format) and one older word search', () => {
    for (const name of files) expect(name).toMatch(/^sample-\d{2}\.json$/);
    expect(boards.length).toBeGreaterThanOrEqual(5);
    expect(searches.length).toBeGreaterThanOrEqual(1);
    expect(boards.length + searches.length).toBe(files.length);
  });

  it.each(boards)('%s is a full 6 by 8 board that passes the validator, with enough extra words for hints', (name) => {
    const data = read(name);
    expect(data.status).toBe('sample');
    expect(data.clue).toBe(data.clue.toLowerCase());
    const puzzle = parsePathPuzzle({ id: name.replace('.json', ''), sample: true, ...data });
    expect(puzzle.grid).toHaveLength(PATH_ROWS);
    expect(puzzle.grid[0]).toHaveLength(PATH_COLS);
    expect(puzzle.words.reduce((sum, word) => sum + word.answer.length, 0)).toBe(PATH_ROWS * PATH_COLS);
    expect(puzzle.words.filter((word) => word.special)).toHaveLength(1);
    expect(spansBoard(puzzle.words.find((word) => word.special)!.path)).toBe(true);
    expect(puzzle.extras.length).toBeGreaterThanOrEqual(6);
  });

  it.each(searches)("%s (older word search) still loads: themed, passes the game's own rules, each word in one place", (name) => {
    const data = read(name);
    expect(data.status).toBe('sample');
    expect(data.theme).toBe(data.theme.toLowerCase());
    const input = { id: name.replace('.json', ''), sample: true, theme: data.theme, grid: data.grid, words: data.words };
    const puzzle = parsePuzzle(input);
    expect(parseWordPath(input)).toEqual(puzzle);
    expect(puzzle.theme!.length).toBeLessThanOrEqual(60);
    for (const word of puzzle.words) {
      // One place only, so a student who picks the word where they see it is never told it is wrong.
      expect(places(puzzle.grid, word.answer)).toBe(1);
      if (word.cue !== undefined) expect(word.cue).toBe(word.cue.toLowerCase());
    }
  });
});
