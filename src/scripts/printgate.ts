import { loadStats, reportStatsChanged, saveStats } from '../islands/gameresults';
import { recordResult, sameGame, type GameStats } from '../islands/gamestats';
import type { KeyValueStorage } from './storage';

/**
 * The shared print gate (Christian, 2026-11-25). A game's paper sheet shows today's answers, so printing a game that is
 * not finished is a forfeit: the day is recorded as not solved first (in the same result record the stats and the /play
 * status read), and only then does the sheet open. Every game's print entry uses this.
 */
export type PrintDecision = 'open' | 'warn';

/** A finished game (won or lost) prints straight away. An unfinished one warns first. */
export function decidePrint(needsWarning: boolean): PrintDecision {
  return needsWarning ? 'warn' : 'open';
}

/** True when this browser holds a result (won or lost) for the game on that day. */
export function isFinished(stats: GameStats, game: string, day: string): boolean {
  return stats.some((entry) => entry.day === day && sameGame(entry.game, game));
}

/**
 * Records today's game as not solved. The first result of a day is the one kept (recordResult), so a later replay
 * cannot change it. Returns false when the browser won't keep it. Nothing is changed unless the save succeeds.
 */
export function forfeitToday(storage: KeyValueStorage | undefined, game: PrintGame, day: string, tries: number): boolean {
  const saved = loadStats(storage, day);
  if (!saved.on) return false;
  if (isFinished(saved.stats, game, day)) return true;
  const next = recordResult(saved.stats, { game, day, solved: false, tries });
  if (!saveStats(storage, next)) return false;
  reportStatsChanged();
  return true;
}

/** What a game's print entry gives the caller: open the sheet now, or show the warning first. */
export interface PrintEntry {
  /** Today's finished state from the saved results; true when this browser keeps results at all. */
  finished: boolean;
  keepsResults: boolean;
}

/** Step 1 of every print entry (the hub's button, and the game frame's printer button once it lands). */
export function requestPrint(entry: PrintEntry, open: () => void, warn: () => void): void {
  if (decidePrint(!entry.finished && entry.keepsResults) === 'open') open();
  else warn();
}

/** Step 2, on "print anyway": record today as not solved first, and only then open the sheet. False (and nothing opens) when the record could not be saved. */
export function printAnyway(storage: KeyValueStorage | undefined, game: PrintGame, day: string, tries: number, open: () => void): boolean {
  if (!forfeitToday(storage, game, day, tries)) return false;
  open();
  return true;
}

/** The event a game frame's printer button sends on `document`; detail.game names the game. */
export const PRINT_EVENT = 'cueory:print';
/** Sent on `window` after a forfeit (detail: { game, day }), so the game on screen ends as lost for that day. */
export const FORFEIT_EVENT = 'cueory:game-forfeited';

const FORFEIT_MEMORY_ATTR = 'data-print-forfeits';

/**
 * Announces a forfeit ("print anyway" on an unfinished game): remembers it on the page for this visit and sends
 * FORFEIT_EVENT. A game's board can load after the print entry, so it also reads the memory when it starts
 * (`rememberedForfeits`); a forfeit confirmed before the board is listening is never lost.
 */
export function announceForfeit(game: PrintGame, day: string, extra: Record<string, unknown> = {}): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const level = typeof extra.level === 'string' ? extra.level : '';
  const root = document.documentElement;
  const list = (root.getAttribute(FORFEIT_MEMORY_ATTR) ?? '').split(' ').filter(Boolean);
  const entry = `${game}|${day}|${level}`;
  if (!list.includes(entry)) root.setAttribute(FORFEIT_MEMORY_ATTR, [...list, entry].join(' '));
  window.dispatchEvent(new CustomEvent(FORFEIT_EVENT, { detail: { ...extra, game, day } }));
}

/** The levels forfeited this visit for that game and day (an empty string for a game without levels); empty when none. */
export function rememberedForfeits(game: PrintGame, day: string): string[] {
  if (typeof document === 'undefined') return [];
  return (document.documentElement.getAttribute(FORFEIT_MEMORY_ATTR) ?? '').split(' ')
    .map((entry) => entry.split('|'))
    .filter((parts) => parts[0] === game && parts[1] === day)
    .map((parts) => parts[2] ?? '');
}

const PENDING_PRINT_ATTR = 'data-print-pending';

/**
 * Asks a game's sheet to print. A game page's print island loads after the page does, so a press can come before the
 * island is listening. The request is therefore also remembered on the page, and the island picks it up with
 * `claimPrint` the moment it starts listening: the press is never lost, and it prints (or warns) exactly once.
 */
export function sendPrint(game: PrintGame): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(PENDING_PRINT_ATTR, game);
  document.dispatchEvent(new CustomEvent(PRINT_EVENT, { detail: { game } }));
}

/** True once for each remembered request for this game, and forgets it. Called when a request is heard and when a sheet starts listening. */
export function claimPrint(game: PrintGame): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.getAttribute(PENDING_PRINT_ATTR) !== game) return false;
  document.documentElement.removeAttribute(PENDING_PRINT_ATTR);
  return true;
}

/** The games that have a paper sheet. Each is the id the results are stored under (piccline's older id is suture, the same history). */
export type PrintGame = 'vialo' | 'piccline';

/** Where each game's print entry lives: its own game page, which opens the print step when it loads. No personal data in it. */
export const PRINT_PAGES: Readonly<Record<PrintGame, string>> = { vialo: '/play/vialo#print', piccline: '/play/piccline#print' };

/** True when the game can print and this browser holds today's result for it (read it again at the moment of pressing). */
export function canPrintToday(storage: KeyValueStorage | undefined, game: PrintGame, day: string): boolean {
  const saved = loadStats(storage, day);
  return saved.on && game in PRINT_PAGES && isFinished(saved.stats, game, day);
}

/** Opens a game's print step: from a page that has no sheet, go to the game page; from the game page, send the event. */
export function openPrint(game: PrintGame, go: (href: string) => void = (href) => window.location.assign(href)): void {
  go(PRINT_PAGES[game]);
}
