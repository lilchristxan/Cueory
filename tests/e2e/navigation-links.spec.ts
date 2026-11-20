import { expect, test } from '@playwright/test';
import { visibleFooterLinks } from '../../src/config/legalfooter';
import { footerLinks, menuLinks, menuSmallLinks } from '../../src/config/site';

// Keyboard theme behavior is already covered by footer-theme.spec.ts. This
// regression adds actual navigation for each configured internal destination.
for (const surface of ['footer', 'menu'] as const) {
  // #747: the footer shows only approved legal pages (and always Privacy).
  const links = surface === 'footer' ? visibleFooterLinks(footerLinks) : [...menuLinks, ...visibleFooterLinks(menuSmallLinks)];
  for (const href of [...new Set(links.map(link => link.href))].filter(href => href.startsWith('/'))) {
    test(`${surface} opens ${href}`, async ({ page }) => {
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* blocked storage */ }
      });
      await page.goto('/privacy');
      if (surface === 'footer') {
        await page.getByRole('contentinfo').locator('[data-footer-toggle]').click();
      } else {
        await page.getByRole('button', { name: 'open site menu', exact: true }).click();
      }
      const root = surface === 'footer' ? page.getByRole('contentinfo') : page.getByTestId('site-menu');
      const destination = root.locator(`a[href=${JSON.stringify(href)}]`).first();
      await expect(destination).toBeVisible();
      const expected = new URL(href, page.url()).href;
      await destination.click();
      await expect(page).toHaveURL(expected);
      await expect(page.locator('main')).toBeVisible();
    });
  }
}

test('footer leaves out legal pages that are not approved yet', async ({ page }) => {
  await page.goto('/privacy');
  const footer = page.getByRole('contentinfo');
  await footer.locator('[data-footer-toggle]').click();
  const shown = new Set(visibleFooterLinks(footerLinks).map((link) => link.href));
  for (const link of footerLinks) {
    await expect(footer.locator(`a[href=${JSON.stringify(link.href)}]`)).toHaveCount(shown.has(link.href) ? 1 : 0);
  }
  await expect(footer.getByRole('link', { name: 'privacy', exact: true })).toBeVisible();
});

// The expectation comes from the same rule the menu uses, so it flips on its own once a legal page is approved.
test('menu leaves out legal pages that are not approved yet, and shows each once it is', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'open site menu', exact: true }).click();
  const menu = page.getByTestId('site-menu');
  const shown = new Set(visibleFooterLinks(menuSmallLinks).map((link) => link.href));
  for (const link of menuSmallLinks) {
    const target = menu.locator(`a[href=${JSON.stringify(link.href)}]`);
    if (shown.has(link.href)) await expect(target.first()).toBeVisible();
    else await expect(target).toHaveCount(0);
  }
  await expect(menu.getByRole('link', { name: 'privacy', exact: true })).toBeVisible();
});
