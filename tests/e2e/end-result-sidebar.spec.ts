import { expect, test, type Locator, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';

// Christian, 2026-11-27: "on every game, move all these end of game text to the left sidebar. make it minimalist."
// On a desktop window the finished game's block (result word, one figure, share, the wait) is in the game frame's left
// side panel; on a tablet or phone the panel is a strip above the board, so the block stays under the board.

test.use({ timezoneId: 'America/Phoenix' });

const daily = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy');
const open = daily.puzzle.flatMap((digit, index) => (digit === 0 ? [index] : []));

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T15:00:00-07:00') });
  await markPanelsSeen(page);
});

const isDesktop = (page: Page) => page.viewportSize()!.width >= 1024;

async function finishWordpill(page: Page) {
  await page.goto('/play/wordpill');
  await expect(page.locator('astro-island[component-url*="VialoGame"]:not([ssr])')).toHaveCount(1);
  const field = page.getByLabel('your guess', { exact: true });
  await field.fill('grace');
  await field.press('Enter');
  const result = page.getByTestId('vialo-result');
  await expect(result).toContainText('solved.');
  await expect(page.getByTestId('share-dialog')).toBeVisible();
  await page.getByTestId('share-dialog-close').click();
  await expect(page.getByTestId('share-dialog')).toBeHidden();
  return result;
}

async function finishSudoku(page: Page) {
  await page.goto('/play/sudoku');
  const cells = page.getByTestId('sudoku').getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');
  await expect(cells).toHaveCount(81);
  for (const index of open) {
    await cells.nth(index).click();
    await page.keyboard.press(String(daily.solution[index]));
  }
  const result = page.getByTestId('sudoku-result');
  await expect(result).toContainText('solved.');
  await expect(page.getByTestId('share-dialog')).toBeVisible();
  await page.getByTestId('share-dialog-close').click();
  await expect(page.getByTestId('share-dialog')).toBeHidden();
  return result;
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found).not.toBeNull();
  return found!;
}

const apart = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.y + a.height <= b.y || b.y + b.height <= a.y || a.x + a.width <= b.x || b.x + b.width <= a.x;

for (const [name, finish, nextText, figure] of [
  ['wordpill', finishWordpill, /next word in \d/, /^1\/6 · \d+:\d\d$/],
  ['sudoku', finishSudoku, /next sudoku in \d/, /^\d+:\d\d · \d+ errors?$/],
] as const) {
  test(`${name}: the finished block is in the left side panel on a desktop window, under the board elsewhere`, async ({ page }) => {
    const result = await finish(page);
    const slot = page.getByTestId('game-frame-end-slot');
    if (isDesktop(page)) {
      await expect(slot.locator('[data-testid$="-result"]')).toBeVisible();
      await expect(result).toHaveAttribute('data-placement', 'sidebar');
      const sidebar = await box(page.locator('.game-frame-sidebar'));
      const mine = await box(result);
      expect(mine.x).toBeGreaterThanOrEqual(sidebar.x);
      expect(mine.x + mine.width).toBeLessThanOrEqual(sidebar.x + sidebar.width);
    } else {
      await expect(slot).toBeHidden();
      await expect(result).toHaveAttribute('data-placement', 'board');
      await expect(page.getByTestId('game-frame-end-slot').getByTestId('vialo-result')).toHaveCount(0);
      // Directly under the board, in the main column.
      expect(await result.evaluate((node) => !!node.closest('.game-frame-main'))).toBe(true);
    }
    // Minimal: a short result word, one figure, the share button and the wait. No repeated branding or share line.
    await expect(result).toContainText(nextText);
    await expect(result.locator('.game-end-figure')).toHaveText(figure);
    await expect(result).not.toContainText('cueory.app');
    await expect(result).not.toContainText(/·.*·.*cueory/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test(`${name}: the share button is at least 44 px, reachable by keyboard, and opens the share dialog`, async ({ page }) => {
    const result = await finish(page);
    const share = result.getByRole('button', { name: 'share', exact: true });
    const size = await box(share);
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await share.focus();
    await expect(share).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('share-dialog')).toBeVisible();
    await page.getByTestId('share-dialog-close').click();
    await expect(page.getByTestId('share-dialog')).toBeHidden();
    // Focus comes back to the share button, in the panel or under the board.
    await expect(share).toBeFocused();
  });
}

// On a desktop window the block never overlaps the tagline, the copper bar or the logo, and the bar stays on the midline.
test('wordpill: the side panel block clears the tagline and the copper bar, which stays on the midline', async ({ page }) => {
  if (!isDesktop(page)) { await page.goto('/play/wordpill'); await expect(page.getByTestId('game-frame-end-slot')).toBeHidden(); return; } // no side panel below the tablet breakpoint
  for (const height of [800, 900, 1100]) {
    await page.setViewportSize({ width: 1440, height });
    const result = await finishWordpill(page);
    const bar = page.getByTestId('game-frame-account-bar').getByRole('link');
    await expect(bar).toBeVisible();
    const barBox = await box(bar);
    expect(Math.abs(barBox.y + barBox.height / 2 - height / 2)).toBeLessThanOrEqual(1);
    const mine = await box(result);
    expect(apart(mine, await box(page.locator('.game-frame-tagline')))).toBe(true);
    expect(apart(mine, barBox)).toBe(true);
    expect(apart(mine, await box(page.getByTestId('game-frame-account-bar').locator('.game-frame-account-note')))).toBe(true);
    expect(apart(mine, await box(page.locator('.game-frame-logo-wrap').first()))).toBe(true);
    expect(mine.y + mine.height).toBeLessThanOrEqual(height);
  }
});

test('sudoku: the side panel block clears the tagline and the copper bar on a desktop window', async ({ page }) => {
  if (!isDesktop(page)) { await page.goto('/play/wordpill'); await expect(page.getByTestId('game-frame-end-slot')).toBeHidden(); return; } // no side panel below the tablet breakpoint
  const result = await finishSudoku(page);
  const bar = page.getByTestId('game-frame-account-bar').getByRole('link');
  const barBox = await box(bar);
  expect(Math.abs(barBox.y + barBox.height / 2 - 450)).toBeLessThanOrEqual(1);
  const mine = await box(result);
  expect(apart(mine, await box(page.locator('.game-frame-tagline')))).toBe(true);
  expect(apart(mine, barBox)).toBe(true);
});

// The result is still announced: the crossword and sudoku block is a status region, wordpill keeps its live region.
test('the sudoku block is announced as a status and wordpill keeps its live region', async ({ page }) => {
  const sudoku = await finishSudoku(page);
  await expect(sudoku).toHaveAttribute('role', 'status');
  await page.goto('/play/wordpill');
  await expect(page.getByTestId('vialo-live')).toHaveAttribute('aria-live', 'polite');
});

// A short desktop window keeps the copper bar in the flow; the block then follows it, still clear of it.
test('wordpill: on a short desktop window the block sits under the copper bar, not over it', async ({ page }) => {
  if (!isDesktop(page)) { await page.goto('/play/wordpill'); await expect(page.getByTestId('game-frame-end-slot')).toBeHidden(); return; } // no side panel below the tablet breakpoint
  await page.setViewportSize({ width: 1440, height: 760 });
  const result = await finishWordpill(page);
  const barBox = await box(page.getByTestId('game-frame-account-bar'));
  const mine = await box(result);
  expect(mine.y).toBeGreaterThanOrEqual(barBox.y + barBox.height);
});
