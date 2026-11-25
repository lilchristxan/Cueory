import { browserStorage, type KeyValueStorage } from '../scripts/storage';
import { CROSSWORD_SAVE_KEY } from './gamesavekeys';
import { isObject, readSavedBoard, whole, writeSavedBoard } from './gamesave';
import { emptyState, words, type CellMark, type CuewordPuzzle, type CuewordState, type Direction } from './cueword';

/**
 * Today's crossword boards on this device, one per size: the letters, the square you were on, the squares revealed or
 * checked, how many times help was used, and the clock. A finished board reopens finished.
 */
const MAX_LENGTH = 8192;

export interface CuewordProgress {
  state: CuewordState;
  elapsed: number;
}

const idFor = (puzzle: CuewordPuzzle) => `${puzzle.level ?? 'easy'}:${puzzle.id}`;

/** The saved progress for this puzzle, checked against its grid, or null. */
export function loadCuewordSave(puzzle: CuewordPuzzle, day: string, storage: KeyValueStorage | undefined = browserStorage()): CuewordProgress | null {
  const saved = readSavedBoard(storage, CROSSWORD_SAVE_KEY, MAX_LENGTH, day, idFor(puzzle));
  if (!isObject(saved)) return null;
  const start = emptyState(puzzle);
  const cells = start.entries.length;
  const letters = puzzle.grid.join('');
  const { entries, cell, direction, cued, checks, assists, elapsed } = saved;
  if (!Array.isArray(entries) || entries.length !== cells) return null;
  if (!entries.every((entry, i) => typeof entry === 'string' && (entry === '' || (letters[i] !== '.' && /^[a-z]$/i.test(entry))))) return null;
  if (!whole(cell, cells - 1) || letters[cell] === '.' || (direction !== 'across' && direction !== 'down')) return null;
  if (!Array.isArray(cued) || cued.length > cells || !cued.every((i) => whole(i, cells - 1) && letters[i] !== '.') || new Set(cued).size !== cued.length) return null;
  if (!Array.isArray(checks) || checks.length !== cells || !checks.every((mark) => mark === null || mark === 'right' || mark === 'wrong' || mark === 'empty')) return null;
  if (!whole(assists, 10_000) || !whole(elapsed, 359_999)) return null;
  const state: CuewordState = {
    ...start,
    entries: (entries as string[]).map((entry) => entry.toUpperCase()),
    cell, direction: direction as Direction, cued: cued as number[],
    checks: (checks as (CellMark | null)[]).map((mark) => mark ?? undefined),
    assists,
  };
  // The square must belong to a word, or the board could not be drawn.
  if (!words(state.puzzle).some((word) => word.cells.includes(cell))) return null;
  return { state, elapsed };
}

/** Saves the board after a move. Pencil letters are gone from the game, so they are not kept. */
export function saveCuewordProgress(puzzle: CuewordPuzzle, day: string, { state, elapsed }: CuewordProgress, storage: KeyValueStorage | undefined = browserStorage()): void {
  const blank = state.entries.every((entry) => !entry) && state.assists === 0;
  writeSavedBoard(storage, CROSSWORD_SAVE_KEY, MAX_LENGTH, day, idFor(puzzle), blank ? null
    : { entries: state.entries, cell: state.cell, direction: state.direction, cued: state.cued, checks: state.checks.map((mark) => mark ?? null), assists: state.assists, elapsed });
}
