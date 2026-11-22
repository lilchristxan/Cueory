import { expect, test } from '@playwright/test';

/**
 * Performance (2026-11-19): each game renders in the browser. While its island is still empty, GamePage keeps one
 * screen of room for it, so the stats panel and footer start below the fold and do not jump down when the game
 * appears. The room goes once the game renders, and without JavaScript there is none.
 */
const games = [
  { path: '/play/pillo', script: /\/_astro\/PulseGame\.[\w-]+\.js$/, framed: false },
  { path: '/play/sudoku', script: /\/_astro\/SudokuGame\.[\w-]+\.js$/, framed: true },
  { path: '/play/word-path', script: /\/_astro\/SutureToday\.[\w-]+\.js$/, framed: false },
];

/** The board child that holds the game's island (the island is display: contents, so measure its holder). */
const gameHolder = (page: import('@playwright/test').Page) =>
  page.locator('article[data-game-page] .game-frame-board > *').filter({ has: page.locator('astro-island') }).first();

const gameFrame = (page: import('@playwright/test').Page) => page.locator('article[data-game-page] > .game-frame');

for (const { path, script, framed } of games) {
  test(`${path}: before the game renders, what follows it starts below the first screen`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(script, async (route) => { await held; await route.continue(); });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const stats = framed ? page.getByTestId('game-frame-stats') : page.getByTestId('game-stats');
    await expect(stats).toBeAttached();
    const viewport = page.viewportSize()!.height;
    const holder = gameHolder(page);
    expect(await holder.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(viewport);
    expect(await gameFrame(page).evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(viewport);
    if (!framed) expect(await stats.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(viewport);

    release();
    // Once the game is on the page the room is released, and the game itself is taller than one screen.
    await expect.poll(() => holder.evaluate((el) => getComputedStyle(el).minHeight)).toBe('0px');
    expect(await holder.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(viewport);
    expect(await gameFrame(page).evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(viewport);
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  for (const { path } of games) {
    test(`${path}: no empty room is kept for a game that cannot load`, async ({ page }) => {
      await page.goto(path);
      await expect(gameHolder(page)).toHaveCSS('min-height', '0px');
      const frameHeight = await gameFrame(page).evaluate((el) => ({ css: getComputedStyle(el).minHeight, px: el.getBoundingClientRect().height }));
      expect(frameHeight.px).toBeGreaterThanOrEqual(page.viewportSize()!.height);
      expect(frameHeight.css).toMatch(/^(100vh|\d+(?:\.\d+)?px)$/);
    });
  }
});
