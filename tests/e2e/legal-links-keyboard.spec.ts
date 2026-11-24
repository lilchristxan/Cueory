import { expect, test, type Locator, type Page } from '@playwright/test';
import { visibleFooterLinks } from '../../src/config/legalfooter';
import { footerLinks, menuSmallLinks } from '../../src/config/site';

// Footer and menu legal links (#747): keyboard only, each reachable by Tab, each with a visible focus ring, and Enter
// opens it. Expectations come from the same rule the pages use, so they follow a legal page's approval on their own.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* blocked storage */ }
  });
});

async function expectVisibleFocus(link: Locator) {
  await expect(link).toBeFocused();
  const ring = await link.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThan(0);
}

/** Presses Tab until `link` has focus (at most `limit` presses). */
async function tabTo(page: Page, link: Locator, limit = 40) {
  for (let i = 0; i < limit; i++) {
    if (await link.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
}

test('footer links: Tab reaches each one in order with a visible focus ring', async ({ page }) => {
  await page.goto('/privacy');
  const footer = page.getByRole('contentinfo');
  const toggle = footer.locator('[data-footer-toggle]');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  for (const link of visibleFooterLinks(footerLinks)) {
    await page.keyboard.press('Tab');
    await expectVisibleFocus(footer.locator(`nav[aria-label="footer"] a[href=${JSON.stringify(link.href)}]`));
  }
});

test('footer privacy link opens with Enter', async ({ page }) => {
  await page.goto('/support');
  const footer = page.getByRole('contentinfo');
  await footer.locator('[data-footer-toggle]').focus();
  await page.keyboard.press('Enter');
  const privacy = footer.getByRole('link', { name: 'privacy', exact: true });
  await tabTo(page, privacy);
  await expectVisibleFocus(privacy);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/privacy$/);
});

test('menu legal links: Tab reaches each shown one with a visible focus ring', async ({ page }) => {
  await page.goto('/support');
  const open = page.getByRole('button', { name: 'open site menu', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByTestId('site-menu');
  await expect(menu).toBeVisible();
  for (const link of visibleFooterLinks(menuSmallLinks)) {
    const target = menu.locator(`a[href=${JSON.stringify(link.href)}]`).first();
    await tabTo(page, target);
    await expectVisibleFocus(target);
  }
});
