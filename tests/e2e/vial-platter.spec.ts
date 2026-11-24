import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { studyModes } from '../../src/config/modes';
import { isDesktopOfEachEngine } from './projects';

/*
  The Home v3 vial platter (src/components/VialPlatter.astro, docs/design/home-v3/), on its preview page. These tests
  set their own window sizes (desktop 1440, portrait phone 390, phone landscape 844), so they run once per engine.
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
const count = studyModes.length;

const vials = (page: Page) => page.locator('[data-platter-vial]');
const front = (page: Page) => page.locator('[data-platter-vial][data-active]');
const shownVials = (page: Page) => vials(page).filter({ visible: true });
const arrows = (page: Page) => page.locator('[data-platter-prev], [data-platter-next]');

async function open(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto('/preview/vial-platter');
  const root = page.locator('[data-platter]');
  await root.scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute('data-platter-state', 'settled');
  return root;
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

async function waitSettled(page: Page) {
  await expect(page.locator('[data-platter]')).toHaveAttribute('data-platter-state', 'settled');
}

test.describe('wide layout (desktop 1440)', () => {
  test('shows all eleven vials, largest in front, none overlapping, with two arrows and eleven dots', async ({ page }) => {
    await open(page, { width: 1440, height: 900 });
    await expect(shownVials(page)).toHaveCount(count);
    const boxes = await Promise.all((await vials(page).all()).map(box));
    const frontIndex = boxes.findIndex((b) => Math.abs(b.x + b.width / 2 - 720) < 2);
    expect(frontIndex).toBe(0);
    expect(boxes[0]!.width).toBeCloseTo(152, 0);
    const byX = [...boxes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < byX.length; i += 1) expect(byX[i]!.x).toBeGreaterThan(byX[i - 1]!.x + byX[i - 1]!.width);
    for (const b of boxes) expect(b.width).toBeLessThanOrEqual(boxes[0]!.width + 0.5);
    await expect(page.locator('[data-platter-dot]')).toHaveCount(count);
    await expect(page.locator('[data-platter-dot][data-on]')).toHaveCount(1);
    for (const arrow of await arrows(page).all()) {
      const b = await box(arrow);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    await noSidewaysScroll(page);
  });

  test('a hovered vial lifts 8 px and glows, and its label text stays dark', async ({ page }) => {
    await open(page, { width: 1440, height: 900 });
    const target = vials(page).nth(1);
    const before = await box(target);
    await target.hover();
    await expect.poll(async () => Math.round((await box(target)).y - before.y)).toBe(-8);
    await expect(target).toHaveCSS('filter', /drop-shadow/);
    await expect(target.locator('.platter-name')).toHaveCSS('color', 'rgb(62, 44, 35)');
  });

  test('keyboard focus lifts the front vial, and the arrow keys turn the platter with focus following', async ({ page }) => {
    await open(page, { width: 1440, height: 900 });
    await front(page).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(front(page)).toBeFocused();
    await expect(front(page)).toHaveCSS('filter', /drop-shadow/);
    await expect(front(page)).toHaveCSS('translate', /-8px/);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-platter]')).toHaveAttribute('data-active', '1');
    await expect(front(page)).toBeFocused();
    await expect(page.locator('[data-platter-dot]').nth(1)).toHaveAttribute('data-on', '');
    await waitSettled(page);
    await page.keyboard.press('End');
    await expect(page.locator('[data-platter]')).toHaveAttribute('data-active', String(count - 1));
    await waitSettled(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-platter]')).toHaveAttribute('data-active', '0');
    // Only the front vial is in the Tab order.
    await expect(vials(page).and(page.locator('[tabindex="0"]'))).toHaveCount(1);
  });

  test('the arrows and a tap on a side vial turn it, and the front vial is the middle one afterwards', async ({ page }) => {
    await open(page, { width: 1440, height: 900 });
    await page.getByRole('button', { name: 'next study method' }).click();
    await expect(page.locator('[data-platter]')).toHaveAttribute('data-active', '1');
    await waitSettled(page);
    await page.getByRole('button', { name: 'previous study method' }).click();
    await expect(page.locator('[data-platter]')).toHaveAttribute('data-active', '0');
    await waitSettled(page);
    await vials(page).nth(2).click();
    await expect(page.locator('[data-platter]')).toHaveAttribute('data-active', '2');
    await waitSettled(page);
    const b = await box(front(page));
    expect(b.x + b.width / 2).toBeCloseTo(720, 0);
  });

  test('reduced motion: no lift, the glow stays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, { width: 1440, height: 900 });
    const target = vials(page).nth(1);
    const before = await box(target);
    await target.hover();
    await expect(target).toHaveCSS('filter', /drop-shadow/);
    expect(Math.round((await box(target)).y - before.y)).toBe(0);
  });

  test('has no accessibility violations', async ({ page }) => {
    await open(page, { width: 1440, height: 900 });
    const results = await new AxeBuilder({ page }).include('[data-platter]').withTags(axeTags).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('portrait phone (390)', () => {
  test('shows three vials, the dots under the platter, and both arrows 16 px in at the same height', async ({ page }) => {
    await open(page, { width: 390, height: 844 });
    await expect(shownVials(page)).toHaveCount(3);
    const frontBox = await box(front(page));
    expect(frontBox.x + frontBox.width / 2).toBeCloseTo(195, 0);
    expect(frontBox.width).toBeCloseTo(132, 0);

    const prev = await box(page.locator('[data-platter-prev]'));
    const next = await box(page.locator('[data-platter-next]'));
    expect(prev.x).toBeCloseTo(16, 0);
    expect(390 - (next.x + next.width)).toBeCloseTo(16, 0);
    expect(prev.y).toBeCloseTo(next.y, 0);
    expect(prev.width).toBeGreaterThanOrEqual(44);
    expect(prev.height).toBeGreaterThanOrEqual(44);

    const dots = await page.locator('[data-platter-dot]').all();
    expect(dots).toHaveLength(count);
    const first = await box(dots[0]!);
    const second = await box(dots[1]!);
    const lastBox = await box(dots[count - 1]!);
    expect(first.width).toBeCloseTo(15.4, 0); // the front vial's dot is a 7 px dot stretched into a pill
    expect(second.width).toBeCloseTo(7, 0);
    expect(lastBox.width).toBeCloseTo(7, 0);
    expect((await box(dots[3]!)).x - (await box(dots[2]!)).x).toBeCloseTo(22, 0);
    const platter = await box(page.locator('.platter-top'));
    expect(first.y).toBeGreaterThan(platter.y + platter.height - 1);
    await noSidewaysScroll(page);
  });

  test('a swipe or a tap on a side vial brings the next one to the front', async ({ page }) => {
    await open(page, { width: 390, height: 844 });
    await vials(page).nth(1).click();
    await expect(page.locator('[data-platter]')).toHaveAttribute('data-active', '1');
    await waitSettled(page);
    await expect(shownVials(page)).toHaveCount(3);
    await expect(front(page)).toHaveAttribute('data-name', studyModes[1]!.name);
  });

  test('has no accessibility violations', async ({ page }) => {
    await open(page, { width: 390, height: 844 });
    const results = await new AxeBuilder({ page }).include('[data-platter]').withTags(axeTags).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('phone landscape (844 × 390)', () => {
  test('shows all eleven vials on the platter without scrolling sideways', async ({ page }) => {
    await open(page, { width: 844, height: 390 });
    await expect(shownVials(page)).toHaveCount(count);
    const stage = await box(page.locator('[data-platter-stage]'));
    for (const b of await Promise.all((await vials(page).all()).map(box))) {
      expect(b.x).toBeGreaterThanOrEqual(stage.x);
      expect(b.x + b.width).toBeLessThanOrEqual(stage.x + stage.width);
    }
    const dotRow = await box(page.locator('.platter-dots'));
    const frontBox = await box(front(page));
    expect(dotRow.y + dotRow.height).toBeLessThanOrEqual(frontBox.y + 1);
    for (const arrow of await arrows(page).all()) {
      const b = await box(arrow);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    await noSidewaysScroll(page);
  });
});

test.describe('Evening', () => {
  test('keeps the label text dark and the arrows readable', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, { width: 1440, height: 900 });
    await expect(vials(page).first().locator('.platter-name')).toHaveCSS('color', 'rgb(28, 25, 23)');
    const results = await new AxeBuilder({ page }).include('[data-platter]').withTags(axeTags).analyze();
    expect(results.violations).toEqual([]);
  });
});
