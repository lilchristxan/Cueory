/**
 * Today's status for each daily game on /play (issue #735): not started, in progress or done. It comes only from what
 * this device already holds, and nothing new is stored:
 *
 * - done: today's result in the private stats record (`cueory-game-stats`, kept only when stats are on), or a finish
 *   heard on this page (each game's own end-of-round event).
 * - in progress: a game said on this page that today's round has started (`GAME_PROGRESS_EVENT`) and it hasn't ended.
 * - not started: neither of the above.
 *
 * "Today" is the visitor's own local day, the same rule the games pick their puzzle by (`localDay`). The games don't
 * keep a half-played round after the page closes, so the status matches what each game itself remembers.
 */
import type { DailyGame } from '../config/games';
import type { GameStats } from './gamestats';

export type GameId = DailyGame['id'];
export type DayStatus = 'not-started' | 'in-progress' | 'done';

/**
 * The optional event a game may send on `window` once today's round has its first move. Detail: `{ game, day }`.
 * Nothing is stored; it only tells this page's status list.
 */
export const GAME_PROGRESS_EVENT = 'cueory:game-progress';

/** What the page has heard since it opened, in memory only. Keys are `${game}:${day}`. */
export interface HeardToday {
  started: ReadonlySet<string>;
  finished: ReadonlySet<string>;
}

export const heardKey = (game: GameId, day: string) => `${game}:${day}`;

/** One game's status on `today` (YYYY-MM-DD, local day). Finished wins over started; a stored result wins over both. */
export function statusFor(game: GameId, today: string, stats: GameStats, heard: HeardToday): DayStatus {
  const key = heardKey(game, today);
  if (heard.finished.has(key) || stats.some((result) => result.game === game && result.day === today)) return 'done';
  if (heard.started.has(key)) return 'in-progress';
  return 'not-started';
}

/** The words and symbol each status shows. The symbol is decoration; the words carry the meaning (never color). */
export interface StatusDisplay {
  label: string;
  symbol: string;
}

export const STATUS_TEXT: Readonly<Record<DayStatus, StatusDisplay>> = Object.freeze({
  'not-started': { label: 'not started', symbol: '○' },
  'in-progress': { label: 'in progress', symbol: '◐' },
  done: { label: 'done', symbol: '✓' },
});

export interface StatusDetails {
  wordsFound?: number;
  totalWords?: number;
}

/**
 * Returns the status label and symbol for a given game and status.
 * Side-card status pills show the real states matching Games.png:
 * - "not started" (symbol: ○)
 * - "in progress" (symbol: ◐)
 * - "done · <n> of <total> words" (symbol: ✓) for word path (suture) when the saved result gives both counts,
 *   otherwise "done"
 * Colour is never the only signal.
 */
/** Both counts present, whole, not negative, and no more words found than the round has. */
function validWordCount(found: number | undefined, total: number | undefined): boolean {
  return (
    Number.isSafeInteger(found) &&
    Number.isSafeInteger(total) &&
    (found as number) >= 0 &&
    (total as number) > 0 &&
    (found as number) <= (total as number)
  );
}

export function statusDisplayFor(
  game: GameId,
  status: DayStatus,
  details?: StatusDetails
): StatusDisplay {
  if (status === 'not-started') {
    return { label: 'not started', symbol: '○' };
  }
  if (status === 'in-progress') {
    return { label: 'in progress', symbol: '◐' };
  }
  // status === 'done'
  // The word count shows only when the saved result backs it; otherwise plain "done", never an assumed count.
  if (game === 'suture' && details && validWordCount(details.wordsFound, details.totalWords)) {
    return { label: `done · ${details.wordsFound} of ${details.totalWords} words`, symbol: '✓' };
  }
  return { label: 'done', symbol: '✓' };
}

/**
 * Reads a game event's detail into a heard key, or nothing when it isn't one of `games` on a real day. Sudoku's own
 * event carries `day` but no `game`, so the caller passes the game id for it.
 */
export function readHeard(detail: unknown, games: readonly GameId[], game?: GameId): string | undefined {
  try {
    if (!detail || typeof detail !== 'object') return;
    const value = detail as Record<string, unknown>;
    const id = game ?? value.game;
    const { day } = value;
    if (typeof id !== 'string' || !games.includes(id as GameId)) return;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    return heardKey(id as GameId, day);
  } catch {
    return;
  }
}
