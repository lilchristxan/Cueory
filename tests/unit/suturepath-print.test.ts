import { describe, expect, it } from 'vitest';
import type { Cell } from '../../src/islands/suture';
import {
  cuesUsed, extend, hintsLeft, parsePathPuzzle, pathDone, pathShareLine, printBoard, startPath, submit,
  type PathState, type SuturePathPuzzle,
} from '../../src/islands/suturepath';

/** A made-up test board (not a real puzzle), as in suturepath.test.ts: the thread down column 0, one row word per row. */
const grid = ['TAAAAA', 'HBBBBB', 'RCCCCC', 'EDDDDD', 'AEEEEE', 'DFFFFF', 'SGGGGG', 'XHHHHH'];
const rowCells = (r: number, from = 1, to = 5): Cell[] => Array.from({ length: to - from + 1 }, (_, i): Cell => [r, from + i]);
const board = (): SuturePathPuzzle => parsePathPuzzle({
  format: 'path',
  id: 'test-board',
  sample: true,
  clue: 'test letters',
  grid: [...grid],
  words: [
    { answer: 'THREADSX', path: [0, 1, 2, 3, 4, 5, 6, 7].map((row): Cell => [row, 0]), special: true },
    ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((letter, row) => ({ answer: letter.repeat(5), path: rowCells(row) })),
  ],
  extras: ['AAAA', 'BBBB', 'CCCC', 'DDDD'],
});
const find = (state: PathState, puzzle: SuturePathPuzzle, cells: Cell[]) =>
  submit(cells.reduce((current, cell) => extend(current, puzzle, cell).state, state), puzzle).state;

describe('printing word path before it is finished counts as a cue', () => {
  it('marks the board once, without spending an earned cue', () => {
    const puzzle = board();
    // Three extra words earn one cue.
    let state = startPath();
    for (const r of [0, 1, 2]) state = find(state, puzzle, rowCells(r, 1, 4));
    expect(hintsLeft(state)).toBe(1);
    expect(cuesUsed(state)).toBe(0);

    const printed = printBoard(state, puzzle);
    expect(printed.printed).toBe(true);
    expect(cuesUsed(printed)).toBe(1);
    expect(printed.hintsUsed).toBe(0);
    expect(hintsLeft(printed)).toBe(1);
    // Printing again changes nothing.
    expect(printBoard(printed, puzzle)).toBe(printed);
  });

  it('a finished board prints without counting a cue', () => {
    const puzzle = board();
    let state = startPath();
    for (const word of puzzle.words) state = find(state, puzzle, word.path);
    expect(pathDone(state, puzzle)).toBe(true);
    expect(printBoard(state, puzzle)).toBe(state);
    expect(cuesUsed(state)).toBe(0);
  });

  it('the share line counts the print as a cue', () => {
    const puzzle = board();
    let state = printBoard(startPath(), puzzle);
    for (const word of puzzle.words) state = find(state, puzzle, word.path);
    expect(pathShareLine(state, puzzle, 'sun 1 nov', 'Word Path')).toBe('cueory word path, sun 1 nov: found 9 of 9 answers, the thread 1st, 1 cue.');
  });
});
