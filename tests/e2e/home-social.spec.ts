import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { socials } from '../../src/config/site';
import { isDesktopOfEachEngine } from './projects';

/*
  The Home v3 social section (src/components/home-v3/Social.astro, docs/design/home-v3/), on its preview page. These
  tests set their own window sizes (desktop 1440, portrait phone 390, phone landscape 844), so they run once per engine.
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
const shown = socials.filter((s) => s.href);

const section = (page: Page) => page.locator('[data-social-section]');
const marks = (page: Page) => section(page).locator('a[data-social]');

async function open(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto('/preview/home-social');
  await section(page).scrollIntoViewIfNeeded();
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

test.describe('layout', () => {
  for (const [name, size] of Object.entries(sizes)) {
    test(`${name}: every mark is on one centred row, at least 44 px, nothing sideways`, async ({ page }) => {
      await open(page, size);
      await expect(marks(page)).toHaveCount(shown.length);
      const boxes = await Promise.all((await marks(page).all()).map(box));
      const tops = boxes.map((b) => Math.round(b.y));
      expect(new Set(tops).size).toBe(1);
      for (const b of boxes) {
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      for (let i = 1; i < boxes.length; i += 1) expect(boxes[i]!.x).toBeGreaterThan(boxes[i - 1]!.x + boxes[i - 1]!.width - 0.5);
      const left = boxes[0]!.x;
      const right = size.width - (boxes.at(-1)!.x + boxes.at(-1)!.width);
      expect(Math.abs(left - right)).toBeLessThan(2);
      expect(boxes.at(-1)!.x + boxes.at(-1)!.width).toBeLessThanOrEqual(size.width);
      await noSidewaysScroll(page);
    });
  }

  // The boards' space above the row: 40 px on desktop, 28 px on a phone, 24 px on a phone turned sideways.
  const spaceAbove = { desktop: '40px', phone: '28px', landscape: '24px' } as Record<string, string>;
  for (const [name, size] of Object.entries(sizes)) {
    test(`${name}: ${spaceAbove[name]} above the row and none below, as on the board`, async ({ page }) => {
      await open(page, size);
      const section = page.locator('[data-social-section]');
      await expect(section).toHaveCSS('margin-top', spaceAbove[name]!);
      await expect(section).toHaveCSS('margin-bottom', '0px');
    });
  }

  test('each mark opens its profile from site.ts in a new tab, safely, and says so', async ({ page }) => {
    await open(page, sizes.desktop);
    for (const social of shown) {
      const link = section(page).locator(`a[data-social="${social.id}"]`);
      await expect(link).toHaveAttribute('href', social.href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
      await expect(link).toHaveAttribute('aria-label', `cueory on ${social.name} (opens in a new tab)`);
    }
  });
});

test.describe('keyboard and hover', () => {
  test('Tab visits the marks in order with a visible focus ring, and the focused mark lifts', async ({ page }) => {
    await open(page, sizes.desktop);
    await marks(page).first().focus();
    for (let i = 0; i < shown.length; i += 1) {
      const mark = marks(page).nth(i);
      await expect(mark).toBeFocused();
      const ring = await mark.evaluate((el) => {
        const s = getComputedStyle(el);
        return parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none';
      });
      expect(ring).toBe(true);
      if (i < shown.length - 1) await page.keyboard.press('Tab');
    }
    await expect(marks(page).last()).toHaveCSS('color', 'rgb(184, 115, 72)');
  });

  test('hover turns a mark copper, and reduced motion keeps it in place', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, sizes.desktop);
    const target = marks(page).nth(1);
    const before = await box(target);
    await target.hover();
    await expect(target).toHaveCSS('color', 'rgb(184, 115, 72)');
    const after = await box(target);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  });
});

for (const [theme, scheme] of [['Light', 'light'], ['Evening', 'dark']] as const) {
  test.describe(theme, () => {
    for (const [name, size] of Object.entries(sizes)) {
      test(`passes axe at ${name}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page, size);
        const results = await new AxeBuilder({ page }).include('[data-social-section]').withTags(axeTags).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  });
}
