import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * The settings dialog never transitions under reduced motion. The blanket 0.01ms rule makes every property transition
 * for a frame, and in WebKit/Firefox axe then reads a half-switched color after the theme rows change the palette
 * (sudoku layout spec, release run 44316784377). transition-property must be "none" for the card and its content.
 */
test('settings dialog content has no transition under reduced motion, before and after a theme switch', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional */ }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/play/sudoku');
  await page.getByRole('button', { name: /settings/ }).click();
  const dialog = page.getByRole('dialog', { name: 'settings' });
  await expect(dialog).toBeVisible();
  const transitions = () => dialog.locator('.game-settings, .game-settings *').evaluateAll((elements) =>
    [...new Set(elements.map((element) => getComputedStyle(element).transitionProperty))]);
  expect(await transitions()).toEqual(['none']);
  await dialog.getByRole('group', { name: 'theme' }).getByRole('radio', { name: /^dark mode/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await transitions()).toEqual(['none']);
});
