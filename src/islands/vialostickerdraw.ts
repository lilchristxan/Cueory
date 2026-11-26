/**
 * Draws a vialo share sticker with the canvas 2D API: transparent background, exact export size, no library and no
 * network beyond our own two files (the blister artwork and the wordmark). This module is loaded only after a game
 * ends (VialoShare.tsx imports it on demand), so /play/vialo's first load does not carry it.
 *
 * Layout is src/islands/vialosticker.ts. Every colour is a CSS token read with getComputedStyle (tokens.css, the
 * --vialo-sticker-* group), so there is no second source of truth. The dialog's preview is this same drawing, scaled
 * down by drawImage, so the preview and the exported file cannot differ.
 */
import {
  FOIL,
  stickerLayout,
  STICKER_SIZE,
  type CellKind,
  type PillRect,
  type StickerInput,
  type StickerKind,
  type TextLine,
} from './vialosticker';

const ARTWORK_URL = '/design/pillo-blister-board.webp';
const WORDMARK_URL = '/design/games-v2/assets/vialo-wordmark-oxblood-v3.svg';

export interface StickerAssets {
  artwork: HTMLImageElement;
  wordmark: HTMLImageElement;
}

export interface StickerPalette {
  oxblood: string;
  espresso: string;
  copper: string;
  outline: string;
  wordmarkOutline: string;
  dividerHalo: string;
  packRim: string;
  packShadow: string;
  pillShade: string;
  pillLift: string;
  pillGloss: string;
  pill: Record<Exclude<CellKind, 'empty'>, readonly [string, string, string]>;
  body: string;
  display: string;
}

/** Reads the sticker's tokens. They are never overridden for Evening, so the answer is the same in both themes. */
export function readStickerPalette(root: Element = document.documentElement): StickerPalette {
  const style = getComputedStyle(root);
  const get = (name: string) => style.getPropertyValue(name).trim();
  const pill = (kind: string) => [get(`--vialo-sticker-${kind}-light`), get(`--vialo-sticker-${kind}-mid`), get(`--vialo-sticker-${kind}-deep`)] as const;
  return {
    oxblood: get('--vialo-sticker-oxblood'),
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
    pill: { here: pill('here'), elsewhere: pill('elsewhere'), absent: pill('absent') },
    body: get('--font-body'),
    display: get('--font-display'),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${src}`));
    image.src = src;
  });
}

/**
 * The wordmark SVG only has a viewBox. Some browsers will not draw such an SVG to a canvas without a size, so it is
 * given one here and handed over as a data: URL (our CSP allows data: images, not blob: ones).
 */
async function loadWordmark(fetcher: typeof fetch): Promise<HTMLImageElement> {
  const response = await fetcher(WORDMARK_URL);
  if (!response.ok) throw new Error('could not load the vialo wordmark');
  const text = await response.text();
  const sized = text.replace('<svg ', '<svg width="4326" height="1620" ');
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`);
}

export async function loadStickerAssets(fetcher: typeof fetch = fetch): Promise<StickerAssets> {
  const [artwork, wordmark] = await Promise.all([loadImage(ARTWORK_URL), loadWordmark(fetcher)]);
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

// ---------- text ----------

function fontString(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

function fontFor(line: TextLine, palette: StickerPalette): string {
  return fontString(line.weight, line.size, line.family === 'display' ? palette.display : palette.body);
}

type SpacedContext = CanvasRenderingContext2D & { letterSpacing?: string };

function hasSpacing(ctx: SpacedContext): boolean {
  return 'letterSpacing' in ctx;
}

function textWidth(ctx: SpacedContext, text: string, spacing: number): number {
  if (hasSpacing(ctx)) {
    ctx.letterSpacing = `${spacing}px`;
    const width = ctx.measureText(text).width;
    ctx.letterSpacing = '0px';
    return width;
  }
  return ctx.measureText(text).width + spacing * text.length;
}

/** Strokes then fills, like `paint-order: stroke fill` with a centred stroke: only the outer half of the line shows. */
function paintText(ctx: SpacedContext, text: string, x: number, baseline: number, spacing: number, fill: string, stroke: string | undefined, strokeWidth: number) {
  const native = hasSpacing(ctx);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const run = (draw: (t: string, px: number, py: number) => void) => {
    if (native) {
      ctx.letterSpacing = `${spacing}px`;
      draw(text, x, baseline);
      ctx.letterSpacing = '0px';
      return;
    }
    let cursor = x;
    for (const char of text) {
      draw(char, cursor, baseline);
      cursor += ctx.measureText(char).width + spacing;
    }
  };
  if (stroke && strokeWidth > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    run((t, px, py) => ctx.strokeText(t, px, py));
  }
  ctx.fillStyle = fill;
  run((t, px, py) => ctx.fillText(t, px, py));
}

function baselineOf(ctx: CanvasRenderingContext2D, line: TextLine): number {
  const m = ctx.measureText(line.text);
  const ascent = m.fontBoundingBoxAscent ?? line.size * 0.8;
  const descent = m.fontBoundingBoxDescent ?? line.size * 0.2;
  return line.y + (line.lineHeight - (ascent + descent)) / 2 + ascent;
}

function leftOf(ctx: SpacedContext, line: TextLine): number {
  return line.align === 'center' ? line.x - textWidth(ctx, line.text, line.letterSpacing) / 2 : line.x;
}

/**
 * Bodoni Moda changes its letter shapes with its size (optical sizing), and the browser picks the shape from the
 * font-size it is given. Christian's design was drawn at half size, so display-face lines are drawn at half size under
 * a 2x transform: the same letter shapes his picture has.
 */
function paintDisplay(ctx: SpacedContext, line: TextLine, palette: StickerPalette, fill: string, stroke: string, strokeWidth: number) {
  const half: TextLine = { ...line, x: line.x / 2, y: line.y / 2, lineHeight: line.lineHeight / 2, size: line.size / 2, letterSpacing: line.letterSpacing / 2 };
  ctx.save();
  ctx.scale(2, 2);
  ctx.font = fontFor(half, palette);
  paintText(ctx, half.text, leftOf(ctx, half), baselineOf(ctx, half), half.letterSpacing, fill, stroke, strokeWidth / 2);
  ctx.restore();
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

function drawPill(ctx: CanvasRenderingContext2D, p: PillRect, palette: StickerPalette, unit: number) {
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
}

// ---------- the sticker ----------

/** Draws the whole sticker onto a canvas that is already the export size. */
export function drawSticker(ctx: CanvasRenderingContext2D, kind: StickerKind, input: StickerInput, assets: StickerAssets, palette: StickerPalette): void {
  const layout = stickerLayout(kind, input);
  const spaced = ctx as SpacedContext;
  ctx.clearRect(0, 0, layout.width, layout.height);

  // Wordmark with Christian's hairline light outline: a pale copy of the artwork 0.8 px off in four directions.
  {
    const { x, y, width, height } = layout.wordmark;
    const scratch = document.createElement('canvas');
    scratch.width = Math.ceil(width);
    scratch.height = Math.ceil(height);
    const s = scratch.getContext('2d')!;
    s.drawImage(assets.wordmark, 0, 0, scratch.width, scratch.height);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = palette.wordmarkOutline;
    s.fillRect(0, 0, scratch.width, scratch.height);
    for (const [dx, dy] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]] as const) ctx.drawImage(scratch, x + dx, y + dy, scratch.width, scratch.height);
    ctx.drawImage(assets.wordmark, x, y, width, height);
  }

  // The date line has no outline.
  const date = layout.date;
  ctx.font = fontFor(date, palette);
  paintText(spaced, date.text, leftOf(spaced, date), baselineOf(ctx, date), date.letterSpacing, palette.espresso, undefined, 0);

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

  // Copper dividers with a faint light halo.
  for (const d of layout.dividers) {
    ctx.fillStyle = palette.dividerHalo;
    ctx.fillRect(d.x - 1, d.y - 1, d.width + 2, d.height + 2);
    ctx.fillStyle = palette.copper;
    ctx.fillRect(d.x, d.y, d.width, d.height);
  }

  // Stats.
  layout.statValues.forEach((value, i) => {
    const label = layout.statLabels[i]!;
    ctx.font = fontFor(value, palette);
    const valueLeft = leftOf(spaced, value);
    const valueBaseline = baselineOf(ctx, value);
    paintText(spaced, value.text, valueLeft, valueBaseline, 0, palette.oxblood, palette.outline, 1);
    const valueWidth = textWidth(spaced, value.text, 0);
    ctx.font = fontFor(label, palette);
    if (layout.labelBesideValue) {
      paintText(spaced, label.text, valueLeft + valueWidth + 20, valueBaseline, 0, palette.espresso, palette.outline, 1);
    } else {
      paintText(spaced, label.text, leftOf(spaced, label), baselineOf(ctx, label), 0, palette.espresso, palette.outline, 1);
    }
  });

  // Site line.
  const footer = layout.footer;
  paintDisplay(spaced, footer, palette, palette.oxblood, palette.outline, 0.6);
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
export function stickerFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? new File([blob], name, { type: 'image/png' }) : null), 'image/png');
  });
}
