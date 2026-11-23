import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

// Redesign P5: the hero's start link, the Ko-fi card and the explore row work by keyboard and touch, in Light
// and Evening, without sideways scroll, including a 320 px screen with 32 px text.
const sizes = [
  { width: 320, height: 720, rootText: '32px' },
  { width: 390, height: 844, rootText: '' },
  { width: 1440, height: 900, rootText: '' },
] as const;

for (const size of sizes) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`home hero: ${size.width}px${size.rootText ? ' with ' + size.rootText + ' text' : ''} in ${scheme}`, async ({ browser }, testInfo) => {
      test.skip(!isDesktopOfEachEngine(testInfo), 'the size and scheme checks run once per browser engine');
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: size.width, height: size.height },
        colorScheme: scheme,
        reducedMotion: 'reduce',
        hasTouch: true,
      });
      try {
        await context.addInitScript(() => {
          try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); }
          catch { /* The home page also works without storage. */ }
        });
        const page = await context.newPage();
        await page.goto('/');
        if (size.rootText) {
          const rootText = size.rootText;
          await page.evaluate((value) => document.documentElement.style.setProperty('font-size', value, 'important'), rootText);
          await expect(page.locator('html')).toHaveCSS('font-size', rootText);
        }

        const hero = page.locator('.scene-hero');
        const start = hero.getByTestId('hero-start');
        await expect(start).toBeVisible();
        // The browser-test build may show drafts, so the button is a link to the open sample lesson. The live build's
        // closed button is checked in tests/unit/home-sections.test.ts.
        await expect(start).toHaveAttribute('href', '/learn/study-skills');

        const targets = ['hero-play-games', 'hero-support', 'explore-lessons', 'explore-materials', 'explore-games', 'explore-suggestions'];
        for (const id of targets) {
          const box = (await hero.getByTestId(id).boundingBox())!;
          expect(box.width, id).toBeGreaterThanOrEqual(44);
          expect(box.height, id).toBeGreaterThanOrEqual(44);
        }
        const startBox = (await start.boundingBox())!;
        expect(startBox.height).toBeGreaterThanOrEqual(44);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        // Keyboard: the start link takes focus with a visible ring; Tab then walks on to the Ko-fi card and the
        // explore tiles, each with a visible focus ring, and Enter on "daily games" opens the games hub.
        await start.focus();
        await expect(start).toBeFocused();
        const startRing = await start.evaluate((el) => {
          const style = getComputedStyle(el);
          return el.matches(':focus-visible') && style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
        });
        expect(startRing).toBe(true);
        for (const id of ['hero-play-games', 'hero-support', 'explore-lessons', 'explore-materials', 'explore-games']) {
          await page.keyboard.press('Tab');
          const link = hero.getByTestId(id);
          await expect(link, id).toBeFocused();
          const ring = await link.evaluate((el) => {
            const style = getComputedStyle(el);
            return el.matches(':focus-visible') && style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
          });
          expect(ring, id).toBe(true);
        }
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/play\/?$/);

        // Touch: a tap on an explore tile opens its page.
        await page.goto('/');
        await page.getByTestId('explore-suggestions').tap();
        await expect(page).toHaveURL(/\/message\/?$/);
      } finally {
        await context.close();
      }
    });
  }
}
