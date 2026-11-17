import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

// Lane 14 home polish: the hero points to today's games (/play) and quietly to the launch list, by keyboard and touch,
// in Light and Evening, without sideways scroll, including a 320 px screen with 32 px text.
const sizes = [
  { width: 320, height: 720, rootText: '32px' },
  { width: 390, height: 844, rootText: '' },
  { width: 1440, height: 900, rootText: '' },
] as const;

for (const size of sizes) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`home hero links: ${size.width}px${size.rootText ? ' with ' + size.rootText + ' text' : ''} in ${scheme}`, async ({ browser }, testInfo) => {
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
          try { localStorage.setItem('cueory-promo-seen', String(Date.now())); }
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
        const play = hero.getByTestId('hero-play');
        const join = hero.getByTestId('hero-join');
        await expect(play).toHaveText("play today's games");
        await expect(play).toHaveAttribute('href', '/play');
        await expect(join).toHaveText('join the launch list');
        await expect(join).toHaveAttribute('href', '/#signup');

        for (const link of [play, join]) {
          const box = (await link.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        // The quiet link is underlined, so it never relies on color alone to read as a link.
        expect(await join.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('underline');

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        // Keyboard: Tab from the play button reaches the launch-list link, both with a visible focus ring.
        await play.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(play).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(join).toBeFocused();
        const ring = await join.evaluate((el) => {
          const style = getComputedStyle(el);
          return el.matches(':focus-visible') && style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
        });
        expect(ring).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/#signup$/);
        await expect(page.locator('#signup')).toBeInViewport();

        // Touch: a tap on the play button opens the games hub.
        await page.goto('/');
        await page.getByTestId('hero-play').tap();
        await expect(page).toHaveURL(/\/play\/?$/);
      } finally {
        await context.close();
      }
    });
  }
}
