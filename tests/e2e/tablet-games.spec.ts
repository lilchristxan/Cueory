import { expect, test } from '@playwright/test';

// A tablet held upright (820 × 1180) and sideways (1180 × 820): all four daily boards, each on its own page, are centred in the
// game column, no square grows past 72px (a crossword square) or drops under 44px, and nothing scrolls sideways.

const boards = [
  { name: 'pillo', path: '/play/pillo', board: '.pillo-pack', square: null },
  { name: 'pillo keys', path: '/play/pillo', board: '.pillo-keys', square: null },
  { name: 'sudoku', path: '/play/sudoku', board: '.sudoku-board', square: '.sudoku-cell' },
  { name: 'crossword', path: '/play/crossword', board: '.crossword-board', square: '.crossword-cell' },
  { name: 'word path', path: '/play/word-path', board: '.wordpath-board', square: '.wordpath-board button[data-path]' },
] as const;

for (const [width, height] of [[820, 1180], [1180, 820]] as const) {
  test.describe(`tablet ${width} × ${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    test('every board is centred, squares are 44 to 72px, no sideways scroll', async ({ page }) => {
      // A fixed board day: without it, the runner's own date picks the sample, and on some days word path shows its
      // older word search, whose letters have no data-path (landscape-games.spec.ts has the same fix).
      await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
      });
      for (const { name, path, board, square } of boards) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), name).toBeLessThanOrEqual(0);

        // The middle of the column the game sits in (the main content box, inside its side padding).
        const middle = await page.locator('.game-frame-main').evaluate((main) => {
          const box = main.getBoundingClientRect();
          const style = getComputedStyle(main);
          return (box.left + parseFloat(style.paddingLeft) + box.right - parseFloat(style.paddingRight)) / 2;
        });

        const box = (await page.locator(board).first().boundingBox())!;
        expect(Math.abs(box.x + box.width / 2 - middle), `${name} is centred`).toBeLessThanOrEqual(2);
        expect(box.x, name).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, name).toBeLessThanOrEqual(width);
        if (!square) continue;
        const cell = (await page.locator(square).first().boundingBox())!;
        expect(cell.width, `${name} square`).toBeLessThanOrEqual(72.5);
        expect(cell.width, `${name} square`).toBeGreaterThanOrEqual(44);
        expect(cell.height, `${name} square`).toBeGreaterThanOrEqual(44);
      }
    });
  });
}
