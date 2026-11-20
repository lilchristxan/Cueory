/**
 * Private daily-game stats (D-76). Each game reports a finished round and the stats panel keeps it. The record itself (first result of each game and day; pillo's and word path's
 * streaks are worked out from it, and the crossword keeps a streak flag; Task 719, #722, Task 721) is the helper's logic in ./gamestats, and results older than 400 days are dropped by today's date.
 *
 * Stats are always kept in this browser (Christian's decision, 2026-11-17; there is no on/off switch any more), and
 * "forget" deletes them. Only a browser that won't store anything (private browsing, blocked site data) keeps none.
 * Nothing here is ever sent anywhere.
 */
import type { KeyValueStorage } from '../scripts/storage';
import { dayLabel } from './daily';
import { LEVEL_LABELS, type SudokuResult } from './sudoku';
import type { StatRoundResult } from './stat';
import { statGame } from '../config/games';
import { migratePilloStatsToVialo, parseStats, serialize, type GameId, type GameStats } from './gamestats';

/** The event a game sends on `window` when a round ends. */
export const GAME_RESULT_EVENT = 'cueory:game-result';

/** The separate event that opens the shared finished-game dialog. */
export const GAME_RESULT_CARD_EVENT = 'cueory:game-result-card';

/** Worker 1's additive Sudoku completion event; the Sudoku island can dispatch it without importing this host. */
export const SUDOKU_SOLVED_EVENT = 'cueory:sudoku-solved';

/** Backward-compatible name for the game's canonical completion payload. */
export type SudokuSolvedDetail = SudokuResult;

declare global {
  interface WindowEventMap {
    'cueory:sudoku-solved': CustomEvent<SudokuSolvedDetail>;
  }
}

function resultDayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? day : dayLabel(date);
}

export type ResultGame = GameId | 'hello-cards' | 'sudoku' | 'stat';

export interface ResultStat {
  label: string;
  value: string;
}

/** Display-only result data. It contains no puzzle answer, personal data or tracking value. */
export interface GameResultCard {
  game: ResultGame;
  name: string;
  date: string;
  level?: string;
  result: string;
  /** Optional detailed outcome for sharing, while the card heading stays short. */
  shareResult?: string;
  summary: string;
  /** Optional game-specific follow-up, without promising unpublished daily content. */
  nextMessage?: string;
  stats: readonly ResultStat[];
  path: string;
  /** Optional official game wordmark asset. Omit it when the approved file is unavailable. */
  wordmarkPath?: string;
}

/** Maps Worker 1's completion payload into the same display-only result card as every other game. */
export function sudokuResultCard(detail: SudokuResult): GameResultCard {
  const errors = `${detail.errors} ${detail.errors === 1 ? 'error' : 'errors'}`;
  // The level as players see it (easy, mid, hard); an unknown level falls back to its id.
  const level = LEVEL_LABELS[detail.level] ?? detail.level;
  return {
    game: 'sudoku',
    name: 'sudoku',
    date: resultDayLabel(detail.day),
    level,
    result: detail.solved ? 'solved' : 'not solved',
    shareResult: `${level} · ${detail.solved ? '' : 'not solved · '}${detail.time} · ${errors}`,
    summary: detail.solved
      ? `${level} completed in ${detail.time} with ${errors}.`
      : `${level} ended after ${detail.time} with ${errors}.`,
    stats: [
      { label: 'time', value: detail.time },
      { label: 'errors', value: String(detail.errors) },
    ],
    path: '/play/sudoku',
  };
}

/**
 * A solved daily sudoku as a round for the shared stats record (#720), under its game id `triage`. Tries are the errors
 * counted while solving. The first round of the day counts, whichever level it was.
 */
export function sudokuRoundResult(detail: SudokuResult): RoundResult {
  return { game: 'triage', day: detail.day, solved: detail.solved, tries: detail.errors };
}

/** Display-only Stat result. Questions, keys and private stats are never included. */
export function statResultCard(detail: StatRoundResult): GameResultCard {
  return {
    game: 'stat', name: statGame.name, date: resultDayLabel(detail.day),
    result: `${detail.score}/${detail.total}`,
    summary: detail.practice ? 'practice round complete.' : 'round complete.',
    nextMessage: 'reviewed daily sets will come later.',
    stats: [
      { label: 'questions', value: String(detail.total) },
      { label: 'average answer time', value: `${detail.averageSeconds} s` },
      { label: 'round', value: detail.practice ? 'practice' : 'today' },
    ],
    path: '/play/stat',
  };
}

/** Hello cards shares the prompt of the day itself; the dialog heading stays short. */
export function helloResultCard(detail: { prompt: string; date: string; deck: string }): GameResultCard {
  return {
    game: 'hello-cards',
    name: 'hello cards',
    date: detail.date,
    result: "today's card",
    shareResult: detail.prompt,
    summary: 'share the prompt, then start a conversation.',
    stats: [{ label: 'deck', value: detail.deck }],
    path: '/play/hello-cards',
  };
}

interface InertNode {
  inert: boolean;
  parentElement: InertNode | null;
  readonly children: ArrayLike<unknown>;
}

/**
 * Makes everything outside the open dialog unreachable (no focus, clicks or screen-reader browsing) by setting
 * `inert` on each sibling branch from the dialog up to the body. Returns a function that restores exactly the
 * branches it changed, so anything that was already inert stays inert.
 */
export function inertOutside(dialog: InertNode, body: InertNode): () => void {
  const changed: InertNode[] = [];
  for (let node: InertNode | null = dialog; node && node !== body; node = node.parentElement) {
    const parent: InertNode | null = node.parentElement;
    if (!parent) break;
    const siblings: InertNode[] = Array.from(parent.children) as InertNode[];
    for (const sibling of siblings) {
      if (sibling === node || sibling.inert) continue;
      sibling.inert = true;
      changed.push(sibling);
    }
  }
  return () => {
    for (const node of changed) node.inert = false;
  };
}

// The page-scroll lock is shared with the sign-up pop-up, so it lives in its own small module.
export { lockPageScroll } from '../scripts/scrolllock';

/** The exact, plain one-line share format approved for finished games. */
export function buildResultShareLine(card: Pick<GameResultCard, 'name' | 'date' | 'result' | 'shareResult'>): string {
  const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
  return `${clean(card.name)} · ${clean(card.date)} · ${clean(card.shareResult ?? card.result)} · cueory.app`;
}

/** Opens the shared result dialog without adding anything to private browser stats. */
export function showResultCard(card: GameResultCard): void {
  if (typeof window === 'undefined') return;
  pendingCards.push(card);
  window.dispatchEvent(new CustomEvent<GameResultCard>(GAME_RESULT_CARD_EVENT, { detail: card }));
}

/** Consume display-only cards that finished before the result host hydrated. */
export function takePendingResultCards(): GameResultCard[] {
  return pendingCards.splice(0, pendingCards.length);
}

/** Remove the event's queued copy when a live host receives it. */
export function discardPendingResultCard(card: GameResultCard): void {
  const index = pendingCards.indexOf(card);
  if (index >= 0) pendingCards.splice(index, 1);
}

/** Where the stats record is kept, when the student has turned stats on. */
export const STATS_STORAGE_KEY = 'cueory-game-stats';

/**
 * Sudoku's own per-level record (#720): the day, level and solve time of each level's first solve of a day. It is kept
 * like the other stats (always, in this browser), and "forget all" deletes it with the shared record (./sudokustats).
 */
export const SUDOKU_STATS_STORAGE_KEY = 'cueory-sudoku-stats';

export interface RoundResult {
  game: GameId;
  /** The day of the puzzle that was played, in the visitor's own time zone, written YYYY-MM-DD. */
  day: string;
  solved: boolean;
  /** Guesses for pillo, errors for sudoku, checks or reveals for the crossword and loose stitches for word path. */
  tries: number;
  /** Set when the round ended on another local day than its puzzle's own: it then never extends a streak. */
  offDay?: true;
  /** Crossword only: whether the solve extends the streak (no Check, Reveal or Autocheck, within 48 hours). */
  streak?: boolean;
  /** Word path boards only (#722): hints used. */
  hints?: number;
  /** Word path boards only (#722): whether the special answer was found first. */
  specialFirst?: boolean;
  /** When present, the same completion also opens the shared finished-game dialog. */
  card?: GameResultCard;
}

/** A date as YYYY-MM-DD in the visitor's own time zone: the same day the games pick their puzzle by. */
export function localDay(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Rounds finished on this page that aren't kept yet, in memory only. A round waits here while the stats panel's own
 * code is still loading. Every island on the page
 * shares this module, so they share the list.
 */
const held: RoundResult[] = [];
const pendingCards: GameResultCard[] = [];

/** Drops the waiting rounds of one game, or of every game, so none of them can be kept later. */
export function forgetHeldRounds(game?: GameId): void {
  const others = game === undefined ? [] : held.filter((result) => result.game !== game);
  held.length = 0;
  held.push(...others);
}

// Another tab turned stats on or off, forgot some or kept a game; or this page came back from the back/forward cache,
// where it heard no such change. Either way a waiting round may be from before the student turned stats off, so it is
// dropped. This is set up as soon as this module loads, which is before any round can wait (Codex on #79).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === STATS_STORAGE_KEY) forgetHeldRounds();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) forgetHeldRounds();
  });
}

/** The event a game sends on `window` once today's round has its first move (read by the /play daily status). */
export const GAME_PROGRESS_EVENT = 'cueory:game-progress';

export interface ProgressDetail {
  game: GameId;
  /** The puzzle's day in the visitor's own time zone, YYYY-MM-DD. */
  day: string;
}

/** Tells the page that today's round has started. Nothing is stored or sent anywhere. */
export function reportProgress(detail: ProgressDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ProgressDetail>(GAME_PROGRESS_EVENT, { detail: { game: detail.game, day: detail.day } }));
}

/** Tells the page that a round has ended: the round waits to be kept, and an event tells the stats panel. */
export function reportRound(result: RoundResult): void {
  held.push(result);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RoundResult>(GAME_RESULT_EVENT, { detail: result }));
  if (result.card) showResultCard(result.card);
}

/** The rounds waiting to be kept, oldest first. Reading them leaves them waiting; forget them once they're kept. */
export function heldRounds(): RoundResult[] {
  return [...held];
}

/** How many calendar days of results this browser keeps, counting today. */
export const KEEP_DAYS = 400;

/** The first day still kept on `today` (both YYYY-MM-DD): earlier results are dropped. */
export function firstKeptDay(today: string): string {
  const day = Date.parse(`${today}T00:00:00.000Z`);
  return Number.isFinite(day) ? new Date(day - (KEEP_DAYS - 1) * 86_400_000).toISOString().slice(0, 10) : '0000-00-00';
}

export interface SavedStats {
  /** Whether this browser can keep stats (false only when its storage is missing or blocked). */
  on: boolean;
  stats: GameStats;
}

/**
 * What this browser keeps, as of `today` in the visitor's own time zone: results from before the last 400 days are
 * left out. No record yet means nothing kept so far (stats are always on); missing or blocked storage means none can
 * be kept; a record that can't be read starts empty.
 */
export function loadStats(storage: KeyValueStorage | undefined, today: string): SavedStats {
  try {
    if (!storage) return { on: false, stats: [] };
    const text = storage.getItem(STATS_STORAGE_KEY);
    if (text === null) return { on: true, stats: [] };
    const first = firstKeptDay(today);
    const parsed = parseStats(text);
    const migrated = migratePilloStatsToVialo(parsed);
    if (migrated.length > parsed.length) {
      saveStats(storage, migrated);
    }
    return { on: true, stats: migrated.filter((result) => result.day >= first) };
  } catch {
    return { on: false, stats: [] };
  }
}

/** Keeps the record. False when the browser won't store it. */
export function saveStats(storage: KeyValueStorage | undefined, stats: GameStats): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STATS_STORAGE_KEY, serialize(stats));
    return true;
  } catch {
    return false;
  }
}

/** Forgets every kept result by deleting the record. False when the browser won't let us. */
export function deleteStats(storage: KeyValueStorage | undefined): boolean {
  try {
    if (!storage) return false;
    storage.removeItem(SUDOKU_STATS_STORAGE_KEY);
    storage.removeItem(STATS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** What each game counts as a try, in the words its own rules use. */
const TRIES: Record<string, { one: string; many: string }> = {
  vialo: { one: 'guess', many: 'guesses' },
  pulse: { one: 'guess', many: 'guesses' },
  triage: { one: 'error', many: 'errors' },
  cueword: { one: 'check or reveal', many: 'checks or reveals' },
  suture: { one: 'loose stitch', many: 'loose stitches' },
};

/**
 * How many tries each recorded round took, in words, fewest first: "2 guesses on 1 day, 3 guesses on 2 days."
 * Empty when nothing is recorded.
 */
export function triesInWords(game: GameId, counts: Readonly<Record<number, number>>): string {
  const words = TRIES[game];
  const parts = Object.entries(counts)
    .map(([tries, days]) => [Number(tries), days] as const)
    .filter(([tries, days]) => Number.isSafeInteger(tries) && tries >= 0 && days > 0)
    .sort(([a], [b]) => a - b)
    .map(([tries, days]) => `${tries} ${tries === 1 ? words.one : words.many} on ${days} ${days === 1 ? 'day' : 'days'}`);
  return parts.length === 0 ? '' : `${parts.join(', ')}.`;
}
