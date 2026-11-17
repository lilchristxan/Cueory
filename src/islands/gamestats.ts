/** Optional private game history. No storage, clock, network or visible game names. */
import type { DailyGame } from '../config/games';

export type GameId = DailyGame['id'];
export interface GameResult {
  game: GameId;
  day: string;
  solved: boolean;
  tries: number;
  /** Word path boards only (#722): hints used. */
  hints?: number;
  /** Word path boards only (#722): whether the special answer (the thread) was found first. */
  specialFirst?: boolean;
}
export type GameStats = readonly GameResult[];
export interface GameSummary {
  played: number;
  solved: number;
  /** All recorded results, including games that weren't solved. */
  triesCounts: Record<number, number>;
}

const GAMES: readonly string[] = ['pulse', 'cueword', 'triage', 'suture'];
const DAY = 86_400_000;
const WINDOW_DAYS = 400;
const VERSION = 1;

function dayNumber(day: unknown): number | undefined {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000-')) return;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day) return time / DAY;
}

function readResult(value: unknown): GameResult | undefined {
  // A bad result is ignored, even if an object from an old caller has throwing getters.
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const { game, day, solved, tries, hints, specialFirst } = value as Record<string, unknown>;
    if (typeof game !== 'string' || !GAMES.includes(game) || dayNumber(day) === undefined ||
      typeof solved !== 'boolean' || typeof tries !== 'number' || !Number.isSafeInteger(tries) || tries < 0) return;
    // The two word path details are optional, and only word path keeps them.
    if (hints !== undefined && (game !== 'suture' || typeof hints !== 'number' || !Number.isSafeInteger(hints) || hints < 0)) return;
    if (specialFirst !== undefined && (game !== 'suture' || typeof specialFirst !== 'boolean')) return;
    return {
      game: game as GameId, day: day as string, solved, tries,
      ...(hints !== undefined ? { hints } : {}),
      ...(specialFirst !== undefined ? { specialFirst } : {}),
    };
  } catch {
    return;
  }
}

/** Keep the inclusive 400-calendar-day window ending on each game's newest result. */
function trim(results: GameStats): GameResult[] {
  const latest = new Map<GameId, number>();
  for (const result of results) latest.set(result.game, Math.max(latest.get(result.game) ?? -Infinity, dayNumber(result.day)!));
  return results.filter((result) => dayNumber(result.day)! >= latest.get(result.game)! - WINDOW_DAYS + 1);
}

/** First result for a game/day wins. Replay never rewrites it or another game's history. */
export function recordResult(stats: GameStats, result: unknown): GameStats {
  const valid = readResult(result);
  if (!valid || stats.some((entry) => entry.game === valid.game && entry.day === valid.day)) return stats;
  return trim([...stats, valid]);
}

export function summary(stats: GameStats, game: string): GameSummary {
  const results = stats.filter((entry) => entry.game === game);
  const triesCounts: Record<number, number> = {};
  for (const result of results) triesCounts[result.tries] = (triesCounts[result.tries] ?? 0) + 1;
  return { played: results.length, solved: results.filter((entry) => entry.solved).length, triesCounts };
}

export function summaryInWords(value: GameSummary): string {
  return `played ${value.played} ${value.played === 1 ? 'day' : 'days'}, solved ${value.solved}.`;
}

/** Only known progress fields are serialized; caller metadata never follows them. */
export function serialize(stats: GameStats): string {
  const results: GameResult[] = [];
  for (const result of stats) {
    const valid = readResult(result);
    if (!valid) return JSON.stringify({ version: VERSION, results: [] });
    results.push(valid);
  }
  return JSON.stringify({ version: VERSION, results: trim(results) });
}

/** Bad or old data starts empty. One invalid entry invalidates the whole saved record. */
export function parseStats(text: unknown): GameStats {
  try {
    if (typeof text !== 'string') return [];
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const { version, results } = value as Record<string, unknown>;
    if (version !== VERSION || !Array.isArray(results)) return [];
    const seen = new Set<string>();
    const parsed: GameResult[] = [];
    for (const result of results) {
      const valid = readResult(result);
      if (!valid) return [];
      const key = `${valid.game}:${valid.day}`;
      if (!seen.has(key)) { seen.add(key); parsed.push(valid); }
    }
    return trim(parsed);
  } catch {
    return [];
  }
}

export interface WordPathSummary {
  played: number;
  completed: number;
  /** Whole percent of played days that were completed (0 when nothing is played). */
  solvePercent: number;
  /** Completed days in a row, ending today or yesterday. */
  currentStreak: number;
  longestStreak: number;
  specialFirst: number;
  withoutHints: number;
}

/**
 * Word path's own stats (#722): completed, solve %, current and longest streak, special answer found first, and solved
 * without hints. Streaks are worked out from the days already kept; nothing extra is stored for them. `today` is the
 * visitor's own YYYY-MM-DD day.
 */
export function wordPathSummary(stats: GameStats, today: string): WordPathSummary {
  const results = stats.filter((entry) => entry.game === 'suture');
  const solved = results.filter((entry) => entry.solved);
  const days = [...new Set(solved.map((entry) => dayNumber(entry.day)!))].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  for (const [i, day] of days.entries()) {
    run = i > 0 && day === days[i - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const now = dayNumber(today);
  const last = days.at(-1);
  const current = now !== undefined && last !== undefined && (last === now || last === now - 1) ? run : 0;
  return {
    played: results.length,
    completed: solved.length,
    solvePercent: results.length ? Math.round((solved.length / results.length) * 100) : 0,
    currentStreak: current,
    longestStreak: longest,
    specialFirst: solved.filter((entry) => entry.specialFirst === true).length,
    withoutHints: solved.filter((entry) => entry.hints === 0).length,
  };
}

export function wordPathSummaryInWords(value: WordPathSummary): string {
  const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;
  return `completed ${value.completed}, solve rate ${value.solvePercent}%. streak: ${days(value.currentStreak)}, longest ${days(value.longestStreak)}. ` +
    `the thread found first: ${value.specialFirst}. solved without hints: ${value.withoutHints}.`;
}

export function forget(stats: GameStats, game?: string): GameStats {
  return game === undefined ? [] : stats.filter((result) => result.game !== game);
}
