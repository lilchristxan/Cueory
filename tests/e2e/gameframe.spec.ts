import { expect, test } from '@playwright/test';

const games = [
  { path: '/play/pillo', name: 'pillo', brandName: 'vialo', hasLegend: true },
  { path: '/play/stat', name: 'stat', brandName: 'tachyyy', hasLegend: false },
  { path: '/play/word-path', name: 'word path', brandName: 'piccline', hasLegend: false },
  { path: '/play/crossword', name: 'crossword', brandName: 'crossword', hasLegend: false },
  { path: '/play/sudoku', name: 'sudoku', brandName: 'sudoku', hasLegend: false },
  { path: '/play/hello-cards', name: 'hello cards', brandName: 'hello cards', hasLegend: false },
] as const;

test.describe('GameFrame shared layout (Scope 1)', () => {
  for (const game of games) {
    test(`${game.name}: provides left panel, date line, controls row, and 44px tap targets`, async ({ page }) => {
      await page.goto(game.path);
      await page.waitForLoadState('domcontentloaded');

      // Left panel elements
      const backLink = page.getByRole('link', { name: 'all games' });
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute('href', '/play');

      const logo = page.locator('.game-frame-logo').first();
      await expect(logo).toBeVisible();

      // Stats
      const stats = page.locator('.game-frame-stats');
      await expect(stats).toBeVisible();
      await expect(stats).toContainText(game.name === 'hello cards' ? 'questions asked' : '% solved');
      await expect(stats).toContainText('played');

      // Date line
      const dateLine = page.locator('.game-frame-dateline');
      await expect(dateLine).toBeVisible();

      // Controls row
      const gear = page.getByTestId('game-frame-gear');
      await expect(gear).toBeVisible();
      const gearBox = await gear.boundingBox();
      expect(gearBox?.width).toBeGreaterThanOrEqual(44);
      expect(gearBox?.height).toBeGreaterThanOrEqual(44);

      const helpBtn = page.getByTestId('game-frame-help-button');
      await expect(helpBtn).toBeVisible();
      const helpBox = await helpBtn.boundingBox();
      expect(helpBox?.width).toBeGreaterThanOrEqual(44);
      expect(helpBox?.height).toBeGreaterThanOrEqual(44);

      // Popover interaction
      await helpBtn.click();
      const popover = page.locator('.game-frame-popover');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText('HOW TO PLAY');

      if (game.hasLegend) {
        await expect(page.locator('.game-frame-legend')).toBeVisible();
      }

      // Close popover
      await page.keyboard.press('Escape');
      await page.mouse.move(0, 0);
      await page.locator('body').click({ position: { x: 0, y: 0 } });
      await expect(popover).toBeHidden();
    });
  }

  // Responsive and Evening checks
  for (const [size, width, height] of [['390', 390, 844], ['820', 820, 1180], ['1440', 1440, 900]] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`no horizontal overflow at ${size}px in ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/play/pillo');
        await page.waitForLoadState('domcontentloaded');

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      });
    }
  }
});
