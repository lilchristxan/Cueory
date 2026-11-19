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

const START = Date.parse('2026-11-17T12:00:00Z');

/**
 * Starts fake time and opens a page. One init script seeds storage, once per tab, so a later navigation or reload
 * sees what the page itself saved: the promo panel counts as already shown (unless `promoDue`), so it doesn't come
 * first and make the pop-up wait, and `seenAgo` sets when the pop-up was last shown.
 *
 * `paused` stops the clock before the page loads, for checks just before the 10 seconds are up. An installed clock that
 * is not paused keeps real time flowing, so on a busy machine the time the page takes to load (and the test takes to
 * reach its next step) counts toward the 10 seconds, and "still hidden after 9 seconds" fails. Paused, the page's timer
 * moves only when the test runs the clock (the same fix as promo.spec.ts, #895).
 */
async function openAt(page: Page, path: string, options: { seenAgo?: number; promoDue?: boolean; paused?: boolean } = {}) {
  await page.clock.install({ time: new Date(START) });
  // Before any page has loaded there are no timers yet, so stopping the clock here skips nothing.
  if (options.paused) await page.clock.pauseAt(new Date(START + 1_000));
  await page.addInitScript(({ key, seen, promoDue }) => {
    try {
      if (sessionStorage.getItem('test-seeded')) return;
      sessionStorage.setItem('test-seeded', '1');
      if (promoDue) localStorage.removeItem('cueory-promo-seen');
      else localStorage.setItem('cueory-promo-seen', String(Date.now()));
      if (seen !== null) localStorage.setItem(key, String(seen));
    } catch {
      // The page also works without storage.
    }
  }, {
    key: SIGNUP_POPUP_STORAGE_KEY,
    seen: options.seenAgo === undefined ? null : START - options.seenAgo,
    promoDue: options.promoDue ?? false,
  });
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
}

test('appears 10 seconds after the page opens, and remembers when', async ({ page }) => {
  await openAt(page, '/', { paused: true });
  await page.clock.runFor(9_000);
  await expect(popup(page)).toBeHidden();
  await page.clock.runFor(1_500);
  await expect(popup(page)).toBeVisible();
  const saved = await page.evaluate((key) => localStorage.getItem(key), SIGNUP_POPUP_STORAGE_KEY);
  expect(Number(saved)).toBeGreaterThan(0);
});

test('a slow host cannot use up the 10 seconds: real time passing changes nothing, only the page clock does', async ({ page }) => {
  await openAt(page, '/', { paused: true });
  await page.waitForTimeout(1_500); // real time: with 9 seconds of page time below, more than the whole delay
  await page.clock.runFor(9_000);
  await expect(popup(page)).toBeHidden();
  await page.clock.runFor(1_500);
  await expect(popup(page)).toBeVisible();
});

test('stays away within 3 hours of the last showing', async ({ page }) => {
  await openAt(page, '/privacy', { seenAgo: 2 * HOUR });
  await page.clock.runFor(12_000);
  await expect(popup(page)).toBeHidden();
  await expect(page.getByTestId('signup-popup')).toHaveCount(1);
});

test('comes back once 3 hours have passed', async ({ page }) => {
  await openAt(page, '/privacy', { seenAgo: 3 * HOUR + 60_000 });
  await page.clock.runFor(11_000);
  await expect(popup(page)).toBeVisible();
});

test('leaving the page while it is open counts as closing, so the wait starts again then', async ({ page }) => {
  await openAt(page, '/');
  await page.clock.runFor(11_000);
  await expect(popup(page)).toBeVisible();
  // The visitor leaves it open for nearly 3 hours, then follows a link away.
  await page.clock.fastForward('02:59:00');
  const leftAt = await page.evaluate(() => Date.now());
  await page.goto('/privacy');
  const saved = Number(await page.evaluate((key) => localStorage.getItem(key), SIGNUP_POPUP_STORAGE_KEY));
  expect(saved).toBeGreaterThanOrEqual(leftAt);
  // Past the first showing's 3 hours, but not 3 hours since leaving: it stays away.
  await page.clock.fastForward('00:02:00');
  await page.clock.runFor(11_000);
  await expect(popup(page)).toBeHidden();
});

test('stays away on a page where the once-only promo panel is due', async ({ page }) => {
  await openAt(page, '/', { promoDue: true });
  await page.clock.runFor(15_000);
  await expect(page.getByTestId('promo')).toBeVisible();
  await expect(popup(page)).toBeHidden();
  // Closing the promo panel doesn't bring the pop-up on this page either.
  await page.getByTestId('promo').getByRole('button', { name: 'close' }).click();
  await page.clock.runFor(15_000);
  await expect(popup(page)).toBeHidden();
});

// Rule (coordinator's decision on #832): once a "flag or comment" report has been opened on a page, the pop-up is
// skipped for the rest of that page view. No retry after the report closes, so focus stays where the report put it,
// and nothing is saved, so the pop-up may appear on a later page.
const footerFlag = (page: Page) => page.locator('[data-footer-flag]').getByRole('button', { name: 'flag or comment' });
const savedTime = (page: Page) => page.evaluate((key) => localStorage.getItem(key), SIGNUP_POPUP_STORAGE_KEY);

for (const scheme of ['light', 'dark'] as const) {
  test(`after a footer report is opened, skips the page view and leaves focus on the opener (${scheme === 'light' ? 'Light' : 'Evening'})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await openAt(page, '/');
    const flag = footerFlag(page);
    await flag.click();
    await expect(flag).toHaveAttribute('aria-expanded', 'true');
    const report = page.locator(`#${await flag.getAttribute('aria-controls')}`);
    await expect(report).toBeVisible();

    // Past 10 seconds the report stays usable: the pop-up doesn't open over it.
    await page.clock.runFor(12_000);
    await expect(popup(page)).toBeHidden();
    expect(await report.evaluate((el) => el.closest('[inert]') === null)).toBe(true);

    // The report closes and puts focus back on its opener; well past the old 500 ms retry, focus is still there.
    await report.focus();
    await page.keyboard.press('Escape');
    await expect(flag).toHaveAttribute('aria-expanded', 'false');
    await expect(flag).toBeFocused();
    await page.clock.runFor(1_500);
    await expect(flag).toBeFocused();
    await expect(popup(page)).toBeHidden();
    await page.clock.runFor(15_000);
    await expect(popup(page)).toBeHidden();
    // A skipped page view saves nothing...
    expect(await savedTime(page)).toBeNull();

    // ...so the pop-up may appear on a later page as usual.
    await page.goto('/privacy');
    await page.clock.runFor(11_000);
    await expect(popup(page)).toBeVisible();
  });
}

test('after the per-game corner flag opens the footer report, the page view is skipped too', async ({ page }) => {
  await openAt(page, '/');
  // A stand-in for #833's game-corner flag, which opens the same footer report form: an a[data-game-flag] link.
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '#footer-flag';
    link.dataset.gameFlag = '';
    link.textContent = 'flag or comment on this game';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      document.querySelector<HTMLButtonElement>('[data-footer-flag] button[aria-controls]')?.click();
    });
    document.querySelector('main')?.append(link);
  });
  const gameFlag = page.locator('a[data-game-flag]');
  await gameFlag.click();
  await expect(footerFlag(page)).toHaveAttribute('aria-expanded', 'true');
  await page.clock.runFor(2_000);
  const report = page.locator(`#${await footerFlag(page).getAttribute('aria-controls')}`);
  await report.focus();
  await page.keyboard.press('Escape');
  await expect(footerFlag(page)).toHaveAttribute('aria-expanded', 'false');
  // Focus is wherever the report put it (the footer button today; the game flag once #833 lands), never the pop-up.
  // (Focus can come back a frame after the report closes, so it is polled, not read once.)
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.matches('a[data-game-flag], [data-footer-flag] button') ?? false))
    .toBe(true);
  await page.clock.runFor(1_500);
  await page.clock.runFor(15_000);
  await expect(popup(page)).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.matches('a[data-game-flag], [data-footer-flag] button') ?? false)).toBe(true);
  expect(await savedTime(page)).toBeNull();
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
    const before = page.getByTestId('games-link');
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

    if (state === 'form') {
      // Keep this browser test from sending a request to Kit even if client-side validation regresses.
      await page.route(newsletter.formAction, (route) => route.abort());
      const email = dialog.getByLabel('email address', { exact: true });
      await subscribe.focus();
      await page.keyboard.press('Enter');
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      await expect(email).toBeFocused();
      await expect(email).toHaveCSS('border-top-style', 'dashed');
      await expect(email).toHaveCSS('outline-style', 'solid');

      await page.keyboard.press('Tab');
      await expect(subscribe).toBeFocused();
      await expect(email).toHaveCSS('border-top-style', 'dashed');
      await expect(email).toHaveCSS('outline-style', 'none');

      await page.keyboard.press('Shift+Tab');
      await expect(email).toBeFocused();
      await expect(email).toHaveCSS('border-top-style', 'dashed');
      await expect(email).toHaveCSS('outline-style', 'solid');
      expect(await email.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThan(0);
    }

    // Escape closes it, focus goes back, and the 3-hour wait starts again from now.
    await page.evaluate((key) => localStorage.removeItem(key), SIGNUP_POPUP_STORAGE_KEY);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(before).toBeFocused();
    expect(await page.evaluate((key) => localStorage.getItem(key), SIGNUP_POPUP_STORAGE_KEY)).not.toBeNull();
  });
}

/**
 * Asks the page to scroll by `dy`: a mouse wheel where the browser has one; mobile WebKit has none ("Mouse wheel is not
 * supported in mobile WebKit"), so there the page itself is asked with scrollBy (the same fallback as tryScroll in
 * game-results.spec.ts). Either way it is only a request: a locked page must ignore it. `overflow: hidden` alone would
 * still let scrollBy through, so this also checks that the body is fixed in place like the game results lock.
 */
async function requestScroll(page: Page, browserName: string, isMobile: boolean | undefined, dy: number) {
  if (browserName === 'webkit' && isMobile) await page.evaluate((y) => window.scrollBy(0, y), dy);
  else await page.mouse.wheel(0, dy);
}

test('the page behind stays put while it is open, and scroll and focus come back on close', async ({ page, browserName, isMobile }) => {
  await openAt(page, '/privacy');
  // Scroll down to the page's first link and focus it, so the test can see focus come back to it, still on screen.
  await page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>('main a[href]');
    link?.scrollIntoView({ block: 'center', behavior: 'instant' });
    link?.setAttribute('data-test-focus', '');
    link?.focus({ preventScroll: true });
  });
  const before = page.locator('[data-test-focus]');
  await expect(before).toBeFocused();
  const startY = await page.evaluate(() => window.scrollY);
  expect(startY).toBeGreaterThan(0);
  // Where the page sits on screen: the lock fixes the body in place, so while it is open the page's own scroll position
  // reads 0 and what the visitor sees is the link's place on screen, which must not move.
  const linkTop = () => before.evaluate((link) => link.getBoundingClientRect().top);
  const startTop = await linkTop();

  await page.clock.runFor(11_000);
  await expect(popup(page)).toBeVisible();
  expect(await linkTop()).toBe(startTop);
  // A wheel over the dimmed page, outside the pop-up, doesn't move the page underneath.
  const viewport = page.viewportSize()!;
  await page.mouse.move(4, viewport.height - 4);
  await requestScroll(page, browserName, isMobile, 700);
  await page.clock.runFor(500);
  expect(await linkTop()).toBe(startTop);
  // Nor does a wheel over the pop-up itself.
  const box = (await popup(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await requestScroll(page, browserName, isMobile, 700);
  await page.clock.runFor(500);
  expect(await linkTop()).toBe(startTop);

  await page.keyboard.press('Escape');
  await expect(popup(page)).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(startY);
  expect(await linkTop()).toBe(startTop);
  await expect(before).toBeFocused();
  await expect(before).toBeInViewport();
});

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
      // On a short screen the pop-up scrolls inside itself, without moving the page behind it (measured on screen: the
      // lock fixes the body in place, so the page's own scroll position stays 0 while it is open).
      const pageTop = () => page.evaluate(() => document.body.getBoundingClientRect().top);
      const pageY = await pageTop();
      const box = (await dialog.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 400);
      await page.clock.runFor(500);
      await expect.poll(() => dialog.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await pageTop()).toBe(pageY);
      // The last control can still be reached: the pop-up scrolls inside itself on a short screen.
      await dialog.getByText('we respect your privacy. unsubscribe anytime.').scrollIntoViewIfNeeded();
      await expect(dialog.getByText('we respect your privacy. unsubscribe anytime.')).toBeInViewport();
    } finally {
      await context.close();
    }
  }
});
