import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/*
  The Home v3 coming-soon section (src/components/home-v3/ComingSoon.astro, docs/design/home-v3/), on its preview page.
  These tests set their own window sizes (desktop 1440, portrait phone 390, phone landscape 844), so they run once per
  engine. Nothing here submits the form: it posts to Kit.
*/

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'sets its own window sizes: runs once per engine (D-48)');
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const sizes = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};

const card = (page: Page) => page.locator('[data-coming-soon] .soon-card');
const copy = (page: Page) => page.locator('[data-coming-soon] .soon-copy');
const email = (page: Page) => page.locator('#soon-email');
const button = (page: Page) => page.getByRole('button', { name: 'join the list' });

async function open(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto('/preview/home-coming-soon');
  await card(page).scrollIntoViewIfNeeded();
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('no box');
  return found;
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function insideCard(page: Page, parts: Locator[]) {
  const c = await box(card(page));
  for (const part of parts) {
    const b = await box(part);
    expect(b.x).toBeGreaterThanOrEqual(c.x - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
    expect(b.y).toBeGreaterThanOrEqual(c.y - 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height + 0.5);
  }
}

async function bigEnough(parts: Locator[]) {
  for (const part of parts) {
    const b = await box(part);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  }
}

test.describe('layout', () => {
  test('desktop 1440: words on the left, field and button on the right in one row, panel centred', async ({ page }) => {
    await open(page, sizes.desktop);
    await expect(page.getByRole('heading', { level: 2, name: 'coming soon' })).toBeVisible();
    await expect(page.getByText('Mental Health I and Med Math are next. Get one email when they open.')).toBeVisible();
    const [c, words, field, join] = await Promise.all([box(card(page)), box(copy(page)), box(email(page)), box(button(page))]);
    expect(c.width).toBeLessThanOrEqual(900.5);
    expect(Math.abs(c.x + c.width / 2 - 720)).toBeLessThan(2);
    expect(field.x).toBeGreaterThan(words.x + words.width - 1);
    expect(join.x).toBeGreaterThan(field.x + field.width - 1);
    expect(Math.abs(field.y + field.height / 2 - (join.y + join.height / 2))).toBeLessThan(2);
    await insideCard(page, [copy(page), email(page), button(page)]);
    await bigEnough([email(page), button(page)]);
    await noSidewaysScroll(page);
  });

  test('portrait phone 390: everything stacks, full width, nothing sideways', async ({ page }) => {
    await open(page, sizes.phone);
    const [words, field, join] = await Promise.all([box(copy(page)), box(email(page)), box(button(page))]);
    expect(field.y).toBeGreaterThan(words.y + words.height - 1);
    expect(join.y).toBeGreaterThan(field.y + field.height - 1);
    expect(Math.abs(field.width - join.width)).toBeLessThan(2);
    await insideCard(page, [copy(page), email(page), button(page)]);
    await bigEnough([email(page), button(page)]);
    await noSidewaysScroll(page);
  });

  test('phone landscape 844: words left, field and button right, one compact row', async ({ page }) => {
    await open(page, sizes.landscape);
    const [c, words, field, join] = await Promise.all([box(card(page)), box(copy(page)), box(email(page)), box(button(page))]);
    expect(c.width).toBeLessThanOrEqual(620.5);
    expect(field.x).toBeGreaterThan(words.x + words.width - 1);
    expect(join.x).toBeGreaterThan(field.x + field.width - 1);
    expect(Math.abs(field.y + field.height / 2 - (join.y + join.height / 2))).toBeLessThan(2);
    await insideCard(page, [copy(page), email(page), button(page)]);
    await bigEnough([email(page), button(page)]);
    await noSidewaysScroll(page);
  });
});

test.describe('keyboard', () => {
  test('Tab reaches the field, then the button, each with a visible focus ring; the field is labelled', async ({ page }) => {
    await open(page, sizes.desktop);
    await expect(page.getByLabel('email address')).toHaveCount(1);
    await email(page).focus();
    await expect(email(page)).toBeFocused();
    const ring = async (target: Locator) =>
      target.evaluate((el) => {
        const s = getComputedStyle(el);
        return (parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none') || s.boxShadow !== 'none';
      });
    expect(await ring(email(page))).toBe(true);
    await page.keyboard.press('Tab');
    await expect(button(page)).toBeFocused();
    expect(await ring(button(page))).toBe(true);
  });

  test('an empty or invalid address is refused by the browser, so nothing is sent', async ({ page }) => {
    await open(page, sizes.desktop);
    let posted = false;
    page.on('request', (request) => {
      if (request.method() === 'POST') posted = true;
    });
    await email(page).fill('not-an-address');
    await button(page).click();
    expect(await email(page).evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    expect(posted).toBe(false);
  });
});

for (const [theme, scheme] of [['Light', 'light'], ['Evening', 'dark']] as const) {
  test.describe(theme, () => {
    for (const [name, size] of Object.entries(sizes)) {
      test(`passes axe at ${name}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page, size);
        const results = await new AxeBuilder({ page }).include('[data-coming-soon]').withTags(axeTags).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  });
}
