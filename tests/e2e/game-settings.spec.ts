import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { markGameRulesSeen } from './clock';

test.beforeEach(async ({ page }) => { await markGameRulesSeen(page); });

// Issue #734: the shared game settings (theme, high contrast, reduced motion, sound), from a game's gear (Christian's
// brief: word path's gear holds only the shared ones).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

test('opens as a focus-trapped dialog that Escape closes, returning focus to its button', async ({ page }) => {
  await page.goto('/play/word-path');
  const button = page.getByTestId('game-frame-gear');
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'piccline settings' });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole('button', { name: 'close settings' });
  await expect(close).toBeFocused();
  const closeBox = await close.boundingBox();
  expect(closeBox!.width).toBeGreaterThanOrEqual(44);
  expect(closeBox!.height).toBeGreaterThanOrEqual(44);

  // The last stop is now piccline's own "show the timer" switch (the game's own settings follow the shared ones).
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('checkbox', { name: /show the timer/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('checkbox', { name: /game sounds/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="game-settings"]')))).toBe(true);
  }

  expect((await new AxeBuilder({ page }).include('[data-testid="game-settings"]').analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('high contrast, reduced motion and sound are remembered and applied to the page', async ({ page }) => {
  await page.goto('/play/word-path');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-game-contrast', /.*/);
  await page.getByTestId('game-frame-gear').click();
  const dialog = page.getByRole('dialog', { name: 'piccline settings' });
  await dialog.getByRole('checkbox', { name: /high contrast/ }).check();
  await dialog.getByRole('group', { name: 'motion' }).getByRole('radio', { name: /always reduce/ }).check();
  await dialog.getByRole('checkbox', { name: /game sounds/ }).uncheck();
  await expect(html).toHaveAttribute('data-game-contrast', 'high');
  await expect(html).toHaveAttribute('data-game-motion', 'reduce');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('cueory-game-settings')))!))
    .toEqual({ highContrast: true, motion: 'reduce', sound: false });
  // High contrast swaps soft text to the main ink, so both read the same color.
  const [soft, ink] = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return [style.getPropertyValue('--color-ink-soft').trim(), style.getPropertyValue('--color-ink').trim()];
  });
  expect(soft).toBe(ink);

  await page.reload();
  await expect(html).toHaveAttribute('data-game-contrast', 'high');
  await expect(html).toHaveAttribute('data-game-motion', 'reduce');

  await page.getByTestId('game-frame-gear').click();
  await dialog.getByRole('checkbox', { name: /high contrast/ }).uncheck();
  await dialog.getByRole('group', { name: 'motion' }).getByRole('radio', { name: /follow device/ }).check();
  await dialog.getByRole('checkbox', { name: /game sounds/ }).check();
  await expect(html).not.toHaveAttribute('data-game-contrast', /.*/);
  await expect(html).not.toHaveAttribute('data-game-motion', /.*/);
  expect(await page.evaluate(() => localStorage.getItem('cueory-game-settings'))).toBeNull();
});

test('reduced motion follows the device by default', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play/word-path');
  await expect(page.getByTestId('game-frame-gear')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-game-motion', 'reduce');
  await page.getByTestId('game-frame-gear').click();
  await expect(page.getByRole('dialog').getByRole('group', { name: 'motion' }).getByRole('radio', { name: /follow device/ })).toBeChecked();
});

test('the theme slider drives the site theme switch', async ({ page }) => {
  await page.goto('/play/word-path');
  await page.getByTestId('game-frame-gear').click();
  const theme = page.getByRole('dialog').getByRole('group', { name: 'theme' });
  await theme.getByRole('radio', { name: /dark mode/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('cueory-theme'))).toBe('dark');
  await theme.getByRole('radio', { name: /follow device/ }).check();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`fits the screen without sideways scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/play/word-path');
    await page.getByTestId('game-frame-gear').click();
    const box = await page.locator('.game-settings').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
