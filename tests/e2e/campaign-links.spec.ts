import { expect, test } from '@playwright/test';

// A campaign link is a real page (so the page-visit statistics count it) that then sends the visitor to the home page.
test('a campaign link forwards to the home page', async ({ page }) => {
  await page.goto('/from/tiktok', { waitUntil: 'commit' });
  await page.waitForURL((url) => url.pathname === '/');
  await expect(page).toHaveURL(/\/$/);
});

test('a campaign link works without JavaScript: the page stays, with a link to the home page', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/from/flyer');
  await expect(page.getByRole('heading', { level: 1, name: 'welcome to cueory' })).toBeVisible();
  await expect(page.getByTestId('campaign-link-home')).toHaveAttribute('href', '/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await context.close();
});
