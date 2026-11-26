import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';
import { SUDOKU_PATTERN, SUDOKU_STICKER_SIZE, sudokuLayout } from '../../src/islands/sudokusticker';

// The sudoku share card (Christian's designs, 25 Nov 2026): two stickers drawn in the browser around one fixed,
// decorative 9 x 9 pattern, the share/save/copy buttons, and the game's own timer on the sticker. The clock is set to
// 1 November 2026 in Phoenix, so today's easy puzzle is the one below.

const daily = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy');
const open = daily.puzzle.flatMap((digit, index) => (digit === 0 ? [index] : []));

test.use({ timezoneId: 'America/Phoenix' });

async function start(page: Page, init?: () => void) {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00-07:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture']));
    } catch { /* optional storage */ }
  });
  if (init) await page.addInitScript(init);
  await page.goto('/play/sudoku');
  await expect(page.getByTestId('sudoku').getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell')).toHaveCount(81);
}

async function solve(page: Page) {
  const cells = page.getByTestId('sudoku').getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');
  for (const index of open) {
    await cells.nth(index).click();
    await page.keyboard.press(String(daily.solution[index]));
  }
  const card = page.getByTestId('share-dialog');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('share-dialog-save')).toBeEnabled({ timeout: 20_000 });
  return card;
}

async function inspect(page: Page, path: string, points: Array<[number, number]>) {
  const base64 = readFileSync(path).toString('base64');
  return page.evaluate(
    async ({ base64, points }) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const at = (x: number, y: number) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      return {
        width: bitmap.width,
        height: bitmap.height,
        corners: [at(2, 2)[3], at(bitmap.width - 3, 2)[3], at(2, bitmap.height - 3)[3], at(bitmap.width - 3, bitmap.height - 3)[3]],
        points: points.map(([x, y]) => at(x, y)),
      };
    },
    { base64, points },
  );
}

async function download(page: Page, button: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(button).click()]);
  return { name: file.suggestedFilename(), path: (await file.path())! };
}

test('solving opens the share card, which is not shown before', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('share-dialog')).toHaveCount(0);
  const card = await solve(page);
  await expect(card).toHaveAttribute('role', 'dialog');
  await expect(card).toBeFocused();
  await expect(page.getByTestId('share-dialog-countdown')).toHaveText(/^next sudoku in \d\d:\d\d:\d\d$/);
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(page.getByTestId('sudoku-share-open')).toBeFocused();
  await page.getByTestId('sudoku-share-open').click();
  await expect(card).toBeVisible();
});

for (const [kind, option, name] of [
  ['centered', 'portrait', 'sudoku-portrait-2026-11-01.png'],
  ['lower-third', 'landscape', 'sudoku-landscape-2026-11-01.png'],
] as const) {
  test(`${option} sticker: export size, transparent corners, the fixed pattern and no digits`, async ({ page }) => {
    await start(page);
    await solve(page);
    await page.getByTestId(`share-dialog-option-${option}`).click();
    const saved = await download(page, 'share-dialog-save');
    expect(saved.name).toBe(name);
    const layout = sudokuLayout(kind, { dateLine: 'x', stats: [] });
    const { grid } = layout;
    const cell = (grid.width - 2 * grid.border) / 9;
    // The middle of a cream cell, a peach cell and the dark cell, from his pattern.
    const at = (row: number, column: number): [number, number] => [grid.x + grid.border + (column + 0.5) * cell, grid.y + grid.border + (row + 0.5) * cell];
    const seen = await inspect(page, saved.path, [at(0, 0), at(0, 4), at(1, 5)]);
    expect(seen.width).toBe(SUDOKU_STICKER_SIZE[kind].width);
    expect(seen.height).toBe(SUDOKU_STICKER_SIZE[kind].height);
    expect(seen.corners).toEqual([0, 0, 0, 0]);
    const [cream, peach, dark] = seen.points as number[][];
    expect(cream!.slice(0, 3).every((v) => v > 235)).toBe(true);
    expect(peach![0]).toBeGreaterThan(peach![2]! + 40); // warm sand
    expect(peach![0]).toBeGreaterThan(200);
    expect(dark!.slice(0, 3).every((v) => v < 110)).toBe(true);
    // The pattern has the same three kinds of cell on every puzzle: no cell is ever a digit.
    expect(SUDOKU_PATTERN.flat().every((v) => v === 0 || v === 1 || v === 2)).toBe(true);
  });
}

test('the card says the result in words with the level, and never a digit of the puzzle', async ({ page }) => {
  await start(page);
  await solve(page);
  const text = await page.getByTestId('share-dialog-description').textContent();
  expect(text).toMatch(/sudoku sticker, \w+, \w+ \d+\w+ · easy/);
  expect(text).toMatch(/no numbers/);
  expect(text).toMatch(/solve time \d+:\d\d/);
  expect(text).not.toMatch(/day streak|solved \d/); // signed out: the time only
});

test('the corner tiles and the typed wordmark show on the card, and share sends the png where the browser can share files', async ({ page }) => {
  await start(page, () => {
    const w = window as unknown as { __shared: Array<{ files: number }> };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d?: ShareData) => Boolean(d?.files?.length) });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: ShareData) => {
        w.__shared.push({ files: d.files?.length ?? 0 });
      },
    });
  });
  const card = await solve(page);
  await expect(card.locator('.share-dialog-corner-tile')).toHaveCount(2);
  await expect(card.locator('.share-dialog-wordmark-text')).toHaveText('sudoku');
  await page.getByTestId('share-dialog-share').click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: Array<{ files: number }> }).__shared);
  expect(shared).toEqual([{ files: 1 }]);
});

test.describe('the share card fits every screen', () => {
  for (const [width, height] of [[390, 844], [844, 390], [820, 1180], [1440, 900]] as const) {
    test(`${width} x ${height}: inside the screen or scrollable, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await start(page);
      const card = await solve(page);
      const fit = await page.evaluate(() => {
        const scrim = document.querySelector('[data-testid="share-dialog-scrim"]') as HTMLElement;
        const dialog = document.querySelector('[data-testid="share-dialog"]') as HTMLElement;
        const before = dialog.getBoundingClientRect();
        scrim.scrollTop = scrim.scrollHeight;
        const after = dialog.getBoundingClientRect();
        return {
          top: before.top,
          left: before.left,
          right: before.right,
          bottomWhenScrolled: after.bottom,
          vh: window.innerHeight,
          vw: window.innerWidth,
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth || scrim.scrollWidth > scrim.clientWidth,
        };
      });
      expect(fit.sideways).toBe(false);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeLessThanOrEqual(fit.vw);
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.bottomWhenScrolled).toBeLessThanOrEqual(fit.vh);
      await page.getByTestId('share-dialog-countdown').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('share-dialog-countdown')).toBeInViewport();
      await expect(card).toBeVisible();
    });
  }
});
