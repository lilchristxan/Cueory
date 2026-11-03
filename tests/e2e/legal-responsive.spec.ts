import { expect, test } from '@playwright/test';

test('privacy copy wraps long storage keys on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/privacy');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const longKey = page.getByText('cueory-guest-imported:<id>', { exact: true });
  await expect(longKey).toBeVisible();
  const box = await longKey.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(350);
});
