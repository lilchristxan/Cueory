/**
 * The completion/share dialog's model, shared by every game that uses it (vialo first). Plain data and small functions,
 * so they can be unit tested; ShareDialog.tsx is the one component that shows them.
 */

/** One sticker a game offers: already drawn at its export size, plus its PNG. */
export interface ShareSticker {
  id: string;
  /** "portrait sticker": the picker button's accessible name. */
  label: string;
  width: number;
  height: number;
  /** The full-size drawing; the preview is this scaled down, so preview and export cannot differ. */
  canvas: HTMLCanvasElement;
  file: File | null;
}

/** What a game feeds the dialog. */
export interface ShareGame {
  /** Selects the accent (sharedialog.css) and the test ids. */
  game: 'vialo' | 'piccline' | 'sudoku';
  /** "share your vialo result" */
  title: string;
  /** The wordmark picture; a game whose wordmark is plain type (sudoku) leaves it out and its name is set in type. */
  wordmarkSrc?: string;
  wordmarkAlt: string;
  /** The corner icon picture; sudoku's is a tile with a letter or number in it instead. */
  cornerSrc?: string;
  cornerText?: string;
  /** "next vialo in": the countdown to local midnight follows it. */
  countdownLabel: string;
}

/** How long to wait after the last guess before the card opens: the pill's pop, then a beat. None with reduced motion. */
export function revealDelayMs(reduceMotion: boolean, durationToken: string): number {
  if (reduceMotion) return 0;
  const text = durationToken.trim();
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return 0;
  const ms = text.endsWith('ms') ? value : text.endsWith('s') ? value * 1000 : 0;
  return Math.round(ms * 2);
}

/** Tab stops inside the dialog, in order: real buttons and links, not the menu items that the arrow keys handle. */
export const DIALOG_TAB_STOPS = 'button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"])';

/** Where Tab or Shift+Tab should go to stay inside the dialog, or undefined to let the browser move on. */
export function trapTarget(count: number, current: number, shift: boolean): number | undefined {
  if (count === 0) return undefined;
  if (current < 0) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return undefined;
}

/**
 * The stickers that may be shown or shared right now: only those drawn for the current stickersKey. Once the key
 * changes (the player signs out in another tab, the stats switch off) the old drawing, with its win percent and
 * streak, is unavailable until the new one resolves, and for good if the new draw fails.
 */
export function stickersFor(drawn: { key: string; list: ShareSticker[] } | undefined, key: string): ShareSticker[] {
  return drawn && drawn.key === key ? drawn.list : [];
}
