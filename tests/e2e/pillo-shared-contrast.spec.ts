import { expect, test } from '@playwright/test';

// pillo's high contrast switch is the shared game setting (#734, lane8/settings-pillo): one switch for every game, kept
// with the other shared settings, and the same in pillo's own settings and in game settings at the top of /play.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture']));
    } catch { /* optional storage */ }
  });
});

test('pillo high contrast and the shared high contrast are one switch, remembered on this device', async ({ page }) => {
  await page.goto('/play');
  const pillo = page.getByTestId('pulse');
  await expect(pillo).toBeVisible();
  await pillo.getByText('pillo settings').click();
  const pilloSwitch = pillo.getByRole('switch', { name: /high contrast/ });
  await expect(pilloSwitch).toHaveAttribute('aria-checked', 'false');

  await pilloSwitch.press('Enter');
  await expect(pilloSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(pillo).toHaveClass(/pillo-contrast/);
  await expect(page.locator('html')).toHaveAttribute('data-game-contrast', 'high');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('cueory-game-settings')))!)).toMatchObject({ highContrast: true });

  // The shared panel shows the same choice, and turning it off there turns pillo's off too.
  await page.getByTestId('game-settings-button').click();
  const dialog = page.getByRole('dialog', { name: 'game settings' });
  const shared = dialog.getByRole('checkbox', { name: /high contrast/ });
  await expect(shared).toBeChecked();
  await shared.uncheck();
  await page.keyboard.press('Escape');
  await expect(pilloSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(pillo).not.toHaveClass(/pillo-contrast/);
  await expect(page.locator('html')).not.toHaveAttribute('data-game-contrast', /.*/);

  // Turned on again, it is still on after a reload.
  await pilloSwitch.click();
  await page.reload();
  await expect(page.getByTestId('pulse')).toHaveClass(/pillo-contrast/);
  await page.getByTestId('pulse').getByText('pillo settings').click();
  await expect(page.getByTestId('pulse').getByRole('switch', { name: /high contrast/ })).toHaveAttribute('aria-checked', 'true');
});
