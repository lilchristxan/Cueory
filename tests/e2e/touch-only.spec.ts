import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sizeOf } from './projects';

type TouchInputObservation = {
  maxTouchPoints: number;
  pointerdown: { isTrusted: boolean; pointerType: string } | null;
  touchstart: { changedTouchesLength: number; isTrusted: boolean; targetTouchesLength: number; touchesLength: number } | null;
};

async function recordLinuxWebkitTouchInput(page: Page, testInfo: TestInfo) {
  await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.type = 'button';
    probe.dataset.linuxWebkitTouchProbe = 'true';
    probe.textContent = 'touch input probe';
    const observation: TouchInputObservation = {
      maxTouchPoints: navigator.maxTouchPoints,
      pointerdown: null,
      touchstart: null,
    };
    const save = () => {
      probe.dataset.touchObservation = JSON.stringify(observation);
    };
    probe.addEventListener('pointerdown', (event) => {
      observation.pointerdown = { isTrusted: event.isTrusted, pointerType: event.pointerType };
      save();
    });
    probe.addEventListener('touchstart', (event) => {
      observation.touchstart = {
        changedTouchesLength: event.changedTouches.length,
        isTrusted: event.isTrusted,
        targetTouchesLength: event.targetTouches.length,
        touchesLength: event.touches.length,
      };
      save();
    });
    save();
    document.body.prepend(probe);
  });

  const probe = page.locator('[data-linux-webkit-touch-probe]');
  let tapError: unknown;
  try {
    await probe.tap();
  } catch (error) {
    tapError = error;
  } finally {
    const observation = await probe
      .evaluate((element) => JSON.parse((element as HTMLElement).dataset.touchObservation ?? '{}'))
      .catch(() => ({ probe: 'unavailable' }));
    await testInfo.attach('linux-webkit-trusted-touch', {
      body: JSON.stringify({
        platform: process.platform,
        tap: tapError === undefined ? 'completed' : 'failed',
        ...observation,
      }, null, 2),
      contentType: 'application/json',
    });
    await probe.evaluate((element) => element.remove()).catch(() => undefined);
  }
  if (tapError !== undefined) throw tapError;
}

async function expectNativeTouchInput(page: Page) {
  await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.type = 'button';
    probe.dataset.touchInputProbe = 'true';
    probe.textContent = 'touch input probe';
    probe.addEventListener('pointerdown', (event) => {
      probe.dataset.touchPointerType = event.pointerType;
    });
    probe.addEventListener('touchstart', () => {
      probe.dataset.touchStart = 'true';
    });
    document.body.prepend(probe);
  });

  const probe = page.locator('[data-touch-input-probe]');
  try {
    await probe.tap();
    await expect(probe).toHaveAttribute('data-touch-pointer-type', 'touch');
    await expect(probe).toHaveAttribute('data-touch-start', 'true');
  } finally {
    await probe.evaluate((element) => element.remove()).catch(() => undefined);
  }
}

/**
 * Touch-only check at 390 px: a phone has no hover. Nothing may depend on resting a pointer, so on the phone
 * projects (touch emulation) the pages must report no hover, carry no title="" tooltips, and show their
 * hover-polish rules as inactive. The phone projects are picked by what they are (phone-size window, touch screen),
 * never by name, so Safari's `webkit-phone` on Release pull requests is checked like `phone` and `phone-evening`.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panels never show then anyway.
    }
  });
});

const pages = ['/', '/play', '/learn', '/support', '/resources', '/progress', '/learn/study-skills'];

test.describe('touch only (no hover)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(sizeOf(testInfo) !== 'phone' || !testInfo.project.use.hasTouch, 'the touch-only check runs on the phone projects');
  });

  for (const path of pages) {
    test(`${path}: no hover, no title tooltips, and no hover-only reveal`, async ({ page, browserName }, testInfo) => {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);

      const media = await page.evaluate(() => ({
        hover: matchMedia('(hover: hover)').matches,
        fine: matchMedia('(pointer: fine)').matches,
        maxTouchPoints: navigator.maxTouchPoints,
        width: innerWidth,
      }));
      expect(media).toMatchObject({ hover: false, fine: false, width: 390 });
      if (process.platform === 'linux' && browserName === 'webkit') {
        await recordLinuxWebkitTouchInput(page, testInfo);
      }
      if (browserName === 'webkit') {
        await expectNativeTouchInput(page);
      } else {
        expect(media.maxTouchPoints).toBeGreaterThan(0);
      }

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

  test('the home vial platter lift is inactive under touch, and its arrows are real tap targets', async ({ page }) => {
    await page.goto('/');
    const platter = page.locator('#ways-to-study');
    const next = platter.locator('[data-platter-next]');
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeVisible();
    await expect(next).toHaveAccessibleName('next study method');
    const box = await next.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await next.tap();
    await expect(platter).toHaveAttribute('data-active', '1');
    // Nothing is hovered by a touch: the vial that came to the front is not lifted or glowing.
    const front = platter.locator('[data-platter-vial][data-active]');
    await expect(front).toHaveCSS('translate', 'none');
    await expect(front).toHaveCSS('filter', 'none');
  });
});
