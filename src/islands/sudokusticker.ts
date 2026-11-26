/**
 * The sudoku share stickers (Christian's designs, 25 Nov 2026): pure layout and wording, no canvas, so every number can
 * be unit tested. src/islands/sudokustickerdraw.ts draws what this module lays out. The artwork is one fixed, decorative
 * 9 x 9 pattern that never depends on the puzzle: no digit, given or answer ever reaches a sticker.
 *
 * Numbers are Christian's CSS doubled (his files are drawn at half the export size).
 */
import { gameName } from '../config/games';
import type { SudokuLevel } from './sudoku';
import { formatSolveTime, type Box, type StickerStat, type TextLine } from './vialosticker';

export const SUDOKU_STICKER_KINDS = ['centered', 'lower-third'] as const;
export type SudokuStickerKind = (typeof SUDOKU_STICKER_KINDS)[number];
export const SUDOKU_STICKER_SIZE: Record<SudokuStickerKind, { width: number; height: number }> = {
  centered: { width: 1200, height: 1620 },
  'lower-third': { width: 1600, height: 840 },
};
export const SUDOKU_STICKER_NAMES: Record<SudokuStickerKind, string> = { centered: 'portrait', 'lower-third': 'landscape' };

/** 0 = cream, 1 = peach, 2 = espresso. The same on every day and every puzzle (his design). */
export const SUDOKU_PATTERN: readonly (readonly (0 | 1 | 2)[])[] = [
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 2, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [1, 1, 1, 1, 0, 1, 1, 1, 1],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 2, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
];

export interface SudokuStickerInput {
  /** "friday, november 20th · hard" */
  dateLine: string;
  stats: readonly StickerStat[];
}

export interface GridBox extends Box {
  radius: number;
  /** The espresso frame around the cells, and the thick lines between the 3 x 3 boxes. */
  border: number;
  /** The thin lines between cells. */
  thin: number;
}

export interface SudokuLayout {
  width: number;
  height: number;
  wordmark: TextLine;
  date: TextLine;
  grid: GridBox;
  statValues: TextLine[];
  statLabels: TextLine[];
  labelBesideValue: boolean;
  dividers: Box[];
  footer: TextLine;
}

const ABOVE: Pick<TextLine, 'family'> = { family: 'body' };

function wordmarkLine(x: number, y: number, align: 'left' | 'center', lineHeight: number): TextLine {
  return { family: 'display', text: gameName('triage'), x, y, lineHeight, size: 148, weight: 600, align, letterSpacing: 1.5 };
}

function centered(input: SudokuStickerInput): SudokuLayout {
  const { width, height } = SUDOKU_STICKER_SIZE.centered;
  const cx = width / 2;
  // Read from his exported picture, which sits a little off his CSS sums.
  const top = 69;
  const dateY = top + 148 + 32;
  const gridTop = dateY + 50 + 53;
  const statsTop = gridTop + 820 + 87;
  const statWidth = 310;
  const dividerWidth = 3;
  const n = Math.max(1, input.stats.length);
  const rowWidth = n * statWidth + (n - 1) * dividerWidth;
  const left = cx - rowWidth / 2;
  const statValues: TextLine[] = [];
  const statLabels: TextLine[] = [];
  const dividers: Box[] = [];
  input.stats.forEach((stat, i) => {
    const centre = left + i * (statWidth + dividerWidth) + statWidth / 2;
    statValues.push({ ...ABOVE, text: stat.value, x: centre, y: statsTop, lineHeight: 85.8, size: 78, weight: 700, align: 'center', letterSpacing: 0 });
    statLabels.push({ ...ABOVE, text: stat.label, x: centre, y: statsTop + 89.8, lineHeight: 44.2, size: 34, weight: 400, align: 'center', letterSpacing: 0 });
    if (i > 0) dividers.push({ x: left + i * (statWidth + dividerWidth) - dividerWidth, y: statsTop + 8.9, width: dividerWidth, height: 116 });
  });
  return {
    width,
    height,
    wordmark: wordmarkLine(cx, top, 'center', 148),
    date: { ...ABOVE, text: input.dateLine, x: cx, y: dateY, lineHeight: 50, size: 42, weight: 400, align: 'center', letterSpacing: 1.6 },
    grid: { x: cx - 410, y: gridTop, width: 820, height: 820, radius: 34, border: 4.4, thin: 2 },
    statValues,
    statLabels,
    labelBesideValue: false,
    dividers,
    footer: { family: 'display', text: 'cueory.app', x: cx, y: statsTop + 183, lineHeight: 94, size: 62, weight: 600, align: 'center', letterSpacing: 1.2 },
  };
}

/** Space kept between the text column and the right edge of the landscape sticker, so a fitted line never touches the edge. */
const TEXT_RIGHT_MARGIN = 40;

function lowerThird(input: SudokuStickerInput): SudokuLayout {
  const { width, height } = SUDOKU_STICKER_SIZE['lower-third'];
  // Read from his exported picture: the grid from x 56, the text column from x 868.
  const left = 56;
  const top = 64;
  const gridSize = 710;
  const dividerX = 813;
  const metaX = 868;
  const lineStep = 96;
  const lineHeight = 88;
  const n = Math.max(1, input.stats.length);
  const statsTop = top + 268 + (3 - n) * (lineStep / 2);
  const statValues: TextLine[] = [];
  const statLabels: TextLine[] = [];
  input.stats.forEach((stat, i) => {
    const y = statsTop + i * lineStep;
    statValues.push({ ...ABOVE, text: stat.value, x: metaX, y, lineHeight, size: 78, weight: 700, align: 'left', letterSpacing: 0 });
    statLabels.push({ ...ABOVE, text: stat.label, x: 0, y, lineHeight, size: 34, weight: 400, align: 'left', letterSpacing: 0 });
  });
  return {
    width,
    height,
    wordmark: wordmarkLine(metaX, top, 'left', 140.6),
    date: { ...ABOVE, text: input.dateLine, x: metaX, y: top + 140.6 + 37, lineHeight: 50, size: 42, weight: 400, align: 'left', letterSpacing: 1.6, maxWidth: width - metaX - TEXT_RIGHT_MARGIN },
    grid: { x: left, y: top, width: gridSize, height: gridSize, radius: 30, border: 4, thin: 2 },
    statValues,
    statLabels,
    labelBesideValue: true,
    dividers: [{ x: dividerX, y: top + 22, width: 3, height: gridSize - 44 }],
    footer: { family: 'display', text: 'cueory.app', x: metaX, y: top + gridSize - 107, lineHeight: 94, size: 62, weight: 600, align: 'left', letterSpacing: 1.2 },
  };
}

export function sudokuLayout(kind: SudokuStickerKind, input: SudokuStickerInput): SudokuLayout {
  return kind === 'centered' ? centered(input) : lowerThird(input);
}

export interface SudokuStatsInput {
  /** The game's own clock, in whole seconds. */
  seconds: number;
  /** The same numbers the stats panel shows, or undefined where those are not shown (signed out). */
  account: { winPercent: number; streak: number } | undefined;
}

/** Signed in: solve time, % solved, day streak. Signed out: solve time only (Christian, 25 Nov 2026). */
export function sudokuStats(input: SudokuStatsInput): StickerStat[] {
  const first: StickerStat = { value: formatSolveTime(input.seconds * 1000), label: 'solve time' };
  if (!input.account) return [first];
  return [first, { value: `${input.account.winPercent}%`, label: 'solved' }, { value: `${input.account.streak}`, label: 'day streak' }];
}

/** "friday, november 20th · hard": the day line plus the level, as in his design. */
export function sudokuDateLine(dateText: string, level: SudokuLevel): string {
  return `${dateText} · ${level}`;
}

/** The plain sentence for screen readers. */
export function sudokuDescription(input: SudokuStickerInput): string {
  const stats = input.stats.map((s) => `${s.label} ${s.value}`).join(', ');
  return `${gameName('triage')} sticker, ${input.dateLine}${stats ? `: ${stats}` : ''}. a decorative nine by nine grid that is the same every day and shows no numbers.`;
}

export function sudokuFileName(kind: SudokuStickerKind, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${gameName('triage')}-${SUDOKU_STICKER_NAMES[kind]}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.png`;
}
