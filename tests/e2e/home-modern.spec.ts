import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { accountLaunch, accountsOpen, newsletter, showsHeroJoin } from '../../src/config/site';

// The hero's ways in (lane 14 home polish): today's games, and the quiet join link once it leads somewhere.
const launch = accountLaunch(accountsOpen);
const heroLinks: ReadonlyArray<readonly [string, string]> = showsHeroJoin(accountsOpen, newsletter.formAction)
  ? [['hero-play', '/play'], ['hero-join', launch.accountHref]]
  : [['hero-play', '/play']];

test.beforeEach(async ({ page }) => {
  // The once-only marketing panel must not interrupt navigation and accessibility checks.
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); }
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

    test('keeps the approved hero, all sections and valid hero links', async ({ page }) => {
      const response = await page.goto('/');
      expect(response?.status()).toBe(200);

      // The approved hero is not rewritten by Task 83.
      await expect(page.locator('main h1')).toHaveText('nursing school is hard enough.');
      await expect(page.locator('#hero-heading + p')).toHaveText('cueory makes studying simpler.');
      await expect(page.getByTestId('hero-play')).toHaveText("play today's games");
      if (heroLinks.length === 2) await expect(page.getByTestId('hero-join')).toHaveText(launch.promoJoinLabel);
      else await expect(page.getByTestId('hero-join')).toHaveCount(0);
      // No line under the button restates it (Christian, 2026-11-02).
      await expect(page.getByText('save your progress and pick up where you left off.')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 2, name: 'how it works' })).toBeVisible();
      await expect(page.locator('#how-it-works li')).toHaveCount(3);
      await expect(page.getByRole('heading', { level: 3, name: "come back to what you're still learning" })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'ways to study' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'daily games' })).toBeVisible();
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

  test('shows all sections and their links without a reveal script', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 2, name: 'how it works' })).toBeVisible();
    await expect(page.locator('#how-it-works li')).toHaveCount(3);
    for (const [testId, href] of heroLinks) {
      await expect(page.getByTestId(testId)).toHaveAttribute('href', href);
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 2, name: 'daily games' })).toBeVisible();
  });
});

test('reduced motion never hides the new sections', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const section of ['#how-it-works', '#daily-games']) {
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
