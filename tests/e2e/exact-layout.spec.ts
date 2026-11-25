import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { isDesktopOfEachEngine } from './projects';

/*
  Engine-independent layout checks behind three Firefox-only release failures (PR #1190). Firefox keeps positions in
  sixtieths of a pixel and reports boxes through 32-bit floats, so a box that starts on a fraction like 419.4531 reads
  back a hair off (43.99998 for a 44 px button). Chromium keeps sixty-fourths and hides it, so these tests check the cause
  rather than the symptom: the boxes start on a quarter pixel (exact in both), have exactly the size the styles give, and
  do not change with the state. Each runs at device pixel ratios 1, 2 and 3. They set their own window sizes, so they run
  once per engine.
*/

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'sets its own window sizes: runs once per engine (D-48)');
  await markPanelsSeen(page);
});

/** True when a position is a whole number of quarter pixels (exact as a float and in sixtieths of a pixel). */
const onQuarter = (value: number) => Math.abs(value * 4 - Math.round(value * 4)) < 1e-9;

const rects = (page: Page, selector: string) =>
  page.evaluate((query) => [...document.querySelectorAll(query)].map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
  }), selector);

for (const ratio of [1, 2, 3]) {
  test.describe(`device pixel ratio ${ratio}`, () => {
    test.use({ deviceScaleFactor: ratio });

    test('platter arrows on a phone turned sideways (844 × 390) are exactly 44 px and start on a quarter pixel', async ({ page }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.goto('/preview/vial-platter');
      await expect(page.locator('[data-platter]')).toHaveAttribute('data-platter-state', 'settled');
      const arrows = page.locator('[data-platter-prev], [data-platter-next]');
      await expect(arrows).toHaveCount(2);
      for (const arrow of await arrows.all()) {
        const style = await arrow.evaluate((element) => {
          const computed = getComputedStyle(element);
          return { minWidth: computed.minWidth, minHeight: computed.minHeight, shrink: computed.flexShrink };
        });
        expect(style).toEqual({ minWidth: '44px', minHeight: '44px', shrink: '0' });
      }
      for (const rect of await rects(page, '[data-platter-prev], [data-platter-next]')) {
        expect(rect.width).toBe(44);
        expect(rect.height).toBe(44);
        expect(onQuarter(rect.x)).toBe(true);
        expect(onQuarter(rect.y)).toBe(true);
      }
      const [prev, next] = await rects(page, '[data-platter-prev], [data-platter-next]');
      expect(prev!.y).toBe(next!.y);
    });

    test('platter arrows keep their quarter-pixel positions when the window is not 844 wide', async ({ page }) => {
      for (const width of [740, 915]) {
        await page.setViewportSize({ width, height: 360 });
        await page.goto('/preview/vial-platter');
        await expect(page.locator('[data-platter]')).toHaveAttribute('data-platter-state', 'settled');
        for (const rect of await rects(page, '[data-platter-prev], [data-platter-next]')) {
          expect(rect.width).toBe(44);
          expect(onQuarter(rect.x)).toBe(true);
          expect(onQuarter(rect.y)).toBe(true);
        }
      }
    });

    test('social marks share one top, start on a quarter pixel and never sit on a half pixel', async ({ page }) => {
      for (const size of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        await page.goto('/preview/home-social');
        await page.locator('[data-social-section]').scrollIntoViewIfNeeded();
        const marks = await rects(page, '[data-social-section] a[data-social]');
        expect(marks.length).toBeGreaterThan(1);
        for (const mark of marks) {
          expect(mark.y).toBe(marks[0]!.y);
          expect(mark.width).toBe(marks[0]!.width);
          expect(mark.height).toBe(marks[0]!.height);
          expect(onQuarter(mark.y)).toBe(true);
          // Math.round(y) must not flip on float noise: stay clear of x.5. (The site header is a quarter pixel taller at ratio 3,
          // which moves every page by that much; the home-social test measures at ratio 1.)
          if (ratio < 3) expect(Math.abs((mark.y % 1) - 0.5)).toBeGreaterThan(0.2);
        }
      }
    });

    test('the open footer panel has the same box in every theme state, on a quarter pixel', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/privacy');
      const footer = page.getByRole('contentinfo');
      await footer.locator('[data-footer-toggle]').scrollIntoViewIfNeeded();
      await footer.locator('[data-footer-toggle]').click();
      const picker = page.getByRole('group', { name: 'Theme' });
      await expect(picker).toBeVisible();
      const snapshots = [];
      for (const word of ['light', 'dark', 'device', 'light']) {
        await picker.locator('.theme-slider-option', { hasText: word }).click();
        await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
        const [panel] = await rects(page, 'footer');
        const options = await rects(page, 'footer .theme-slider-option');
        const [slider] = await rects(page, 'footer .theme-slider');
        snapshots.push({ panel, slider, options: options.map((option) => [option.width, option.height]) });
        expect(onQuarter(panel!.y)).toBe(true);
      }
      for (const snapshot of snapshots) {
        expect(snapshot.panel!.height).toBe(snapshots[0]!.panel!.height);
        expect(snapshot.panel!.width).toBe(snapshots[0]!.panel!.width);
        expect(snapshot.slider!.width).toBe(snapshots[0]!.slider!.width);
        expect(snapshot.options).toEqual(snapshots[0]!.options);
      }
    });
  });
}
