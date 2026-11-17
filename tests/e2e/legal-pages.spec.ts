import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { site } from '../../src/config/site';

// /terms and /disclaimer with Christian's approved text: dated, readable at 320px with 32px text, accessible in Light
// and Evening, and their links (/disclaimer, /privacy, the contact email) work.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

const pages = [
  { path: '/terms', heading: 'terms of use', links: ['/disclaimer', '/privacy'] as string[] },
  { path: '/disclaimer', heading: 'disclaimer', links: ['/terms', '/privacy'] },
] as const;

async function noSideways(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(0);
}

for (const legal of pages) {
  test(`${legal.path} shows final, dated text with no placeholder`, async ({ page }) => {
    await page.goto(legal.path);
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1, name: legal.heading, exact: true })).toBeVisible();
    await expect(main.getByText(/^Last updated \d{1,2} [A-Z][a-z]+ \d{4}$/)).toBeVisible();
    await expect(main).not.toContainText(/Christian:|paste your|Placeholder:/);
    const mail = main.locator(`a[href="mailto:${site.contactEmail}"]`);
    expect(await mail.count()).toBeGreaterThan(0);
    await expect(mail.first()).toHaveText(site.contactEmail);
  });

  for (const href of legal.links) {
    test(`${legal.path} links to ${href}`, async ({ page }) => {
      await page.goto(legal.path);
      await page.locator('main').locator(`a[href="${href}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator('main h1')).toBeVisible();
    });
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${legal.path} in ${colorScheme === 'light' ? 'Light' : 'Evening'}`, () => {
      test.use({ colorScheme });

      test('passes axe', async ({ page }) => {
        await page.goto(legal.path);
        // The same WCAG rule set as the site's other page specs.
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
      });

      test('fits 320px with 32px text', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 700 });
        await page.goto(legal.path);
        await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
        await expect(page.locator('html')).toHaveCSS('font-size', '32px');
        await noSideways(page);
      });
    });
  }
}
