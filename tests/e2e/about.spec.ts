import { expect, test } from '@playwright/test';

test.describe('about page', () => {
  test('renders the four sections with real copy and no placeholders', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'about cueory' })).toBeVisible();

    for (const name of ['our mission', 'who we are', 'how content is made', 'support us']) {
      const heading = page.getByRole('heading', { level: 2, name });
      await expect(heading).toBeVisible();
      // Each section carries a real paragraph, not a note to the founder.
      const section = page.locator('section', { has: heading });
      await expect(section.locator('p').first()).not.toBeEmpty();
      await expect(section).not.toContainText('[Christian writes this]');
    }

    await expect(page.locator('[data-placeholder="CHRISTIAN-TEXT"]')).toHaveCount(0);

    const supportLink = page.getByRole('link', { name: 'visit our support page' });
    await expect(supportLink).toBeVisible();
    await expect(supportLink).toHaveAttribute('href', '/support');
  });
});

test.describe('legal pages', () => {
  for (const [path, heading] of [
    ['/terms', 'terms of use'],
    ['/disclaimer', 'disclaimer'],
    ['/privacy', 'privacy, in plain language'],
  ] as const) {
    test(`${path} shows a last-updated date and no draft markers`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText(/^Last updated: \d{1,2} [A-Z][a-z]+ \d{4}\.?$/)).toBeVisible();
      const body = page.locator('body');
      await expect(body).not.toContainText('Draft for review');
      await expect(body).not.toContainText('Placeholder:');
      await expect(body).not.toContainText('Christian:');
    });
  }
});
