import { expect, test } from '@playwright/test';

// wordpill was called vialo until 26 Nov 2026: the old address keeps working and sends visitors on, keeping a #hash.
test('/play/vialo goes on to /play/wordpill', async ({ page }) => {
  await page.goto('/play/vialo');
  await expect(page).toHaveURL(/\/play\/wordpill$/);
  await expect(page.getByTestId('vialo')).toBeVisible();
});

test('/play/vialo#print reaches the game and the back button does not return to the old address', async ({ page }) => {
  await page.goto('/play');
  await page.goto('/play/vialo#print');
  await expect(page).toHaveURL(/\/play\/wordpill(#print)?$/); // the game page handles #print and may clear it
  await page.goBack();
  await expect(page).toHaveURL(/\/play$/);
});

test('with JavaScript off the old address shows a plain link to the new one', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/play/vialo');
  await expect(page.getByTestId('old-vialo-link')).toHaveAttribute('href', '/play/wordpill');
  await context.close();
});
