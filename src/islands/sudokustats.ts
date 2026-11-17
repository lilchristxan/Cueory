/**
 * Sudoku's private per-level stats (#720): solved, best time, average time and streak for easy, mid and hard.
 *
 * The record holds only the day, the level and the solve time of each level's first solve of a day. It follows the
 * shared daily-game stats switch (D-76): it is kept only while stats are on, it is deleted when stats are turned off or
 * "forget all" is used (gameresults.deleteStats), and nothing in it is ever sent anywhere. Results older than 400 days
 * are dropped. Pure apart from the small load/save helpers at the bottom, which never throw.
 */
import type { KeyValueStorage } from '../scripts/storage';
import { loadStats, SUDOKU_STATS_STORAGE_KEY } from './gameresults';
import type { SudokuLevel } from './sudoku';

export interface SudokuSolve {
  level: SudokuLevel;
  /** The puzzle's day in the player's own time zone, YYYY-MM-DD. */
  day: string;
  seconds: number;
}
export type SudokuSolves = readonly SudokuSolve[];

export interface SudokuLevelStats {
  solved: number;
  bestSeconds: number | null;
  averageSeconds: number | null;
  /** Days in a row with a solve at this level, ending today or yesterday. */
  streak: number;
}

const LEVELS: readonly string[] = ['easy', 'medium', 'hard'];
const VERSION = 1;
const DAY = 86_400_000;
const KEEP_DAYS = 400;
/** A day is 86,400 seconds; a longer time can't be a real solve of that day's puzzle. */
const MAX_SECONDS = 86_400;

function dayNumber(day: unknown): number | undefined {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000-')) return;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day) return time / DAY;
}

function readSolve(value: unknown): SudokuSolve | undefined {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const { level, day, seconds } = value as Record<string, unknown>;
    if (typeof level !== 'string' || !LEVELS.includes(level) || dayNumber(day) === undefined ||
      typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 0 || seconds > MAX_SECONDS) return;
    return { level: level as SudokuLevel, day: day as string, seconds };
  } catch {
    return;
  }
}

/** Keeps the 400 calendar days ending on `today` (or on the newest solve when no day is given). */
function trim(solves: readonly SudokuSolve[], today?: string): SudokuSolve[] {
  const end = dayNumber(today) ?? Math.max(-Infinity, ...solves.map((solve) => dayNumber(solve.day)!));
  return solves.filter((solve) => dayNumber(solve.day)! >= end - KEEP_DAYS + 1);
}

/** The first solve of each level and day counts. Solving the same board again changes nothing. */
export function recordSudokuSolve(solves: SudokuSolves, solve: unknown): SudokuSolves {
  const valid = readSolve(solve);
  if (!valid || solves.some((entry) => entry.level === valid.level && entry.day === valid.day)) return solves;
  return trim([...solves, valid]);
}

export function sudokuLevelStats(solves: SudokuSolves, level: SudokuLevel, today: string): SudokuLevelStats {
  const mine = solves.filter((solve) => solve.level === level);
  const times = mine.map((solve) => solve.seconds);
  const days = new Set(mine.map((solve) => dayNumber(solve.day)!));
  const todayNumber = dayNumber(today);
  let streak = 0;
  if (todayNumber !== undefined) {
    // A streak is still alive until a whole day passes without a solve.
    let cursor = days.has(todayNumber) ? todayNumber : todayNumber - 1;
    while (days.has(cursor)) { streak++; cursor--; }
  }
  return {
    solved: mine.length,
    bestSeconds: times.length ? Math.min(...times) : null,
    averageSeconds: times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : null,
    streak,
  };
}

/** mm:ss, or h:mm:ss from an hour. */
export function sudokuTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${String(minutes).padStart(2, '0')}:${rest}`;
}

export function serializeSudokuSolves(solves: SudokuSolves): string {
  const valid: SudokuSolve[] = [];
  for (const solve of solves) {
    const checked = readSolve(solve);
    if (!checked) return JSON.stringify({ version: VERSION, solves: [] });
    valid.push(checked);
  }
  return JSON.stringify({ version: VERSION, solves: trim(valid) });
}

/** Bad or old data starts empty: one invalid entry invalidates the whole record. */
export function parseSudokuSolves(text: unknown, today?: string): SudokuSolves {
  try {
    if (typeof text !== 'string') return [];
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const { version, solves } = value as Record<string, unknown>;
    if (version !== VERSION || !Array.isArray(solves)) return [];
    const seen = new Set<string>();
    const parsed: SudokuSolve[] = [];
    for (const solve of solves) {
      const valid = readSolve(solve);
      if (!valid) return [];
      const key = `${valid.level}:${valid.day}`;
      if (!seen.has(key)) { seen.add(key); parsed.push(valid); }
    }
    return trim(parsed, today);
  } catch {
    return [];
  }
}

export interface SavedSudokuStats {
  /** Whether the shared daily-game stats switch is on in this browser. */
  on: boolean;
  solves: SudokuSolves;
}

/**
 * What this browser keeps, as of `today`. Stats are always kept; when this browser can't keep them a leftover sudoku
 * record is deleted (fail closed).
 */
export function loadSudokuStats(storage: KeyValueStorage | undefined, today: string): SavedSudokuStats {
  try {
    if (!loadStats(storage, today).on) {
      if (storage?.getItem(SUDOKU_STATS_STORAGE_KEY) !== null) storage?.removeItem(SUDOKU_STATS_STORAGE_KEY);
      return { on: false, solves: [] };
    }
    return { on: true, solves: parseSudokuSolves(storage?.getItem(SUDOKU_STATS_STORAGE_KEY) ?? null, today) };
  } catch {
    return { on: false, solves: [] };
  }
}

/** Adds a solve. Returns what is kept afterwards; nothing is written when this browser can't keep stats. */
export function keepSudokuSolve(storage: KeyValueStorage | undefined, today: string, solve: SudokuSolve): SavedSudokuStats {
  const saved = loadSudokuStats(storage, today);
  if (!saved.on) return saved;
  const solves = recordSudokuSolve(saved.solves, solve);
  try {
    if (solves !== saved.solves) storage?.setItem(SUDOKU_STATS_STORAGE_KEY, serializeSudokuSolves(solves));
  } catch {
    return saved;
  }
  return { on: true, solves };
}
