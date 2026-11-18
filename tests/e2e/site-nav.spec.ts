import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Redesign P2: the persistent top bar. A pill of links and an "about" dropdown on wide screens; phones and tablets keep
 * the ☰ panel. New spec: it replaces no existing one yet (the renderings' header specs are replaced when the old
 * header goes, in a later PR).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch { /* optional storage */ }
  });
});

test.describe('wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('shows the pill links and search, and the links go where they say', async ({ page }) => {
    await page.goto('/support');
    const nav = page.getByRole('navigation', { name: 'main', exact: true });
    await expect(nav).toBeVisible();
    for (const [label, href] of [['study', '/courses'], ['games', '/play'], ['support', '/support']] as const) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href);
    }
    await expect(nav.getByRole('link', { name: 'support', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'search the site' })).toBeVisible();
  });

  test('every control is at least 44 by 44 px, dropdown links included, and nothing scrolls sideways', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-about-menu] summary').click();
    await expect(page.locator('[data-about-menu]')).toHaveAttribute('open', '');
    for (const control of [
      ...(await page.getByRole('navigation', { name: 'main', exact: true }).getByRole('link').all()),
      page.locator('[data-about-menu] summary'),
      page.getByRole('button', { name: 'search the site' }),
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('at the breakpoint with enlarged text the bar never scrolls the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/support');
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the about dropdown opens by keyboard, Escape closes it and focus returns to about', async ({ page }) => {
    await page.goto('/support');
    const summary = page.locator('[data-about-menu] summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-about-menu]')).toHaveAttribute('open', '');
    await expect(page.locator('[data-about-menu]').getByRole('link', { name: 'privacy', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-about-menu]')).not.toHaveAttribute('open', '');
    await expect(summary).toBeFocused();
  });

  test('search opens the panel with the search field focused, Escape returns to the search button', async ({ page }) => {
    await page.goto('/support');
    const search = page.getByRole('button', { name: 'search the site' });
    await search.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(search).toBeFocused();
  });

  test('passes axe with the dropdown open', async ({ page }) => {
    await page.goto('/support');
    await page.locator('[data-about-menu] summary').click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});

for (const [label, width, height] of [['phone', 390, 844], ['smallest phone', 320, 640], ['tablet', 820, 1180]] as const) {
  test.describe(label, () => {
    test.use({ viewport: { width, height } });

    test('keeps the ☰ panel, shows no pill, and does not scroll sideways', async ({ page }) => {
      await page.goto('/support');
      await expect(page.getByRole('navigation', { name: 'main', exact: true })).toBeHidden();
      await expect(page.getByRole('button', { name: 'open site menu' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}
