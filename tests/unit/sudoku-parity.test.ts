/** Sudoku parity (#720): levels, validator, modes, candidates, undo, check and per-level stats. Numbers only. */
import { describe, expect, it } from 'vitest';
import {
  LEVEL_LABELS,
  autoCandidateNotes,
  candidates,
  checkSudoku,
  dailySudokuSeed,
  editSudokuBoard,
  effectiveSudokuMode,
  generateSudoku,
  newSudokuBoard,
  noteDigits,
  pushSudokuHistory,
  SUDOKU_UNDO_LIMIT,
  sudokuKeyAction,
  sudokuWrongCells,
  undoSudoku,
  validateSudokuPuzzle,
  type SudokuLevel,
} from '../../src/islands/sudoku';
import { sudokuCellClasses } from '../../src/islands/sudokuhighlight';
import { DEFAULT_SUDOKU_SETTINGS } from '../../src/islands/sudoku';
import { deleteStats, STATS_STORAGE_KEY, SUDOKU_STATS_STORAGE_KEY, sudokuRoundResult } from '../../src/islands/gameresults';
import { recordResult, summary } from '../../src/islands/gamestats';
import { GAME_PROGRESS_EVENT, getResult, sudokuProgressDetail } from '../../src/islands/sudoku';
import {
  keepSudokuSolve, loadSudokuStats, parseSudokuSolves, recordSudokuSolve, serializeSudokuSolves, sudokuLevelStats, sudokuTime,
  type SudokuSolves,
} from '../../src/islands/sudokustats';

const levels: SudokuLevel[] = ['easy', 'medium', 'hard'];
const today = '2026-11-16';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

describe('levels and the puzzle validator', () => {
  it('calls the levels easy, mid and hard, with one stable puzzle per level per day', () => {
    expect(levels.map((level) => LEVEL_LABELS[level])).toEqual(['easy', 'mid', 'hard']);
    const boards = levels.map((level) => generateSudoku(dailySudokuSeed(today, level), level).puzzle.join(''));
    expect(new Set(boards).size).toBe(3);
    expect(generateSudoku(dailySudokuSeed(today, 'hard'), 'hard').puzzle.join('')).toBe(boards[2]);
  });

  it.each(levels)('every %s puzzle for two weeks passes the validator (exactly one solution)', (level) => {
    for (let day = 1; day <= 14; day++) {
      const puzzle = generateSudoku(dailySudokuSeed(`2026-12-${String(day).padStart(2, '0')}`, level), level);
      expect(validateSudokuPuzzle(puzzle), `${level} day ${day}`).toEqual([]);
    }
  });

  it('rejects a puzzle with more than one solution, no solution, or givens that disagree with the answer', () => {
    const good = generateSudoku('validator', 'easy');
    const blank = Array<number>(81).fill(0);
    expect(validateSudokuPuzzle({ puzzle: blank, solution: good.solution })).toContain('givens have more than one solution.');
    const clash = [...good.puzzle];
    const open = clash.indexOf(0);
    clash[open] = good.solution[open] === 9 ? 1 : good.solution[open]! + 1;
    expect(validateSudokuPuzzle({ puzzle: clash, solution: good.solution })).toContain('givens must match the solution.');
    expect(validateSudokuPuzzle({ puzzle: good.puzzle.slice(1), solution: good.solution })).toEqual(['givens must be 81 digits from 0 to 9.']);
    expect(validateSudokuPuzzle({ puzzle: good.puzzle, solution: blank })).toEqual(['solution must be a complete, valid grid.']);
  });
});

describe('normal and candidate modes', () => {
  it('Space toggles, holding Shift flips the mode for that moment, and Shift+number still names the number', () => {
    expect(sudokuKeyAction(' ', 0)).toEqual({ kind: 'toggle-mode' });
    expect(effectiveSudokuMode('normal', false)).toBe('normal');
    expect(effectiveSudokuMode('normal', true)).toBe('candidate');
    expect(effectiveSudokuMode('candidate', true)).toBe('normal');
    expect(sudokuKeyAction('!', 0, 'Digit1')).toEqual({ kind: 'enter', value: 1 });
    expect(sudokuKeyAction('End', 0, 'Numpad1')).toEqual({ kind: 'enter', value: 1 });
    expect(sudokuKeyAction('0', 0, 'Digit0')).toBeUndefined();
  });

  it('toggles candidates on an empty square, never on a given or a filled square', () => {
    const game = generateSudoku('modes', 'easy');
    const open = game.puzzle.indexOf(0);
    const given = game.puzzle.findIndex(Boolean);
    const board = newSudokuBoard(game.puzzle);
    const one = editSudokuBoard(board, game.puzzle, open, { kind: 'note', value: 4 })!;
    const two = editSudokuBoard(one, game.puzzle, open, { kind: 'note', value: 7 })!;
    expect(noteDigits(two.notes[open]!)).toEqual([4, 7]);
    expect(noteDigits(editSudokuBoard(two, game.puzzle, open, { kind: 'note', value: 4 })!.notes[open]!)).toEqual([7]);
    expect(editSudokuBoard(board, game.puzzle, given, { kind: 'note', value: 4 })).toBeUndefined();
    const filled = editSudokuBoard(two, game.puzzle, open, { kind: 'enter', value: 2 })!;
    expect(filled.notes[open]).toBe(0);
    expect(editSudokuBoard(filled, game.puzzle, open, { kind: 'note', value: 3 })).toBeUndefined();
    expect(board.notes[open]).toBe(0);
  });

  it('auto candidates fill every empty square and drop a placed number from its row, column and box', () => {
    const game = generateSudoku('auto', 'medium');
    const notes = autoCandidateNotes(game.puzzle);
    for (let index = 0; index < 81; index++) {
      expect(noteDigits(notes[index]!)).toEqual(game.puzzle[index] ? [] : candidates(game.puzzle, index));
    }
    const open = game.puzzle.indexOf(0);
    const value = game.solution[open]!;
    const board = { ...newSudokuBoard(game.puzzle), notes };
    const next = editSudokuBoard(board, game.puzzle, open, { kind: 'enter', value }, true)!;
    const row = Math.floor(open / 9);
    for (let column = 0; column < 9; column++) expect(noteDigits(next.notes[row * 9 + column]!)).not.toContain(value);
    // Without auto candidates, the neighbours' notes stay as they were.
    const manual = editSudokuBoard(board, game.puzzle, open, { kind: 'enter', value }, false)!;
    expect(manual.notes.filter((_, index) => index !== open)).toEqual(notes.filter((_, index) => index !== open));
  });
});

describe('clear cell, x mark and undo', () => {
  it('clear empties a number, notes or mark, and reports no change for an empty or given square', () => {
    const game = generateSudoku('clear', 'easy');
    const open = game.puzzle.indexOf(0);
    const board = newSudokuBoard(game.puzzle);
    expect(editSudokuBoard(board, game.puzzle, open, { kind: 'clear' })).toBeUndefined();
    expect(editSudokuBoard(board, game.puzzle, game.puzzle.findIndex(Boolean), { kind: 'clear' })).toBeUndefined();
    const entered = editSudokuBoard(board, game.puzzle, open, { kind: 'enter', value: 5 })!;
    expect(editSudokuBoard(entered, game.puzzle, open, { kind: 'clear' })!.entries[open]).toBe(0);
    const marked = editSudokuBoard(board, game.puzzle, open, { kind: 'mark' })!;
    expect(marked.marks.has(open)).toBe(true);
    expect(editSudokuBoard(marked, game.puzzle, open, { kind: 'clear' })!.marks.has(open)).toBe(false);
  });

  it('undo steps back through earlier boards in order and keeps a bounded history', () => {
    const game = generateSudoku('undo', 'easy');
    const open = game.puzzle.indexOf(0);
    const start = newSudokuBoard(game.puzzle);
    const first = editSudokuBoard(start, game.puzzle, open, { kind: 'enter', value: 3 })!;
    const second = editSudokuBoard(first, game.puzzle, open, { kind: 'note', value: 1 }) ?? editSudokuBoard(first, game.puzzle, open, { kind: 'clear' })!;
    let history = pushSudokuHistory(pushSudokuHistory([], start), first);
    const back = undoSudoku(history)!;
    expect(back.board).toBe(first);
    history = back.history;
    expect(undoSudoku(history)!.board).toBe(start);
    expect(undoSudoku([])).toBeUndefined();
    expect(second).not.toBe(first);
    let long: ReturnType<typeof pushSudokuHistory> = [];
    for (let step = 0; step < SUDOKU_UNDO_LIMIT + 5; step++) long = pushSudokuHistory(long, start);
    expect(long).toHaveLength(SUDOKU_UNDO_LIMIT);
  });
});

describe('check puzzle and wrong answers', () => {
  it('shows wrong entries live when guesses are checked, otherwise only after a check', () => {
    const game = generateSudoku('check', 'easy');
    const open = game.puzzle.indexOf(0);
    const entries = [...game.puzzle];
    entries[open] = game.solution[open] === 9 ? 1 : game.solution[open]! + 1;
    expect([...sudokuWrongCells(entries, game.puzzle, game.solution, true, new Set())]).toEqual([open]);
    expect(sudokuWrongCells(entries, game.puzzle, game.solution, false, new Set()).size).toBe(0);
    const result = checkSudoku(entries, game.puzzle, game.solution);
    expect(result.wrong).toEqual([open]);
    expect(result.empty).toBe(game.puzzle.filter((value) => value === 0).length - 1);
    expect([...sudokuWrongCells(entries, game.puzzle, game.solution, false, new Set(result.wrong))]).toEqual([open]);
  });

  it('gives givens, entries, candidates, conflicts and wrong answers their own class, and hides them while paused', () => {
    const game = generateSudoku('classes', 'easy');
    const [a, b] = game.puzzle.flatMap((value, index) => (value ? [] : [index]));
    const entries = [...game.puzzle];
    entries[a!] = game.solution[a!] === 9 ? 1 : game.solution[a!]! + 1;
    const state = {
      selected: a!, entries, givens: game.puzzle, conflicts: new Set([a!]), paused: false, settings: DEFAULT_SUDOKU_SETTINGS,
      wrong: new Set([a!]), noted: new Set([b!]),
    };
    expect(sudokuCellClasses(a!, state)).toEqual(expect.arrayContaining(['is-entered', 'is-wrong', 'is-conflict']));
    expect(sudokuCellClasses(b!, state)).toContain('has-candidates');
    expect(sudokuCellClasses(game.puzzle.findIndex(Boolean), state)).toContain('is-given');
    const paused = { ...state, paused: true };
    expect(sudokuCellClasses(a!, paused)).not.toEqual(expect.arrayContaining(['is-wrong']));
    expect(sudokuCellClasses(b!, paused)).not.toContain('has-candidates');
  });
});

describe('per-level stats', () => {
  const solves: SudokuSolves = [
    { level: 'easy', day: '2026-11-14', seconds: 300 },
    { level: 'easy', day: '2026-11-15', seconds: 200 },
    { level: 'easy', day: '2026-11-16', seconds: 250 },
    { level: 'hard', day: '2026-11-10', seconds: 900 },
  ];

  it('deletes solves older than 400 days from storage when loaded, not only from the result (Codex on #831)', () => {
    const old = { level: 'easy', day: '2025-01-01', seconds: 100 } as const;
    const storage = memoryStorage({ [SUDOKU_STATS_STORAGE_KEY]: serializeSudokuSolves([old, ...solves]) });
    expect(loadSudokuStats(storage, today).solves).toEqual(solves);
    expect(parseSudokuSolves(storage.data.get(SUDOKU_STATS_STORAGE_KEY)!)).toEqual(solves);
    // Only old solves: the record goes.
    const onlyOld = memoryStorage({ [SUDOKU_STATS_STORAGE_KEY]: serializeSudokuSolves([old]) });
    expect(loadSudokuStats(onlyOld, today).solves).toEqual([]);
    expect(onlyOld.data.has(SUDOKU_STATS_STORAGE_KEY)).toBe(false);
    // Nothing to clean: the record is left as it was.
    const fresh = memoryStorage({ [SUDOKU_STATS_STORAGE_KEY]: serializeSudokuSolves(solves) });
    const before = fresh.data.get(SUDOKU_STATS_STORAGE_KEY);
    loadSudokuStats(fresh, today);
    expect(fresh.data.get(SUDOKU_STATS_STORAGE_KEY)).toBe(before);
  });

  it('counts solved, best and average time, and a streak that ends today or yesterday', () => {
    expect(sudokuLevelStats(solves, 'easy', today)).toEqual({ solved: 3, bestSeconds: 200, averageSeconds: 250, streak: 3 });
    expect(sudokuLevelStats(solves, 'easy', '2026-11-17').streak).toBe(3);
    expect(sudokuLevelStats(solves, 'easy', '2026-11-18').streak).toBe(0);
    expect(sudokuLevelStats(solves, 'hard', today)).toEqual({ solved: 1, bestSeconds: 900, averageSeconds: 900, streak: 0 });
    expect(sudokuLevelStats(solves, 'medium', today)).toEqual({ solved: 0, bestSeconds: null, averageSeconds: null, streak: 0 });
    expect(sudokuTime(65)).toBe('01:05');
    expect(sudokuTime(3725)).toBe('1:02:05');
  });

  it('keeps only the first solve of a level and day, and rejects bad records whole', () => {
    expect(recordSudokuSolve(solves, { level: 'easy', day: '2026-11-16', seconds: 10 })).toBe(solves);
    expect(recordSudokuSolve(solves, { level: 'easy', day: 'not a day', seconds: 10 })).toBe(solves);
    expect(recordSudokuSolve(solves, { level: 'medium', day: today, seconds: 120 })).toHaveLength(5);
    expect(parseSudokuSolves(serializeSudokuSolves(solves), today)).toEqual(solves);
    expect(parseSudokuSolves(JSON.stringify({ version: 1, solves: [...solves, { level: 'expert', day: today, seconds: 1 }] }))).toEqual([]);
    expect(parseSudokuSolves('{')).toEqual([]);
    expect(parseSudokuSolves(serializeSudokuSolves(solves), '2027-12-31')).toEqual([]);
  });

  it('is always kept (2026-11-17: no switch), never written without storage, and "forget" deletes it', () => {
    // Kept even before the shared record exists.
    const fresh = memoryStorage({ [SUDOKU_STATS_STORAGE_KEY]: serializeSudokuSolves(solves) });
    expect(loadSudokuStats(fresh, today).on).toBe(true);
    expect(loadSudokuStats(fresh, today).solves.length).toBeGreaterThan(0);
    expect(keepSudokuSolve(undefined, today, { level: 'easy', day: today, seconds: 99 }).on).toBe(false);

    const on = memoryStorage({ [STATS_STORAGE_KEY]: JSON.stringify({ version: 1, results: [] }) });
    expect(keepSudokuSolve(on, today, { level: 'hard', day: today, seconds: 600 }).solves).toHaveLength(1);
    expect(loadSudokuStats(on, today).solves).toEqual([{ level: 'hard', day: today, seconds: 600 }]);
    expect(deleteStats(on)).toBe(true);
    expect(on.data.size).toBe(0);
  });
});

describe('shared stats and daily status (#720)', () => {
  it('records a solved sudoku in the shared stats record, first solve of the day only', () => {
    const solved = getResult({ day: today, level: 'medium', solved: true, seconds: 300, errors: 2 });
    const round = sudokuRoundResult(solved);
    expect(round).toEqual({ game: 'triage', day: today, solved: true, tries: 2 });
    const once = recordResult([], round);
    expect(summary(once, 'triage')).toEqual({ played: 1, solved: 1, triesCounts: { 2: 1 } });
    const again = recordResult(once, sudokuRoundResult(getResult({ day: today, level: 'hard', solved: true, seconds: 90, errors: 0 })));
    expect(again).toBe(once);
  });

  it('sends the daily-status progress event shape that /play listens for', () => {
    expect(GAME_PROGRESS_EVENT).toBe('cueory:game-progress');
    expect(sudokuProgressDetail(today)).toEqual({ game: 'triage', day: today });
  });
});
