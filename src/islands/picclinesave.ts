import { browserStorage, type KeyValueStorage } from '../scripts/storage';
import { hintsEarned, startPath, type PathHint, type PathState, type SuturePathPuzzle } from './suturepath';

/**
 * Device-local autosave for piccline's board format, one record per puzzle day. It holds only what the player did on
 * this board (found answers, other words found, cues used, wrong submits): never the answers themselves, a name or an
 * account id, and nothing is sent anywhere. Public accounts are closed, so the record is stamped "device"; when
 * accounts open, the owner field is where the account id check of docs/GAMES-PARITY.md belongs (a record stamped for
 * another owner is ignored, never shown). Storage can be missing, blocked or full: every call then quietly does nothing.
 */
export const PICCLINE_SAVE_KEY = 'cueory-piccline-save';
export const PICCLINE_SAVE_VERSION = 1 as const;
export const PICCLINE_OWNER = 'device';
/** Never read or write more than this many characters, so a damaged record cannot grow without bound. */
const MAX_SAVE_LENGTH = 16_384;
/** A solve time over a day cannot be real: ignore it. */
const MAX_MS = 86_400_000;

interface SavedBoard {
  found: number[];
  extras: string[];
  hintsUsed: number;
  hint: PathHint | null;
  misses: number;
  printed?: true;
  /** The solve timer's milliseconds so far (Christian, 25 Nov 2026); boards saved before the timer have none. */
  ms?: number;
}
interface SaveFile {
  v: typeof PICCLINE_SAVE_VERSION;
  owner: typeof PICCLINE_OWNER;
  /** The day (YYYY-MM-DD, the visitor's own) every board in this file belongs to. */
  day: string;
  boards: Record<string, SavedBoard>;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const whole = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

function read(storage: KeyValueStorage | undefined): unknown {
  try {
    const raw = storage?.getItem(PICCLINE_SAVE_KEY);
    if (!raw || raw.length > MAX_SAVE_LENGTH) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/** The saved boards for `day`, or none: another day's file, another owner's or a damaged one counts as nothing. */
function boardsFor(data: unknown, day: string): Record<string, unknown> {
  if (!isObject(data) || data.v !== PICCLINE_SAVE_VERSION || data.owner !== PICCLINE_OWNER || data.day !== day || !isObject(data.boards)) return {};
  return data.boards;
}

/** Checks a saved board against its puzzle, so a damaged or outdated record can never break or cheat the game. */
function restore(value: unknown, puzzle: SuturePathPuzzle): PathState | null {
  if (!isObject(value)) return null;
  const total = puzzle.words.length;
  const { found, extras, hintsUsed, hint, misses } = value;
  if (!Array.isArray(found) || found.length > total || !found.every((i) => whole(i, total - 1)) || new Set(found).size !== found.length) return null;
  if (!Array.isArray(extras) || extras.length > puzzle.extras.length || !extras.every((w) => typeof w === 'string' && puzzle.extras.includes(w)) || new Set(extras).size !== extras.length) return null;
  if (!whole(misses, 10_000) || !whole(hintsUsed, 10_000)) return null;
  let marked: PathHint | null = null;
  if (hint !== null && hint !== undefined) {
    if (!isObject(hint) || !whole(hint.answer, total - 1) || typeof hint.order !== 'boolean' || found.includes(hint.answer)) return null;
    marked = { answer: hint.answer, order: hint.order };
  }
  const state: PathState = { ...startPath(), found: found as number[], extras: extras as string[], hintsUsed, hint: marked, misses };
  if (hintsUsed > hintsEarned(state)) return null;
  if (value.printed === true) state.printed = true;
  return state;
}

/** Today's saved board for this puzzle, or null when there is none worth restoring. */
export function loadPicclineSave(puzzle: SuturePathPuzzle, day: string, storage: KeyValueStorage | undefined = browserStorage()): PathState | null {
  return restore(boardsFor(read(storage), day)[puzzle.id], puzzle);
}

/** The solve timer's milliseconds saved with today's board, or undefined for none (an older save, or never started). */
export function loadPicclineMs(puzzle: SuturePathPuzzle, day: string, storage: KeyValueStorage | undefined = browserStorage()): number | undefined {
  const board = boardsFor(read(storage), day)[puzzle.id];
  const ms = isObject(board) ? board.ms : undefined;
  return whole(ms, MAX_MS) ? ms : undefined;
}

/** Saves the board after a move. Only today's file is kept: opening a new day starts over. Letters being picked are not saved. */
export function savePicclineBoard(puzzle: SuturePathPuzzle, day: string, state: PathState, storage: KeyValueStorage | undefined = browserStorage(), ms?: number): void {
  if (!storage) return;
  try {
    const board: SavedBoard = { found: state.found, extras: state.extras, hintsUsed: state.hintsUsed, hint: state.hint, misses: state.misses, ...(state.printed ? { printed: true as const } : {}), ...(ms !== undefined && ms <= MAX_MS ? { ms: Math.round(ms) } : {}) };
    const others = Object.fromEntries(Object.entries(boardsFor(read(storage), day)).filter(([id]) => id !== puzzle.id));
    const file = { v: PICCLINE_SAVE_VERSION, owner: PICCLINE_OWNER, day, boards: { ...others, [puzzle.id]: board } };
    const text = JSON.stringify(file);
    if (text.length <= MAX_SAVE_LENGTH) storage.setItem(PICCLINE_SAVE_KEY, text);
  } catch { /* storage blocked or full: the game still plays, it just is not remembered */ }
}

/**
 * Saves only the solve time of an already saved board, leaving every other field as stored. A tab that is hidden or left
 * calls this, not savePicclineBoard: its own copy of the board may be older than what another tab saved since (Codex on
 * #1230), and writing that copy back would erase a word found there. The larger time wins, so a quieter tab never
 * shortens it. A board that is already complete keeps its time as it is. With no saved board for today there is nothing to attach the time to, and nothing is written.
 */
export function savePicclineMs(puzzle: SuturePathPuzzle, day: string, ms: number, storage: KeyValueStorage | undefined = browserStorage()): void {
  if (!storage || !(ms >= 0) || ms > MAX_MS) return;
  try {
    const boards = boardsFor(read(storage), day);
    const board = boards[puzzle.id];
    if (!isObject(board)) return;
    // A finished board already holds its final, stopped time: a tab still running on an older copy must not inflate it.
    if (Array.isArray(board.found) && board.found.length >= puzzle.words.length) return;
    const stored = whole(board.ms, MAX_MS) ? board.ms : 0;
    const text = JSON.stringify({ v: PICCLINE_SAVE_VERSION, owner: PICCLINE_OWNER, day, boards: { ...boards, [puzzle.id]: { ...board, ms: Math.max(stored, Math.round(ms)) } } });
    if (text.length <= MAX_SAVE_LENGTH) storage.setItem(PICCLINE_SAVE_KEY, text);
  } catch { /* storage blocked or full: the time is simply not remembered */ }
}
