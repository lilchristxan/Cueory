import { expect, test } from '@playwright/test';

const stored = (page: import('@playwright/test').Page, key: string) => page.evaluate((name) => localStorage.getItem(name), key);

test('framed Sudoku disables its Frame difficulty picker while paused and restores keyboard/tap use', async ({ page }) => {
  await page.goto('/play/sudoku');
  const picker = page.getByTestId('game-frame-sudoku-stats').getByLabel('difficulty');
  await picker.selectOption('hard');
  await page.getByTestId('sudoku').getByRole('button', { name: 'pause puzzle' }).click();
  await expect(picker).toBeDisabled();
  await expect(picker).toHaveValue('hard');
  await picker.press('ArrowUp').catch(() => undefined);
  await expect(picker).toHaveValue('hard');
  await page.getByTestId('sudoku').getByRole('button', { name: 'resume puzzle' }).click();
  await expect(picker).toBeEnabled();
  await picker.selectOption('easy');
  await expect(picker).toHaveValue('easy');
});

test('framed Sudoku trims expired per-level solves when the mounted stats island loads', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: [{ level: 'easy', day: '2020-01-01', seconds: 120 }] }));
  });
  await page.goto('/play/sudoku');
  await expect.poll(() => stored(page, 'cueory-sudoku-stats')).toBeNull();
});

test('mounted framed Sudoku stats refresh after a same-tab stats-changed event', async ({ page }) => {
  await page.goto('/play/sudoku');
  const numbers = page.getByTestId('game-frame-sudoku-numbers');
  await expect(numbers).toContainText('easy solved');
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  await page.evaluate((day) => {
    localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: [{ level: 'easy', day, seconds: 120 }] }));
    window.dispatchEvent(new Event('cueory:game-stats-changed'));
  }, today);
  await expect(numbers).toContainText('1easy solved');
});
