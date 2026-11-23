import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
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
      await expect(page.locator('.scene-hero').getByText('less overwhelm, more focus')).toBeVisible();
      await expect(page.getByRole('list', { name: 'what you get' }).getByRole('listitem')).toHaveCount(3);
      await expect(page.getByTestId('hero-support')).toHaveAttribute('href', site.tipPageUrl);
      // No line under the button restates it (Christian, 2026-11-02).
      await expect(page.getByText('save your progress and pick up where you left off.')).toHaveCount(0);
      await expect(page.locator('#how-it-works')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 2, name: 'ways to study' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: "nurse's station games" })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'coming soon' })).toBeVisible();
      const lowerSectionIds = await page.locator('main > section[id]').evaluateAll((sections) => sections.map((section) => section.id));
      expect(lowerSectionIds).toEqual([
        'ways-to-study', 'daily-games', 'signup',
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

    test('centers the one-column hero and keeps the desktop hero inside the page container', async ({ page }) => {
      await page.goto('/');
      if (size.viewport.width >= 1024) {
        const left = (await page.locator('.scene-hero .\\@container').boundingBox())!.x;
        const sectionLeft = (await page.locator('nav[aria-labelledby="explore-heading"]').boundingBox())!.x;
        // Inside the same centered container as the sections below (the page gutter is the only difference), not at the screen edge.
        expect(left).toBeGreaterThanOrEqual(sectionLeft);
        expect(left - sectionLeft).toBeLessThanOrEqual(40);
        expect(sectionLeft).toBeGreaterThan(40);
        const figure = (await page.locator('.hero-figure').boundingBox())!;
        expect(figure.x + figure.width).toBeLessThanOrEqual(size.viewport.width);
        return;
      }
      const center = async (loc: ReturnType<typeof page.locator>) => {
        const box = await loc.boundingBox();
        expect(box).not.toBeNull();
        return box!.x + box!.width / 2;
      };
      const viewportCenter = size.viewport.width / 2;
      const column = page.locator('.scene-hero .\\@container');
      expect(Math.abs((await center(column)) - viewportCenter)).toBeLessThanOrEqual(2);
      for (const loc of [page.locator('main h1'), page.getByTestId('hero-support'), page.locator('.hero-curve')]) {
        expect(Math.abs((await center(loc)) - viewportCenter)).toBeLessThanOrEqual(2);
      }
      // The buttons are centered as a group (the start button, its "coming soon" tag when closed, and the games button).
      const boxes = await page.locator('[data-testid="hero-start"], #hero-start-soon, [data-testid="hero-play-games"]').evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })),
      );
      const groupCenter = (Math.min(...boxes.map((b) => b.left)) + Math.max(...boxes.map((b) => b.right))) / 2;
      expect(Math.abs(groupCenter - viewportCenter)).toBeLessThanOrEqual(2);
    });

    test('keeps the gap between the Ko-fi card and the Explore panel at normal section spacing below the desktop layout', async ({ page }) => {
      test.skip(size.viewport.width >= 1024, 'the desktop hero lays the figure beside the text');
      await page.goto('/');
      const gap = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="hero-support"]')!.getBoundingClientRect();
        const explore = document.querySelector('nav[aria-labelledby="explore-heading"]')!.getBoundingClientRect();
        const probe = document.createElement('div');
        probe.style.height = 'var(--spacing-section)';
        document.body.appendChild(probe);
        const section = probe.getBoundingClientRect().height;
        probe.remove();
        return { gap: explore.top - card.bottom, section };
      });
      expect(gap.section).toBeGreaterThan(0);
      expect(gap.gap).toBeGreaterThan(0);
      expect(gap.gap).toBeLessThanOrEqual(gap.section);
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
