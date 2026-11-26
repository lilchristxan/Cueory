/**
 * Draws a piccline share sticker with the canvas 2D API (transparent background, exact export size). Layout is
 * picclinesticker.ts; the wordmark, date, stats and site line come from stickerpaint.ts, shared with vialo. Loaded on
 * demand when a board ends, never on first paint. Every colour is a CSS token (the --picc-sticker-* and
 * --vialo-sticker-* groups, never overridden for Evening), read with getComputedStyle.
 */
import { PICCLINE_STICKER_SIZE, PICCLINE_WORDMARK_VIEWBOX, picclineLayout, type DotShape, type PicclineStickerInput, type PicclineStickerKind, type BeadLineShape } from './picclinesticker';
import { canvasFile, drawDate, drawDividers, drawFooter, drawStats, drawWordmark, fontString, loadWordmark, type PaintPalette } from './stickerpaint';

const WORDMARK_URL = '/brand/games/piccline-wordmark-light.svg';


export interface PicclinePalette extends PaintPalette {
  special: readonly [string, string, string];
  other: readonly [string, string, string];
  barSpecial: string;
  barOther: string;
  lift: string;
  beadLift: string;
  barLift: string;
  edge: string;
  ring: { color: string; dot: number; dotGap: number; bead: number; beadGap: number };
}

export interface PicclineAssets {
  wordmark: HTMLImageElement;
}

export function readPicclinePalette(root: Element = document.documentElement): PicclinePalette {
  const style = getComputedStyle(root);
  const get = (name: string) => style.getPropertyValue(name).trim();
  const px = (name: string) => Number.parseFloat(get(name)) || 0;
  const trio = (name: string) => [get(`--picc-sticker-${name}-light`), get(`--picc-sticker-${name}-mid`), get(`--picc-sticker-${name}-deep`)] as const;
  return {
    accent: get('--picc-sticker-accent'),
    espresso: get('--vialo-sticker-espresso'),
    copper: get('--vialo-sticker-copper'),
    outline: get('--vialo-sticker-outline'),
    wordmarkOutline: get('--vialo-sticker-wordmark-outline'),
    dividerHalo: get('--vialo-sticker-divider-halo'),
    special: trio('teal'),
    other: trio('brown'),
    barSpecial: get('--picc-sticker-bar-teal'),
    barOther: get('--picc-sticker-bar-brown'),
    lift: get('--picc-sticker-lift'),
    beadLift: get('--picc-sticker-bead-lift'),
    barLift: get('--picc-sticker-bar-lift'),
    edge: get('--picc-sticker-edge'),
    ring: {
      color: get('--picc-sticker-ring-color'),
      dot: px('--picc-sticker-ring-dot'),
      dotGap: px('--picc-sticker-ring-dot-gap'),
      bead: px('--picc-sticker-ring-bead'),
      beadGap: px('--picc-sticker-ring-bead-gap'),
    },
    body: get('--font-body'),
    display: get('--font-display'),
  };
}

export async function loadPicclineAssets(fetcher: typeof fetch = fetch): Promise<PicclineAssets> {
  return { wordmark: await loadWordmark(WORDMARK_URL, PICCLINE_WORDMARK_VIEWBOX.width, PICCLINE_WORDMARK_VIEWBOX.height, fetcher) };
}

export async function waitForPicclineFonts(palette: PicclinePalette): Promise<void> {
  await Promise.all([
    document.fonts.load(fontString(400, 34, palette.body)),
    document.fonts.load(fontString(700, 78, palette.body)),
    document.fonts.load(fontString(600, 62, palette.display)),
  ]);
  await document.fonts.ready;
}

interface DotLook {
  lift: string;
  blur: number;
  dy: number;
  edge: number;
  ring: { width: number; gap: number } | undefined;
}

/** One dot or bead: a soft drop shadow, the radial face, a hairline edge, and (for the word of the day) the ring. */
export function drawDot(ctx: CanvasRenderingContext2D, dot: DotShape, palette: PicclinePalette, look: DotLook): void {
  const colours = dot.special ? palette.special : palette.other;
  const size = dot.radius * 2;
  const left = dot.cx - dot.radius;
  const top = dot.cy - dot.radius;
  ctx.save();
  ctx.shadowColor = look.lift;
  ctx.shadowBlur = look.blur;
  ctx.shadowOffsetY = look.dy;
  ctx.beginPath();
  ctx.arc(dot.cx, dot.cy, dot.radius, 0, Math.PI * 2);
  ctx.fillStyle = colours[1];
  ctx.fill();
  ctx.restore();
  // radial-gradient(120% 120% at 36% 32%, light 0%, mid 55%, deep 100%)
  const gx = left + size * 0.36;
  const gy = top + size * 0.32;
  const gradient = ctx.createRadialGradient(gx, gy, 0, gx, gy, size * 1.2);
  gradient.addColorStop(0, colours[0]);
  gradient.addColorStop(0.55, colours[1]);
  gradient.addColorStop(1, colours[2]);
  ctx.beginPath();
  ctx.arc(dot.cx, dot.cy, dot.radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(dot.cx, dot.cy, dot.radius - look.edge / 2, 0, Math.PI * 2);
  ctx.lineWidth = look.edge;
  ctx.strokeStyle = palette.edge;
  ctx.stroke();
  if (look.ring && dot.special) {
    ctx.beginPath();
    ctx.arc(dot.cx, dot.cy, dot.radius - look.ring.gap - look.ring.width / 2, 0, Math.PI * 2);
    ctx.lineWidth = look.ring.width;
    ctx.strokeStyle = palette.ring.color;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBeadLine(ctx: CanvasRenderingContext2D, beadLine: BeadLineShape, palette: PicclinePalette): void {
  const { bar } = beadLine;
  ctx.save();
  ctx.shadowColor = palette.barLift;
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, bar.width, bar.height, bar.height / 2);
  ctx.fillStyle = beadLine.special ? palette.barSpecial : palette.barOther;
  ctx.fill();
  ctx.restore();
  for (const bead of beadLine.beads) {
    drawDot(ctx, bead, palette, { lift: palette.beadLift, blur: 4, dy: 3, edge: 1.6, ring: { width: palette.ring.bead, gap: palette.ring.beadGap } });
  }
}

/** Draws the whole sticker onto a canvas that is already the export size. */
export function drawPicclineSticker(ctx: CanvasRenderingContext2D, kind: PicclineStickerKind, input: PicclineStickerInput, assets: PicclineAssets, palette: PicclinePalette): void {
  const layout = picclineLayout(kind, input);
  ctx.clearRect(0, 0, layout.width, layout.height);
  drawWordmark(ctx, layout.wordmark, assets.wordmark, palette.wordmarkOutline);
  drawDate(ctx, layout.date, palette);
  for (const dot of layout.dots) drawDot(ctx, dot, palette, { lift: palette.lift, blur: 4, dy: 7, edge: 2, ring: { width: palette.ring.dot, gap: palette.ring.dotGap } });
  for (const beadLine of layout.beadLines) drawBeadLine(ctx, beadLine, palette);
  drawDividers(ctx, layout.dividers, palette);
  drawStats(ctx, layout.statValues, layout.statLabels, layout.labelBesideValue, palette, 14);
  drawFooter(ctx, layout.footer, palette);
}

export function renderPicclineSticker(kind: PicclineStickerKind, input: PicclineStickerInput, assets: PicclineAssets, palette: PicclinePalette): HTMLCanvasElement {
  const { width, height } = PICCLINE_STICKER_SIZE[kind];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawPicclineSticker(canvas.getContext('2d')!, kind, input, assets, palette);
  return canvas;
}

export const picclineStickerFile = canvasFile;
