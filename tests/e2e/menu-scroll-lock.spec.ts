import { expect, test, type Page } from '@playwright/test';

// The page behind the open site menu must not scroll, and closing the menu must put the page back where it was.
// A link to a spot on the same page must still take the visitor there.

async function prepare(page: Page, path: string) {
  // The once-only promo panel (D-59) and sign-up pop-up would sit over the page, so they count as already shown.
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

test.describe('site menu and the page behind it', () => {
  test('the page is fixed in place while the menu is open and returns to the same spot on close', async ({ page }) => {
    await prepare(page, '/about');
    await page.evaluate(() => window.scrollTo(0, 300));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    // The top bar's button can be hidden while scrolled down, and clicking would scroll it into view first.
    await page.locator('[data-menu-open]').first().dispatchEvent('click');
    const dialog = page.locator('#site-menu');
    await expect(dialog).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('position', 'fixed');
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('"ways to study" on the home page still scrolls to that section', async ({ page }) => {
    await prepare(page, '/');
    await page.locator('[data-menu-open]').first().click();
    const dialog = page.locator('#site-menu');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('link', { name: 'ways to study' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#ways-to-study$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  });
});
