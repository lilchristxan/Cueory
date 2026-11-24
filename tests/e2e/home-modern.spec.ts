import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { newsletter, signupState, site } from '../../src/config/site';

// The hero's ways in (redesign P5): the explore row's tiles, each to a page that exists today. The "start studying" call
// to action is closed (not a link) and the old quiet join link is gone.
const heroLinks: ReadonlyArray<readonly [string, string]> = [
  ['explore-lessons', '/learn'],
  ['explore-materials', '#ways-to-study'],
  ['explore-games', '/play'],
  ['explore-suggestions', '/message'],
];

test.beforeEach(async ({ page }) => {
  // The once-only marketing panel must not interrupt navigation and accessibility checks.
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); }
    catch { /* Storage may be blocked; the page still works. */ }
  });
});

for (const size of [
  { name: 'phone', viewport: { width: 320, height: 720 } },
  { name: 'tablet', viewport: { width: 820, height: 1180 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
]) {
  test.describe('home at ' + size.name + ' width', () => {
    test.use({ viewport: size.viewport });

    test('shows the redesigned hero, all sections and valid hero links', async ({ page }) => {
      const response = await page.goto('/');
      expect(response?.status()).toBe(200);

      // The redesigned hero (P5): motto, headline, a closed call to action, three value points, the Ko-fi card.
      await expect(page.locator('main h1')).toHaveText('nursing school made simpler.');
      await expect(page.getByText('by nursing students, for nursing students').first()).toBeVisible();
      const start = page.getByTestId('hero-start');
      await expect(start).toHaveText(/start studying for free/);
      // The browser-test build may show drafts, so the button is a link to the open sample lesson (the live build's
      // closed button is checked in tests/unit/home-sections.test.ts).
      await expect(start).toHaveAttribute('href', '/learn/study-skills');
      await expect(page.getByTestId('hero-join')).toHaveCount(0);
      await expect(page.locator('.scene-hero').getByText('adhd friendly')).toBeVisible();
      await expect(page.locator('.scene-hero .stage-points li').last()).toHaveText('adhd friendly');
      await expect(page.getByRole('list', { name: 'what you get' }).getByRole('listitem')).toHaveCount(3);
      await expect(page.getByTestId('hero-support')).toHaveAttribute('href', site.tipPageUrl);
      // No line under the button restates it (Christian, 2026-11-02).
      await expect(page.getByText('save your progress and pick up where you left off.')).toHaveCount(0);
      await expect(page.locator('#how-it-works')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 2, name: 'ways to study' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: "nurse's station games" })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'coming soon' })).toBeVisible();
      const lowerSectionIds = await page.locator('main > section[id]').evaluateAll((sections) => sections.map((section) => section.id));
      // Christian's final home board (20 Nov): the games come before the vials.
      expect(lowerSectionIds).toEqual([
        'daily-games', 'ways-to-study', 'signup',
      ]);
      await expect(page.getByTestId('games-stage')).toBeVisible();
      // The old feature tiles repeated the vials and the lesson link, so they left the home page.
      await expect(page.locator('#study-features')).toHaveCount(0);

      for (const [testId, href] of heroLinks) {
        const link = page.getByTestId(testId);
        await expect(link).toHaveAttribute('href', href);
        const destination = await page.request.get(href.replace(/#.*$/, '') || '/');
        expect(destination.status(), href).toBe(200);
      }
      // Unapproved break ideas are never linked.
      await expect(page.locator('main a[href="/breaks"]')).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: 'continue studying' })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('centers the hero, underlines the final word, and keeps the support pill on the stage', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      const measured = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const mid = (selector: string) => {
          const r = box(selector);
          return r.left + r.width / 2;
        };
        const stage = box('.stage-scene');
        const tip = box('.stage-tip');
        return {
          middle: document.documentElement.clientWidth / 2,
          centers: ['.hero-eyebrow', '#hero-heading', '.stage-actions', '.stage-points', '.stage-photo'].map(mid),
          underlineOffset: Math.abs(mid('.stage-underline') - mid('.stage-word')),
          pointsBeforeStage: box('.stage-points').bottom <= stage.top,
          tipLeft: tip.left - stage.left,
          tipRight: stage.right - tip.right,
          tipBottom: stage.bottom - tip.bottom,
          tipCenter: mid('.stage-tip'),
        };
      });
      for (const position of measured.centers) expect(Math.abs(position - measured.middle)).toBeLessThanOrEqual(2);
      expect(measured.underlineOffset).toBeLessThanOrEqual(2);
      expect(measured.pointsBeforeStage).toBe(true);
      expect(measured.tipLeft).toBeGreaterThanOrEqual(0);
      expect(measured.tipRight).toBeGreaterThanOrEqual(0);
      expect(measured.tipBottom).toBeGreaterThanOrEqual(0);
      if (size.viewport.width < 640) expect(Math.abs(measured.tipCenter - measured.middle)).toBeLessThanOrEqual(2);
      else expect(measured.tipCenter).toBeLessThan(measured.middle);
      await expect(page.locator('.stage-photo')).toHaveCSS('mask-image', /gradient/);
    });

    test('stops the seven-second halo orbit under reduced motion', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto('/');
      const halo = page.locator('.stage-halo i');
      await expect(halo).toBeVisible();
      await expect(halo).toHaveCSS('animation-duration', '7s');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(halo).toHaveCSS('animation-name', 'none');
      await expect(page.locator('.hero-accent')).toHaveCSS('animation-name', 'none');
    });

    test('keeps the explore dock immediately after the illustrated stage', async ({ page }) => {
      await page.goto('/');
      const gap = await page.evaluate(() => {
        const stage = document.querySelector('.stage-scene')!.getBoundingClientRect();
        const dock = document.querySelector('nav[aria-labelledby="explore-heading"]')!.getBoundingClientRect();
        return dock.top - stage.bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(-8);
      expect(gap).toBeLessThanOrEqual(2);
    });

    test('has accessible sections and comfortable hero-link targets', async ({ page }) => {
      await page.goto('/');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);

      for (const [testId] of heroLinks) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test.describe('home without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the approved lower sections and their links without a reveal script', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('#how-it-works')).toHaveCount(0);
    for (const [testId, href] of heroLinks) {
      await expect(page.getByTestId(testId)).toHaveAttribute('href', href);
      await expect(page.getByTestId(testId)).toBeVisible();
    }
      await expect(page.getByRole('heading', { level: 2, name: "nurse's station games" })).toBeVisible();
    await expect(page.getByTestId('games-stage')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'coming soon' })).toBeVisible();
    // The landmark names the signup, not only its "coming soon" heading.
    await expect(page.locator('#signup')).toHaveAccessibleName('launch updates coming soon');
    await expect(page.getByRole('region', { name: 'launch updates coming soon', exact: true })).toBeVisible();
    if (signupState(newsletter.formAction, newsletter.landingUrl) === 'form') {
      // This is intentionally not submitted: the browser must retain a useful, native form without a Kit script.
      const form = page.getByTestId('signup-form');
      const email = form.getByLabel('email address');
      const submit = form.getByRole('button', { name: 'join the list' });
      await expect(form).toBeVisible();
      await expect(email).toHaveAttribute('type', 'email');
      await expect(email).toHaveAttribute('placeholder', 'your email');
      await expect(submit).toBeVisible();
      await email.focus();
      await page.keyboard.press('Tab');
      await expect(submit).toBeFocused();
    }
  });
});

test('reduced motion never hides the new sections', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const section of ['#daily-games']) {
    const target = page.locator(section + ' [data-reveal-section]');
    await expect(target).toBeVisible();
    await expect(target).not.toHaveAttribute('data-reveal', 'waiting');
  }
});

test('a valid on-device study snapshot shows a resume strip linking to the saved page', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-resume', JSON.stringify({
        tool: 'cards',
        page: '/learn/study-skills/cards',
        itemIndex: 1,
        itemId: 'ss01-c02',
        totalItems: 3,
        answers: { 'ss01-c01': 'know' },
        timer: null,
        phase: 'working',
        version: 1,
        savedAt: Date.now(),
      }));
    } catch { /* No storage means no resume strip. */ }
  });
  await page.goto('/');
  const strip = page.getByRole('complementary', { name: 'continue studying' });
  await expect(strip).toBeVisible();
  const link = strip.getByRole('link', { name: 'continue cards, question 2 of 3' });
  await expect(link).toHaveAttribute('href', '/learn/study-skills/cards');
  await link.click();
  await expect(page).toHaveURL(/\/learn\/study-skills\/cards$/);
});


// The start link sits inside a wrapper that carries a travelling light, clipped to the wrapper's shape. If that clip
// ever catches the link again, its focus outline keeps the right computed style and still cannot be seen. So this looks
// at the pixels: tabbing onto the link must paint the focus colour in the outline's band outside the link's edge, on
// all four sides, and nothing is painted there before.
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`the start link's keyboard focus ring is painted, not clipped, at ${viewport.width} wide in ${scheme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); }
        catch { /* Storage may be blocked; the page still works. */ }
      });
      await page.goto('/');
      const start = page.getByTestId('hero-start');
      await expect(start).toBeVisible();
      const ring = page.locator('.hero-start-ring');
      await ring.scrollIntoViewIfNeeded();

      const readBand = async () => {
        const box = (await start.boundingBox())!;
        const { width: line, offset, colour } = await ring.evaluate((el) => {
          const probe = document.createElement('span');
          probe.style.cssText = 'outline: var(--focus-width) solid var(--color-focus); outline-offset: var(--focus-offset)';
          el.append(probe);
          const style = getComputedStyle(probe);
          const out = { width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset), colour: style.outlineColor };
          probe.remove();
          return out;
        });
        const pad = Math.ceil(offset + line) + 4;
        const clip = { x: Math.floor(box.x) - pad, y: Math.floor(box.y) - pad, width: Math.ceil(box.width) + 2 * pad, height: Math.ceil(box.height) + 2 * pad };
        const { data, info } = await sharp(await page.screenshot({ clip, scale: 'css' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const want = colour.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const pixel = (x: number, y: number) => { const i = (Math.round(y) * info.width + Math.round(x)) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
        const near = (a: number[]) => a.every((channel, i) => Math.abs(channel - want[i]) <= 36);
        // The middle of the outline band: offset plus half the line's width outside the link's edge.
        const out = offset + line / 2;
        const left = box.x - clip.x, top = box.y - clip.y;
        const points = {
          above: pixel(left + box.width / 2, top - out),
          below: pixel(left + box.width / 2, top + box.height + out),
          before: pixel(left - out, top + box.height / 2),
          after: pixel(left + box.width + out, top + box.height / 2),
        };
        return Object.fromEntries(Object.entries(points).map(([side, rgb]) => [side, near(rgb)]));
      };

      expect(await readBand(), 'no ring before the link has keyboard focus').toEqual({ above: false, below: false, before: false, after: false });
      // Keyboard, not script: leave the link and come back with Tab so :focus-visible is certain in every engine.
      await start.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(start).toBeFocused();
      expect(await readBand(), 'the focus colour is painted outside the link on every side').toEqual({ above: true, below: true, before: true, after: true });
      await context.close();
    });
  }
}

// "simpler." is large text, so it needs 3:1 against the silk behind it at every moment of the copper shine (11 s loop), in
// Light and Evening, and in the still state reduced motion shows. The glyph pixels are found by taking the word twice,
// once as drawn and once with the letters hidden, and comparing each interior glyph pixel with the pixel behind it.
const luminance = ([r, g, b]: number[]) => {
  const f = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`the copper shine on "simpler." at ${viewport.width} wide in ${scheme}`, () => {
      test.use({ viewport, colorScheme: scheme });

      async function worstContrast(page: import('@playwright/test').Page): Promise<number> {
        const word = page.locator('.hero-accent');
        const box = (await word.boundingBox())!;
        const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
        const grab = async () => sharp(await page.screenshot({ clip, scale: 'css' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const drawn = await grab();
        await word.evaluate((el) => {
          el.style.setProperty('color', 'transparent');
          el.style.setProperty('-webkit-text-fill-color', 'transparent');
          el.style.setProperty('background-image', 'none');
        });
        const behind = await grab();
        await word.evaluate((el) => {
          el.style.removeProperty('color');
          el.style.removeProperty('-webkit-text-fill-color');
          el.style.removeProperty('background-image');
        });
        const { data: a, info } = drawn;
        const b = behind.data;
        const isGlyph = (x: number, y: number) => {
          const i = (y * info.width + x) * 3;
          return Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 150;
        };
        let worst = Infinity;
        let counted = 0;
        for (let y = 2; y < info.height - 2; y++) {
          for (let x = 2; x < info.width - 2; x++) {
            // Interior pixels only: the anti-aliased edge blends the letter with the background.
            if (!(isGlyph(x, y) && isGlyph(x - 2, y) && isGlyph(x + 2, y) && isGlyph(x, y - 2) && isGlyph(x, y + 2))) continue;
            const i = (y * info.width + x) * 3;
            counted++;
            worst = Math.min(worst, contrast([a[i], a[i + 1], a[i + 2]], [b[i], b[i + 1], b[i + 2]]));
          }
        }
        expect(counted).toBeGreaterThan(100);
        return worst;
      }

      test('keeps 3:1 at 0%, 25%, 50%, 75% and 100% of the animation', async ({ page }) => {
        await page.addInitScript(() => {
          try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional */ }
        });
        await page.goto('/');
        const word = page.locator('.hero-accent');
        await expect(word).toBeVisible();
        for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
          await word.evaluate((el, p) => {
            el.style.animationPlayState = 'paused';
            el.style.animationDelay = `-${p * 11}s`;
          }, phase);
          expect(await worstContrast(page), `at ${phase * 100}%`).toBeGreaterThanOrEqual(3);
        }
      });

      test('shows a still, legible word under reduced motion', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
        await page.addInitScript(() => {
          try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional */ }
        });
        await page.goto('/');
        await expect(page.locator('.hero-accent')).toHaveCSS('animation-name', 'none');
        expect(await worstContrast(page)).toBeGreaterThanOrEqual(3);
      });
    });
  }
}
