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
export function forfeitToday(storage: KeyValueStorage | undefined, game: 'vialo', day: string, tries: number): boolean {
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
export function printAnyway(storage: KeyValueStorage | undefined, game: 'vialo', day: string, tries: number, open: () => void): boolean {
  if (!forfeitToday(storage, game, day, tries)) return false;
  open();
  return true;
}

/** The event a game frame's printer button sends on `document`; detail.game names the game. */
export const PRINT_EVENT = 'cueory:print';
/** Sent on `window` after a forfeit, so the game on screen ends as lost for today. */
export const FORFEIT_EVENT = 'cueory:vialo-forfeited';

export type PrintGame = 'vialo';

/** Where each game's print entry lives: its own game page, which opens the print step when it loads. No personal data in it. */
export const PRINT_PAGES: Readonly<Record<PrintGame, string>> = { vialo: '/play/wordpill#print' };

/** True when the game can print and this browser holds today's result for it (read it again at the moment of pressing). */
export function canPrintToday(storage: KeyValueStorage | undefined, game: PrintGame, day: string): boolean {
  const saved = loadStats(storage, day);
  return saved.on && game in PRINT_PAGES && isFinished(saved.stats, game, day);
}

/** Opens a game's print step: from a page that has no sheet, go to the game page; from the game page, send the event. */
export function openPrint(game: PrintGame, go: (href: string) => void = (href) => window.location.assign(href)): void {
  go(PRINT_PAGES[game]);
}
