/**
 * Draws a sudoku share sticker with the canvas 2D API (transparent background, exact export size). Layout is
 * sudokusticker.ts; the date, stats and site line come from stickerpaint.ts, shared with the other games. The
 * "sudoku" wordmark is set in type (Bodoni Moda 600, his design), like the site line. Loaded on demand when a puzzle
 * is solved, never on first paint. Every colour is a CSS token (the --sudoku-sticker-* and --vialo-sticker-* groups,
 * never overridden for Evening), read with getComputedStyle.
 */
import { SUDOKU_PATTERN, SUDOKU_STICKER_SIZE, sudokuLayout, type GridBox, type SudokuStickerInput, type SudokuStickerKind } from './sudokusticker';
import { canvasFile, drawDate, drawDividers, drawFooter, drawStats, fontString, paintDisplay, type PaintPalette, type SpacedContext } from './stickerpaint';

export interface SudokuPalette extends PaintPalette {
  peach: string;
  dark: string;
  cream: string;
  line: string;
  lift: string;
  halo: string;
}

export function readSudokuPalette(root: Element = document.documentElement): SudokuPalette {
  const style = getComputedStyle(root);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    accent: get('--sudoku-sticker-espresso'),
    espresso: get('--sudoku-sticker-espresso'),
    copper: get('--vialo-sticker-copper'),
    outline: get('--vialo-sticker-outline'),
    wordmarkOutline: get('--vialo-sticker-wordmark-outline'),
    dividerHalo: get('--vialo-sticker-divider-halo'),
    peach: get('--sudoku-sticker-peach'),
    dark: get('--sudoku-sticker-dark'),
    cream: get('--sudoku-sticker-cream'),
    line: get('--sudoku-sticker-line'),
    lift: get('--sudoku-sticker-lift'),
    halo: get('--sudoku-sticker-halo'),
    body: get('--font-body'),
    display: get('--font-display'),
  };
}

export async function waitForSudokuFonts(palette: SudokuPalette): Promise<void> {
  await Promise.all([
    document.fonts.load(fontString(400, 34, palette.body)),
    document.fonts.load(fontString(700, 78, palette.body)),
    document.fonts.load(fontString(600, 62, palette.display)),
    document.fonts.load(fontString(600, 148, palette.display)),
  ]);
  await document.fonts.ready;
}

function roundedRect(ctx: CanvasRenderingContext2D, grid: GridBox, grow = 0) {
  ctx.beginPath();
  ctx.roundRect(grid.x - grow, grid.y - grow, grid.width + grow * 2, grid.height + grow * 2, grid.radius + grow);
}

/** The fixed decorative 9 x 9 grid: frame, cells, thin lines, and thick lines between the 3 x 3 boxes. */
export function drawGrid(ctx: CanvasRenderingContext2D, grid: GridBox, palette: SudokuPalette): void {
  // Drop shadow (cast by an opaque shape, so its strength is the token's), then the faint light ring outside the frame.
  ctx.save();
  ctx.shadowColor = palette.lift;
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 16;
  roundedRect(ctx, grid);
  ctx.fillStyle = palette.cream;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundedRect(ctx, grid, 1);
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.halo;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  roundedRect(ctx, grid);
  ctx.clip();
  ctx.fillStyle = palette.cream;
  ctx.fillRect(grid.x, grid.y, grid.width, grid.height);
  const inner = grid.width - 2 * grid.border;
  const cell = inner / 9;
  const origin = { x: grid.x + grid.border, y: grid.y + grid.border };
  SUDOKU_PATTERN.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value === 0) return;
      ctx.fillStyle = value === 1 ? palette.peach : palette.dark;
      ctx.fillRect(origin.x + c * cell, origin.y + r * cell, cell, cell);
    });
  });
  // Thin lines at the end of every cell, thick ones after the third and sixth.
  for (let i = 1; i < 9; i += 1) {
    const thick = i === 3 || i === 6;
    const width = thick ? grid.border : grid.thin;
    ctx.fillStyle = thick ? palette.espresso : palette.line;
    ctx.fillRect(origin.x + i * cell - width / 2, origin.y, width, inner);
    ctx.fillRect(origin.x, origin.y + i * cell - width / 2, inner, width);
  }
  ctx.restore();
  // The frame.
  ctx.save();
  roundedRect(ctx, grid, -grid.border / 2);
  ctx.lineWidth = grid.border;
  ctx.strokeStyle = palette.espresso;
  ctx.stroke();
  ctx.restore();
}

/** Draws the whole sticker onto a canvas that is already the export size. */
export function drawSudokuSticker(ctx: CanvasRenderingContext2D, kind: SudokuStickerKind, input: SudokuStickerInput, palette: SudokuPalette): void {
  const layout = sudokuLayout(kind, input);
  ctx.clearRect(0, 0, layout.width, layout.height);
  paintDisplay(ctx as SpacedContext, layout.wordmark, palette, palette.espresso, palette.outline, 0.6);
  drawDate(ctx, layout.date, palette);
  drawGrid(ctx, layout.grid, palette);
  drawDividers(ctx, layout.dividers, palette);
  drawStats(ctx, layout.statValues, layout.statLabels, layout.labelBesideValue, palette, 14);
  drawFooter(ctx, layout.footer, palette);
}

export function renderSudokuSticker(kind: SudokuStickerKind, input: SudokuStickerInput, palette: SudokuPalette): HTMLCanvasElement {
  const { width, height } = SUDOKU_STICKER_SIZE[kind];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawSudokuSticker(canvas.getContext('2d')!, kind, input, palette);
  return canvas;
}

export const sudokuStickerFile = canvasFile;
