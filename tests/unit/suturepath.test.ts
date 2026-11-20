import { describe, expect, it } from 'vitest';
import type { Cell } from '../../src/islands/suture';
import {
  announceProgress, backspace, cellView, clearPicked, extend, firstWordFound, GAME_PROGRESS_EVENT, hintsEarned, hintsLeft,
  isPathPuzzle, parsePathPuzzle, parseWordPath, pathCellLabel, pathDone, pathProblem, pathShareLine, spansBoard, startPath,
  submit, submitInWords, takeHint, touching, traceable, wordsToNextHint, type PathState, type SuturePathPuzzle,
} from '../../src/islands/suturepath';

/**
 * A made-up test board (not a real puzzle): the thread THREADSX runs down column 0, top edge to bottom edge, and each
 * row's other five letters are one repeated-letter answer (AAAAA, BBBBB, ...), so every path is easy to read.
 */
const grid = [
  'TAAAAA',
  'HBBBBB',
  'RCCCCC',
  'EDDDDD',
  'AEEEEE',
  'DFFFFF',
  'SGGGGG',
  'XHHHHH',
];
const rowWord = (row: number, letter: string): { answer: string; path: Cell[] } => ({
  answer: letter.repeat(5),
  path: [1, 2, 3, 4, 5].map((col): Cell => [row, col]),
});
const raw = () => ({
  format: 'path',
  id: 'test-board',
  sample: true,
  clue: 'test letters',
  grid: [...grid],
  words: [
    { answer: 'THREADSX', path: [0, 1, 2, 3, 4, 5, 6, 7].map((row): Cell => [row, 0]), special: true },
    ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((letter, row) => rowWord(row, letter)),
  ],
  extras: ['AAAA', 'BBBB', 'CCCC', 'DDDD'],
});
const board = (): SuturePathPuzzle => parsePathPuzzle(raw());
const pickAll = (state: PathState, puzzle: SuturePathPuzzle, cells: Cell[]) =>
  cells.reduce((current, cell) => extend(current, puzzle, cell).state, state);
const row = (r: number, from = 1, to = 5): Cell[] => Array.from({ length: to - from + 1 }, (_, i): Cell => [r, from + i]);

describe('path rules', () => {
  it('cells touch up, down, sideways and diagonally, never themselves', () => {
    expect(touching([3, 3], [2, 2])).toBe(true);
    expect(touching([3, 3], [4, 3])).toBe(true);
    expect(touching([3, 3], [3, 5])).toBe(false);
    expect(touching([3, 3], [3, 3])).toBe(false);
  });
  it('a path may turn, but every step touches the last, stays on the board and uses no cell twice', () => {
    expect(pathProblem([[0, 0], [1, 1], [1, 2], [0, 3]])).toBeNull();
    expect(pathProblem([[0, 0], [0, 2]])).toMatch('touch');
    expect(pathProblem([[0, 0], [1, 1], [0, 0]])).toMatch('twice');
    expect(pathProblem([[7, 5], [8, 5]])).toMatch('leaves');
  });
  it('a path spans the board when it touches two opposite edges', () => {
    expect(spansBoard([[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]])).toBe(true);
    expect(spansBoard([[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5]])).toBe(true);
    expect(spansBoard([[0, 0], [1, 1], [2, 2]])).toBe(false);
  });
  it('finds whether a word can be traced anywhere on the board', () => {
    expect(traceable(grid, 'THREAD')).toBe(true);
    expect(traceable(grid, 'ABCD')).toBe(true);
    expect(traceable(grid, 'TX')).toBe(false);
  });
});

describe('the board validator', () => {
  it('accepts a full 6 by 8 board and keeps the special answer and extras', () => {
    const puzzle = board();
    expect(puzzle.format).toBe('path');
    expect(puzzle.words.filter((word) => word.special).map((word) => word.answer)).toEqual(['THREADSX']);
    expect(puzzle.extras).toHaveLength(4);
    // A parsed board parses again unchanged, so the island can check it a second time.
    expect(parsePathPuzzle(puzzle)).toEqual(puzzle);
  });
  it('refuses a board of the wrong size', () => {
    expect(() => parsePathPuzzle({ ...raw(), grid: grid.slice(0, 7) })).toThrow('8 rows');
    expect(() => parsePathPuzzle({ ...raw(), grid: grid.map((r) => `${r}A`) })).toThrow('6 letters');
    expect(() => parsePathPuzzle({ ...raw(), grid: grid.map((r) => r.toLowerCase()) })).toThrow('capital');
  });
  it('refuses paths that skip, reuse or overlap cells, or do not spell their answer', () => {
    const skip = raw();
    skip.words[1] = { answer: 'AAAAA', path: [[0, 1], [0, 2], [0, 3], [0, 5], [0, 4]] };
    expect(() => parsePathPuzzle(skip)).toThrow('touch');
    const reuse = raw();
    reuse.words[1] = { answer: 'AAAAA', path: [[0, 1], [0, 2], [0, 1], [0, 3], [0, 4]] };
    expect(() => parsePathPuzzle(reuse)).toThrow('twice');
    const overlap = raw();
    overlap.words[2] = { answer: 'BBBBB', path: [[0, 1], [1, 2], [1, 3], [1, 4], [1, 5]] };
    expect(() => parsePathPuzzle(overlap)).toThrow();
    const spelling = raw();
    spelling.words[1] = { answer: 'BBBBB', path: row(0) };
    expect(() => parsePathPuzzle(spelling)).toThrow('spell');
  });
  it('needs every letter covered', () => {
    const gap = raw();
    gap.words[1] = { answer: 'AAAA', path: row(0, 1, 4) };
    expect(() => parsePathPuzzle(gap)).toThrow('every letter');
  });
  it('needs exactly one special answer, touching two opposite edges', () => {
    const none = raw();
    none.words[0] = { ...none.words[0]!, special: false };
    expect(() => parsePathPuzzle(none)).toThrow('exactly one special');
    const two = raw();
    two.words[1] = { ...two.words[1]!, special: true };
    expect(() => parsePathPuzzle(two)).toThrow('exactly one special');
    const short = raw();
    // Swap the roles: row A (columns 1 to 5) touches neither the left nor the bottom edge.
    short.words[0] = { ...short.words[0]!, special: false };
    short.words[1] = { ...short.words[1]!, special: true };
    expect(() => parsePathPuzzle(short)).toThrow('opposite edges');
  });
  it('checks the extra words: long enough, not an answer, listed once and on the board', () => {
    expect(() => parsePathPuzzle({ ...raw(), extras: ['AAA'] })).toThrow('at least 4');
    expect(() => parsePathPuzzle({ ...raw(), extras: ['AAAAA'] })).toThrow('not be an answer');
    expect(() => parsePathPuzzle({ ...raw(), extras: ['AAAA', 'AAAA'] })).toThrow('once');
    expect(() => parsePathPuzzle({ ...raw(), extras: ['ZZZZ'] })).toThrow('traced');
  });
  it('needs the clue and the format name', () => {
    expect(() => parsePathPuzzle({ ...raw(), clue: '  ' })).toThrow('clue');
    expect(() => parsePathPuzzle({ ...raw(), clue: 'a'.repeat(61) })).toThrow('60');
    expect(() => parsePathPuzzle({ ...raw(), format: undefined })).toThrow('format');
  });
});

describe('both formats load', () => {
  it('a file with "format": "path" is a board; one without is the older word search', () => {
    const path = parseWordPath(raw());
    expect(isPathPuzzle(path)).toBe(true);
    const search = parseWordPath({
      id: 'old', sample: true, theme: 'everyday things', grid: ['CATS', 'GODU', 'XYZN', 'QRST'],
      words: [
        { answer: 'CAT', path: [[0, 0], [0, 1], [0, 2]] },
        { answer: 'DOG', path: [[1, 2], [1, 1], [1, 0]] },
        { answer: 'SUN', path: [[0, 3], [1, 3], [2, 3]] },
      ],
    });
    expect(isPathPuzzle(search)).toBe(false);
    expect(() => parseWordPath({ ...raw(), format: 'grid' })).toThrow('format');
  });
});

describe('selecting letters', () => {
  it('adds touching letters, takes the last back when dragging back, and restarts on a far letter', () => {
    const puzzle = board();
    let state = pickAll(startPath(), puzzle, [[0, 1], [0, 2], [1, 3]]);
    expect(state.picked).toEqual([[0, 1], [0, 2], [1, 3]]);
    state = extend(state, puzzle, [0, 2]).state;
    expect(state.picked).toEqual([[0, 1], [0, 2]]);
    expect(extend(state, puzzle, [0, 1]).state.picked).toEqual([[0, 1]]);
    // A letter already in the word (not the one before last) is ignored, so no cell is used twice.
    const loop = pickAll(startPath(), puzzle, [[0, 1], [0, 2], [1, 2]]);
    expect(extend(loop, puzzle, [0, 1]).outcome).toBe('ignored');
    expect(extend(state, puzzle, [5, 5]).state.picked).toEqual([[5, 5]]);
    expect(backspace(pickAll(startPath(), puzzle, [[0, 1], [0, 2]])).picked).toEqual([[0, 1]]);
    expect(clearPicked(state).picked).toEqual([]);
  });
});

describe('submitting words', () => {
  it('finds a theme answer on its own cells and the thread, and finishes the board', () => {
    const puzzle = board();
    let next = submit(pickAll(startPath(), puzzle, row(0)), puzzle);
    expect(next.outcome).toEqual({ kind: 'found', answer: 1 });
    expect(submitInWords(next.state, puzzle, next.outcome)).toBe('theme word: aaaaa, 1 of 9.');
    expect(cellView(next.state, puzzle, [0, 1]).look).toBe('theme');
    expect(pathCellLabel(next.state, puzzle, [0, 1])).toBe('row 1, column 2, A, theme word: aaaaa');
    // Found letters can't be picked again.
    expect(extend(next.state, puzzle, [0, 1]).outcome).toBe('ignored');
    next = submit(pickAll(next.state, puzzle, [0, 1, 2, 3, 4, 5, 6, 7].map((r): Cell => [r, 0])), puzzle);
    expect(next.outcome).toEqual({ kind: 'found', answer: 0 });
    expect(submitInWords(next.state, puzzle, next.outcome)).toBe('the thread: threadsx, 2 of 9.');
    expect(cellView(next.state, puzzle, [3, 0]).look).toBe('special');
    let state = next.state;
    for (let r = 1; r < 8; r++) state = submit(pickAll(state, puzzle, row(r)), puzzle).state;
    expect(pathDone(state, puzzle)).toBe(true);
    expect(pathShareLine(state, puzzle, 'sun 1 nov', 'Word Path')).toBe('cueory word path, sun 1 nov: found 9 of 9 answers, the thread 2nd, 0 cues.');
  });
  it('says short and unknown words apart, and only unknown words count as misses', () => {
    const puzzle = board();
    const short = submit(pickAll(startPath(), puzzle, row(0, 1, 3)), puzzle);
    expect(short.outcome.kind).toBe('short');
    expect(short.state.picked).toEqual([]);
    expect(short.state.misses).toBe(0);
    const unknown = submit(pickAll(startPath(), puzzle, [[0, 1], [1, 1], [2, 1], [3, 1]]), puzzle);
    expect(unknown.outcome.kind).toBe('unknown');
    expect(unknown.state.misses).toBe(1);
    expect(submitInWords(unknown.state, puzzle, unknown.outcome)).toBe('not a word on this board.');
    expect(submit(startPath(), puzzle).outcome.kind).toBe('empty');
  });
  it('counts an answer traced over its own cells in either direction, and says so when it runs along other cells', () => {
    const puzzle = board();
    const reversed = submit(pickAll(startPath(), puzzle, [[1, 5], [1, 4], [1, 3], [1, 2], [1, 1]]), puzzle);
    expect(reversed.outcome).toEqual({ kind: 'found', answer: 2 });
    // EEEEE again, starting on the thread's E at row 4, column 1: the right word along the wrong cells.
    const elsewhere = submit(pickAll(startPath(), puzzle, [[3, 0], [4, 1], [4, 2], [4, 3], [4, 4]]), puzzle);
    expect(elsewhere.outcome.kind).toBe('elsewhere');
    expect(elsewhere.state.misses).toBe(0);
    expect(elsewhere.state.found).toEqual([]);
  });
});

describe('hints', () => {
  const earn = (puzzle: SuturePathPuzzle, words: number) =>
    [0, 1, 2, 3].slice(0, words).reduce((state, r) => submit(pickAll(state, puzzle, row(r, 1, 4)), puzzle).state, startPath());

  it('every 3 non-theme words of 4 letters or more earn one hint, and a repeat earns nothing', () => {
    const puzzle = board();
    let next = submit(pickAll(startPath(), puzzle, row(0, 1, 4)), puzzle);
    expect(next.outcome).toEqual({ kind: 'extra', word: 'AAAA', earned: false });
    expect(submitInWords(next.state, puzzle, next.outcome)).toBe('aaaa is a word, not a theme word. 2 more for a cue.');
    const again = submit(pickAll(next.state, puzzle, row(0, 1, 4)), puzzle);
    expect(again.outcome.kind).toBe('extra-again');
    expect(again.state.extras).toHaveLength(1);
    next = submit(pickAll(next.state, puzzle, row(1, 1, 4)), puzzle);
    next = submit(pickAll(next.state, puzzle, row(2, 1, 4)), puzzle);
    expect(next.outcome).toEqual({ kind: 'extra', word: 'CCCC', earned: true });
    expect(hintsEarned(next.state)).toBe(1);
    expect(hintsLeft(next.state)).toBe(1);
    expect(wordsToNextHint(next.state)).toBe(3);
  });
  it('a hint marks one unsolved theme answer; a second hint on it shows the order; no hint without one earned', () => {
    const puzzle = board();
    expect(takeHint(startPath(), puzzle)).toEqual(startPath());
    let state = earn(puzzle, 3);
    state = takeHint(state, puzzle);
    expect(state.hint).toEqual({ answer: 1, order: false });
    expect(state.hintsUsed).toBe(1);
    expect(cellView(state, puzzle, [0, 1])).toEqual({ look: 'hinted' });
    expect(cellView(state, puzzle, [0, 0]).look).toBe('plain');
    // No hints left: nothing changes.
    expect(takeHint(state, puzzle)).toBe(state);
    state = { ...state, extras: ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'XXXX', 'YYYY'] };
    state = takeHint(state, puzzle);
    expect(state.hint).toEqual({ answer: 1, order: true });
    expect(cellView(state, puzzle, [0, 3])).toEqual({ look: 'hinted', order: 3 });
    expect(pathCellLabel(state, puzzle, [0, 3])).toBe('row 1, column 4, A, cue, letter 3');
    state = extend(state, puzzle, [0, 3]).state;
    expect(cellView(state, puzzle, [0, 3])).toEqual({ look: 'picked', step: 1, order: 3 });
    expect(cellView(state, puzzle, [0, 1])).toEqual({ look: 'hinted', order: 1 });
    expect(pathCellLabel(state, puzzle, [0, 3])).toBe('row 1, column 4, A, picked, letter 1 of the word, cue, letter 3');
    // Solving the hinted answer clears the hint; the next hint goes to the next unsolved theme answer.
    state = submit(pickAll(state, puzzle, row(0)), puzzle).state;
    expect(state.hint).toBeNull();
    state = takeHint({ ...state, extras: [...state.extras, 'ZZZZ', 'WWWW', 'VVVV'] }, puzzle);
    expect(state.hint).toEqual({ answer: 2, order: false });
  });
  it('the thread is hinted last', () => {
    const puzzle = board();
    let state: PathState = { ...startPath(), found: [1, 2, 3, 4, 5, 6, 7, 8], extras: ['AAAA', 'BBBB', 'CCCC'] };
    state = takeHint(state, puzzle);
    expect(state.hint).toEqual({ answer: 0, order: false });
  });
});

describe('the day\'s first word tells the /play status list (#761)', () => {
  it('fires once, on the first answer or extra word', () => {
    const empty = { found: [], extras: [] };
    expect(firstWordFound(empty, { found: [1], extras: [] })).toBe(true);
    expect(firstWordFound(empty, { found: [], extras: ['AAAA'] })).toBe(true);
    expect(firstWordFound(empty, empty)).toBe(false);
    expect(firstWordFound({ found: [1], extras: [] }, { found: [1, 2], extras: [] })).toBe(false);
  });
  it('sends cueory:game-progress with the game id and the local day', () => {
    const target = new EventTarget();
    const heard: unknown[] = [];
    target.addEventListener(GAME_PROGRESS_EVENT, (event) => heard.push((event as CustomEvent).detail));
    announceProgress('2026-11-16', target);
    expect(GAME_PROGRESS_EVENT).toBe('cueory:game-progress');
    expect(heard).toEqual([{ game: 'suture', day: '2026-11-16' }]);
  });
});
