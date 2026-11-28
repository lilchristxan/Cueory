import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

test.beforeEach(async ({ page }) => {
  // Same reviewed November sample puzzle as play.spec.ts, so tests do not depend on today's word.
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // When storage is blocked the panel never appears.
    }
  });
});

const mark = (page: Page) => page.getByTestId('result-brand-mark');

test('no game result mark appears while a student is answering', async ({ page }) => {
  // Each game is on its own page (2026-11-17).
  await page.goto('/play/pillo');
  await expect(page.getByTestId('pulse')).toBeVisible();
  await expect(mark(page)).toHaveCount(0);
  await page.goto('/play/crossword');
  await expect(page.getByRole('grid', { name: 'crossword grid' })).toBeVisible();
  await expect(mark(page)).toHaveCount(0);
  await page.goto('/play/sudoku');
  await expect(page.getByTestId('sudoku')).toBeVisible();
  await expect(mark(page)).toHaveCount(0);
});

// Christian, 2026-11-27: the finished game's block is minimal, so the repeated "cueory.app/play" line is gone.
test('pillo completion shows no repeated brand line in its result', async ({ page }) => {
  await page.goto('/play/pillo');
  await page.getByTestId('pulse').getByLabel('your guess', { exact: true }).fill('grace');
  await page.getByTestId('pulse').getByRole('button', { name: 'enter', exact: true }).click();
  const resultDialog = page.getByTestId('game-result-dialog');
  await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
  await resultDialog.getByRole('button', { name: 'close results' }).click();
  const result = page.getByTestId('pulse-result');
  await expect(result).toBeFocused();
  await expect(mark(page)).toHaveCount(0);
  await expect(result).not.toContainText('cueory.app');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('crossword completion shows no repeated brand line in its finished card', async ({ page }) => {
  await page.goto('/play/crossword');
  // The crossword has no clue buttons any more: each square is a button named by its row and column (Task 627).
  // Same easy November sample as play.spec.ts.
  const board = page.getByTestId('cueword');
  const sample = ['.ABC.', 'DEFGH', 'IJKLM', 'NOPQR', '.STU.'];
  for (const [row, letters] of sample.entries()) {
    for (const [column, letter] of [...letters].entries()) {
      if (letter === '.') continue;
      await board.getByRole('button', { name: new RegExp('^(?:\\d+, )?row ' + (row + 1) + ', column ' + (column + 1) + ',') }).click();
      await page.keyboard.type(letter);
    }
  }
  await expect(page.getByTestId('cueword-result')).toBeVisible();
  await expect(mark(page)).toHaveCount(0);
  await expect(page.getByTestId('cueword-result')).not.toContainText('cueory.app');
});

test('progress is a share-worthy summary, with a mark that remains decorative', async ({ page }) => {
  await page.goto('/progress');
  await expect(mark(page)).toHaveCount(1);
  await expect(mark(page)).toHaveText('cueory.app/progress');
  await expect(mark(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(mark(page)).toHaveClass(/print:hidden/);
});
