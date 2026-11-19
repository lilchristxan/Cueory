import { expect, test, type Locator, type Page } from '@playwright/test';

// The footer and the site menu at 320px wide with 32px root text, in Light and Evening: links wrap and stay on
// screen, every footer link and button is at least 44 × 44, and the theme switch can be used.

async function expectTarget(page: Page, control: Locator, name: string) {
  await control.scrollIntoViewIfNeeded();
  const box = (await control.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.width, name).toBeGreaterThanOrEqual(44);
  expect(box.height, name).toBeGreaterThanOrEqual(44);
  expect(box.x, name).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, name).toBeLessThanOrEqual(width);
}

async function sideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`footer and site menu at 320px with 32px text (${colorScheme === 'light' ? 'Light' : 'Evening'})`, () => {
    test.use({ viewport: { width: 320, height: 700 }, colorScheme, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      // The once-only promo panel (D-59) would sit over the footer, so it counts as already shown.
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
      });
      await page.goto('/about');
      await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveCSS('font-size', '32px');
    });

    test('footer links wrap with 44px targets and the theme switch works', async ({ page }) => {
      const footer = page.locator('[data-site-footer]');
      await footer.locator('[data-footer-toggle]').click();
      const panel = page.locator('#site-footer-panel');
      await expect(panel).toBeVisible();
      expect(await sideways(page)).toBeLessThanOrEqual(0);

      // The link row is drawn above the bar and is always visible; its links keep 44 px targets too.
      for (const link of await footer.getByRole('navigation', { name: 'footer' }).getByRole('link').all()) {
        await expectTarget(page, link, (await link.textContent())?.trim() || 'footer link');
      }
      for (const link of await panel.getByRole('link').all()) {
        if (!(await link.isVisible())) continue;
        await expectTarget(page, link, (await link.textContent())?.trim() || (await link.getAttribute('aria-label')) || 'link');
      }
      await expectTarget(page, footer.locator('[data-footer-toggle]'), 'footer links toggle');
      await expectTarget(page, footer.getByRole('button', { name: 'flag or comment' }), 'flag or comment');

      const theme = panel.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Dark' });
      // The radio covers its whole option (ThemePicker.astro), so its box is the tap target.
      await expectTarget(page, theme, 'dark theme option');
      await theme.tap();
      await expect(theme).toBeChecked();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    });

    test('site menu links wrap on screen with 44px targets', async ({ page }) => {
      await page.getByRole('button', { name: 'open site menu' }).click();
      const menu = page.getByRole('dialog', { name: 'site menu' });
      await expect(menu).toBeVisible();
      await expectTarget(page, menu.getByRole('button', { name: 'close site menu' }), 'close site menu');
      for (const link of await menu.getByRole('navigation', { name: 'site' }).getByRole('link').all()) {
        await expectTarget(page, link, (await link.textContent())?.trim() || 'menu link');
      }
      expect(await menu.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    });
  });
}
