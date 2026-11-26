/**
 * The numbers and words on the /play hub (option B): the four totals in the left panel and each row's status. Pure
 * functions over what this browser already keeps (gamestats.ts); nothing is stored or sent.
 */
import { sameGame, type GameResult, type GameStats } from './gamestats';
import type { DayStatus } from './playstatus';

export interface HubTotals {
  /** Rounds finished, one per game and day. */
  played: number;
  /** Whole percent of those rounds that were solved; undefined until something has been played. */
  solvedPercent: number | undefined;
  /** Days in a row, ending today (or yesterday, while today has no game yet), with at least one game finished. */
  dayStreak: number;
  /** The longest run of such days. */
  bestStreak: number;
}

const DAY = 86_400_000;
const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00.000Z`) / DAY;

/** One result per game and day, the first one kept (a game's old and new names count as one). */
function onePerGameDay(stats: GameStats): GameResult[] {
  const kept: GameResult[] = [];
  for (const result of stats) {
    if (!kept.some((entry) => entry.day === result.day && sameGame(entry.game, result.game))) kept.push(result);
  }
  return kept;
}

export function hubTotals(stats: GameStats, today: string): HubTotals {
  const results = onePerGameDay(stats);
  // A round finished on a later day than its puzzle never extends a streak (offDay), as in the games' own streaks.
  const days = new Set(results.filter((result) => !result.offDay).map((result) => dayNumber(result.day)));
  let best = 0;
  for (const day of days) {
    if (days.has(day - 1)) continue;
    let run = 1;
    while (days.has(day + run)) run++;
    best = Math.max(best, run);
  }
  const end = dayNumber(today);
  let day = days.has(end) ? end : end - 1;
  let current = 0;
  while (days.has(day)) { current++; day--; }
  const solved = results.filter((result) => result.solved).length;
  return {
    played: results.length,
    solvedPercent: results.length === 0 ? undefined : Math.round((solved / results.length) * 100),
    dayStreak: current,
    bestStreak: best,
  };
}

/** What a finished game says: "solved in 4" (vialo keeps its guesses), "solved" or "not solved" (the print button beside it says the rest, Christian 2026-11-25). */
export function playedLabel(game: string, result: GameResult | undefined): string {
  if (!result) return 'played';
  if (!result.solved) return 'not solved';
  return sameGame(game, 'vialo') && result.tries > 0 ? `solved in ${result.tries}` : 'solved';
}

/** The row's status words, in the site's lowercase voice. Colour is never the only signal. */
export function statusWords(status: DayStatus, played: string): string {
  if (status === 'done') return played;
  return status === 'in-progress' ? 'in progress' : 'new today';
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "six games, new every day." for the number of games the page lists; digits past nine. */
export function hubHeadline(count: number): string {
  return `${WORDS[count] ?? String(count)} ${count === 1 ? 'game' : 'games'}, new every day.`;
}
