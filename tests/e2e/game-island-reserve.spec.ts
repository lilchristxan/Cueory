import { expect, test } from '@playwright/test';

/**
 * Performance (2026-11-19, rewritten for the Games v2 frame 2026-11-23): each game renders in the browser. The frame
 * keeps a full-screen minimum height before and after the game renders, so the footer does not jump when the game
 * appears, and without JavaScript the game's holder keeps no empty room.
 */
const games = [
  { path: '/play/pillo', script: /\/_astro\/PulseGame\.[\w-]+\.js$/ },
  { path: '/play/sudoku', script: /\/_astro\/SudokuGame\.[\w-]+\.js$/ },
  { path: '/play/word-path', script: /\/_astro\/SutureToday\.[\w-]+\.js$/ },
];

/** The board child that holds the game's island (the island is display: contents, so measure its holder). */
const gameHolder = (page: import('@playwright/test').Page) =>
  page.locator('article[data-game-page] .game-frame-board > *').filter({ has: page.locator('astro-island') }).first();

const gameFrame = (page: import('@playwright/test').Page) => page.locator('article[data-game-page] > .game-frame');

const top = (locator: import('@playwright/test').Locator) => locator.evaluate((el) => el.getBoundingClientRect().top);

// Games v2 (23 Nov): the board is meant to fit the first screen, so the game is no longer taller than one screen. What
// must hold instead is that the frame keeps a full-screen minimum height before and after the game renders, so the
// footer starts below the first screen and never moves up, and nothing inside the first screen moves.
for (const { path, script } of games) {
  test(`${path}: the frame keeps a full screen before and after the game renders and the footer does not move up`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(script, async (route) => { await held; await route.continue(); });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('game-frame-stats')).toBeAttached();
    const viewport = page.viewportSize()!.height;
    const frame = gameFrame(page);
    const footer = page.locator('footer').last();
    const back = page.getByTestId('all-games-link');
    const dateline = page.locator('.game-frame-dateline');

    // (a) While the island is empty the frame is at least one screen tall, so the footer starts below the first screen.
    expect(await frame.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(viewport);
    const footerBefore = await top(footer);
    expect(footerBefore).toBeGreaterThanOrEqual(viewport);
    const backBefore = await top(back);
    const datelineBefore = await top(dateline);

    release();
    // (b) Once the game is on the page the frame is still a full screen, the footer did not move up, and the first screen holds still.
    await expect.poll(() => gameHolder(page).evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');
    expect(await frame.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(viewport);
    expect(await top(footer)).toBeGreaterThanOrEqual(footerBefore);
    expect(await top(back)).toBe(backBefore);
    expect(await top(dateline)).toBe(datelineBefore);
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
