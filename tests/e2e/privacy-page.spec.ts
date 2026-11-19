import { expect, test } from '@playwright/test';
import { site } from '../../src/config/site';

// The site-wide welcome panel is tested elsewhere. Keep it from interrupting
// a privacy-page link or keyboard interaction halfway through this page spec.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // The policy must remain readable when browser storage is unavailable.
    }
  });
});

test.describe('Task 422: privacy page', () => {
  test('explains each kind of data in a readable, organized document', async ({ page }) => {
    await page.goto('/privacy');
    const main = page.getByRole('main');

    await expect(main.getByRole('heading', { level: 1 })).toHaveText('privacy, in plain language');
    for (const heading of [
      'Studying on this device',
      'Playing daily games',
      'Settings and reminders',
      'Joining the launch email list',
      'Contacting Cueory',
      'Tips, videos and social links',
      'Hosting and visit statistics',
      'Children’s information',
      'Your information and questions',
    ]) {
      await expect(main.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
    }

    // The notice describes keys in plain words (tests/unit/privacy-keys.test.ts checks each one) and names only the
    // signup pop-up's key.
    await expect(main.locator('code')).toHaveText(['cueory-signup-popup-seen']);
    await expect(main.getByText('Effective 19 November 2026', { exact: true })).toBeVisible();
  });

  test('offers working links to view or manage device progress and daily games', async ({ page }) => {
    await page.goto('/privacy');
    const main = page.getByRole('main');

    const progress = main.locator('a[href="/progress"]').first();
    await expect(progress).toBeVisible();
    await progress.click();
    await expect(page).toHaveURL(/\/progress\/?$/);
    await expect(page.getByRole('main')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/privacy\/?$/);

    const games = page.getByRole('main').locator('a[href="/play"]');
    await expect(games).toBeVisible();
    await games.click();
    await expect(page).toHaveURL(/\/play\/?$/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('provides a usable contact address without preloading a lesson video', async ({ page }) => {
    const videoRequests: string[] = [];
    page.on('request', (request) => {
      const host = new URL(request.url()).hostname;
      if (host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com') ||
          host === 'youtube.com' || host.endsWith('.youtube.com')) {
        videoRequests.push(request.url());
      }
    });

    await page.goto('/privacy');
    const main = page.getByRole('main');
    const email = main.locator(`a[href="mailto:${site.contactEmail}"]`, { hasText: site.contactEmail });
    await expect(email.first()).toBeVisible();
    await expect(main.getByRole('link', { name: 'Email Cueory', exact: true })).toHaveAttribute('href', `mailto:${site.contactEmail}`);
    await expect(main.locator('iframe')).toHaveCount(0);
    expect(videoRequests).toEqual([]);
  });
});

test('links to the other legal pages and to each outside privacy policy it names', async ({ page }) => {
  await page.goto('/privacy');
  const main = page.getByRole('main');
  for (const [name, href] of [
    ['Terms of Use', '/terms'],
    ['Disclaimer', '/disclaimer'],
    ['Kit signup page', 'https://cueory.kit.com/bfd9609b46'],
    ['Kit privacy policy', 'https://kit.com/privacy'],
    ['Ko-fi privacy policy', 'https://more.ko-fi.com/privacy'],
    ['Google privacy policy', 'https://policies.google.com/privacy'],
    ['Cloudflare privacy policy', 'https://www.cloudflare.com/privacypolicy/'],
  ] as const) {
    await expect(main.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }
  await main.getByRole('link', { name: 'Terms of Use', exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
});

test('is final, indexable and available to site search', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('main')).not.toContainText('Draft for review.');
  await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('main[data-pagefind-body]')).toHaveCount(1);
  await expect(page.getByRole('main').getByText('Effective 19 November 2026', { exact: true })).toBeVisible();
});
