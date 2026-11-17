import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { kitLandingUrl, newsletter, signupState } from '../../src/config/site';
import { SIGNUP_POPUP_STORAGE_KEY } from '../../src/scripts/signuppopup';
import { isDesktopOfEachEngine } from './projects';

// The launch-updates pop-up (lane 14): 10 seconds after a page opens, at most once every 3 hours, never on study or
// game screens, an accessible modal in Light and Evening. Fake time keeps every test fast.
const HOUR = 60 * 60 * 1000;
const state = signupState(newsletter.formAction, newsletter.landingUrl);
const popup = (page: Page) => page.getByRole('dialog', { name: 'get updates and study tips for nursing school success!' });

test.skip(state === 'pending', 'the pop-up only exists once Kit has a form or a landing page');

test.beforeEach(async ({ page }) => {
  // The once-only promo panel would otherwise come first and make the pop-up wait.
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); }
    catch { /* The page also works without storage. */ }
  });
});

async function openAt(page: Page, path: string, seenAgo?: number) {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') });
  if (seenAgo !== undefined) {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      SIGNUP_POPUP_STORAGE_KEY, String(Date.parse('2026-11-17T12:00:00Z') - seenAgo),
    ] as const);
  }
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
}

test('appears 10 seconds after the page opens, and remembers when', async ({ page }) => {
  await openAt(page, '/');
  await page.clock.runFor(9_000);
  await expect(popup(page)).toBeHidden();
  await page.clock.runFor(1_500);
  await expect(popup(page)).toBeVisible();
  const saved = await page.evaluate((key) => localStorage.getItem(key), SIGNUP_POPUP_STORAGE_KEY);
  expect(Number(saved)).toBeGreaterThan(0);
});

test('stays away within 3 hours of the last showing, and comes back after', async ({ page }) => {
  await openAt(page, '/privacy', 2 * HOUR);
  await page.clock.runFor(12_000);
  await expect(popup(page)).toBeHidden();
  await expect(page.getByTestId('signup-popup')).toHaveCount(1);

  await openAt(page, '/privacy', 3 * HOUR + 60_000);
  await page.clock.runFor(11_000);
  await expect(popup(page)).toBeVisible();
});

for (const path of ['/learn/study-skills', '/play/sudoku']) {
  test(`never appears on ${path}`, async ({ page }) => {
    await openAt(page, path);
    await page.clock.runFor(15_000);
    await expect(page.getByTestId('signup-popup')).toHaveCount(0);
    await expect(popup(page)).toHaveCount(0);
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('never appears', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await expect(popup(page)).toBeHidden();
  });
});

test('is hidden in print', async ({ page }) => {
  await openAt(page, '/');
  await page.clock.runFor(11_000);
  await expect(popup(page)).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('signup-popup')).toBeHidden();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`keyboard, focus and axe in ${scheme === 'light' ? 'Light' : 'Evening'}`, async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo) && testInfo.project.name !== 'phone', 'phone and desktop sizes');
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await openAt(page, '/');
    // Focus starts on a page link, so the test can see it come back.
    const before = page.getByRole('link', { name: "play today's games", exact: true }).first();
    await before.focus();
    await page.clock.runFor(11_000);
    const dialog = popup(page);
    await expect(dialog).toBeVisible();

    const close = dialog.getByRole('button', { name: 'close' });
    await expect(close).toBeFocused();
    // Reduced motion: no animation.
    expect(await dialog.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');

    // Every control is at least 44 px.
    const subscribe = state === 'form' ? dialog.getByRole('button', { name: 'subscribe' }) : dialog.getByRole('link', { name: /^subscribe/ });
    for (const control of [close, subscribe]) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    if (state === 'landing') {
      await expect(subscribe).toHaveAttribute('href', kitLandingUrl(newsletter.landingUrl));
      await expect(subscribe).toHaveAttribute('target', '_blank');
      await expect(subscribe).toHaveAttribute('rel', /\bnoopener\b/);
      await expect(subscribe).toHaveAccessibleName('subscribe (opens in a new tab)');
    }
    await expect(dialog.getByText('we respect your privacy. unsubscribe anytime.')).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'cueory' })).toBeVisible();

    // Tab and Shift+Tab stay inside, with a visible focus ring.
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-signup-popup]'))).toBe(true);
    }
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-signup-popup]'))).toBe(true);
    }
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return el.matches(':focus-visible') && style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    });
    expect(ring).toBe(true);

    const axe = await new AxeBuilder({ page })
      .include('[data-signup-popup]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // Escape closes it, focus goes back, and the 3-hour wait starts again from now.
    await page.evaluate((key) => localStorage.removeItem(key), SIGNUP_POPUP_STORAGE_KEY);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(before).toBeFocused();
    expect(await page.evaluate((key) => localStorage.getItem(key), SIGNUP_POPUP_STORAGE_KEY)).not.toBeNull();
  });
}

test('the × closes it and starts the 3-hour wait', async ({ page }) => {
  await openAt(page, '/');
  await page.clock.runFor(11_000);
  await page.evaluate((key) => localStorage.removeItem(key), SIGNUP_POPUP_STORAGE_KEY);
  await popup(page).getByRole('button', { name: 'close' }).click();
  await expect(popup(page)).toBeHidden();
  expect(await page.evaluate((key) => localStorage.getItem(key), SIGNUP_POPUP_STORAGE_KEY)).not.toBeNull();
  await page.reload();
  await page.clock.runFor(15_000);
  await expect(popup(page)).toBeHidden();
});

test('fits 320 px with 32 px text, with no sideways scroll', async ({ browser }, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'one large-text check per engine');
  for (const scheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL, viewport: { width: 320, height: 720 }, colorScheme: scheme, reducedMotion: 'reduce',
    });
    try {
      await context.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
      const page = await context.newPage();
      await openAt(page, '/');
      await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
      await page.clock.runFor(11_000);
      const dialog = popup(page);
      await expect(dialog).toBeVisible();
      const fit = await dialog.evaluate((el) => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        inside: el.scrollWidth - el.clientWidth,
        right: el.getBoundingClientRect().right,
      }));
      expect(fit.page).toBeLessThanOrEqual(0);
      expect(fit.inside).toBeLessThanOrEqual(0);
      expect(fit.right).toBeLessThanOrEqual(320);
      // The last control can still be reached: the pop-up scrolls inside itself on a short screen.
      await dialog.getByText('we respect your privacy. unsubscribe anytime.').scrollIntoViewIfNeeded();
      await expect(dialog.getByText('we respect your privacy. unsubscribe anytime.')).toBeInViewport();
    } finally {
      await context.close();
    }
  }
});
