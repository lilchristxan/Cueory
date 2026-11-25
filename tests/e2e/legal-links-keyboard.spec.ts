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

// The boards' footer is one row (about us, privacy, terms, disclaimer, contact) in this order, between the flag and the
// chevron; the other pages (courses, coming soon, support cueory) sit in the extras panel the chevron opens.
const rowHrefs = ['/about', '/privacy', '/terms', '/disclaimer', '/message'];

test('footer links: Tab reaches each one in order with a visible focus ring', async ({ page }) => {
  await page.goto('/privacy');
  const footer = page.getByRole('contentinfo');
  const shown = visibleFooterLinks(footerLinks);
  const row = shown.filter((link) => rowHrefs.includes(link.href));
  const panel = shown.filter((link) => !rowHrefs.includes(link.href));

  // The row is always there: from the flag, Tab walks its links in order.
  await footer.getByRole('button', { name: 'flag or comment' }).focus();
  for (const link of row) {
    await page.keyboard.press('Tab');
    await expectVisibleFocus(footer.locator(`nav[aria-label="footer"] a[href=${JSON.stringify(link.href)}]`));
  }

  // Then the chevron, which opens the panel; its logo link comes first, then the rest in order.
  await page.keyboard.press('Tab');
  const toggle = footer.locator('[data-footer-toggle]');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab'); // the small logo (home)
  for (const link of panel) {
    await page.keyboard.press('Tab');
    await expectVisibleFocus(footer.locator(`nav[aria-label="more pages"] a[href=${JSON.stringify(link.href)}]`));
  }
});

test('footer privacy link opens with Enter', async ({ page }) => {
  await page.goto('/support');
  const footer = page.getByRole('contentinfo');
  // "privacy" is in the always-visible row, which comes before the chevron; start at the flag, the row's first control.
  await footer.getByRole('button', { name: 'flag or comment' }).focus();
  const privacy = footer.getByRole('link', { name: 'privacy', exact: true });
  await tabTo(page, privacy);
  await expectVisibleFocus(privacy);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/privacy$/);
});

// The side bar no longer lists the legal pages; they sit in the links section of the about page.
test('about page legal links: Tab reaches each shown one with a visible focus ring', async ({ page }) => {
  await page.goto('/about');
  const section = page.getByTestId('about-links');
  for (const link of visibleFooterLinks(menuSmallLinks)) {
    const target = section.locator(`a[href=${JSON.stringify(link.href)}]`).first();
    await tabTo(page, target, 80);
    await expectVisibleFocus(target);
  }
});

test('menu rows: Tab reaches each with a visible focus ring', async ({ page }) => {
  await page.goto('/support');
  const open = page.getByRole('button', { name: 'open site menu', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByTestId('site-menu');
  await expect(menu).toBeVisible();
  for (const href of ['/courses', '/play', '/support', '/about']) {
    const target = menu.locator(`nav a[href=${JSON.stringify(href)}]`).first();
    await tabTo(page, target);
    await expectVisibleFocus(target);
  }
});
