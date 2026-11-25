import { expect, test } from '@playwright/test';

// The shared copper gradient used to start inside the 1 px transparent border and tile into it, which showed a thin
// copper sliver at the button's right end. It must draw from the border edge and never repeat.
const targets = [
  { name: 'home start button', path: '/', selector: '[data-testid="hero-start"]' },
  { name: 'about tip button', path: '/about', selector: 'a.copper-button' },
] as const;

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test.describe(`copper button gradient, ${scheme}, ${width}px`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height: 900 } });

      test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
          try {
            localStorage.setItem('cueory-promo-seen', String(Date.now()));
            localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
            localStorage.removeItem('cueory-theme');
          } catch {
            // Pages must still be usable if browser storage is unavailable.
          }
        });
      });

      for (const target of targets) {
        test(`${target.name} draws its gradient from the border edge without repeating`, async ({ page }) => {
          await page.goto(target.path);
          const button = page.locator(target.selector).first();
          await expect(button).toBeVisible();
          const style = await button.evaluate((el) => {
            const s = getComputedStyle(el);
            return { origin: s.backgroundOrigin, repeat: s.backgroundRepeat, image: s.backgroundImage };
          });
          expect(style.image).toContain('linear-gradient');
          expect(style.origin).toBe('border-box');
          expect(style.repeat).toBe('no-repeat');
        });
      }
    });
  }
}
