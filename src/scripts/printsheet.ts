import { localDay, type SavedStats } from '../islands/gameresults';
import { sameGame } from '../islands/gamestats';
import { dayNumber, playablePuzzles, puzzleForDay } from '../islands/pulse';
import { SHEET_IMAGE_WAIT_MS } from './printwait';

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

/** Waits (briefly) until the sheet's pictures have loaded, so none is missing when the print dialog draws the pages. */
export async function sheetImagesReady(root: Document = document): Promise<void> {
  const images = [...root.querySelectorAll<HTMLImageElement>('[data-print-sheet] img')];
  for (const image of images) image.loading = 'eager';
  // Each picture is fetched by a fresh Image and waited for by its own load or error event. That does not depend on how an
  // engine reports `complete` or `decode()` for a lazy picture that never started (Safari can say "complete" early); the
  // fetched file then sits in the browser's cache for the real picture.
  const loaded = Promise.all(images.map((image) => new Promise<void>((resolve) => {
    const source = image.currentSrc || image.src;
    if (!source) { resolve(); return; }
    const probe = new Image();
    probe.onload = () => resolve();
    probe.onerror = () => resolve();
    probe.src = source;
  })));
  // Never hold the print dialog back for long: a picture that is slow still prints, as the browser has it.
  await Promise.race([loaded, new Promise((resolve) => window.setTimeout(resolve, SHEET_IMAGE_WAIT_MS))]);
}

/** Fills the word box on page 2 for printing. Nothing is in the page before this. */
export function fillKeeper(keeper: Keeper, root: Document = document): void {
  const box = root.querySelector<HTMLElement>('[data-print-sheet] [data-keeper]');
  if (!box) return;
  box.querySelector('[data-keeper-word]')!.textContent = keeper.word;
  box.querySelector('[data-keeper-date]')!.textContent = `${keeper.date} · #${keeper.number}`;
  box.dataset.keeper = 'ready';
}

/** Takes the word out of the page again once printing is over. */
export function clearKeeper(root: Document = document): void {
  const box = root.querySelector<HTMLElement>('[data-print-sheet] [data-keeper]');
  if (!box) return;
  box.querySelector('[data-keeper-word]')!.textContent = '';
  box.querySelector('[data-keeper-date]')!.textContent = '';
  box.dataset.keeper = 'locked';
}
