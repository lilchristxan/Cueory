import { browserStorage, type KeyValueStorage } from '../scripts/storage';
import { SUDOKU_SAVE_KEY } from './gamesavekeys';
import { isObject, readSavedBoard, whole, writeSavedBoard } from './gamesave';
import type { SudokuBoard, SudokuLevel } from './sudoku';

/**
 * Today's sudoku boards on this device, one per level: the numbers entered, cues (notes), x marks, the clock, the error
 * count and whether auto cues were on. Undo history and the pause state are not kept: a reloaded board runs again.
 */
const MAX_LENGTH = 8192;
const CELLS = 81;

export interface SudokuProgress {
  board: SudokuBoard;
  seconds: number;
  errors: number;
  auto: boolean;
}

/** Whether the board is just the puzzle as dealt (nothing worth saving). */
export function untouched(progress: SudokuProgress, puzzle: readonly number[]): boolean {
  const { board } = progress;
  return progress.errors === 0 && !progress.auto && board.entries.every((value, i) => value === puzzle[i]) && board.notes.every((mask) => mask === 0) && board.marks.size === 0;
}

/** The saved progress for this level, checked against its puzzle (givens must match), or null. */
export function loadSudokuSave(puzzle: readonly number[], day: string, level: SudokuLevel, storage: KeyValueStorage | undefined = browserStorage()): SudokuProgress | null {
  const saved = readSavedBoard(storage, SUDOKU_SAVE_KEY, MAX_LENGTH, day, level);
  if (!isObject(saved)) return null;
  const { entries, notes, marks, seconds, errors, auto } = saved;
  if (!Array.isArray(entries) || entries.length !== CELLS || !entries.every((value, i) => whole(value, 9) && (puzzle[i] === 0 || value === puzzle[i]))) return null;
  if (!Array.isArray(notes) || notes.length !== CELLS || !notes.every((mask) => whole(mask, 511))) return null;
  if (!Array.isArray(marks) || marks.length > CELLS || !marks.every((i) => whole(i, CELLS - 1)) || new Set(marks).size !== marks.length) return null;
  if (!whole(seconds, 359_999) || !whole(errors, 10_000) || typeof auto !== 'boolean') return null;
  return { board: { entries: entries as number[], notes: notes as number[], marks: new Set(marks as number[]) }, seconds, errors, auto };
}

/** Saves this level's board after a move; a board back at the start drops its record. */
export function saveSudokuProgress(puzzle: readonly number[], day: string, level: SudokuLevel, progress: SudokuProgress, storage: KeyValueStorage | undefined = browserStorage()): void {
  const { board, seconds, errors, auto } = progress;
  writeSavedBoard(storage, SUDOKU_SAVE_KEY, MAX_LENGTH, day, level,
    untouched(progress, puzzle) ? null : { entries: board.entries, notes: board.notes, marks: [...board.marks], seconds, errors, auto });
}
