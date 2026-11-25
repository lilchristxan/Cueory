import type { KeyValueStorage } from '../scripts/storage';

/**
 * Shared plumbing for the games' device-local autosave (the same pattern as piccline's: docs/GAMES-PARITY.md, "autosave
 * every move"). One key per game holds one day's boards, each under its own id (a sudoku level, a crossword size). It
 * holds only what the player did on this board: never a name or an account id, and nothing is sent anywhere. A file for
 * another day, version or owner, or a damaged one, counts as nothing; storage can be missing, blocked or full, and
 * every call then quietly does nothing.
 */
export const SAVE_VERSION = 1 as const;
export const SAVE_OWNER = 'device';

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const whole = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

function read(storage: KeyValueStorage | undefined, key: string, maxLength: number): unknown {
  try {
    const raw = storage?.getItem(key);
    if (!raw || raw.length > maxLength) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/** The saved boards for `day`, by id. */
function boardsFor(data: unknown, day: string): Record<string, unknown> {
  if (!isObject(data) || data.v !== SAVE_VERSION || data.owner !== SAVE_OWNER || data.day !== day || !isObject(data.boards)) return {};
  return data.boards;
}

/** One saved board's raw record for today, to be checked by the game before use. */
export function readSavedBoard(storage: KeyValueStorage | undefined, key: string, maxLength: number, day: string, id: string): unknown {
  return boardsFor(read(storage, key, maxLength), day)[id];
}

/**
 * Saves one board (or drops it when `board` is null). Only today's file is kept: opening a new day starts over.
 * Never writes for an older day over a newer one: a tab left open overnight must not wipe what today's tab saved.
 * Each write re-reads storage first, so two same-day tabs on different levels or sizes keep each other's boards.
 */
export function writeSavedBoard(storage: KeyValueStorage | undefined, key: string, maxLength: number, day: string, id: string, board: unknown): void {
  if (!storage) return;
  try {
    const data = read(storage, key, maxLength);
    if (isObject(data) && typeof data.day === 'string' && data.day > day) return;
    const existing = boardsFor(data, day);
    if (board === null && !(id in existing)) return;
    const others = Object.fromEntries(Object.entries(existing).filter(([other]) => other !== id));
    const write = (boards: Record<string, unknown>) => {
      const text = JSON.stringify({ v: SAVE_VERSION, owner: SAVE_OWNER, day, boards });
      if (text.length > maxLength) return false;
      storage.setItem(key, text);
      return true;
    };
    // Too big to keep: drop this board's record rather than leave an older copy that would restore stale moves.
    if (board === null || !write({ ...others, [id]: board })) write(others);
  } catch { /* storage blocked or full: the game still plays, it just is not remembered */ }
}
