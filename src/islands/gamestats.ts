/** Optional private game history. No storage, clock, network or visible game names. */
import type { DailyGame } from '../config/games';

export type GameId = DailyGame['id'];
export interface GameResult {
  game: GameId;
  day: string;
  solved: boolean;
  tries: number;
  /**
   * Set only when the round was finished on another local day than its puzzle's own (for example after midnight). It
   * still counts as played, but never extends a streak (Task 719).
   */
  offDay?: true;
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
    const { game, day, solved, tries, offDay } = value as Record<string, unknown>;
    if (typeof game !== 'string' || !GAMES.includes(game) || dayNumber(day) === undefined ||
      typeof solved !== 'boolean' || typeof tries !== 'number' || !Number.isSafeInteger(tries) || tries < 0 ||
      (offDay !== undefined && offDay !== true)) return;
    const result: GameResult = { game: game as GameId, day: day as string, solved, tries };
    return offDay === true ? { ...result, offDay: true } : result;
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

export interface DailyStats {
  played: number;
  /** Solved rounds as a whole percentage of rounds played; 0 when none were played. */
  winPercent: number;
  currentStreak: number;
  longestStreak: number;
  /** Solved rounds by guesses used: index 0 is one guess, up to `maxTries`. */
  distribution: number[];
}

/**
 * Played, win %, streaks and the guess distribution for one game (Task 719). A streak counts days in a row whose
 * daily puzzle was solved on its own local day; a round finished on another day (offDay) never extends it. The current
 * streak still stands today until today's puzzle is played, and a puzzle lost today ends it.
 */
export function dailyStats(stats: GameStats, game: string, today: string, maxTries: number): DailyStats {
  const results = stats.filter((entry) => entry.game === game);
  const solved = results.filter((entry) => entry.solved);
  const distribution = Array.from({ length: maxTries }, () => 0);
  for (const result of solved) if (result.tries >= 1 && result.tries <= maxTries) distribution[result.tries - 1] = (distribution[result.tries - 1] ?? 0) + 1;
  const onDay = results.filter((entry) => !entry.offDay);
  const won = new Set(onDay.filter((entry) => entry.solved).map((entry) => dayNumber(entry.day)!));
  const lost = new Set(onDay.filter((entry) => !entry.solved).map((entry) => dayNumber(entry.day)!));

  let longestStreak = 0;
  for (const day of won) {
    if (won.has(day - 1)) continue;
    let run = 1;
    while (won.has(day + run)) run++;
    longestStreak = Math.max(longestStreak, run);
  }
  const now = dayNumber(today);
  let currentStreak = 0;
  if (now !== undefined && !lost.has(now)) {
    let day = won.has(now) ? now : now - 1;
    while (won.has(day)) {
      currentStreak++;
      day--;
    }
  }
  return {
    played: results.length,
    winPercent: results.length === 0 ? 0 : Math.round((solved.length / results.length) * 100),
    currentStreak,
    longestStreak,
    distribution,
  };
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

export function forget(stats: GameStats, game?: string): GameStats {
  return game === undefined ? [] : stats.filter((result) => result.game !== game);
}
