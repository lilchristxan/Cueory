import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

// The game pages' graph-paper backdrop is painted by the play area (.game-frame-main, the box the board is centred
// in). One stronger vertical line runs through its horizontal middle and one stronger horizontal line through its
// vertical middle; the fine and medium lines mirror to both sides; and the board's centre sits on that crossing.
// Pixels are read from a screenshot with every element inside the play area hidden, so only the backdrop is sampled
// (nothing of the board, the deck or the controls can be in the sample).

const routes = [
  '/play/sudoku',
  '/play/piccline',
  '/play/word-path',
  '/play/pillo',
  '/play/wordpill',
  '/play/crossword',
  '/play/stat',
  '/play/hello-cards',
  '/play/tachyyy',
];
const sizes = [
  [390, 844],
  [820, 1180],
  [1180, 820],
  [1288, 700],
  [1440, 900],
  [1920, 1080],
  [2560, 1300],
] as const;
const schemes = ['light', 'dark'] as const;

// The ink of every pixel (distance from the page colour) along one row and one column, read in the browser so the
// test needs no image library.
async function backdropProfiles(page: Page, png: Buffer, width: number, height: number, ax: number, by: number) {
  return page.evaluate(
    async ({ b64, width, height, ax, by }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const at = (x: number, y: number) => (y * bitmap.width + x) * 4;
      // A pixel on neither a fine nor a medium line (4 px from the centre lines) is the plain paper.
      const bg = at(ax + 4, by + 4);
      const ink = (x: number, y: number) => {
        const i = at(x, y);
        return Math.abs(data[i] - data[bg]) + Math.abs(data[i + 1] - data[bg + 1]) + Math.abs(data[i + 2] - data[bg + 2]);
      };
      const row: number[] = [];
      for (let x = 0; x < width; x += 1) row.push(ink(x, by + 4));
      const column: number[] = [];
      for (let y = 0; y < height; y += 1) column.push(ink(ax + 4, y));
      return { row, column, size: [bitmap.width, bitmap.height] };
    },
    { b64: png.toString('base64'), width, height, ax, by },
  );
}

function strongest(values: number[]) {
  const max = Math.max(...values);
  const at = values.flatMap((v, i) => (v === max ? [i] : []));
  const rest = Math.max(...values.filter((v) => v !== max));
  return { at, max, rest };
}

function mirrored(values: number[], mid: number) {
  const bad: number[] = [];
  for (let d = 1; d <= Math.min(mid, values.length - 1 - mid); d += 1) {
    if (values[mid - d] !== values[mid + d]) bad.push(d);
  }
  return bad;
}

test.describe('game backdrop and board are centred in the play area', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own window sizes: runs once, in the desktop project');
  });

  for (const route of routes) {
    for (const [width, height] of sizes) {
      test(`${route} at ${width} x ${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
        await markPanelsSeen(page);
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.game-frame-board')).toBeVisible();

        for (const scheme of schemes) {
          await page.emulateMedia({ colorScheme: scheme });
          const label = `${route} ${width}x${height} ${scheme}`;
          const box = await page.evaluate(() => {
            const main = document.querySelector('.game-frame-main')!.getBoundingClientRect();
            const board = document.querySelector('.game-frame-board')!.getBoundingClientRect();
            const head = document.querySelector('.game-frame-head')!.getBoundingClientRect();
            const style = getComputedStyle(document.querySelector('.game-frame-main')!);
            const padLeft = parseFloat(style.paddingLeft);
            const padRight = parseFloat(style.paddingRight);
            return {
              main: { x: main.left + scrollX, y: main.top + scrollY, w: main.width, h: main.height },
              board: { cx: board.left + board.width / 2 + scrollX, cy: board.top + board.height / 2 + scrollY, top: board.top + scrollY, bottom: board.bottom + scrollY },
              padLeft,
              padRight,
              headBottom: head.bottom + scrollY,
              viewportHeight: innerHeight,
              noSideways: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            };
          });
          expect(box.noSideways, `${label}: no sideways scroll`).toBe(true);

          // The board's centre is the play area's centre, left to right and top to bottom (within 1 px).
          // The play area is the main area's content box (the box the board is centred in): the deck takes room on its right at narrow widths.
          const mainCx = box.main.x + box.padLeft + (box.main.w - box.padLeft - box.padRight) / 2;
          const mainCy = box.main.y + box.main.h / 2;
          expect(Math.abs(box.board.cx - mainCx), `${label}: board centred left to right`).toBeLessThanOrEqual(1);
          expect(Math.abs(box.board.cy - mainCy), `${label}: board centred top to bottom`).toBeLessThanOrEqual(1);
          // When the column is taller than the window nothing is clipped: the board stays below the controls, inside
          // the play area, and the page scrolls.
          expect(box.board.top, `${label}: board below the controls`).toBeGreaterThanOrEqual(box.headBottom - 1);
          expect(box.board.bottom, `${label}: board inside the play area`).toBeLessThanOrEqual(box.main.y + box.main.h + 1);

          // Hide everything inside the play area and look at the paper alone.
          await page.evaluate(() => {
            for (const el of document.querySelectorAll<HTMLElement>('.game-frame-main > *, .game-frame-deck-slot')) el.style.visibility = 'hidden';
          });
          const w = Math.floor(box.main.w);
          const h = Math.floor(box.main.h);
          const png = await page.screenshot({ fullPage: true, clip: { x: box.main.x, y: box.main.y, width: w, height: h } });
          // The tile is 81 px with its line on pixel 40; its position is rounded down to a whole pixel (the content box's middle).
          const ax = Math.floor((box.main.w - 81) / 2 + (box.padLeft - box.padRight) / 2) + 40;
          const by = Math.floor((box.main.h - 81) / 2) + 40;
          const { row, column } = await backdropProfiles(page, png, w, h, ax, by);

          const vertical = strongest(row);
          const horizontal = strongest(column);
          // Exactly one stronger line each way, on the middle pixel (an even width has no middle pixel: the line is the left one of the two).
          expect(vertical.at, `${label}: one stronger vertical line`).toEqual([ax]);
          expect(Math.abs(box.main.x + ax + 0.5 - mainCx), `${label}: vertical line on the play area's middle`).toBeLessThanOrEqual(1);
          expect(Math.abs(box.main.y + by + 0.5 - mainCy), `${label}: horizontal line on the play area's middle`).toBeLessThanOrEqual(1);
          expect(horizontal.at, `${label}: one stronger horizontal line`).toEqual([by]);
          expect(vertical.max, `${label}: the vertical line is stronger than the medium lines`).toBeGreaterThan(vertical.rest * 1.5);
          expect(horizontal.max, `${label}: the horizontal line is stronger than the medium lines`).toBeGreaterThan(horizontal.rest * 1.5);
          // The crossing is within one pixel of the board's centre.
          expect(Math.abs(box.main.x + ax + 0.5 - box.board.cx), `${label}: crossing at the board's centre, left to right`).toBeLessThanOrEqual(1);
          expect(Math.abs(box.main.y + by + 0.5 - box.board.cy), `${label}: crossing at the board's centre, top to bottom`).toBeLessThanOrEqual(1);
          // The fine and medium lines mirror left/right and top/bottom about the crossing.
          expect(mirrored(row, ax), `${label}: mirrored left and right`).toEqual([]);
          expect(mirrored(column, by), `${label}: mirrored above and below`).toEqual([]);
          // The pattern has lines on both sides (the screenshot was not blank).
          expect(row.filter((v) => v > 0).length, `${label}: lines are drawn`).toBeGreaterThan(w / 20);

          await page.evaluate(() => {
            for (const el of document.querySelectorAll<HTMLElement>('.game-frame-main > *, .game-frame-deck-slot')) el.style.visibility = '';
          });
        }
      });
    }
  }
});
