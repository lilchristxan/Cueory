import { expect, test } from '@playwright/test';
import { kitFormAction, kitLandingUrl, newsletter, signupState } from '../../src/config/site';
import { sizeOf } from './projects';

const homeSizes = new Set(['phone', 'desktop']);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // The home page remains usable when storage is blocked.
    }
  });
});

test.describe('home page-specific behavior', () => {
  test('keeps its section order, primary links, and signup state', async ({ page }, testInfo) => {
    test.skip(!homeSizes.has(sizeOf(testInfo)), 'Task 400 runs at phone and desktop sizes only.');

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const identifiedSections = page.locator('main > section[id]');
    await expect(page.locator('main > section')).toHaveCount(4);
    await expect(identifiedSections).toHaveCount(3);
    const sectionIds = await identifiedSections.evaluateAll((sections) => sections.map((section) => section.id));
    expect(sectionIds).toEqual([
      'ways-to-study',
      'daily-games',
      'signup',
    ]);

    await expect(page.getByTestId('games-link')).toHaveAttribute('href', '/play');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'start with what you need.',
      'one lesson, multiple ways to study',
      'a few minutes, every day.',
      'coming soon',
    ]);

    await expect(page.getByText('a new set of nursing games each day. play one, or all three.')).toBeVisible();
    const games = page.getByTestId('games-stage');
    await expect(games.locator('[data-game-card]')).toHaveCount(5);
    await expect(games.locator('[data-game-card="crossword"]')).toContainText('coming soon');
    await expect(games.locator('[data-game-card="hello cards"]')).toContainText('coming soon');
    await expect(games.locator('[data-game-card="sudoku"]')).toContainText('fill every row, column and box with the numbers one through nine.');

    // The launch-updates box follows src/config/site.ts: Kit's form, a link to Kit's landing page, or the pending line.
    const state = signupState(newsletter.formAction, newsletter.landingUrl);
    await expect(page.getByTestId('signup-form')).toHaveCount(state === 'form' ? 1 : 0);
    await expect(page.getByTestId('signup-landing')).toHaveCount(state === 'landing' ? 1 : 0);
    if (state === 'pending') await expect(page.getByTestId('signup-pending')).toHaveText('sign ups open soon.');
    else await expect(page.getByTestId('signup-pending')).toHaveCount(0);
    if (state === 'landing') {
      const landing = page.getByTestId('signup-landing');
      await expect(landing).toHaveAttribute('href', kitLandingUrl(newsletter.landingUrl));
      await expect(landing).toHaveAttribute('target', '_blank');
      await expect(landing).toHaveAttribute('rel', /\bnoopener\b/);
      await expect(landing).toHaveAccessibleName('get launch updates (opens in a new tab)');
      await expect(landing).toHaveText('get launch updates');
      await landing.scrollIntoViewIfNeeded();
      const box = (await landing.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Keyboard: the link takes focus with a visible ring. Nothing is followed, so no request leaves the test machine.
      await landing.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(landing).toBeFocused();
      expect(await landing.evaluate((el) => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none')).toBe(true);
    }
    if (state === 'form') {
      // The configured Kit path remains a plain HTML form. Do not submit it: that would create a real subscription.
      const form = page.getByTestId('signup-form');
      const email = form.getByLabel('email address');
      const submit = form.getByRole('button', { name: 'join the list' });
      await expect(form).toHaveAttribute('action', kitFormAction(newsletter.formAction));
      await expect(email).toHaveAttribute('name', newsletter.emailFieldName);
      await expect(email).toHaveAttribute('type', 'email');
      await expect(email).toHaveAttribute('placeholder', 'your email');
      await expect(submit).toBeVisible();
      await email.scrollIntoViewIfNeeded();
      await email.focus();
      await page.keyboard.press('Tab');
      await expect(submit).toBeFocused();
    }
  });

  test('keeps the daily-games action keyboard focus visible on its inverted stage in Light and Evening', async ({ page }, testInfo) => {
    test.skip(!homeSizes.has(sizeOf(testInfo)), 'Task 400 runs at phone and desktop sizes only.');

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      const action = page.getByTestId('games-link');
      await action.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(action).toBeFocused();

      const focus = await action.evaluate((element) => {
        const stage = element.closest<HTMLElement>('[data-testid="games-stage"]')!;
        const rgb = (color: string) => color.match(/\d+/g)!.slice(0, 3).map(Number).map((channel) => channel / 255);
        const luminance = (color: string) => {
          const [red, green, blue] = rgb(color).map((channel) =>
            channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
          );
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const style = getComputedStyle(element);
        const outline = luminance(style.outlineColor);
        const stagePaint = luminance(getComputedStyle(stage).backgroundColor);
        return {
          visible: element.matches(':focus-visible') && style.outlineStyle !== 'none',
          width: style.outlineWidth,
          offset: style.outlineOffset,
          contrast: (Math.max(outline, stagePaint) + 0.05) / (Math.min(outline, stagePaint) + 0.05),
        };
      });

      expect(focus.visible).toBe(true);
      expect(focus.width).toBe('3px');
      expect(focus.offset).toBe('3px');
      expect(focus.contrast).toBeGreaterThanOrEqual(3);
    }
  });

  test('opens and closes a study-mode preview with keyboard-safe focus', async ({ page }, testInfo) => {
    test.skip(!homeSizes.has(sizeOf(testInfo)), 'Task 400 runs at phone and desktop sizes only.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const activeCard = page.locator('[data-mode-card][data-active]');
    const openButton = activeCard.locator('[data-mode-open]');
    await expect(openButton).toBeVisible();
    const originalTitle = (await activeCard.locator('h3').textContent()) ?? '';
    await openButton.click();

    const dialog = page.getByRole('dialog', { name: /.+/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(originalTitle);
    await expect(dialog.getByRole('button', { name: 'close preview' })).toBeFocused();

    await dialog.getByRole('button', { name: 'next study mode' }).click();
    await expect(dialog.getByRole('heading', { level: 2 })).not.toHaveText(originalTitle);
    await dialog.getByRole('button', { name: 'close preview' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-mode-card][data-active] [data-mode-open]')).toBeFocused();
  });
});
