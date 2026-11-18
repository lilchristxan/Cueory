import { expect, test } from '@playwright/test';

/**
 * /resources, /preview/concept-map and the study-skills sample lesson pages have two builds: drafts open (staging, previews, tests) and drafts closed (the live
 * build shows a plain coming-soon page). Whichever build the tests run on, the page must reflow at 320px with a 32px root
 * font, with the page-width check unchanged.
 */
const lessonRoutes = ['', '/cards', '/fill-in', '/learn-mode', '/matching', '/organizer', '/print-cards', '/label-it', '/questions'].map((tail) => `/learn/study-skills${tail}`);

for (const path of ['/resources', '/preview/concept-map', ...lessonRoutes]) {
  test(`${path} does not scroll sideways at 320px with a 32px root font`, async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('cueory-promo-seen', String(Date.now()));
      } catch {
        // The page must also work when storage is unavailable.
      }
    });
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
    await expect(page.locator('h1')).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
}
