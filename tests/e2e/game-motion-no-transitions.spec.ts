import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * The games' own "reduce motion" setting (data-game-motion="reduce") follows the site's reduced-motion rule: nothing
 * transitions, so a theme switch lands in one step and text reads in its new color at once (engine run 44460645965,
 * E2). This runs with the device NOT asking for reduced motion, so only the game setting is in play.
 */
test('with the game setting on reduce, a theme switch starts no transition and text is Ivory at once', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-settings', JSON.stringify({ highContrast: false, motion: 'reduce', sound: true }));
    } catch { /* optional storage */ }
  });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.goto('/play/sudoku');
  await expect(page.locator('html')).toHaveAttribute('data-game-motion', 'reduce');
  await expect(page.locator('h1')).toBeVisible();
  const result = await page.evaluate(async () => {
    const runs: string[] = [];
    document.addEventListener('transitionrun', (event) => {
      runs.push((event.target as Element).tagName.toLowerCase() + ' ' + (event as TransitionEvent).propertyName);
    }, true);
    document.documentElement.dataset.theme = 'dark';
    const now = { root: getComputedStyle(document.documentElement).color, heading: getComputedStyle(document.querySelector('h1')!).color };
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { now, runs };
  });
  expect(result.now.root).toBe('rgb(249, 245, 239)');
  expect(result.now.heading).toBe('rgb(249, 245, 239)');
  expect(result.runs).toEqual([]);
});
