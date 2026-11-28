import { expect, test } from '@playwright/test';
import { visibleFooterLinks } from '../../src/config/legalfooter';
import { footerLinks } from '../../src/config/site';
import { aboutPageLinks, drawerPrimaryLinks } from '../../src/config/sitenav';

// Keyboard theme behavior is already covered by footer-theme.spec.ts. This
// regression adds actual navigation for each configured internal destination.
// The side bar lists five rows; every other page it used to list is linked from the about page (revised 2026-11-24).
// These tests run on a drafts build, where the drafts-only rows and links show too.
for (const surface of ['footer', 'menu', 'about page'] as const) {
  // #747: the footer shows only approved legal pages (and always Privacy).
  const links = surface === 'footer' ? visibleFooterLinks(footerLinks) : surface === 'menu' ? drawerPrimaryLinks : visibleFooterLinks(aboutPageLinks);
  for (const href of [...new Set(links.map(link => link.href))].filter(href => href.startsWith('/'))) {
    test(`${surface} opens ${href}`, async ({ page }) => {
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* blocked storage */ }
      });
      await page.goto(surface === 'about page' ? '/about' : '/privacy');
      if (surface === 'footer') {
        await page.getByRole('contentinfo').locator('[data-footer-toggle]').click();
      } else if (surface === 'menu') {
        await page.getByRole('button', { name: 'open site menu', exact: true }).click();
      }
      const root = surface === 'footer' ? page.getByRole('contentinfo') : surface === 'menu' ? page.getByTestId('site-menu') : page.getByTestId('about-links');
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

// The expectation comes from the same rule the footer uses, so it flips on its own once a legal page is approved.
test('about page links leave out legal pages that are not approved yet, and show each once it is', async ({ page }) => {
  await page.goto('/about');
  const section = page.getByTestId('about-links');
  const shown = new Set(visibleFooterLinks(aboutPageLinks).map((link) => link.href));
  for (const link of aboutPageLinks) {
    const target = section.locator(`a[href=${JSON.stringify(link.href)}]`);
    // Drafts builds (these tests) show the drafts-only link; the live build never does (tests/unit/sitenav.test.ts).
    if (shown.has(link.href)) await expect(target.first()).toBeVisible();
    else await expect(target).toHaveCount(0);
  }
  await expect(section.getByRole('link', { name: 'privacy', exact: true })).toBeVisible();
});

test('the side bar no longer lists the legal pages', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'open site menu', exact: true }).click();
  const menu = page.getByTestId('site-menu');
  for (const href of ['/privacy', '/terms', '/disclaimer', '/message', '/progress']) await expect(menu.locator(`a[href=${JSON.stringify(href)}]`)).toHaveCount(0);
});
