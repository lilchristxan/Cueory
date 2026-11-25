import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadVialoSave, saveVialoGuesses } from '../../src/islands/vialosave';
import { loadSudokuSave, saveSudokuProgress, untouched } from '../../src/islands/sudokusave';
import { loadCuewordSave, saveCuewordProgress } from '../../src/islands/cuewordsave';
import { startVialo } from '../../src/islands/vialo';
import { playGuess } from '../../src/islands/pulse';
import { dailySudokuSeed, generateSudoku, newSudokuBoard } from '../../src/islands/sudoku';
import { emptyState, enter, parsePuzzle, type CuewordPuzzle } from '../../src/islands/cueword';
import { DEFAULT_CROSSWORD_SETTINGS } from '../../src/islands/cueword';
import { CROSSWORD_SAVE_KEY, SUDOKU_SAVE_KEY, VIALO_SAVE_KEY } from '../../src/islands/gamesavekeys';
import { storageKeys } from '../../src/config/storage-keys';
import type { KeyValueStorage } from '../../src/scripts/storage';

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}
const DAY = '2026-11-25';

describe('vialo autosave', () => {
  const start = () => startVialo('pilot', undefined, true);
  it('replays the saved guesses, and a finished game stays finished', () => {
    const storage = memory();
    let state = playGuess(start(), 'grace');
    state = playGuess(state, 'crane');
    saveVialoGuesses(state, DAY, storage);
    expect(loadVialoSave(start(), DAY, storage)).toEqual(state);
    state = playGuess(state, 'pilot');
    saveVialoGuesses(state, DAY, storage);
    const back = loadVialoSave(start(), DAY, storage)!;
    expect(back.status).toBe('solved');
    expect(back.guesses).toHaveLength(3);
  });
  it('starts fresh on a new day, and ignores damaged or oversized records', () => {
    const storage = memory();
    saveVialoGuesses(playGuess(start(), 'grace'), DAY, storage);
    expect(loadVialoSave(start(), '2026-11-26', storage)).toBeNull();
    storage.setItem(VIALO_SAVE_KEY, '{nope');
    expect(loadVialoSave(start(), DAY, storage)).toBeNull();
    const file = (guesses: unknown) => JSON.stringify({ v: 1, owner: 'device', day: DAY, boards: { today: { guesses } } });
    storage.setItem(VIALO_SAVE_KEY, file(['gr4ce']));
    expect(loadVialoSave(start(), DAY, storage)).toBeNull();
    storage.setItem(VIALO_SAVE_KEY, file(['pilot', 'grace']));
    expect(loadVialoSave(start(), DAY, storage)).toBeNull();
    storage.setItem(VIALO_SAVE_KEY, file(Array(7).fill('grace')));
    expect(loadVialoSave(start(), DAY, storage)).toBeNull();
  });
  it('keeps no record when nothing was guessed, and works without storage', () => {
    const storage = memory();
    saveVialoGuesses(start(), DAY, storage);
    expect(storage.data.size).toBe(0);
    expect(() => saveVialoGuesses(playGuess(start(), 'grace'), DAY, undefined)).not.toThrow();
  });
});

describe('sudoku autosave', () => {
  const easy = generateSudoku(dailySudokuSeed(DAY, 'easy'), 'easy');
  const medium = generateSudoku(dailySudokuSeed(DAY, 'medium'), 'medium');
  const played = (puzzle = easy) => {
    const open = puzzle.puzzle.flatMap((v, i) => (v === 0 ? [i] : []));
    const board = newSudokuBoard(puzzle.puzzle);
    board.entries[open[0]!] = puzzle.solution[open[0]!]!;
    board.notes[open[1]!] = 0b101;
    board.marks.add(open[2]!);
    return { board, seconds: 75, errors: 2, auto: false };
  };
  it('restores entries, notes, marks, clock and errors per level and day', () => {
    const storage = memory();
    saveSudokuProgress(easy.puzzle, DAY, 'easy', played(), storage);
    const back = loadSudokuSave(easy.puzzle, DAY, 'easy', storage)!;
    expect(back.board.entries).toEqual(played().board.entries);
    expect(back.board.notes).toEqual(played().board.notes);
    expect([...back.board.marks]).toEqual([...played().board.marks]);
    expect([back.seconds, back.errors, back.auto]).toEqual([75, 2, false]);
    expect(loadSudokuSave(medium.puzzle, DAY, 'medium', storage)).toBeNull();
    expect(loadSudokuSave(easy.puzzle, '2026-11-26', 'easy', storage)).toBeNull();
  });
  it('keeps the personal pencil marks while auto marks are on, and drops them when auto is off', () => {
    const storage = memory();
    const own = Array<number>(81).fill(0); own[2] = 0b1010;
    saveSudokuProgress(easy.puzzle, DAY, 'easy', { ...played(), auto: true, own }, storage);
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)!.own).toEqual(own);
    saveSudokuProgress(easy.puzzle, DAY, 'easy', { ...played(), auto: false, own }, storage);
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)!.own).toBeUndefined();
    storage.setItem(SUDOKU_SAVE_KEY, JSON.stringify({ v: 1, owner: 'device', day: DAY, boards: { easy: { ...JSON.parse(storage.getItem(SUDOKU_SAVE_KEY)!).boards.easy, own: [1, 2] } } }));
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)).toBeNull();
  });
  it('keeps a solved board solved', () => {
    const storage = memory();
    const board = { entries: [...easy.solution], notes: Array<number>(81).fill(0), marks: new Set<number>() };
    saveSudokuProgress(easy.puzzle, DAY, 'easy', { board, seconds: 300, errors: 0, auto: false }, storage);
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)!.board.entries).toEqual(easy.solution);
  });
  it('drops the record when the board is back at the start, and keeps other levels', () => {
    const storage = memory();
    saveSudokuProgress(medium.puzzle, DAY, 'medium', played(medium), storage);
    saveSudokuProgress(easy.puzzle, DAY, 'easy', played(), storage);
    const fresh = { board: newSudokuBoard(easy.puzzle), seconds: 9, errors: 0, auto: false };
    expect(untouched(fresh, easy.puzzle)).toBe(true);
    saveSudokuProgress(easy.puzzle, DAY, 'easy', fresh, storage);
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)).toBeNull();
    expect(loadSudokuSave(medium.puzzle, DAY, 'medium', storage)).not.toBeNull();
  });
  it('rejects a record that changes a given number or is damaged', () => {
    const storage = memory();
    const bad = played();
    const given = easy.puzzle.findIndex((v) => v !== 0);
    bad.board.entries[given] = ((easy.puzzle[given]! % 9) + 1);
    saveSudokuProgress(easy.puzzle, DAY, 'easy', bad, storage);
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)).toBeNull();
    storage.setItem(SUDOKU_SAVE_KEY, 'x'.repeat(9000));
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)).toBeNull();
  });
});

describe('crossword autosave', () => {
  const puzzle = parsePuzzle({ id: 'sample-01', sample: true, ...JSON.parse(readFileSync(new URL('../../content/games/cueword/sample-01.json', import.meta.url), 'utf8')) }) as CuewordPuzzle;
  it('restores letters, cursor, help and the clock, and keeps a solved board solved', () => {
    const storage = memory();
    let state = emptyState(puzzle);
    state = enter(state, 's', DEFAULT_CROSSWORD_SETTINGS, false);
    state = { ...state, assists: 1 };
    saveCuewordProgress(puzzle, DAY, { state, elapsed: 42 }, storage);
    const back = loadCuewordSave(puzzle, DAY, storage)!;
    expect(back.state.entries).toEqual(state.entries);
    expect([back.state.cell, back.state.direction, back.state.assists, back.elapsed]).toEqual([state.cell, state.direction, 1, 42]);
    const full = { ...emptyState(puzzle), entries: [...puzzle.grid.join('')].map((c) => (c === '.' ? '' : c)) };
    saveCuewordProgress(puzzle, DAY, { state: full, elapsed: 90 }, storage);
    expect(loadCuewordSave(puzzle, DAY, storage)!.state.entries).toEqual(full.entries);
  });
  it('keeps a board with every square revealed (reveal puzzle), not only three', () => {
    const storage = memory();
    const letters = [...puzzle.grid.join('')];
    const cells = letters.flatMap((c, i) => (c === '.' ? [] : [i]));
    expect(cells.length).toBeGreaterThan(3);
    const full = { ...emptyState(puzzle), entries: letters.map((c) => (c === '.' ? '' : c)), cued: cells, checks: letters.map((c) => (c === '.' ? undefined : ('right' as const))), assists: 1 };
    saveCuewordProgress(puzzle, DAY, { state: full, elapsed: 120 }, storage);
    const back = loadCuewordSave(puzzle, DAY, storage)!;
    expect(back.state.cued).toEqual(cells);
    expect(back.state.entries).toEqual(full.entries);
  });
  it('starts fresh on a new day, and rejects letters on blocked squares', () => {
    const storage = memory();
    const state = { ...emptyState(puzzle), entries: emptyState(puzzle).entries.map((_, i) => (i === 4 ? 'X' : '')) };
    saveCuewordProgress(puzzle, DAY, { state, elapsed: 1 }, storage);
    expect(loadCuewordSave(puzzle, DAY, storage)).toBeNull();
    const ok = enter(emptyState(puzzle), 's', DEFAULT_CROSSWORD_SETTINGS, false);
    saveCuewordProgress(puzzle, DAY, { state: ok, elapsed: 1 }, storage);
    expect(loadCuewordSave(puzzle, '2026-11-26', storage)).toBeNull();
  });
});

describe('stale days and size cap', () => {
  const start = () => startVialo('pilot', undefined, true);
  it('never writes an older day over a newer one, but same-day and newer-day writes work', () => {
    const storage = memory();
    saveVialoGuesses(playGuess(start(), 'grace'), '2026-11-26', storage);
    const today = storage.data.get(VIALO_SAVE_KEY);
    saveVialoGuesses(playGuess(playGuess(start(), 'grace'), 'crane'), DAY, storage); // yesterday's tab flushing late
    expect(storage.data.get(VIALO_SAVE_KEY)).toBe(today);
    saveVialoGuesses(start(), DAY, storage); // a drop for the older day is ignored too
    expect(storage.data.get(VIALO_SAVE_KEY)).toBe(today);
    saveVialoGuesses(playGuess(playGuess(start(), 'grace'), 'crane'), '2026-11-26', storage);
    expect(loadVialoSave(start(), '2026-11-26', storage)!.guesses).toHaveLength(2);
    saveVialoGuesses(playGuess(start(), 'grace'), '2026-11-27', storage);
    expect(loadVialoSave(start(), '2026-11-27', storage)!.guesses).toHaveLength(1);
    expect(loadVialoSave(start(), '2026-11-26', storage)).toBeNull();
  });
  it('two same-day tabs keep each other\'s sudoku levels', () => {
    const storage = memory();
    const easy = generateSudoku(dailySudokuSeed(DAY, 'easy'), 'easy');
    const hard = generateSudoku(dailySudokuSeed(DAY, 'hard'), 'hard');
    const moved = (p: typeof easy) => { const b = newSudokuBoard(p.puzzle); const i = p.puzzle.indexOf(0); b.entries[i] = p.solution[i]!; return { board: b, seconds: 5, errors: 0, auto: false }; };
    saveSudokuProgress(easy.puzzle, DAY, 'easy', moved(easy), storage);
    saveSudokuProgress(hard.puzzle, DAY, 'hard', moved(hard), storage);
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)).not.toBeNull();
    expect(loadSudokuSave(hard.puzzle, DAY, 'hard', storage)).not.toBeNull();
  });
  it('a board too big to keep drops its older record instead of leaving stale moves', () => {
    const storage = memory();
    const easy = generateSudoku(dailySudokuSeed(DAY, 'easy'), 'easy');
    const b = newSudokuBoard(easy.puzzle); const i = easy.puzzle.indexOf(0); b.entries[i] = easy.solution[i]!;
    saveSudokuProgress(easy.puzzle, DAY, 'easy', { board: b, seconds: 1, errors: 0, auto: false }, storage);
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)).not.toBeNull();
    // An absurd record (a huge own-notes list is rejected by the cap): the old copy must not survive.
    saveSudokuProgress(easy.puzzle, DAY, 'easy', { board: b, seconds: 2, errors: 0, auto: true, own: Array<number>(81).fill(511).concat(Array<number>(5000).fill(511)) }, storage);
    expect(loadSudokuSave(easy.puzzle, DAY, 'easy', storage)).toBeNull();
  });
});

describe('save keys are registered and delete-my-account clears them', () => {
  it.each([VIALO_SAVE_KEY, SUDOKU_SAVE_KEY, CROSSWORD_SAVE_KEY])('%s', (name) => {
    expect(storageKeys.find((key) => key.name === name)?.onDeletion).toBe('cleared');
  });
});
