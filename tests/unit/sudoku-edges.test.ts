import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUDOKU_SETTINGS,
  SUDOKU_SETTINGS_KEY,
  SUDOKU_UNDO_LIMIT,
  advanceSudokuSeconds,
  candidates,
  checkSudoku,
  conflictIndices,
  countSolutions,
  getResult,
  isCompleteAndValid,
  loadSudokuSettings,
  newSudokuBoard,
  parseSudokuSettings,
  pushSudokuHistory,
  saveSudokuSettings,
  solveSudoku,
  sudokuCellPresentation,
  sudokuKeyAction,
  sudokuWrongCells,
  undoSudoku,
  validateSudokuPuzzle,
} from '../../src/islands/sudoku';

/** A known-valid full grid built from a repeating pattern. */
const solution = Array.from({ length: 81 }, (_, index) => {
  const row = Math.floor(index / 9);
  const column = index % 9;
  return ((row * 3 + Math.floor(row / 3) + column) % 9) + 1;
});
const blank = () => Array<number>(81).fill(0);

describe('sudoku settings edges', () => {
  it('returns a fresh copy of the defaults each time', () => {
    const a = parseSudokuSettings(null);
    a.playSound = false;
    expect(parseSudokuSettings(null)).toEqual(DEFAULT_SUDOKU_SETTINGS);
    expect(DEFAULT_SUDOKU_SETTINGS.playSound).toBe(true);
  });
  it.each(['', 'nope', '[]', 'null', '5', '"x"', '{}', '{"checkGuesses":true}'])('resets to defaults for %j', (saved) => {
    expect(parseSudokuSettings(saved)).toEqual(DEFAULT_SUDOKU_SETTINGS);
  });
  it('resets everything when one value is not a boolean, instead of mixing', () => {
    const saved = { ...DEFAULT_SUDOKU_SETTINGS, checkGuesses: false, showTimer: 'no' };
    expect(parseSudokuSettings(JSON.stringify(saved))).toEqual(DEFAULT_SUDOKU_SETTINGS);
  });
  it('resets everything when there is an extra key', () => {
    const saved = { ...DEFAULT_SUDOKU_SETTINGS, checkGuesses: false, extra: true };
    expect(parseSudokuSettings(JSON.stringify(saved))).toEqual(DEFAULT_SUDOKU_SETTINGS);
  });
  it('keeps a complete saved record and drops key order differences', () => {
    const saved = Object.fromEntries(Object.entries({ ...DEFAULT_SUDOKU_SETTINGS, highlightBox: false }).reverse());
    expect(parseSudokuSettings(JSON.stringify(saved))).toEqual({ ...DEFAULT_SUDOKU_SETTINGS, highlightBox: false });
  });
  it('loads defaults without storage, and when reading throws', () => {
    expect(loadSudokuSettings(undefined)).toEqual(DEFAULT_SUDOKU_SETTINGS);
    expect(loadSudokuSettings({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_SUDOKU_SETTINGS);
  });
  it('saves under its own key, and stays quiet when storage is missing or throws', () => {
    const written: Record<string, string> = {};
    saveSudokuSettings({ setItem: (key, value) => { written[key] = value; } }, DEFAULT_SUDOKU_SETTINGS);
    expect(Object.keys(written)).toEqual([SUDOKU_SETTINGS_KEY]);
    expect(() => saveSudokuSettings(undefined, DEFAULT_SUDOKU_SETTINGS)).not.toThrow();
    expect(() => saveSudokuSettings({ setItem: () => { throw new Error('full'); } }, DEFAULT_SUDOKU_SETTINGS)).not.toThrow();
  });
});

describe('sudoku clock and cell presentation edges', () => {
  it('advances one second only while playing and unsolved', () => {
    expect(advanceSudokuSeconds(5, false, false)).toBe(6);
    expect(advanceSudokuSeconds(5, true, false)).toBe(5);
    expect(advanceSudokuSeconds(5, false, true)).toBe(5);
    expect(advanceSudokuSeconds(5, true, true)).toBe(5);
  });
  it('hides every number while paused, givens included, but still says which are givens', () => {
    const puzzle = blank(); puzzle[0] = 4;
    const entries = [...puzzle]; entries[1] = 2;
    expect(sudokuCellPresentation(entries, puzzle, new Set([1]), 0, true)).toEqual({ given: true, value: 0, marked: false, hidden: true });
    expect(sudokuCellPresentation(entries, puzzle, new Set([1]), 1, true)).toEqual({ given: false, value: 0, marked: false, hidden: true });
  });
  it('shows a mark only on a non-given square, and treats a missing entry as empty', () => {
    const puzzle = blank(); puzzle[0] = 4;
    expect(sudokuCellPresentation(puzzle, puzzle, new Set([0, 1]), 0, false).marked).toBe(false);
    expect(sudokuCellPresentation(puzzle, puzzle, new Set([0, 1]), 1, false).marked).toBe(true);
    expect(sudokuCellPresentation([], puzzle, new Set(), 5, false).value).toBe(0);
  });
});

describe('sudoku keys edges', () => {
  it.each([-1, 81, 1.5, Number.NaN, Infinity])('ignores every key when the square is %s', (selected) => {
    expect(sudokuKeyAction('ArrowUp', selected)).toBeUndefined();
    expect(sudokuKeyAction('5', selected)).toBeUndefined();
  });
  it('stops at each edge and corner instead of wrapping', () => {
    expect(sudokuKeyAction('ArrowUp', 0)).toEqual({ kind: 'select', index: 0 });
    expect(sudokuKeyAction('ArrowLeft', 0)).toEqual({ kind: 'select', index: 0 });
    expect(sudokuKeyAction('ArrowDown', 80)).toEqual({ kind: 'select', index: 80 });
    expect(sudokuKeyAction('ArrowRight', 80)).toEqual({ kind: 'select', index: 80 });
    expect(sudokuKeyAction('ArrowRight', 8)).toEqual({ kind: 'select', index: 8 });
    expect(sudokuKeyAction('ArrowLeft', 9)).toEqual({ kind: 'select', index: 9 });
  });
  it('moves one square or one row inside the board', () => {
    expect(sudokuKeyAction('ArrowUp', 40)).toEqual({ kind: 'select', index: 31 });
    expect(sudokuKeyAction('ArrowDown', 40)).toEqual({ kind: 'select', index: 49 });
    expect(sudokuKeyAction('ArrowLeft', 40)).toEqual({ kind: 'select', index: 39 });
    expect(sudokuKeyAction('ArrowRight', 40)).toEqual({ kind: 'select', index: 41 });
  });
  it('enters 1 to 9 only, not 0, two digits or letters', () => {
    for (const digit of '123456789') expect(sudokuKeyAction(digit, 0)).toEqual({ kind: 'enter', value: Number(digit) });
    for (const key of ['0', '10', 'a', '', '１']) expect(sudokuKeyAction(key, 0)).toBeUndefined();
  });
  it('reads the physical key when shift changes the character', () => {
    expect(sudokuKeyAction('!', 0, 'Digit1')).toEqual({ kind: 'enter', value: 1 });
    expect(sudokuKeyAction('Unidentified', 0, 'Numpad9')).toEqual({ kind: 'enter', value: 9 });
    expect(sudokuKeyAction('!', 0, 'Digit0')).toBeUndefined();
    expect(sudokuKeyAction('!', 0, 'KeyA')).toBeUndefined();
    expect(sudokuKeyAction('!', 0, 'Digit12')).toBeUndefined();
  });
  it('maps pencil shortcuts, delete keys and x', () => {
    expect(sudokuKeyAction(' ', 0)).toEqual({ kind: 'toggle-mode' });
    expect(sudokuKeyAction('p', 0)).toEqual({ kind: 'toggle-mode' });
    expect(sudokuKeyAction('P', 0)).toEqual({ kind: 'toggle-mode' });
    expect(sudokuKeyAction('Spacebar', 0)).toEqual({ kind: 'toggle-mode' });
    expect(sudokuKeyAction('Backspace', 0)).toEqual({ kind: 'clear' });
    expect(sudokuKeyAction('Delete', 0)).toEqual({ kind: 'clear' });
    expect(sudokuKeyAction('x', 0)).toEqual({ kind: 'mark' });
    expect(sudokuKeyAction('X', 0)).toEqual({ kind: 'mark' });
    expect(sudokuKeyAction('Enter', 0)).toBeUndefined();
  });
});

describe('sudoku grid rule edges', () => {
  it('has no candidates for a filled square, a bad index or a wrong-size grid', () => {
    expect(candidates(solution, 0)).toEqual([]);
    expect(candidates(blank(), -1)).toEqual([]);
    expect(candidates(blank(), 81)).toEqual([]);
    expect(candidates([0, 0], 0)).toEqual([]);
  });
  it('gives all nine on an empty board and removes what the row, column and box hold', () => {
    expect(candidates(blank(), 40)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const grid = blank(); grid[41] = 3; grid[4] = 5; grid[30] = 7;
    expect(candidates(grid, 40)).toEqual([1, 2, 4, 6, 8, 9]);
  });
  it('finds no conflicts in a valid grid, an empty grid or a wrong-size grid', () => {
    expect(conflictIndices(solution)).toEqual([]);
    expect(conflictIndices(blank())).toEqual([]);
    expect(conflictIndices([1, 1])).toEqual([]);
  });
  it('reports both squares of a clash once, in order, across row, column and box', () => {
    const row = blank(); row[0] = 4; row[8] = 4;
    expect(conflictIndices(row)).toEqual([0, 8]);
    const column = blank(); column[0] = 4; column[72] = 4;
    expect(conflictIndices(column)).toEqual([0, 72]);
    const box = blank(); box[0] = 4; box[10] = 4;
    expect(conflictIndices(box)).toEqual([0, 10]);
  });
  it('is complete and valid only for a full conflict-free grid', () => {
    expect(isCompleteAndValid(solution)).toBe(true);
    expect(isCompleteAndValid(blank())).toBe(false);
    expect(isCompleteAndValid(solution.slice(1))).toBe(false);
    const broken = [...solution]; broken[0] = solution[1]!;
    expect(isCompleteAndValid(broken)).toBe(false);
    const tenth = [...solution]; tenth[0] = 10;
    expect(isCompleteAndValid(tenth)).toBe(false);
  });
});

describe('sudoku solver edges', () => {
  it('returns a full grid unchanged and leaves its input alone', () => {
    const copy = [...solution];
    expect(solveSudoku(solution)).toEqual(solution);
    expect(solution).toEqual(copy);
  });
  it('refuses grids that are the wrong size, hold bad values or already clash', () => {
    expect(solveSudoku([])).toBeUndefined();
    expect(solveSudoku(blank().map((_, i) => (i === 0 ? 10 : 0)))).toBeUndefined();
    expect(solveSudoku(blank().map((_, i) => (i === 0 ? -1 : 0)))).toBeUndefined();
    expect(solveSudoku(blank().map((_, i) => (i === 0 ? 1.5 : 0)))).toBeUndefined();
    const clash = blank(); clash[0] = 3; clash[1] = 3;
    expect(solveSudoku(clash)).toBeUndefined();
  });
  it('refuses a grid with an empty square that has no candidates', () => {
    const grid = blank();
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((value, index) => { grid[index] = value; });
    grid[9 * 1 + 8] = 9;
    expect(solveSudoku(grid)).toBeUndefined();
  });
  it('fills one missing square to the stored answer', () => {
    const grid = [...solution]; grid[44] = 0;
    expect(solveSudoku(grid)).toEqual(solution);
    expect(countSolutions(grid)).toBe(1);
  });
  it('counts zero for a clash or a wrong size, and stops at the limit', () => {
    const clash = blank(); clash[0] = 3; clash[1] = 3;
    expect(countSolutions(clash)).toBe(0);
    expect(countSolutions([])).toBe(0);
    expect(countSolutions(blank(), 2)).toBe(2);
    expect(countSolutions(blank(), 5)).toBe(5);
  });
});

describe('sudoku result and history edges', () => {
  it.each([
    [0, '00:00'], [59, '00:59'], [60, '01:00'], [3599, '59:59'], [3600, '60:00'], [3661, '61:01'],
  ])('writes %i seconds as %s', (seconds, time) => {
    expect(getResult({ day: '2026-03-10', level: 'easy', solved: true, seconds, errors: 2 })).toEqual({
      game: 'sudoku', day: '2026-03-10', level: 'easy', solved: true, seconds, time, errors: 2,
    });
  });
  it('keeps at most the undo limit, dropping the oldest, and never changes the old list', () => {
    const board = newSudokuBoard(blank());
    let history: ReturnType<typeof pushSudokuHistory> = [];
    for (let i = 0; i < SUDOKU_UNDO_LIMIT + 5; i++) {
      const before = history;
      history = pushSudokuHistory(history, { ...board, entries: blank().map((_, index) => (index === 0 ? (i % 9) + 1 : 0)) });
      expect(history).not.toBe(before);
    }
    expect(history).toHaveLength(SUDOKU_UNDO_LIMIT);
    expect(history[0]!.entries[0]).toBe(((5) % 9) + 1);
  });
  it('undoes nothing from an empty history, and steps back one board at a time', () => {
    expect(undoSudoku([])).toBeUndefined();
    const a = newSudokuBoard(blank());
    const b = { ...a, marks: new Set([3]) };
    const first = undoSudoku([a, b])!;
    expect(first.board).toBe(b);
    expect(first.history).toEqual([a]);
    expect(undoSudoku(first.history)!.history).toEqual([]);
  });
});

describe('sudoku checking edges', () => {
  const givens = blank(); givens[0] = solution[0]!;
  it('shows a wrong number only when checked as entered or looked at by check puzzle', () => {
    const entries = [...givens]; entries[1] = solution[1]! % 9 + 1;
    expect([...sudokuWrongCells(entries, givens, solution, false, new Set())]).toEqual([]);
    expect([...sudokuWrongCells(entries, givens, solution, true, new Set())]).toEqual([1]);
    expect([...sudokuWrongCells(entries, givens, solution, false, new Set([1]))]).toEqual([1]);
    expect([...sudokuWrongCells(entries, givens, solution, false, new Set([2]))]).toEqual([]);
  });
  it('never marks a right number, an empty square or a given square', () => {
    const entries = [...givens]; entries[1] = solution[1]!;
    const wrongGiven = [...entries]; wrongGiven[0] = (solution[0]! % 9) + 1;
    expect(sudokuWrongCells(wrongGiven, givens, solution, true, new Set([0, 2])).size).toBe(0);
  });
  it('counts empty squares and lists wrong ones in order', () => {
    const entries = [...givens]; entries[5] = (solution[5]! % 9) + 1; entries[2] = (solution[2]! % 9) + 1;
    expect(checkSudoku(entries, givens, solution)).toEqual({ wrong: [2, 5], empty: 78 });
    expect(checkSudoku(solution, solution, solution)).toEqual({ wrong: [], empty: 0 });
    expect(checkSudoku([], givens, solution).empty).toBe(81);
  });
});

describe('sudoku puzzle validator edges', () => {
  it('reports shape problems for both parts and stops there', () => {
    expect(validateSudokuPuzzle({ puzzle: [], solution: [] })).toEqual([
      'givens must be 81 digits from 0 to 9.',
      'solution must be a complete, valid grid.',
    ]);
    expect(validateSudokuPuzzle({ puzzle: blank().map((_, i) => (i === 0 ? 12 : 0)), solution })).toEqual(['givens must be 81 digits from 0 to 9.']);
  });
  it('reports a solution with a clash or an empty square', () => {
    const broken = [...solution]; broken[0] = solution[1]!;
    expect(validateSudokuPuzzle({ puzzle: blank(), solution: broken })).toEqual(['solution must be a complete, valid grid.']);
    const gap = [...solution]; gap[0] = 0;
    expect(validateSudokuPuzzle({ puzzle: blank(), solution: gap })).toEqual(['solution must be a complete, valid grid.']);
  });
  it('reports givens that disagree with the solution, and a puzzle with many solutions', () => {
    const wrongGiven = blank(); wrongGiven[0] = (solution[0]! % 9) + 1;
    expect(validateSudokuPuzzle({ puzzle: wrongGiven, solution })).toContain('givens must match the solution.');
    expect(validateSudokuPuzzle({ puzzle: blank(), solution })).toContain('givens have more than one solution.');
  });
  it('accepts a full grid as its own puzzle, and one missing square', () => {
    expect(validateSudokuPuzzle({ puzzle: solution, solution })).toEqual([]);
    const gap = [...solution]; gap[10] = 0;
    expect(validateSudokuPuzzle({ puzzle: gap, solution })).toEqual([]);
  });
  it('reports givens that clash with each other as having no solution', () => {
    const clash = blank(); clash[0] = solution[0]!; clash[1] = solution[0]!;
    const problems = validateSudokuPuzzle({ puzzle: clash, solution });
    expect(problems).toContain('givens have no solution.');
  });
});
