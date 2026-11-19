import { expect, test } from '@playwright/test';

/**
 * Touch-only check at 390 px: a phone has no hover. Nothing may depend on resting a pointer, so on the phone
 * projects (touch emulation) the pages must report no hover, carry no title="" tooltips, and show their
 * hover-polish rules as inactive.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

const pages = ['/', '/play', '/learn', '/support', '/resources', '/progress', '/learn/study-skills'];

test.describe('touch only (no hover)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('phone'), 'the touch-only check runs on the phone projects');
  });

  for (const path of pages) {
    test(`${path}: no hover, no title tooltips, and no hover-only reveal`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);

      const media = await page.evaluate(() => ({
        hover: matchMedia('(hover: hover)').matches,
        fine: matchMedia('(pointer: fine)').matches,
        touch: navigator.maxTouchPoints > 0,
        width: innerWidth,
      }));
      expect(media).toMatchObject({ hover: false, fine: false, touch: true, width: 390 });

      // A title="" tooltip never shows on a phone. The video frame's title is for screen readers.
      const titled = await page.evaluate(() =>
        [...document.querySelectorAll('[title]')]
          .filter((element) => element.tagName !== 'IFRAME' && !(element instanceof SVGElement && element.tagName === 'title'))
          .map((element) => `${element.tagName.toLowerCase()}[title=${element.getAttribute('title')}]`),
      );
      expect(titled).toEqual([]);

      // No :hover rule in the loaded styles shows, hides or resizes anything, so a tap never needs a hover first.
      const hoverReveals = await page.evaluate(() => {
        const found: string[] = [];
        const visit = (rules: CSSRuleList, active: boolean) => {
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule && active && rule.selectorText.includes(':hover')) {
              const style = rule.style;
              if (['display', 'visibility', 'height', 'max-height', 'clip', 'clip-path'].some((name) => style.getPropertyValue(name))) {
                found.push(rule.selectorText);
              }
            } else if (rule instanceof CSSMediaRule) {
              visit(rule.cssRules, active && matchMedia(rule.conditionText).matches);
            } else if ('cssRules' in rule) {
              visit((rule as CSSGroupingRule).cssRules, active);
            }
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            visit(sheet.cssRules, true);
          } catch {
            // A sheet from another origin cannot be read; the site self-hosts all of its own.
          }
        }
        return found;
      });
      expect(hoverReveals).toEqual([]);

      // 320-style guard: nothing sideways at the phone width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test('the home carousel hover zoom is inactive under touch, and its pause button is a real tap target', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#ways-to-study [data-mode-card][data-offset="0"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    expect(await card.evaluate((element) => getComputedStyle(element).scale)).toBe('none');

    const pause = page.locator('#ways-to-study').getByRole('button', { name: /^(pause|play) the (slideshow|animation)$/ }).first();
    if (await pause.isVisible()) {
      const box = await pause.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await pause.tap();
      await expect(pause).toHaveAccessibleName(/^play the /);
    }
  });
});
