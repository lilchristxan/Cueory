import { expect, test } from '@playwright/test';

const games = [
  { path: '/play/pillo', name: 'pillo', framed: false, bridge: false },
  { path: '/play/stat', name: 'stat', framed: true, bridge: false },
  { path: '/play/word-path', name: 'piccline', framed: false, bridge: false },
  { path: '/play/crossword', name: 'crossword', framed: true, bridge: true },
  { path: '/play/hello-cards', name: 'hello cards', framed: true, bridge: false },
] as const;

test.describe('GameFrame shared layout (Scope 1)', () => {
  for (const game of games) {
    test(`${game.name}: keeps the explicit Frame control ownership`, async ({ page }) => {
      await page.goto(game.path);
      await page.waitForLoadState('domcontentloaded');

      // Left panel elements
      const backLink = page.getByRole('link', { name: 'all games' });
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute('href', '/play');

      const logo = page.locator('.game-frame-logo:visible');
      await expect(logo).toHaveCount(1);
      await expect(logo).toBeVisible();

      // Stats
      const stats = page.locator('.game-frame-stats');
      // Every game page shows its four stats in the left panel (Games v2, 23 Nov), framed controls or not.
      await expect(stats).toBeVisible();
      await expect(stats).toContainText(game.name === 'hello cards' ? 'questions asked' : '% solved');
      await expect(stats).toContainText('played');
      const statsIsland = page.locator('astro-island[component-url*="GameFrameStats"]');
      if (game.name === 'hello cards') {
        await expect(stats).toHaveText(/0\s*questions asked\s*0\s*current streak\s*0\s*best streak\s*0\s*played/);
        await expect(statsIsland).toHaveCount(0);
      } else {
        await expect(statsIsland).toHaveCount(1);
      }

      // Date line
      const dateLine = page.locator('.game-frame-dateline');
      await expect(dateLine).toBeVisible();

      // Only opted-in routes use the Frame controls; held routes retain their legacy island controls.
      const gear = page.getByTestId('game-frame-gear');
      const helpBtn = page.getByTestId('game-frame-help-button');
      if (!game.framed) {
        await expect(gear).toHaveCount(0);
        await expect(helpBtn).toHaveCount(0);
        return;
      }
      await expect(gear).toBeVisible();
      const gearBox = await gear.boundingBox();
      expect(gearBox?.width).toBeGreaterThanOrEqual(44);
      expect(gearBox?.height).toBeGreaterThanOrEqual(44);

      await expect(helpBtn).toBeVisible();
      const helpBox = await helpBtn.boundingBox();
      expect(helpBox?.width).toBeGreaterThanOrEqual(44);
      expect(helpBox?.height).toBeGreaterThanOrEqual(44);

      if (game.bridge) {
        // The one visible shared opener delegates to the island's established dialog and returns focus to this button.
        await expect(page.getByRole('button', { name: `${game.name} settings` })).toHaveCount(1);
        await expect(page.getByRole('button', { name: `how to play ${game.name}` })).toHaveCount(1);
        await expect(page.getByTestId('game-settings-button')).toHaveCount(0);
        await expect(page.getByTestId('game-help-button')).toHaveCount(0);
        await helpBtn.click();
        const dialog = page.getByRole('dialog', { name: `how to play ${game.name}` });
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(helpBtn).toBeFocused();
      } else {
        await helpBtn.click();
        await expect(page.locator('.game-frame-popover')).toBeVisible();
      }
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

test.describe('game page frame (Games v2, 23 Nov)', () => {
  for (const path of ['/play/vialo', '/play/sudoku', '/play/piccline']) {
    test(`${path}: no site menu bar or building strip, the other open games as deck cards, a skip link`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('header')).toHaveCount(0);
      await expect(page.getByTestId('building-notice')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'skip to content' })).toHaveCount(1);
      const links = page.locator('.game-deck-card');
      // The test build opens every game, the live build only these three; either way no card is a dead end.
      expect(await links.count()).toBeGreaterThanOrEqual(2);
      await expect(page.locator('.game-deck-item')).toHaveCount(await links.count());
      for (const link of await links.all()) await expect(link).toHaveAttribute('href', /^\/play\/[a-z-]+$/);
    });
  }
});
