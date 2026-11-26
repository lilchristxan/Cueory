import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Sudoku's per-level solve times follow the same 400 days as the other stats (Codex on #831): opening daily games or
 * any game page deletes older ones from storage, without opening the sudoku stats view or solving a puzzle.
 */
const today = '2026-11-01';
const old = { level: 'easy', day: '2025-09-27', seconds: 100 };
const recent = { level: 'hard', day: '2026-10-30', seconds: 600 };

for (const path of ['/play', '/play/pillo', '/play/sudoku']) {
  test(`opening ${path} deletes sudoku solve times older than 400 days`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${today}T15:00:00`));
    await markPanelsSeen(page);
    await page.addInitScript(({ old, recent }) => {
      try {
        localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
        // Seeded once, so the page's own cleanup is what the test sees after load.
        if (!sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1');
          localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: [old, recent] }));
        }
      } catch { /* optional storage */ }
    }, { old, recent });
    await page.goto(path);
    // A signed-out game page has no stats panel (2026-11-25); its island is the proof the page has loaded.
    const routeSurface = path === '/play' ? page.getByTestId('game-stats').getByRole('heading', { name: 'your stats' }) : page.locator('astro-island[component-url*="GameFrameStats"]:not([ssr])');
    if (path === '/play') await expect(routeSurface).toBeVisible();
    else { await expect(routeSurface).toHaveCount(1); await expect(page.getByTestId('game-frame-stats')).toHaveCount(0); }
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cueory-sudoku-stats') ?? 'null')?.solves))
      .toEqual([recent]);
  });

  test(`opening ${path} removes a sudoku record that holds only old solve times`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${today}T15:00:00`));
    await markPanelsSeen(page);
    await page.addInitScript((old) => {
      try {
        localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
        if (!sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1');
          localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: [old] }));
        }
      } catch { /* optional storage */ }
    }, old);
    await page.goto(path);
    // A signed-out game page has no stats panel (2026-11-25); its island is the proof the page has loaded.
    const routeSurface = path === '/play' ? page.getByTestId('game-stats').getByRole('heading', { name: 'your stats' }) : page.locator('astro-island[component-url*="GameFrameStats"]:not([ssr])');
    if (path === '/play') await expect(routeSurface).toBeVisible();
    else { await expect(routeSurface).toHaveCount(1); await expect(page.getByTestId('game-frame-stats')).toHaveCount(0); }
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cueory-sudoku-stats'))).toBeNull();
  });
}
