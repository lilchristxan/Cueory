import { expect, test } from '@playwright/test';

const pages = [
  ['/terms', 'terms of use', 'this page is being prepared. please check back for the final terms of use.'],
  ['/disclaimer', 'disclaimer', 'this page is being prepared. please check back for the final disclaimer.'],
] as const;

for (const [path, heading, notice] of pages) {
  test(`${path} shows a visitor-facing preparation notice`, async ({ page }) => {
    await page.goto(path);

    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(notice, { exact: true })).toBeVisible();
    await expect(page.getByText(/Christian: paste/i)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
