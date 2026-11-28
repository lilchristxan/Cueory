import { expect, test, type Page } from '@playwright/test';
import { site, socials } from '../../src/config/site';

/**
 * The once-only promo panel (D-59) is switched off (Christian, 2026-11-25): the green launch-updates pop-up is the only
 * marketing pop-up. These tests always run and check the shipped page; they do not read the `promo.show` flag.
 * tests/unit/promo.test.ts pins the flag itself, and the panel's logic stays covered there (src/scripts/promo.ts).
 */
const KEY = 'cueory-promo-seen';
const promoPanel = (page: Page) => page.getByRole('dialog', { name: 'welcome to cueory.' });

/** Lets the page's clock run, as if the visitor had waited that long. */
const wait = (page: Page, ms: number) => page.clock.runFor(ms);

test.describe('promo panel switched off (promo.show is false)', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-11-18T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1_000));
  });

  test('is never rendered or shown on any marketing page, even with nothing remembered, after a delay or a scroll', async ({ page }) => {
    for (const path of ['/', '/about', '/support', '/privacy', '/courses']) {
      // The page itself must have loaded: an error page has no promo markup either, and would pass the checks below.
      const response = await page.goto(path);
      expect(response?.status(), `${path}: status`).toBe(200);
      expect(new URL(page.url()).pathname.replace(/(.)\/$/, '$1'), `${path}: final address`).toBe(path);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await wait(page, 10_000);
      await expect(page.locator('[data-promo]'), path).toHaveCount(0);
      await expect(page.getByTestId('promo'), path).toHaveCount(0);
      await expect(promoPanel(page), path).toHaveCount(0);
    }
  });

  test('leaves its date alone: nothing is written to local storage by the panel', async ({ page }) => {
    await page.goto('/');
    await wait(page, 10_000);
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  });

  test('the supporting-our-mission page and the social links stay reachable from the footer', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('[data-site-footer]');
    // The footer keeps "support cueory" behind its "show footer links" button.
    await footer.getByRole('button', { name: 'show footer links', exact: true }).click();
    await expect(footer.getByRole('link', { name: 'support cueory' })).toHaveAttribute('href', '/support');
    for (const social of socials.filter((entry) => entry.href)) {
      await expect(footer.getByRole('link', { name: `cueory on ${social.name} (opens in a new tab)` })).toHaveAttribute('href', social.href);
    }
    await page.goto('/support');
    await expect(page.getByRole('heading', { level: 1, name: 'supporting our mission' })).toBeVisible();
    if (site.tipPageUrl) {
      await expect(page.locator(`main a[href="${site.tipPageUrl}"]`).first()).toBeVisible();
    }
  });
});
