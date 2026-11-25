import { expect, test, type Page } from '@playwright/test';

/**
 * Home header (Christian's boards of 2026-11-24): one row with a round menu button at the left, the centred logo, and
 * search plus sign in at the right. The row of links is gone; one side bar (the site's existing menu) lists them.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch { /* optional storage */ }
  });
  await page.goto('/');
});

const menuButton = (page: Page) => page.locator('header [data-menu-open]:not([data-menu-search])');

test('the header is one row: menu button, logo, search, sign in, with no row of links', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'main', exact: true })).toHaveCount(0);
  const boxes = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, centre: rect.top + rect.height / 2, width: rect.width, height: rect.height };
    };
    return {
      menu: box('header [data-menu-open]:not([data-menu-search])'),
      logo: box('header .home-brand'),
      search: box('header [data-menu-search]'),
      account: box('header [data-account-toggle]'),
      header: box('header'),
    };
  });
  const { menu, logo, search, account, header } = boxes;
  expect(menu.right).toBeLessThanOrEqual(logo.left);
  expect(logo.right).toBeLessThanOrEqual(search.left);
  expect(search.right).toBeLessThanOrEqual(account.left);
  for (const part of [logo, search, account]) expect(Math.abs(part.centre - menu.centre)).toBeLessThanOrEqual(5);
  // The logo is centred on the screen.
  expect(Math.abs((logo.left + logo.right) / 2 - header.width / 2)).toBeLessThanOrEqual(1);
  // 48 px buttons on desktop and tablet, 44 px on phones.
  const expected = page.viewportSize()!.width < 640 ? 44 : 48;
  expect(menu.width).toBeCloseTo(expected, 0);
  expect(menu.height).toBeCloseTo(expected, 0);
  expect(search.width).toBeCloseTo(expected, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sign in is the copper pill with words from 640 px, and an icon only on phones', async ({ page }) => {
  const account = page.locator('header [data-account-toggle]');
  const label = account.locator('.account-pill-label');
  if (page.viewportSize()!.width >= 640) {
    await expect(label).toBeVisible();
    await expect(label).toHaveText('sign in');
  } else {
    await expect(label).toBeHidden();
    const box = (await account.boundingBox())!;
    expect(box.width).toBeCloseTo(box.height, 0);
  }
});

test('the menu button opens the side bar, which dims and locks the page, and Escape closes it', async ({ page }) => {
  const open = menuButton(page);
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await open.click();
  const bar = page.getByTestId('site-menu');
  await expect(bar).toBeVisible();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(bar.getByRole('button', { name: 'close site menu' })).toBeFocused();
  const nav = bar.getByRole('navigation', { name: 'site' });
  // Revised 2026-11-24: study, anatomy lab (drafts builds), games, support, about; the rest moved to the about page.
  const rows = await nav.getByRole('link').allInnerTexts();
  expect(rows.map((row) => row.trim())).toEqual(['study', 'anatomy lab', 'games', 'support', 'about']);
  for (const [name, href] of [['study', '/courses'], ['games', '/play'], ['support', '/support'], ['about', '/about']] as const) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }
  await expect(nav.getByRole('heading')).toHaveCount(0);
  await expect(bar.getByRole('link', { name: 'contact us' })).toHaveCount(0);
  // The page behind cannot scroll while the bar is open.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
  await expect(open).toBeFocused();
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
});

test('the social icons stay pinned at the bottom edge of the side bar, below the rows and the search', async ({ page }) => {
  await menuButton(page).click();
  const bar = page.getByTestId('site-menu');
  await expect(bar).toBeVisible();
  const socials = bar.locator('.menu-panel-socials');
  await expect(socials.locator('[data-social]').first()).toBeInViewport();
  const { socialsBottom, barBottom, searchBottom, socialsTop, viewport } = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    return {
      socialsBottom: rect('.menu-panel-socials').bottom,
      socialsTop: rect('.menu-panel-socials').top,
      barBottom: rect('#site-menu').bottom,
      searchBottom: rect('[data-site-search]').bottom,
      viewport: window.innerHeight,
    };
  });
  expect(socialsBottom).toBeLessThanOrEqual(viewport + 0.5);
  expect(Math.abs(socialsBottom - barBottom)).toBeLessThanOrEqual(1);
  expect(searchBottom).toBeLessThanOrEqual(socialsTop + 0.5);
});

test('a click anywhere on the dimmed page, or the close button, closes the side bar', async ({ page }) => {
  const bar = page.getByTestId('site-menu');
  const viewport = page.viewportSize()!;
  await menuButton(page).click();
  await expect(bar).toBeVisible();
  await page.mouse.click(viewport.width - 6, viewport.height - 6);
  await expect(bar).toBeHidden();
  await menuButton(page).click();
  await bar.getByRole('button', { name: 'close site menu' }).click();
  await expect(bar).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
});

test.describe('landscape phone', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('buttons are drawn 40 px but keep a 44 px hit area', async ({ page }) => {
    const hits = await page.evaluate(() => {
      const results: Record<string, { size: number; reach: boolean }> = {};
      for (const [name, selector] of [
        ['menu', 'header [data-menu-open]:not([data-menu-search])'],
        ['search', 'header [data-menu-search]'],
        ['account', 'header [data-account-toggle]'],
      ] as const) {
        const element = document.querySelector(selector)!;
        const rect = element.getBoundingClientRect();
        // One pixel inside the 44 px square around the centre, outside the drawn button.
        const x = rect.left + rect.width / 2 - 21;
        const y = rect.top + rect.height / 2 - 21;
        results[name] = { size: Math.min(rect.width, rect.height), reach: document.elementFromPoint(x, y)?.closest(selector) === element };
      }
      return results;
    });
    expect(hits.menu).toEqual({ size: 40, reach: true });
    expect(hits.search).toEqual({ size: 40, reach: true });
    expect(hits.account.reach).toBe(true);
  });
});
