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

// Leaving early is the point: the old address must not start any island chunk, or the browser has to cancel it (Firefox
// reports that as NS_BINDING_ABORTED) and the visitor downloads code for a page they never see.
test('/play/vialo leaves before it requests any script chunk, and nothing fails', async ({ page }) => {
  const chunksFromOldDocument: string[] = [];
  const failed: string[] = [];
  let leftOldAddress = false;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame() && /\/play\/wordpill$/.test(frame.url())) leftOldAddress = true; });
  page.on('request', (request) => {
    if (!leftOldAddress && new URL(request.url()).pathname.startsWith('/_astro/')) chunksFromOldDocument.push(request.url());
  });
  page.on('requestfailed', (request) => failed.push(request.url() + ' ' + (request.failure()?.errorText ?? '')));
  await page.goto('/play/vialo');
  await expect(page).toHaveURL(/\/play\/wordpill$/);
  await expect(page.getByTestId('vialo')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(chunksFromOldDocument).toEqual([]);
  expect(failed).toEqual([]);
});
