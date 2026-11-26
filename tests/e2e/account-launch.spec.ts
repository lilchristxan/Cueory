import { test, expect } from '@playwright/test';
import { kitLandingUrl, newsletter, signupState } from '../../src/config/site';

test('default launch switch keeps the account menu and the green launch-updates pop-up on the launch list', async ({ page }) => {
  await page.goto('/');
  const account = page.locator('[data-account-toggle]');
  await expect(account).toHaveAccessibleName('sign in, open account menu');
  await account.click();
  await expect(account).toHaveAccessibleName('sign in, close account menu');
  const menu = page.getByTestId('account-menu');
  await expect(menu.getByRole('link', { name: /create free account/ })).toHaveAttribute('href', '/#signup');
  await expect(menu.getByRole('link', { name: /sign in/ })).toHaveAttribute('href', '/#signup');
  await expect(menu.getByText('coming soon')).toHaveCount(2);
  // The brown promo panel is off; its "join the launch list" button is gone and the green pop-up carries the launch list.
  await expect(page.locator('[data-promo]')).toHaveCount(0);
  const popup = page.locator('[data-signup-popup]');
  if (signupState(newsletter.formAction, newsletter.landingUrl) === 'form') {
    await expect(popup.locator('form')).toHaveAttribute('action', newsletter.formAction);
  } else {
    await expect(popup.locator('[data-signup-popup-subscribe]')).toHaveAttribute('href', kitLandingUrl(newsletter.landingUrl)!);
  }
});
