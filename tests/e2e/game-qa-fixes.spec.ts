import { expect, test, type Page } from '@playwright/test';
import { markGameRulesSeen } from './clock';
import { recordCspEvents, withoutWebkitSelectReports } from './csp-allow';

// Fixes from the 25 Nov gameplay QA (docs/status/in-review/task-games-v2-qa-fixes.md). Each test fails on the build
// before the fix. Games with a first-visit dialog start from empty storage; the rest of the suite starts as a returning
// player (playwright.config.ts).

const PAGES = ['/play/vialo', '/play/piccline', '/play/sudoku', '/play/crossword', '/play/tachyyy', '/play/hello-cards'];

function yesterday(): string {
  const date = new Date(Date.now() - 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test.describe('returning player with saved stats', () => {
  for (const path of PAGES) {
    test(`${path} hydrates without console errors`, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
      page.on('pageerror', (error) => problems.push(error.message));
      // Structured CSP events, so the check is engine-independent. Only WebKit's native <select> report (the sudoku
      // difficulty picker, csp-allow.ts, #862) is set aside; any other violation fails.
      await recordCspEvents(page);
      await markGameRulesSeen(page);
      const day = yesterday();
      await page.addInitScript((seedDay) => {
        const results = ['pulse', 'cueword', 'triage', 'suture', 'stat'].map((game) => ({ game, day: seedDay, solved: true, tries: 3 }));
        localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results }));
      }, day);
      await page.goto(path);
      // Signed out (2026-11-25) the stats numbers are not drawn; the copper bar stands in their place. Waiting for it
      // proves the island hydrated with saved stats in storage.
      await expect(page.getByTestId('game-frame-account-bar')).toBeVisible();
      await page.waitForTimeout(500);
      expect(await withoutWebkitSelectReports(page, problems)).toEqual([]);
      await expect(page.locator('.game-frame-stat')).toHaveCount(0);
      // The saved stats are still on the device, untouched (the signed-in numbers are checked in game-stats-gate.spec.ts).
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-game-stats') ?? 'null')?.results?.length)).toBeGreaterThanOrEqual(5);
    });
  }
});

test.describe('first visit', () => {
  for (const path of ['/play/vialo', '/play/sudoku', '/play/crossword', '/play/piccline']) {
    test(`${path} shows the rules once`, async ({ page }) => {
      await page.goto(path);
      const dialog = page.getByTestId('game-help');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await page.reload();
      await expect(page.locator('[data-game-page], .game-frame, main').first()).toBeVisible();
      await page.waitForTimeout(300);
      await expect(page.getByTestId('game-help')).toHaveCount(0);
    });
  }
});

test('sudoku help names the levels the picker uses', async ({ page }) => {
  await markGameRulesSeen(page);
  await page.goto('/play/sudoku');
  await page.getByRole('button', { name: 'how to play sudoku' }).first().click();
  const body = page.getByTestId('game-help-body');
  await expect(body).toContainText('pick easy, medium or hard');
  await expect(body).not.toContainText('mid or hard');
});

test.describe('tachyyy', () => {
  test('buttons use the current game name', async ({ page }) => {
    await markGameRulesSeen(page);
    await page.goto('/play/tachyyy');
    await expect(page.getByRole('button', { name: 'tachyyy settings' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'how to play tachyyy' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'stat settings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'how to play stat' })).toHaveCount(0);
  });

  test('Enter does nothing until an answer is picked', async ({ page }) => {
    await markGameRulesSeen(page);
    await page.goto('/play/tachyyy');
    await page.getByTestId('stat-start').click();
    const progress = page.getByTestId('stat-progress');
    await expect(progress).toHaveText('question 1 of 15');
    await page.keyboard.press('Enter');
    await expect(progress).toHaveText('question 1 of 15');
    await page.keyboard.press('b');
    await page.keyboard.press('Enter');
    await expect(progress).toHaveText('question 2 of 15');
  });
});

test('the launch-list promo panel does not open over a game in play', async ({ page }) => {
  // Rules already seen, so no dialog is open and only the game-in-play guard in PromoPanel.astro holds the panel back.
  await markGameRulesSeen(page);
  for (const path of ['/play/vialo', '/play/sudoku', '/play/piccline']) {
    await page.clock.install({ time: new Date('2026-11-11T09:00:00') });
    await page.addInitScript(() => { try { localStorage.removeItem('cueory-promo-seen'); } catch { /* blocked */ } });
    await page.goto(path);
    await expect(page.locator('.game-frame, [data-game-page]').first()).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.clock.runFor(30_000);
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.clock.runFor(2_000);
    await expect(page.getByTestId('promo')).toBeHidden();
  }
});
