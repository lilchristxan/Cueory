/**
 * The vialo share stickers (Christian's designs, 25 Nov 2026): pure layout and wording, no canvas here, so every
 * number can be unit tested. src/islands/vialostickerdraw.ts draws what this module lays out.
 *
 * All sizes are export pixels (the portrait sticker is 1200 x 1720, the landscape one 1620 x 840). Christian's HTML
 * was drawn at half that size in CSS pixels, so the measurements below are his, doubled; they were read from his
 * files in a browser (element boxes), not estimated from the pictures.
 */
import { formatSolveTime } from './vialotimer';
import { gameName } from '../config/games';
import type { Mark } from './pulse';

export type StickerKind = 'centered' | 'lower-third';
export const STICKER_KINDS: readonly StickerKind[] = ['centered', 'lower-third'];

export const STICKER_SIZE: Record<StickerKind, { width: number; height: number }> = {
  centered: { width: 1200, height: 1720 },
  'lower-third': { width: 1620, height: 840 },
};

export const STICKER_NAMES: Record<StickerKind, string> = {
  centered: 'portrait',
  'lower-third': 'landscape',
};

export const STICKER_ROWS = 6;
export const STICKER_COLUMNS = 5;

/** The blister artwork file (public/design/pillo-blister-board.webp). */
export const ART = { width: 1230, height: 1180 } as const;

/**
 * The foil card inside the artwork file, in file pixels. These are the measurements the live board uses for
 * --vialo-art-clip (tokens.css): the file has an ivory mat around the foil, and the cut sits 2 px inside the foil's
 * edge so the file's light rim is hidden too. Christian's HTML cropped 1179 x 1131 from (25, 19) instead; the two
 * boxes have the same shape (1.0423 against 1.0424) and differ by under 2 file pixels at every edge.
 */
export const FOIL = { x: 23, y: 18, width: 1183, height: 1135, radius: 60 } as const;

/** Where the wells are in the artwork file, as fractions of the file (Christian's measurements). */
const COLUMN_CENTRES = [0.134, 0.315, 0.49798, 0.68, 0.86199] as const;
const ROW_CENTRES = [0.12299, 0.267, 0.41099, 0.555, 0.699, 0.843] as const;
const PILL_SIZE = { width: 0.131998, height: 0.091997 } as const;

export type CellKind = Mark | 'empty';

/** Pills tell their result apart by more than colour: only "elsewhere" carries the thin inset ring (as on the board). */
export function hasRing(kind: CellKind): boolean {
  return kind === 'elsewhere';
}

export interface PillRect {
  /** Centre, export pixels. */
  cx: number;
  cy: number;
  width: number;
  height: number;
  kind: CellKind;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One stat: a big value over (portrait) or beside (landscape) a small label. */
export interface StickerStat {
  value: string;
  label: string;
}

export interface StickerInput {
  /** The marks of each accepted guess, in order; rows not played are shown as empty wells. */
  rows: readonly (readonly Mark[])[];
  /** "friday, november 20th" */
  date: string;
  stats: readonly StickerStat[];
}

export interface TextLine {
  text: string;
  /** Left edge for left-aligned text; centre for centred text. */
  x: number;
  /** Top of the text's line box. */
  y: number;
  /** Height of the line box (CSS `line-height`). */
  lineHeight: number;
  size: number;
  weight: 400 | 700 | 600;
  family: 'body' | 'display';
  align: 'left' | 'center';
  letterSpacing: number;
  /** The widest this line may be; a longer one is drawn smaller to fit (sudoku's landscape date line). */
  maxWidth?: number;
}

export interface StickerLayout {
  width: number;
  height: number;
  wordmark: Box;
  date: TextLine;
  pack: Box;
  /** Export pixels per artwork-file pixel. */
  artScale: number;
  pills: PillRect[];
  statValues: TextLine[];
  statLabels: TextLine[];
  /** Label sits on the baseline of the value beside it (landscape) rather than below it (portrait). */
  labelBesideValue: boolean;
  dividers: Box[];
  footer: TextLine;
}

/** Wordmark: 77 CSS px tall, with the SVG's 4326 x 1620 ratio. */
const WORDMARK_RATIO = 4326 / 1620;
const WORDMARK_HEIGHT = 154;
const PACK_RATIO = FOIL.width / FOIL.height;

function dayPill(row: number, column: number, scale: number, pack: Box, kind: CellKind): PillRect {
  return {
    cx: pack.x + (COLUMN_CENTRES[column]! * ART.width - FOIL.x) * scale,
    cy: pack.y + (ROW_CENTRES[row]! * ART.height - FOIL.y) * scale,
    width: PILL_SIZE.width * ART.width * scale,
    height: PILL_SIZE.height * ART.height * scale,
    kind,
  };
}

/** The 6 x 5 wells: played rows coloured by result, the rest empty. Extra rows are ignored. */
export function pillGrid(rows: readonly (readonly Mark[])[], pack: Box, scale: number): PillRect[] {
  const out: PillRect[] = [];
  for (let row = 0; row < STICKER_ROWS; row += 1) {
    for (let column = 0; column < STICKER_COLUMNS; column += 1) {
      out.push(dayPill(row, column, scale, pack, rows[row]?.[column] ?? 'empty'));
    }
  }
  return out;
}

const ABOVE: Pick<TextLine, 'family'> = { family: 'body' };

/** Portrait sticker: wordmark, date, pack, stats row, site. Content is centred in the 1200 x 1720 frame. */
function centered(input: StickerInput): StickerLayout {
  const { width, height } = STICKER_SIZE.centered;
  const contentHeight = 1552.875; // 776.4375 CSS px in Christian's file, doubled
  const top = (height - contentHeight) / 2;
  const cx = width / 2;
  const wordmarkWidth = WORDMARK_HEIGHT * WORDMARK_RATIO;
  const packWidth = 960;
  const packHeight = packWidth / PACK_RATIO;
  const pack: Box = { x: cx - packWidth / 2, y: top + 272, width: packWidth, height: packHeight }; // 264 in the HTML; his exported picture has it 8 lower
  const scale = packWidth / FOIL.width;
  const statsTop = top + 1276; // 1256.9 in the HTML; his exported picture has the stats row 19 lower
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
    wordmark: { x: cx - wordmarkWidth / 2, y: top, width: wordmarkWidth, height: WORDMARK_HEIGHT },
    date: { ...ABOVE, text: input.date, x: cx, y: top + 174, lineHeight: 50, size: 42, weight: 400, align: 'center', letterSpacing: 2 },
    pack,
    artScale: scale,
    pills: pillGrid(input.rows, pack, scale),
    statValues,
    statLabels,
    labelBesideValue: false,
    dividers,
    footer: { family: 'display', text: 'cueory.app', x: cx, y: top + 1457, lineHeight: 94, size: 62, weight: 600, align: 'center', letterSpacing: 1.2 },
    // 1458.9 = 729.45 CSS px doubled
  };
}

/** Landscape sticker: pack on the left, a copper rule, then wordmark, date, stats, site. Centred in 1620 x 840. */
function lowerThird(input: StickerInput): StickerLayout {
  const { width, height } = STICKER_SIZE['lower-third'];
  const contentHeight = 719.4375; // 359.71875 CSS px doubled
  // Christian's exported picture has the pack 56 px from the left edge (not centred) and a 96 px step between stat lines.
  const left = 56;
  const top = (height - contentHeight) / 2;
  const packWidth = 750;
  const pack: Box = { x: left, y: top, width: packWidth, height: contentHeight };
  const scale = packWidth / FOIL.width;
  const metaX = left + 853;
  const wordmarkWidth = WORDMARK_HEIGHT * WORDMARK_RATIO;
  // The right column is wordmark, date, a stats block centred in the gap, and the site line. Heights and gaps below
  // are read from his exported picture.
  const footerHeight = 94;
  const lineHeight = 88;
  const lineStep = 96;
  const n = Math.max(1, input.stats.length);
  const statsHeight = (n - 1) * lineStep + lineHeight;
  const statsTop = top + 400.2 - statsHeight / 2;
  const columnTop = top - 1;
  const columnBottom = top + 605.4 + footerHeight;
  const statValues: TextLine[] = [];
  const statLabels: TextLine[] = [];
  input.stats.forEach((stat, i) => {
    const y = statsTop + i * lineStep;
    statValues.push({ ...ABOVE, text: stat.value, x: metaX, y, lineHeight, size: 78, weight: 700, align: 'left', letterSpacing: 0 });
    // x of the label is filled in by the drawing code: it follows the value's measured width plus a 20 gap.
    statLabels.push({ ...ABOVE, text: stat.label, x: 0, y, lineHeight, size: 34, weight: 400, align: 'left', letterSpacing: 0 });
  });
  return {
    width,
    height,
    wordmark: { x: metaX, y: columnTop, width: wordmarkWidth, height: WORDMARK_HEIGHT },
    date: { ...ABOVE, text: input.date, x: metaX, y: columnTop + 169, lineHeight: 50, size: 42, weight: 400, align: 'left', letterSpacing: 2 },
    pack,
    artScale: scale,
    pills: pillGrid(input.rows, pack, scale),
    statValues,
    statLabels,
    labelBesideValue: true,
    dividers: [{ x: left + 800, y: top + 26, width: 3, height: 667.4375 }],
    footer: { family: 'display', text: 'cueory.app', x: metaX, y: columnBottom - footerHeight, lineHeight: footerHeight, size: 62, weight: 600, align: 'left', letterSpacing: 1.2 },
  };
}

export function stickerLayout(kind: StickerKind, input: StickerInput): StickerLayout {
  return kind === 'centered' ? centered(input) : lowerThird(input);
}

// ---------- wording ----------

// formatSolveTime lives with the timer (vialotimer.ts) so a board page does not load the sticker module just to print a time.
export { formatSolveTime };

/** "08:42:15" until local midnight. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th'}`;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const;

/** "friday, november 20th", from the player's own local date. */
export function stickerDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${ordinal(date.getDate())}`;
}

export interface StickerStatsInput {
  solved: boolean;
  /** How many guesses were used. */
  tries: number;
  maxTries: number;
  /** Silent solve timer, only meaningful for a solved game. */
  solveMs: number | undefined;
  /** The same numbers the stats sidebar shows, or undefined where those stats are not shown. */
  account: { winPercent: number; streak: number } | undefined;
}

/**
 * The stats on a sticker. Signed in: solve time, % solved and day streak (Christian's design). Signed out: solve time
 * only (Christian, 25 Nov 2026), so this is the one switch: pass `account: undefined`.
 * A lost game has no solve time; it shows "x/6" tries instead, so the sticker is never empty.
 */
export function stickerStats(input: StickerStatsInput): StickerStat[] {
  const first: StickerStat =
    input.solved && input.solveMs !== undefined
      ? { value: formatSolveTime(input.solveMs), label: 'solve time' }
      : input.solved
        ? { value: `${input.tries}/${input.maxTries}`, label: 'tries' }
        : { value: `x/${input.maxTries}`, label: 'tries' };
  if (!input.account) return [first];
  return [first, { value: `${input.account.winPercent}%`, label: 'solved' }, { value: `${input.account.streak}`, label: 'day streak' }];
}

/** The plain sentence for screen readers and the preview's accessible name. */
export function stickerDescription(input: StickerInput, solved: boolean, tries: number, maxTries: number): string {
  const stats = input.stats.map((s) => `${s.label} ${s.value}`).join(', ');
  const result = solved ? `solved in ${tries} of ${maxTries}` : `not solved in ${maxTries}`;
  return `${gameName('vialo')} sticker, ${input.date}: ${result}${stats ? `, ${stats}` : ''}. pills show each guess by colour, and the ones in the wrong place have a ring, with no letters.`;
}

export function stickerFileName(kind: StickerKind, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${gameName('vialo')}-${STICKER_NAMES[kind]}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.png`;
}
