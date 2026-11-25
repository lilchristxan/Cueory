import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { socials } from '../../src/config/site';

/** The Home header opens the side panel from the hamburger on phones and from the search button from 640 px wide. */
function homeMenuOpener(page: Page) {
  const name = page.viewportSize()!.width >= 640 ? 'search the site' : 'open site menu';
  return page.getByRole('button', { name, exact: true });
}

/**
 * The once-only promo panel (D-59). The page's clock is faked, so "5 seconds later" takes no real time. The other
 * browser tests (pages.spec.ts) start as if the panel had already been shown, so it never interrupts them.
 */
const KEY = 'cueory-promo-seen';
const DAY = 24 * 60 * 60 * 1000;
const promoPanel = (page: Page) => page.getByRole('dialog', { name: 'welcome to cueory.' });
const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();

/** Lets the page's clock run, as if the visitor had waited that long. */
const wait = (page: Page, ms: number) => page.clock.runFor(ms);

test.describe('once-only promo panel (D-59)', () => {
  test.beforeEach(async ({ page }) => {
    // The clock is installed AND paused before the page loads, so the panel's 5-second timer can neither arm nor fire
    // until a test runs the clock. An unpaused fake clock keeps real time flowing: on a busy machine the page's load
    // time (1.7 s measured) counted toward the 5 seconds and "hidden at 4.5 seconds" failed. Pausing after the page has
    // loaded would be too late, so the page loads at a clock that stands still.
    const start = new Date('2026-11-18T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1_000));
  });

  test('slides down after 5 seconds, takes focus without scrolling, moves nothing and passes axe', async ({ page }) => {
    await page.goto('/');
    // document.fonts.ready never settles while the page's clock is paused, so poll the status from here instead.
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
    const headline = page.locator('h1');
    const before = await headline.boundingBox();

    await wait(page, 4_500);
    await expect(promoPanel(page)).toBeHidden();
    await wait(page, 1_000);

    const panel = promoPanel(page);
    await expect(panel).toBeVisible();
    // It slides down into its place at the top of the window.
    expect(await panel.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('transform');
    await expect.poll(() => panel.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(40);

    // Focus moves to its close button, the page doesn't scroll, and nothing on the page moves.
    const close = panel.getByRole('button', { name: 'close' });
    await expect(close).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await headline.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // The launch list (until accounts exist), the supporting-our-mission page in a new tab, and every target at least
    // 44 px.
    const join = panel.getByRole('link', { name: 'join the launch list' });
    const support = panel.getByRole('link', { name: 'supporting our mission (opens in a new tab)' });
    await expect(join).toHaveAttribute('href', '/#signup');
    await expect(support).toHaveAttribute('href', 'https://ko-fi.com/cueory');
    await expect(support).toHaveAttribute('target', '_blank');
    await expect(support).toHaveAttribute('rel', 'noopener noreferrer');
    // The social marks (D-54): the profiles that have an address, each opening in a new tab.
    const socialLinks = panel.getByRole('list', { name: 'cueory elsewhere' }).getByRole('link');
    await expect(socialLinks).toHaveCount(socials.filter((social) => social.href).length);
    for (const { id, href } of socials.filter((social) => social.href)) {
      const link = panel.locator(`a[data-social="${id}"]`);
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    for (const target of [close, join, support, ...(await socialLinks.all())]) {
      const size = (await target.boundingBox())!;
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }

    // axe schedules work on the page's timers, which never fire while the clock is paused: every timing assertion
    // above is done, so let time flow again for the scan.
    await page.clock.resume();
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // Remembered on this device only: a date in local storage.
    expect(Number(await page.evaluate((key) => localStorage.getItem(key), KEY))).toBeGreaterThan(0);
  });

  test('a slow host cannot use up the 5 seconds: real time passing changes nothing, only the page clock does', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
    await page.waitForTimeout(5_500); // real time, longer than the panel's whole delay
    await expect(promoPanel(page)).toBeHidden();
    await wait(page, 4_500);
    await expect(promoPanel(page)).toBeHidden();
    await wait(page, 1_000);
    await expect(promoPanel(page)).toBeVisible();
  });

  test('comes as soon as the visitor scrolls halfway down, before 5 seconds', async ({ page }) => {
    await page.goto('/');
    await wait(page, 1_000);
    await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * 0.3));
    await wait(page, 500);
    await expect(promoPanel(page)).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * 0.6));
    await expect(promoPanel(page)).toBeVisible();
    // Focus moved without scrolling the visitor back up.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('never comes back on a refresh, on another page or later in the visit, but may again after 30 days', async ({
    page,
  }) => {
    await page.goto('/');
    await wait(page, 5_500);
    await expect(promoPanel(page)).toBeVisible();

    // Shown and ignored: still not again.
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await wait(page, 10_000);
    await expect(promoPanel(page)).toBeHidden();
    await page.goto('/support');
    await wait(page, 10_000);
    await expect(promoPanel(page)).toBeHidden();

    // A month later (fastForward can't jump that far at once, so the clock is set instead).
    await page.clock.setSystemTime(Date.now() + 31 * DAY);
    await page.goto('/support');
    await wait(page, 5_500);
    await expect(promoPanel(page)).toBeVisible();
  });

  test('Escape closes it, and focus goes back where it was', async ({ page }) => {
    await page.goto('/');
    const hero = page.getByTestId('explore-games');
    await hero.focus();
    await wait(page, 5_500);
    const panel = promoPanel(page);
    await expect(panel.getByRole('button', { name: 'close' })).toBeFocused();

    await page.keyboard.press('Escape');
    await wait(page, 500);
    await expect(panel).toBeHidden();
    await expect(hero).toBeFocused();
  });

  test('the close button closes it for good', async ({ page }) => {
    await page.goto('/privacy');
    await wait(page, 5_500);
    await promoPanel(page).getByRole('button', { name: 'close' }).click();
    await wait(page, 500);
    await expect(promoPanel(page)).toBeHidden();

    await page.reload();
    await wait(page, 10_000);
    await expect(promoPanel(page)).toBeHidden();
  });

  test('"join the launch list" goes to the launch-updates signup and closes the panel', async ({ page }) => {
    await page.goto('/');
    await wait(page, 5_500);
    await promoPanel(page).getByRole('link', { name: 'join the launch list' }).click();
    await wait(page, 500);
    await expect(page).toHaveURL(/\/#signup$/);
    await expect(promoPanel(page)).toBeHidden();
    await expect(page.locator('#signup')).toBeInViewport();
  });

  test('a link that opens a new tab closes the panel, and focus comes back where it was', async ({ page }) => {
    // Nothing leaves the test machine: the supporting-our-mission page's address is answered with an error.
    await page.context().route(/^https?:\/\/(?:[^/]*\.)?ko-fi\.com(?:[/:?#]|$)/, (route) => route.abort());
    await page.goto('/');
    const hero = page.getByTestId('explore-games');
    await hero.focus();
    await wait(page, 5_500);
    const popup = page.waitForEvent('popup');
    await promoPanel(page).getByRole('link', { name: /supporting our mission/ }).click();
    await (await popup).close();
    await wait(page, 500);
    await expect(promoPanel(page)).toBeHidden();
    await expect(hero).toBeFocused();
  });

  test('leaving the page closes it, so Back never brings it back (back/forward cache)', async ({ page }) => {
    await page.goto('/');
    await wait(page, 5_500);
    await expect(promoPanel(page)).toBeVisible();
    // What the browser fires when it keeps the page in its back/forward cache to show again on Back.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await expect(promoPanel(page)).toBeHidden();

    await page.goto('/privacy');
    await page.goBack();
    await wait(page, 10_000);
    await expect(promoPanel(page)).toBeHidden();
  });

  test('waits while the ☰ panel is open, then appears once it closes', async ({ page }) => {
    // Home v3: from the desktop width the home header shows the menu bar instead of the ☰ button, so use the phone width where the button is.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await homeMenuOpener(page).click();
    await expect(page.getByTestId('site-menu')).toBeVisible();
    await wait(page, 7_000);
    await expect(promoPanel(page)).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('site-menu')).toBeHidden();
    await wait(page, 600);
    await expect(promoPanel(page)).toBeVisible();
    await expect(promoPanel(page).getByRole('button', { name: 'close' })).toBeFocused();
  });

  test('waits until the ☰ panel has finished closing, so its focus never takes over', async ({ page }) => {
    // Home v3: from the desktop width the home header shows the menu bar instead of the ☰ button, so use the phone width where the button is.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await homeMenuOpener(page).click();
    await wait(page, 7_000);
    // The browser sends a dialog's "close" event a moment after the dialog closes, and the ☰ panel moves focus back to
    // its button then. Hold that event back, so the moment in between lasts long enough to test.
    await page.evaluate(() => {
      const hold = (event: Event) => {
        event.stopImmediatePropagation();
        window.removeEventListener('close', hold, true);
      };
      window.addEventListener('close', hold, true);
    });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('site-menu')).toBeHidden();
    await wait(page, 2_000);
    await expect(promoPanel(page)).toBeHidden();

    // The event arrives: focus goes back to ☰, and then the panel comes and takes it.
    await page.getByTestId('site-menu').evaluate((menu) => menu.dispatchEvent(new Event('close')));
    await expect(homeMenuOpener(page)).toHaveAttribute('aria-expanded', 'false');
    await wait(page, 600);
    await expect(promoPanel(page)).toBeVisible();
    await expect(promoPanel(page).getByRole('button', { name: 'close' })).toBeFocused();
  });

  test('with reduced motion it appears in place, with no slide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/support');
    await wait(page, 5_500);
    const panel = promoPanel(page);
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe('none');
    expect(await panel.evaluate((el) => getComputedStyle(el).transform)).toBe('none');

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('never appears on study screens or on the signup thank-you page', async ({ page }) => {
    for (const path of ['/learn/study-skills', '/learn/study-skills/cards', '/subscribed']) {
      await page.goto(path);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await wait(page, 10_000);
      await expect(page.getByTestId('promo'), path).toHaveCount(0);
    }
  });

  test('never appears in a browser that cannot remember it', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Storage is blocked', 'SecurityError');
        },
      });
    });
    await page.goto('/');
    await wait(page, 10_000);
    await expect(promoPanel(page)).toBeHidden();
  });
});

test.describe('promo panel without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('never appears', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('promo')).toBeHidden();
  });
});
