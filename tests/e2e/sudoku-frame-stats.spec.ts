import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

const stored = (page: import('@playwright/test').Page, key: string) => page.evaluate((name) => localStorage.getItem(name), key);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch { /* optional browser storage */ }
  });
  await markPanelsSeen(page);
});

test('framed Sudoku keeps one keyboard-accessible difficulty picker and updates its polite level numbers', async ({ page }) => {
  await page.goto('/play/sudoku');
  const stats = page.getByTestId('game-frame-sudoku-stats');
  const picker = stats.getByLabel('difficulty');
  await expect(picker).toHaveValue('easy');
  await expect(page.getByTestId('sudoku').getByLabel('difficulty')).toHaveCount(0);
  await picker.selectOption('hard');
  await expect(picker).toHaveValue('hard');
  await expect(page.getByTestId('game-frame-sudoku-numbers')).toContainText('Hard solved');
  await expect(page.getByTestId('game-frame-sudoku-numbers')).toHaveAttribute('aria-live', 'polite');
});

test('framed Sudoku confirms Forget all in settings and deletes the two existing stats keys immediately', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [{ game: 'triage', day: '2026-11-20', solved: true, tries: 0 }] }));
    localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: [{ level: 'easy', day: '2026-11-20', seconds: 120 }] }));
  });
  await page.goto('/play/sudoku');
  await page.getByRole('button', { name: 'sudoku settings' }).click();
  await page.getByRole('group', { name: /your data/i }).getByRole('button', { name: 'forget all my stats' }).click();
  await expect(page.getByRole('group', { name: /forget all game stats/i })).toBeVisible();
  await page.getByRole('button', { name: 'yes, forget all my stats' }).click();
  await expect.poll(() => stored(page, 'cueory-game-stats')).toBeNull();
  await expect.poll(() => stored(page, 'cueory-sudoku-stats')).toBeNull();
});
