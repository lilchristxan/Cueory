/**
 * What every game's share sticker shares: loading images, text with a hairline outline, the wordmark with its light
 * outline, copper dividers, the stat blocks and the site line. Per-game modules (vialostickerdraw.ts,
 * picclinestickerdraw.ts) draw their own artwork between these. Loaded on demand with them, never on first paint.
 */
import type { Box, TextLine } from './vialosticker';

/** The colours and faces the shared pieces need; each game's palette extends it. */
export interface PaintPalette {
  /** Value and site-line colour: oxblood for vialo, teal for piccline. */
  accent: string;
  espresso: string;
  copper: string;
  outline: string;
  wordmarkOutline: string;
  dividerHalo: string;
  body: string;
  display: string;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
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

export function fontString(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

export function fontFor(line: TextLine, palette: PaintPalette): string {
  return fontString(line.weight, line.size, line.family === 'display' ? palette.display : palette.body);
}

export type SpacedContext = CanvasRenderingContext2D & { letterSpacing?: string };

export function hasSpacing(ctx: SpacedContext): boolean {
  return 'letterSpacing' in ctx;
}

export function textWidth(ctx: SpacedContext, text: string, spacing: number): number {
  if (hasSpacing(ctx)) {
    ctx.letterSpacing = `${spacing}px`;
    const width = ctx.measureText(text).width;
    ctx.letterSpacing = '0px';
    return width;
  }
  return ctx.measureText(text).width + spacing * text.length;
}

/** Strokes then fills, like `paint-order: stroke fill` with a centred stroke: only the outer half of the line shows. */
export function paintText(ctx: SpacedContext, text: string, x: number, baseline: number, spacing: number, fill: string, stroke: string | undefined, strokeWidth: number) {
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

export function baselineOf(ctx: CanvasRenderingContext2D, line: TextLine): number {
  const m = ctx.measureText(line.text);
  const ascent = m.fontBoundingBoxAscent ?? line.size * 0.8;
  const descent = m.fontBoundingBoxDescent ?? line.size * 0.2;
  return line.y + (line.lineHeight - (ascent + descent)) / 2 + ascent;
}

export function leftOf(ctx: SpacedContext, line: TextLine): number {
  return line.align === 'center' ? line.x - textWidth(ctx, line.text, line.letterSpacing) / 2 : line.x;
}

/**
 * Bodoni Moda changes its letter shapes with its size (optical sizing), and the browser picks the shape from the
 * font-size it is given. Christian's design was drawn at half size, so display-face lines are drawn at half size under
 * a 2x transform: the same letter shapes his picture has.
 */
export function paintDisplay(ctx: SpacedContext, line: TextLine, palette: PaintPalette, fill: string, stroke: string, strokeWidth: number) {
  const half: TextLine = { ...line, x: line.x / 2, y: line.y / 2, lineHeight: line.lineHeight / 2, size: line.size / 2, letterSpacing: line.letterSpacing / 2 };
  ctx.save();
  ctx.scale(2, 2);
  ctx.font = fontFor(half, palette);
  paintText(ctx, half.text, leftOf(ctx, half), baselineOf(ctx, half), half.letterSpacing, fill, stroke, strokeWidth / 2);
  ctx.restore();
}


/**
 * A wordmark SVG that only has a viewBox is given a size here and handed over as a data: URL (our CSP allows data:
 * images, not blob: ones), because some browsers will not draw a size-less SVG to a canvas.
 */
export async function loadWordmark(url: string, width: number, height: number, fetcher: typeof fetch = fetch): Promise<HTMLImageElement> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error('could not load the wordmark');
  const text = await response.text();
  const sized = text.replace('<svg ', `<svg width="${width}" height="${height}" `);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`);
}

/** The wordmark with Christian's hairline light outline: a pale copy of the artwork 0.8 px off in four directions. */
export function drawWordmark(ctx: CanvasRenderingContext2D, box: Box, wordmark: HTMLImageElement, outline: string): void {
  const { x, y, width, height } = box;
  const scratch = document.createElement('canvas');
  scratch.width = Math.ceil(width);
  scratch.height = Math.ceil(height);
  const s = scratch.getContext('2d')!;
  s.drawImage(wordmark, 0, 0, scratch.width, scratch.height);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = outline;
  s.fillRect(0, 0, scratch.width, scratch.height);
  for (const [dx, dy] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]] as const) ctx.drawImage(scratch, x + dx, y + dy, scratch.width, scratch.height);
  ctx.drawImage(wordmark, x, y, width, height);
}

/** The date line: plain, no outline. */
export function drawDate(ctx: CanvasRenderingContext2D, line: TextLine, palette: PaintPalette): void {
  const spaced = ctx as SpacedContext;
  let date = line;
  ctx.font = fontFor(date, palette);
  const width = line.maxWidth ? textWidth(spaced, line.text, line.letterSpacing) : 0;
  if (line.maxWidth && width > line.maxWidth) {
    const scale = line.maxWidth / width;
    date = { ...line, size: line.size * scale, letterSpacing: line.letterSpacing * scale };
    ctx.font = fontFor(date, palette);
  }
  paintText(spaced, date.text, leftOf(spaced, date), baselineOf(ctx, date), date.letterSpacing, palette.espresso, undefined, 0);
}

/** Copper dividers with a faint light halo. */
export function drawDividers(ctx: CanvasRenderingContext2D, dividers: readonly Box[], palette: PaintPalette): void {
  for (const d of dividers) {
    ctx.fillStyle = palette.dividerHalo;
    ctx.fillRect(d.x - 1, d.y - 1, d.width + 2, d.height + 2);
    ctx.fillStyle = palette.copper;
    ctx.fillRect(d.x, d.y, d.width, d.height);
  }
}

/** Stat values with their labels, under (portrait) or beside (landscape) each value. */
export function drawStats(ctx: CanvasRenderingContext2D, values: readonly TextLine[], labels: readonly TextLine[], labelBesideValue: boolean, palette: PaintPalette, labelGap = 20): void {
  const spaced = ctx as SpacedContext;
  values.forEach((value, i) => {
    const label = labels[i]!;
    ctx.font = fontFor(value, palette);
    const valueLeft = leftOf(spaced, value);
    const valueBaseline = baselineOf(ctx, value);
    paintText(spaced, value.text, valueLeft, valueBaseline, 0, palette.accent, palette.outline, 1);
    const valueWidth = textWidth(spaced, value.text, 0);
    ctx.font = fontFor(label, palette);
    if (labelBesideValue) {
      paintText(spaced, label.text, valueLeft + valueWidth + labelGap, valueBaseline, 0, palette.espresso, palette.outline, 1);
    } else {
      paintText(spaced, label.text, leftOf(spaced, label), baselineOf(ctx, label), 0, palette.espresso, palette.outline, 1);
    }
  });
}

/** The site line, in the display face. */
export function drawFooter(ctx: CanvasRenderingContext2D, footer: TextLine, palette: PaintPalette): void {
  paintDisplay(ctx as SpacedContext, footer, palette, palette.accent, palette.outline, 0.6);
}

/** The sticker canvas as a PNG file; null if the browser cannot encode one. */
export function canvasFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? new File([blob], name, { type: 'image/png' }) : null), 'image/png');
  });
}
