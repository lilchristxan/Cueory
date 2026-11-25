import { expect, test } from '@playwright/test';
import { visibleFooterLinks } from '../../src/config/legalfooter';
import { footerLinks } from '../../src/config/site';

// The footer as drawn (the home boards, 2026-11-24): one centered row of five small underlined links (about us, privacy,
// terms, disclaimer, contact), visible without opening anything and with no hairline above it. The flag stands at the
// row's left end and the chevron at its right end; the extras panel behind the chevron holds the logo, the pages the row
// leaves out (courses, coming soon, support cueory) and the theme switch.
const rowHrefs = ['/about', '/privacy', '/terms', '/disclaimer', '/message'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
  await page.goto('/about');
});

test('every footer link is visible without opening the panel, centered, underlined, in order', async ({ page }) => {
  const footer = page.locator('[data-site-footer]');
  await expect(footer.locator('[data-footer-toggle]')).toHaveAttribute('aria-expanded', 'false');
  const nav = footer.getByRole('navigation', { name: 'footer' });
  const expected = visibleFooterLinks(footerLinks).filter((link) => rowHrefs.includes(link.href));
  const links = nav.getByRole('link');
  await expect(links).toHaveCount(expected.length);
  for (const [index, link] of expected.entries()) {
    const item = links.nth(index);
    await item.scrollIntoViewIfNeeded();
    await expect(item).toHaveText(link.label);
    await expect(item).toHaveAttribute('href', link.href);
    await expect(item).toBeVisible();
    await expect(item).toHaveCSS('text-decoration-line', 'underline');
  }
  // As drawn: no hairline above the footer, links centered on the page.
  await expect(footer).toHaveCSS('border-top-width', '0px');
  const box = (await nav.locator('ul').boundingBox())!;
  const first = (await links.first().boundingBox())!;
  const last = (await links.last().boundingBox())!;
  const width = page.viewportSize()!.width;
  const left = first.x;
  const right = width - (last.x + last.width);
  if (box.height < 60) expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
});

test('the open report panel sits above the link row and covers no footer link', async ({ page }) => {
  const footer = page.locator('[data-site-footer]');
  const nav = footer.getByRole('navigation', { name: 'footer' });
  const flag = footer.getByRole('button', { name: 'flag or comment', exact: true });
  await flag.click();
  const panel = footer.locator('#footer-flag div[tabindex="-1"]');
  await expect(panel).toBeVisible();
  const panelBox = (await panel.boundingBox())!;
  const navBox = (await nav.boundingBox())!;
  const flagBox = (await flag.boundingBox())!;
  // The panel ends above the row and starts in line with the flag.
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(navBox.y);
  expect(Math.abs(panelBox.x - flagBox.x)).toBeLessThanOrEqual(1);
  // No link is covered, even partly (a partly covered link fails axe's target-size rule).
  for (const link of await nav.getByRole('link').all()) {
    const box = (await link.boundingBox())!;
    const covered =
      box.x < panelBox.x + panelBox.width && box.x + box.width > panelBox.x &&
      box.y < panelBox.y + panelBox.height && box.y + box.height > panelBox.y;
    expect(covered, (await link.textContent()) ?? '').toBe(false);
  }
  // It stays on the screen.
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('the flag and the chevron stay, and the extras panel holds the logo home link, the other pages and the theme switch', async ({ page }) => {
  const footer = page.locator('[data-site-footer]');
  await expect(footer.getByRole('button', { name: 'flag or comment' })).toBeVisible();
  await expect(footer.getByRole('link', { name: /home$/ })).toBeHidden();
  const toggle = footer.locator('[data-footer-toggle]');
  await toggle.click();
  const panel = page.locator('#site-footer-panel');
  await expect(panel.getByRole('link', { name: /home$/ })).toBeVisible();
  for (const name of ['courses', 'coming soon', 'support cueory']) {
    await expect(panel.getByRole('navigation', { name: 'more pages' }).getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(panel.getByRole('group', { name: 'Theme' })).toBeVisible();
  await expect(panel.getByText(/study help, not medical advice/)).toBeVisible();
  await toggle.click();
  await expect(panel).toBeHidden();
  // The links stay on screen while the panel is closed.
  await expect(footer.getByRole('navigation', { name: 'footer' })).toBeVisible();
});
