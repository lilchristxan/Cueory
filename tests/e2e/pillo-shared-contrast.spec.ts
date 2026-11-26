import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

// pillo's high contrast is the shared game setting (#734): one switch for every game, kept with the other shared
// settings, in the dialog the gear at the top left of the game opens (Christian's brief).

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture']));
    } catch { /* optional storage */ }
  });
});

test('pillo high contrast is the shared switch in the gear\'s dialog, remembered on this device', async ({ page }) => {
  await page.goto('/play/pillo');
  const pillo = page.getByTestId('pulse');
  await expect(pillo).toBeVisible();
  // One dialog from the gear (Christian's brief): pillo's own settings and the shared ones, so one high contrast switch.
  const gear = page.getByRole('button', { name: 'pillo settings' });
  const dialog = page.getByRole('dialog', { name: 'pillo settings' });
  await gear.click();
  await expect(dialog.getByRole('checkbox', { name: /high contrast/ })).toHaveCount(1);
  await expect(dialog.getByRole('switch', { name: /high contrast/ })).toHaveCount(0);
  const contrast = dialog.getByRole('checkbox', { name: /high contrast/ });
  await expect(contrast).not.toBeChecked();

  await contrast.press('Space');
  await expect(contrast).toBeChecked();
  await expect(pillo).toHaveClass(/pillo-contrast/);
  await expect(page.locator('html')).toHaveAttribute('data-game-contrast', 'high');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('cueory-game-settings')))!)).toMatchObject({ highContrast: true });

  // Turning it off there turns pillo's high contrast off too.
  await contrast.uncheck();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(gear).toBeFocused();
  await expect(pillo).not.toHaveClass(/pillo-contrast/);
  await expect(page.locator('html')).not.toHaveAttribute('data-game-contrast', /.*/);

  // Turned on again, it is still on after a reload, and other games' pages follow it.
  await gear.click();
  await contrast.check();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('pulse')).toHaveClass(/pillo-contrast/);
  await page.getByRole('button', { name: 'pillo settings' }).click();
  await expect(dialog.getByRole('checkbox', { name: /high contrast/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await page.goto('/play/crossword');
  await expect(page.locator('html')).toHaveAttribute('data-game-contrast', 'high');
});
