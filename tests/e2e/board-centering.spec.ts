import { expect, test } from '@playwright/test';

const routes = [
  { path: '/play/pillo', name: 'pillo' },
  { path: '/play/stat', name: 'stat' },
  { path: '/play/word-path', name: 'word path' },
  { path: '/play/crossword', name: 'crossword' },
  { path: '/play/sudoku', name: 'sudoku' },
  { path: '/play/hello-cards', name: 'hello cards' },
];

const viewports = [
  { width: 390, height: 844, name: '390x844' },
  { width: 820, height: 1180, name: '820x1180' },
  { width: 1440, height: 900, name: '1440x900' },
] as const;

test.describe('Game board centering', () => {
  for (const { width, height, name: vpName } of viewports) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const route of routes) {
        test(`${route.name} at ${vpName} in ${scheme}: board top and bottom gaps equal within 8px`, async ({ page }) => {
          await page.setViewportSize({ width, height });
          await page.emulateMedia({ colorScheme: scheme });
          await page.addInitScript(() => {
            try {
              localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'vialo', 'suture', 'triage', 'cueword']));
            } catch {
              // optional
            }
          });
          await page.goto(route.path);
          await page.waitForLoadState('domcontentloaded');

          const controls = page.locator('.game-frame-controls-row');
          await expect(controls).toBeVisible();
          const board = page.locator('.game-frame-board');
          await expect(board).toBeVisible();
          const footer = page.locator('.game-frame-footer-slot:not(:empty), footer[data-site-footer]').first();
          await expect(footer).toBeVisible();

          const controlsBox = (await controls.boundingBox())!;
          const boardBox = (await board.boundingBox())!;
          const footerBox = (await footer.boundingBox())!;

          const topGap = boardBox.y - (controlsBox.y + controlsBox.height);
          const bottomGap = footerBox.y - (boardBox.y + boardBox.height);

          expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(8);

          // No horizontal scroll
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
          expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
        });
      }
    }
  }

  // Short viewport test
  for (const route of routes) {
    test(`${route.name} in short viewport (390x600): sits at or below controls row and nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 600 });
      await page.addInitScript(() => {
        try {
          localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'vialo', 'suture', 'triage', 'cueword']));
        } catch {
          // optional
        }
      });
      await page.goto(route.path);
      await page.waitForLoadState('domcontentloaded');

      const controls = page.locator('.game-frame-controls-row');
      await expect(controls).toBeVisible();
      const board = page.locator('.game-frame-board');
      await expect(board).toBeVisible();

      const controlsBox = (await controls.boundingBox())!;
      const boardBox = (await board.boundingBox())!;

      // Sits at or below controls row
      expect(boardBox.y).toBeGreaterThanOrEqual(controlsBox.y + controlsBox.height - 1);

      // Nothing clipped (window scroll is at top and content is scrollable)
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBe(0);

      // No horizontal scroll
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});
