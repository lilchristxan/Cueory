/**
 * Draws a vialo share sticker with the canvas 2D API: transparent background, exact export size, no library and no
 * network beyond our own two files (the blister artwork and the wordmark). This module is loaded only after a game
 * ends (VialoShare.tsx imports it on demand), so /play/wordpill's first load does not carry it.
 *
 * Layout is src/islands/vialosticker.ts. Every colour is a CSS token read with getComputedStyle (tokens.css, the
 * --vialo-sticker-* group), so there is no second source of truth. The dialog's preview is this same drawing, scaled
 * down by drawImage, so the preview and the exported file cannot differ.
 */
import { imageLogo } from '../config/gamelogos';
import {
  FOIL,
  stickerLayout,
  STICKER_SIZE,
  type CellKind,
  type PillRect,
  type StickerInput,
  type StickerKind,
  hasRing,
} from './vialosticker';
import { canvasFile, drawDate, drawDividers, drawFooter, drawStats, drawWordmark, fontString, loadImage, loadWordmark, type PaintPalette } from './stickerpaint';

const ARTWORK_URL = '/design/pillo-blister-board.webp';
const WORDMARK = imageLogo('vialo').wordmark;
const WORDMARK_URL = WORDMARK.day;

export interface StickerAssets {
  artwork: HTMLImageElement;
  wordmark: HTMLImageElement;
}

export interface StickerPalette extends PaintPalette {
  packRim: string;
  packShadow: string;
  pillShade: string;
  pillLift: string;
  pillGloss: string;
  /** The thin light ring inside an "elsewhere" pill (the board's own ring, scaled up to the sticker), so colour is not the only signal. */
  ring: { color: string; width: number; gap: number };
  pill: Record<Exclude<CellKind, 'empty'>, readonly [string, string, string]>;
}

/** Reads the sticker's tokens. They are never overridden for Evening, so the answer is the same in both themes. */
export function readStickerPalette(root: Element = document.documentElement): StickerPalette {
  const style = getComputedStyle(root);
  const get = (name: string) => style.getPropertyValue(name).trim();
  const pill = (kind: string) => [get(`--vialo-sticker-${kind}-light`), get(`--vialo-sticker-${kind}-mid`), get(`--vialo-sticker-${kind}-deep`)] as const;
  return {
    accent: get('--vialo-sticker-oxblood'),
    espresso: get('--vialo-sticker-espresso'),
    copper: get('--vialo-sticker-copper'),
    outline: get('--vialo-sticker-outline'),
    wordmarkOutline: get('--vialo-sticker-wordmark-outline'),
    dividerHalo: get('--vialo-sticker-divider-halo'),
    packRim: get('--vialo-sticker-pack-rim'),
    packShadow: get('--vialo-sticker-pack-shadow'),
    pillShade: get('--vialo-sticker-pill-shade'),
    pillLift: get('--vialo-sticker-pill-lift'),
    pillGloss: get('--vialo-sticker-pill-gloss'),
    ring: {
      color: get('--vialo-pill-ring-color'),
      width: (Number.parseFloat(get('--vialo-pill-ring')) || 0) * (Number.parseFloat(get('--vialo-sticker-ring-scale')) || 1),
      gap: (Number.parseFloat(get('--vialo-pill-ring-gap')) || 0) * (Number.parseFloat(get('--vialo-sticker-ring-scale')) || 1),
    },
    pill: { here: pill('here'), elsewhere: pill('elsewhere'), absent: pill('absent') },
    body: get('--font-body'),
    display: get('--font-display'),
  };
}

export async function loadStickerAssets(fetcher: typeof fetch = fetch): Promise<StickerAssets> {
  const [artwork, wordmark] = await Promise.all([loadImage(ARTWORK_URL), loadWordmark(WORDMARK_URL, WORDMARK.width, WORDMARK.height, fetcher)]);
  return { artwork, wordmark };
}

/** The fonts the sticker uses must be ready, or the canvas would silently draw a fallback face. */
export async function waitForStickerFonts(palette: StickerPalette): Promise<void> {
  await Promise.all([
    document.fonts.load(fontString(400, 34, palette.body)),
    document.fonts.load(fontString(700, 78, palette.body)),
    document.fonts.load(fontString(600, 62, palette.display)),
  ]);
  await document.fonts.ready;
}

// ---------- shapes ----------

function packPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const rx = width * 0.052;
  const ry = height * 0.052;
  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + width - rx, y);
  ctx.ellipse(x + width - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
  ctx.lineTo(x + width, y + height - ry);
  ctx.ellipse(x + width - rx, y + height - ry, rx, ry, 0, 0, Math.PI / 2);
  ctx.lineTo(x + rx, y + height);
  ctx.ellipse(x + rx, y + height - ry, rx, ry, 0, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + ry);
  ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

function capsule(ctx: CanvasRenderingContext2D, p: PillRect, grow = 0) {
  const w = p.width + grow * 2;
  const h = p.height + grow * 2;
  const x = p.cx - w / 2;
  const y = p.cy - h / 2;
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

/** The pill's face: radial-gradient(120% 140% at 30% 20%, light 0%, mid 55%, deep 100%). */
function pillFace(ctx: CanvasRenderingContext2D, p: PillRect, colours: readonly [string, string, string]): CanvasGradient {
  const cx = p.cx - p.width / 2 + p.width * 0.3;
  const cy = p.cy - p.height / 2 + p.height * 0.2;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, colours[0]);
  gradient.addColorStop(0.55, colours[1]);
  gradient.addColorStop(1, colours[2]);
  ctx.translate(cx, cy);
  ctx.scale(p.width * 1.2, p.height * 1.4);
  return gradient;
}

/** One inset shadow, as in `box-shadow: inset 0 dy blur colour`. */
function insetShadow(ctx: CanvasRenderingContext2D, p: PillRect, dy: number, blur: number, colour: string) {
  ctx.save();
  capsule(ctx, p);
  ctx.clip();
  const reach = Math.max(p.width, p.height);
  ctx.beginPath();
  ctx.rect(p.cx - p.width / 2 - reach, p.cy - p.height / 2 - reach, p.width + reach * 2, p.height + reach * 2);
  const hole = new Path2D();
  const x = p.cx - p.width / 2;
  const y = p.cy - p.height / 2;
  const r = p.height / 2;
  hole.moveTo(x + r, y);
  hole.lineTo(x + p.width - r, y);
  hole.arc(x + p.width - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  hole.lineTo(x + r, y + p.height);
  hole.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
  hole.closePath();
  const outer = new Path2D();
  outer.rect(x - reach, y - reach, p.width + reach * 2, p.height + reach * 2);
  outer.addPath(hole);
  ctx.shadowColor = colour;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
  ctx.fillStyle = colour;
  ctx.fill(outer, 'evenodd');
  ctx.restore();
}

export function drawPill(ctx: CanvasRenderingContext2D, p: PillRect, palette: StickerPalette, unit: number) {
  if (p.kind === 'empty') return;
  const colours = palette.pill[p.kind];
  // Shadow depths in Christian's CSS, at his 480 px pack (a 960 px pack here): drop 0 3 5, inset 0 -4 7 and 0 3 4.
  ctx.save();
  ctx.shadowColor = palette.pillLift;
  ctx.shadowBlur = 10 * unit;
  ctx.shadowOffsetY = 6 * unit;
  capsule(ctx, p);
  ctx.fillStyle = colours[1];
  ctx.fill();
  ctx.restore();
  ctx.save();
  capsule(ctx, p);
  ctx.clip();
  ctx.save();
  const face = pillFace(ctx, p, colours);
  ctx.fillStyle = face;
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
  ctx.restore();
  insetShadow(ctx, p, -8 * unit, 14 * unit, palette.pillShade);
  insetShadow(ctx, p, 6 * unit, 8 * unit, palette.pillGloss);
  if (hasRing(p.kind)) drawRing(ctx, p, palette.ring);
}

/** The ring inside the capsule's edge: its outer edge sits `gap` in, and it is `width` thick, as on the board. */
function drawRing(ctx: CanvasRenderingContext2D, p: PillRect, ring: StickerPalette['ring']) {
  ctx.save();
  capsule(ctx, p, -(ring.gap + ring.width / 2));
  ctx.lineWidth = ring.width;
  ctx.strokeStyle = ring.color;
  ctx.stroke();
  ctx.restore();
}

// ---------- the sticker ----------

/** Draws the whole sticker onto a canvas that is already the export size. */
export function drawSticker(ctx: CanvasRenderingContext2D, kind: StickerKind, input: StickerInput, assets: StickerAssets, palette: StickerPalette): void {
  const layout = stickerLayout(kind, input);
  ctx.clearRect(0, 0, layout.width, layout.height);
  drawWordmark(ctx, layout.wordmark, assets.wordmark, palette.wordmarkOutline);
  drawDate(ctx, layout.date, palette);

  // The foil card: shadow, the artwork cropped to the foil, the wells' pills, then a hairline rim.
  const { pack } = layout;
  const unit = pack.width / 960;
  ctx.save();
  ctx.shadowColor = palette.packShadow;
  ctx.shadowBlur = 36 * unit;
  ctx.shadowOffsetY = 16 * unit;
  packPath(ctx, pack.x, pack.y, pack.width, pack.height);
  ctx.fillStyle = palette.espresso;
  ctx.fill();
  ctx.restore();
  ctx.save();
  packPath(ctx, pack.x, pack.y, pack.width, pack.height);
  ctx.clip();
  ctx.drawImage(assets.artwork, FOIL.x, FOIL.y, FOIL.width, FOIL.height, pack.x, pack.y, pack.width, pack.height);
  for (const pill of layout.pills) drawPill(ctx, pill, palette, unit);
  packPath(ctx, pack.x, pack.y, pack.width, pack.height);
  ctx.lineWidth = 4;
  ctx.strokeStyle = palette.packRim;
  ctx.stroke();
  ctx.restore();

  drawDividers(ctx, layout.dividers, palette);
  drawStats(ctx, layout.statValues, layout.statLabels, layout.labelBesideValue, palette);
  drawFooter(ctx, layout.footer, palette);
}

/** A new canvas at the export size with the sticker drawn on it. */
export function renderSticker(kind: StickerKind, input: StickerInput, assets: StickerAssets, palette: StickerPalette): HTMLCanvasElement {
  const { width, height } = STICKER_SIZE[kind];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawSticker(canvas.getContext('2d')!, kind, input, assets, palette);
  return canvas;
}

/** The sticker as a PNG file; null if the browser cannot encode one. */
export const stickerFile = canvasFile;
