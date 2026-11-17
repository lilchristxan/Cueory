import { expect, test, type Page } from '@playwright/test';

/**
 * Today's status for each daily game on /play (#735), from this device only. The clock is set to 1 November 2026, when
 * pillo's sample word is "grace" (content/games/pulse/sample-01.json).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
});

const list = (page: Page) => page.getByTestId('play-status');
const row = (page: Page, game: string) => page.getByTestId(`play-status-${game}`);

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('every game shows "not started" in words and a symbol, with 44 px targets and no sideways scroll', async ({ page }) => {
      await page.goto('/play');
      await expect(list(page).getByRole('heading', { name: 'today' })).toBeVisible();
      for (const [game, name] of [['pulse', 'pillo'], ['triage', 'sudoku'], ['cueword', 'crossword'], ['suture', 'word path']]) {
        await expect(row(page, game)).toHaveAttribute('data-status', 'not-started');
        await expect(row(page, game)).toContainText(name);
        await expect(row(page, game)).toContainText('○');
        await expect(row(page, game)).toContainText('not started');
        const box = await row(page, game).getByRole('link').boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByTestId('play-status-note')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('a result kept in the stats record shows as done, and the stats note goes away', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('cueory-game-stats', JSON.stringify({
          version: 1,
          results: [
            { game: 'cueword', day: '2026-11-01', solved: true, tries: 0 },
            { game: 'suture', day: '2026-10-31', solved: true, tries: 0 },
          ],
        }));
      });
      await page.goto('/play');
      await expect(row(page, 'cueword')).toHaveAttribute('data-status', 'done');
      await expect(row(page, 'cueword')).toContainText('✓');
      await expect(row(page, 'cueword')).toContainText('done');
      // Yesterday's result doesn't count for today.
      await expect(row(page, 'suture')).toHaveAttribute('data-status', 'not-started');
      await expect(page.getByTestId('play-status-note')).toHaveCount(0);
    });
  });
}

test('finishing pillo on the page marks it done, and a started round shows in progress', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play');
  await expect(row(page, 'pulse')).toHaveAttribute('data-status', 'not-started');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-progress', { detail: { game: 'suture', day: '2026-11-01' } })));
  await expect(row(page, 'suture')).toHaveAttribute('data-status', 'in-progress');
  await expect(row(page, 'suture')).toContainText('◐');
  await expect(row(page, 'suture')).toContainText('in progress');
  const field = page.getByLabel('your guess', { exact: true });
  await field.fill('grace');
  await field.press('Enter');
  await expect(page.getByTestId('pulse-result')).toContainText('solved.');
  await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
  await expect(row(page, 'pulse')).toHaveAttribute('data-status', 'done');
});

test('each row jumps to its game by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/play');
  const link = row(page, 'triage').getByRole('link');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#sudoku-heading$/);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('no status shows, so none can be wrong', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
    await expect(list(page)).toHaveCount(0);
  });
});
