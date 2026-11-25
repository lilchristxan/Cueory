import { expect, test } from '@playwright/test';

// The footer row on narrow phones: 390 keeps one centred row; below 384 px it is a deliberate 3 + 2, each row centred
// between the flag and the chevron, never overlapping them, never an orphan link, never a sideways scroll.

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [390, 375, 360, 344, 320]) {
    test.describe(`footer row at ${width}px (${colorScheme === 'light' ? 'Light' : 'Evening'})`, () => {
      test.use({ viewport: { width, height: 800 }, colorScheme, hasTouch: true });

      for (const path of ['/', '/support']) {
        test(`${path}: centred between the corner buttons, 44px targets, no sideways scroll`, async ({ page }) => {
          await page.addInitScript(() => {
            try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
          });
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          const footer = page.locator('[data-site-footer]');
          const flag = footer.getByRole('button', { name: 'flag or comment' });
          await expect(flag).toBeVisible();
          const flagBox = (await flag.boundingBox())!;
          const toggleBox = (await footer.locator('[data-footer-toggle]').boundingBox())!;
          const links = footer.getByRole('navigation', { name: 'footer' }).getByRole('link');
          const boxes = [];
          for (const link of await links.all()) boxes.push((await link.boundingBox())!);
          expect(boxes.length).toBeGreaterThanOrEqual(3);

          // Group the links into visual rows.
          const rows = new Map<number, typeof boxes>();
          for (const box of boxes) rows.set(Math.round(box.y), [...(rows.get(Math.round(box.y)) ?? []), box]);
          const rowList = [...rows.values()];
          if (width >= 384) {
            expect(rowList.length, 'one row').toBe(1);
          } else if (boxes.length === 5) {
            expect(rowList.map((row) => row.length), 'three then two, no orphan').toEqual([3, 2]);
          } else {
            expect(rowList.every((row) => row.length >= 2), 'no lone link').toBe(true);
          }

          const middle = (flagBox.x + flagBox.width + toggleBox.x) / 2;
          for (const row of rowList) {
            const left = Math.min(...row.map((box) => box.x));
            const right = Math.max(...row.map((box) => box.x + box.width));
            expect(Math.abs((left + right) / 2 - middle), 'row centred between the corner buttons').toBeLessThanOrEqual(2);
          }
          for (const box of boxes) {
            expect(box.height, 'tap height').toBeGreaterThanOrEqual(44);
            expect(box.width, 'tap width').toBeGreaterThanOrEqual(44);
            // The two rows of links sit between the corner buttons, never over them.
            expect(box.x, 'clear of the flag').toBeGreaterThanOrEqual(flagBox.x + flagBox.width - 0.5);
            expect(box.x + box.width, 'clear of the chevron').toBeLessThanOrEqual(toggleBox.x + 0.5);
          }
          expect(flagBox.width).toBeGreaterThanOrEqual(44);
          expect(flagBox.height).toBeGreaterThanOrEqual(44);
          expect(toggleBox.width).toBeGreaterThanOrEqual(44);
          expect(toggleBox.height).toBeGreaterThanOrEqual(44);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

          // Keyboard order: flag, the links in order, chevron.
          const order = await page.evaluate(() => {
            const f = document.querySelector('[data-site-footer]')!;
            const nodes = [...f.querySelectorAll<HTMLElement>('button, a[href]')].filter((el) => el.offsetParent !== null);
            return nodes.slice(0, 7).map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim());
          });
          expect(order[0]).toBe('flag or comment');
          expect(order[1]).toBe('about us');
        });
      }
    });
  }
}
