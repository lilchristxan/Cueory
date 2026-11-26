/**
 * The piccline share stickers (Christian's designs, 25 Nov 2026): pure layout and wording, no canvas, so every number
 * can be unit tested. src/islands/picclinestickerdraw.ts draws what this module lays out. The text pieces share
 * stickerpaint.ts with the vialo stickers; the artwork here is one dot (or one five-bead line) per word, in the order
 * the words were found. The word of the day is teal and also ringed; the others are brown.
 *
 * Numbers are Christian's CSS doubled (his files are drawn at half the export size).
 */
import { gameName } from '../config/games';
import { formatSolveTime, type Box, type StickerStat, type TextLine } from './vialosticker';

export const PICCLINE_STICKER_KINDS = ['centered', 'lower-third'] as const;
export type PicclineStickerKind = (typeof PICCLINE_STICKER_KINDS)[number];
export const PICCLINE_STICKER_SIZE: Record<PicclineStickerKind, { width: number; height: number }> = {
  centered: { width: 1200, height: 1220 },
  'lower-third': { width: 1580, height: 840 },
};
export const PICCLINE_STICKER_NAMES: Record<PicclineStickerKind, string> = { centered: 'portrait', 'lower-third': 'landscape' };

/** The wordmark file's box (public/brand/games/piccline-wordmark-light.svg viewBox). */
export const PICCLINE_WORDMARK_VIEWBOX = { width: 5060, height: 2555 } as const;
export const BEADS_PER_LINE = 5;

export interface PicclineStickerInput {
  /** One entry per word on the board, in the order they were found: true for the word of the day. */
  found: readonly boolean[];
  /** "friday, november 20th" */
  date: string;
  stats: readonly StickerStat[];
}

export interface DotShape {
  cx: number;
  cy: number;
  radius: number;
  special: boolean;
}

export interface BeadLineShape {
  special: boolean;
  /** The bar behind the beads. */
  bar: Box;
  beads: DotShape[];
}

export interface PicclineLayout {
  width: number;
  height: number;
  wordmark: Box;
  date: TextLine;
  /** Portrait: the dot cluster. */
  dots: DotShape[];
  /** Landscape: the beadLines. */
  beadLines: BeadLineShape[];
  statValues: TextLine[];
  statLabels: TextLine[];
  labelBesideValue: boolean;
  dividers: Box[];
  footer: TextLine;
}

const WORDMARK_RATIO = PICCLINE_WORDMARK_VIEWBOX.width / PICCLINE_WORDMARK_VIEWBOX.height;
const ABOVE: Pick<TextLine, 'family'> = { family: 'body' };

export const DOT = { diameter: 136, columnGap: 48, rowGap: 40 } as const;
export const BEAD = { diameter: 54, beadLineWidth: 584, beadLineHeight: 54, gap: 34, barInset: 26, barHeight: 17 } as const;

/** Dots in the cluster: two rows, as many columns as the words need. */
export function dotColumns(count: number): number {
  return Math.max(1, Math.ceil(count / 2));
}

function centered(input: PicclineStickerInput): PicclineLayout {
  const { width, height } = PICCLINE_STICKER_SIZE.centered;
  const cx = width / 2;
  const top = 50;
  const wordmarkHeight = 248;
  const wordmarkWidth = wordmarkHeight * WORDMARK_RATIO;
  // Read from his exported picture, which sits a little off his CSS sums: date 1 px under the wordmark box, dots 100 under the date.
  const dateY = top + wordmarkHeight + 1;
  const dotsTop = dateY + 100;
  const columns = dotColumns(input.found.length);
  const clusterWidth = columns * DOT.diameter + (columns - 1) * DOT.columnGap;
  const dots: DotShape[] = input.found.map((special, i) => ({
    cx: cx - clusterWidth / 2 + (i % columns) * (DOT.diameter + DOT.columnGap) + DOT.diameter / 2,
    cy: dotsTop + Math.floor(i / columns) * (DOT.diameter + DOT.rowGap) + DOT.diameter / 2,
    radius: DOT.diameter / 2,
    special,
  }));
  const statsTop = dotsTop + 2 * DOT.diameter + DOT.rowGap + 128; // 108 in the HTML; his exported picture has the stats row 20 lower
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
    wordmark: { x: cx - wordmarkWidth / 2, y: top, width: wordmarkWidth, height: wordmarkHeight },
    date: { ...ABOVE, text: input.date, x: cx, y: dateY, lineHeight: 50, size: 42, weight: 400, align: 'center', letterSpacing: 2 },
    dots,
    beadLines: [],
    statValues,
    statLabels,
    labelBesideValue: false,
    dividers,
    footer: { family: 'display', text: 'cueory.app', x: cx, y: statsTop + 195, lineHeight: 94, size: 62, weight: 600, align: 'center', letterSpacing: 1.2 },
  };
}

function lowerThird(input: PicclineStickerInput): PicclineLayout {
  const { width, height } = PICCLINE_STICKER_SIZE['lower-third'];
  // Positions are read from his exported picture (beadLines from x 82, the first bead line's top at y 84, 88 between beadLines).
  const left = 82;
  const stackCentre = 419;
  const wordmarkHeight = 232;
  const wordmarkWidth = wordmarkHeight * WORDMARK_RATIO;
  const count = input.found.length;
  // Eight beadLines fit at his spacing; more are squeezed so the sticker never grows past its frame.
  const step = Math.min(BEAD.beadLineHeight + BEAD.gap, (670 - BEAD.beadLineHeight) / Math.max(1, count - 1));
  const stackHeight = (count - 1) * step + BEAD.beadLineHeight;
  const stackTop = stackCentre - stackHeight / 2;
  const beadLines: BeadLineShape[] = input.found.map((special, i) => {
    const y = stackTop + i * step;
    const beadStep = (BEAD.beadLineWidth - BEAD.diameter) / (BEADS_PER_LINE - 1);
    return {
      special,
      bar: { x: left + BEAD.barInset, y: y + (BEAD.beadLineHeight - BEAD.barHeight) / 2, width: BEAD.beadLineWidth - 2 * BEAD.barInset, height: BEAD.barHeight },
      beads: Array.from({ length: BEADS_PER_LINE }, (_, b) => ({ cx: left + BEAD.diameter / 2 + b * beadStep, cy: y + BEAD.beadLineHeight / 2, radius: BEAD.diameter / 2, special })),
    };
  });
  const dividerX = 738;
  const metaX = 792;
  const lineStep = 96;
  const lineHeight = 88;
  const n = Math.max(1, input.stats.length);
  const statsTop = 351 + (3 - n) * (lineStep / 2);
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
    wordmark: { x: metaX, y: 34, width: wordmarkWidth, height: wordmarkHeight },
    date: { ...ABOVE, text: input.date, x: metaX, y: 268, lineHeight: 50, size: 42, weight: 400, align: 'left', letterSpacing: 2 },
    dots: [],
    beadLines,
    statValues,
    statLabels,
    labelBesideValue: true,
    dividers: [{ x: dividerX, y: 86, width: 3, height: 667 }],
    footer: { family: 'display', text: 'cueory.app', x: metaX, y: 670, lineHeight: 94, size: 62, weight: 600, align: 'left', letterSpacing: 1.2 },
  };
}

export function picclineLayout(kind: PicclineStickerKind, input: PicclineStickerInput): PicclineLayout {
  return kind === 'centered' ? centered(input) : lowerThird(input);
}

export interface PicclineStatsInput {
  /** Silent solve timer in ms; undefined for a board finished before the timer existed. */
  solveMs: number | undefined;
  found: number;
  total: number;
  /** The same numbers the stats sidebar shows, or undefined where those are not shown (signed out). */
  account: { winPercent: number; streak: number } | undefined;
}

/**
 * The stats on a sticker. Signed in: solve time, % solved, day streak. Signed out: solve time only (Christian,
 * 25 Nov 2026), so the one switch is `account: undefined`. A board with no recorded time shows "n/n words" instead.
 */
export function picclineStats(input: PicclineStatsInput): StickerStat[] {
  const first: StickerStat = input.solveMs !== undefined ? { value: formatSolveTime(input.solveMs), label: 'solve time' } : { value: `${input.found}/${input.total}`, label: 'words' };
  if (!input.account) return [first];
  return [first, { value: `${input.account.winPercent}%`, label: 'solved' }, { value: `${input.account.streak}`, label: 'day streak' }];
}

/** The plain sentence for screen readers: what the dots say, since colour alone is not the message. */
export function picclineDescription(input: PicclineStickerInput): string {
  const stats = input.stats.map((s) => `${s.label} ${s.value}`).join(', ');
  const place = input.found.indexOf(true) + 1;
  const order = place > 0 ? `the word of the day was number ${place} of ${input.found.length}` : `${input.found.length} words`;
  return `${gameName('piccline')} sticker, ${input.date}: ${order}${stats ? `, ${stats}` : ''}. one dot or line of beads for each word in the order found, and the word of the day is teal with a ring.`;
}

export function picclineFileName(kind: PicclineStickerKind, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${gameName('piccline')}-${PICCLINE_STICKER_NAMES[kind]}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.png`;
}
