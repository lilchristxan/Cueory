import { loadStats, localDay, type SavedStats } from '../islands/gameresults';
import { sameGame } from '../islands/gamestats';
import { dayNumber, playablePuzzles, puzzleForDay } from '../islands/pulse';
import { browserStorage } from './storage';

export interface SheetPuzzle { word: string }
export interface Keeper { word: string; number: number; date: string }

/**
 * What the word keeper's page shows: today's word, chosen as the game chooses it (dayNumber, puzzleForDay), but only
 * when this browser has a finished vialo for today. Otherwise nothing.
 */
export function keeperFor(puzzles: readonly SheetPuzzle[], saved: SavedStats, now: Date): Keeper | undefined {
  const today = localDay(now);
  if (!saved.stats.some((entry) => entry.day === today && sameGame(entry.game, 'vialo'))) return undefined;
  const puzzle = puzzleForDay(playablePuzzles(puzzles), dayNumber(now));
  if (!puzzle) return undefined;
  const day = now.getDate();
  const ordinal = day % 100 >= 11 && day % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  const part = (options: Intl.DateTimeFormatOptions) => now.toLocaleDateString('en-US', options).toLowerCase();
  const date = `${part({ weekday: 'long' })}, ${part({ month: 'long' })} ${day}${ordinal}`;
  return { word: puzzle.word, number: dayNumber(now) + 1, date };
}

/** The "print" buttons: open the browser's print dialog. An external file, so no inline script. */
export function wirePrintButtons(root: Document = document, print: () => void = () => window.print()): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-print-sheet]')) {
    button.addEventListener('click', () => print());
  }
}

/** Fills the word box on page 2 when today's game is finished; leaves the "finish today's vialo" line otherwise. */
export function showKeeperWord(root: Document = document, now: Date = new Date()): void {
  const box = root.querySelector<HTMLElement>('[data-keeper]');
  if (!box) return;
  let puzzles: SheetPuzzle[] = [];
  try { puzzles = JSON.parse(box.dataset.puzzles ?? '[]') as SheetPuzzle[]; } catch { return; }
  const keeper = keeperFor(puzzles, loadStats(browserStorage(), localDay(now)), now);
  if (!keeper) return;
  box.querySelector('[data-keeper-word]')!.textContent = keeper.word;
  box.querySelector('[data-keeper-date]')!.textContent = `${keeper.date} · #${keeper.number}`;
  box.dataset.keeper = 'ready';
}
