import { expect, test, type Page, type Locator } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { isDesktopOfEachEngine } from './projects';

/*
  Engine-independent layout checks behind the Firefox-only release failures (PRs #1190 and the social-row follow-up). They
  compare boxes with each other and with the sizes the styles give, never with absolute page positions (those differ between
  engines: each lays text out with its own font metrics). Each runs at device pixel ratios 1, 2 and 3 and sets its own window
  sizes, so it runs once per engine.
*/

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'sets its own window sizes: runs once per engine (D-48)');
  await markPanelsSeen(page);
});

const rects = (page: Page, selector: string) =>
  page.evaluate((query) => [...document.querySelectorAll(query)].map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
  }), selector);

const settleMarks = (marks: Locator) =>
  marks.evaluateAll(async (links) => {
    // Changing focus can cancel a transition and start its replacement.
    for (;;) {
      const active = links.flatMap((link) => link.getAnimations({ subtree: true }))
        .filter((animation) => animation.pending || animation.playState === 'running');
      if (!active.length) return;
      await Promise.allSettled(active.map((animation) => animation.finished));
    }
  });

for (const ratio of [1, 2, 3]) {
  test.describe(`device pixel ratio ${ratio}`, () => {
    test.use({ deviceScaleFactor: ratio });

    test('platter arrows on a phone turned sideways (844 × 390) are exactly 44 px', async ({ page }) => {
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
      }
      const [prev, next] = await rects(page, '[data-platter-prev], [data-platter-next]');
      expect(prev!.y).toBe(next!.y);
    });

    test('platter arrows keep their size when the window is not 844 wide', async ({ page }) => {
      for (const width of [740, 915]) {
        await page.setViewportSize({ width, height: 360 });
        await page.goto('/preview/vial-platter');
        await expect(page.locator('[data-platter]')).toHaveAttribute('data-platter-state', 'settled');
        for (const rect of await rects(page, '[data-platter-prev], [data-platter-next]')) {
          expect(rect.width).toBe(44);
        }
      }
    });

    test('social marks share one top, never sit on a half pixel', async ({ page }) => {
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
        }
      }
    });

    test('hovering or focusing a social mark does not move its box (a resting pointer is common in Firefox)', async ({ page }) => {
      for (const size of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        await page.goto('/preview/home-social');
        const marks = page.locator('[data-social-section] a[data-social]');
        await marks.first().scrollIntoViewIfNeeded();
        const before = await rects(page, '[data-social-section] a[data-social]');
        await marks.nth(1).hover();
        await settleMarks(marks);
        expect(await rects(page, '[data-social-section] a[data-social]')).toEqual(before);
        await page.mouse.move(0, 0);
        await marks.nth(2).focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await settleMarks(marks);
        expect(await rects(page, '[data-social-section] a[data-social]')).toEqual(before);
      }
    });

    test('the open footer panel has the same box in every theme state', async ({ page }) => {
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
