import { expect, test, type Page } from '@playwright/test';

/**
 * Performance (2026-11-19): the /play hub's stats render in the browser. While each island is still empty,
 * the stats holder keeps the room the island will take (src/styles/playhub.css), so the sample note, the stats and the
 * footer do not jump when they appear: each either stays put (within a few pixels) or stays below the first screen.
 */
const islands = /\/_astro\/(GameStatsPanel)\.[\w-]+\.js$/;

const tops = (page: Page) =>
  page.evaluate(() =>
    ['[data-testid="sample-note"]', 'footer'].map((selector) => document.querySelector(selector)!.getBoundingClientRect().top),
  );

test('/play: what follows the cards and stats does not move into or within the first screen when they render', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-promo-seen', String(Date.now()));
    localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(islands, async (route) => { await held; await route.continue(); });
  await page.goto('/play', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sample-note')).toBeAttached();
  const viewport = page.viewportSize()!.height;
  const before = await tops(page);

  release();
  await expect(page.getByTestId('play-status')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('game-stats')).toBeAttached({ timeout: 30_000 });
  for (const holder of ['.play-hub-stats']) {
    await expect.poll(() => page.locator(holder).evaluate((el) => getComputedStyle(el).minHeight)).toBe('0px');
  }
  const after = await tops(page);
  before.forEach((top, i) => {
    const offscreen = top >= viewport && after[i] >= viewport;
    expect(offscreen || Math.abs(after[i] - top) <= 8, `element ${i}: ${top} -> ${after[i]} (screen ${viewport})`).toBe(true);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('/play: no empty room is kept for islands that cannot load', async ({ page }) => {
    await page.goto('/play');
    await expect(page.locator('.play-hub-stats')).toHaveCSS('min-height', '0px');
  });
});
