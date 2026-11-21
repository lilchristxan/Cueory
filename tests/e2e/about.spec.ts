import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

const headings = [
  'we know nursing school is hard.',
  'our mission',
  'how we make our lessons',
  "what's coming",
  'help keep cueory free.',
] as const;

async function tabTo(page: Page, target: Locator, label: string) {
  for (let attempts = 0; attempts < 24; attempts++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error(`Keyboard focus did not reach ${label}`);
}

async function expectKeyboardFocusRing(target: Locator) {
  const focus = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { kind: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(focus.kind).not.toBe('none');
  expect(focus.width).toBeGreaterThanOrEqual(1);
}

test.describe('about page', () => {
  test('shows the design sections with founder-owned copy, without publishing unfinished text', async ({ page }) => {
    await page.goto('/about');

    await expect(page.getByText('/ about us', { exact: true })).toBeVisible();
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1, main h2')).toHaveText([...headings]);
    await expect(page.locator('main section')).toHaveCount(4);

    const paragraphs = page.locator('main p');
    await expect(paragraphs).toHaveCount(6);
    await expect(page.locator('main p[data-placeholder="CHRISTIAN-TEXT"]')).toHaveCount(1);
    await expect(page.locator('main p[data-placeholder="CHRISTIAN-TEXT"]')).toHaveText("[Christian's story: why Cueory exists, in his own words.]");
    await expect(page.locator('main p').filter({ hasText: 'To make studying for nursing school simpler' })).toHaveCount(1);
    await expect(page.locator('main p').filter({ hasText: 'Mental Health I and Med Math are next' })).toHaveCount(1);

    await expect(page.locator('main section').nth(1).locator('li')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByRole('link', { name: 'join the mailing list' })).toHaveAttribute('href', '/#signup');
    await expect(page.getByRole('link', { name: 'support on Ko-fi (opens in a new tab)' })).toHaveAttribute('href', 'https://ko-fi.com/cueory');
    await expect(page.getByRole('link', { name: 'support on Ko-fi (opens in a new tab)' })).toHaveAttribute('target', '_blank');
  });

  test('page calls to action receive natural keyboard focus and activate safely', async ({ page, context }) => {
    const signup = page.getByRole('link', { name: 'join the mailing list' });
    // This test owns the page CTAs, not either once-only launch panel that can take focus after navigation.
    await markPanelsSeen(page);
    await page.goto('/about');
    await tabTo(page, signup, 'join the mailing list');
    await expect(signup).toBeFocused();
    // A keyboard round trip establishes :focus-visible across Chromium's page-load focus state.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(signup).toBeFocused();
    await expectKeyboardFocusRing(signup);
    await Promise.all([
      page.waitForURL(/\/#signup$/),
      page.keyboard.press('Enter'),
    ]);

    // The outbound destination is intercepted so this keyboard check never contacts Ko-fi.
    await context.route('https://ko-fi.com/cueory', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<title>intercepted Ko-fi destination</title>',
    }));
    try {
      await page.goto('/about');
      const support = page.getByRole('link', { name: 'support on Ko-fi (opens in a new tab)' });
      await tabTo(page, support, 'support on Ko-fi');
      await expect(support).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(support).toBeFocused();
      await expectKeyboardFocusRing(support);

      const popupPromise = page.waitForEvent('popup');
      await page.keyboard.press('Enter');
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      expect(popup.url()).toBe('https://ko-fi.com/cueory');
      await expect(popup).toHaveTitle('intercepted Ko-fi destination');
    } finally {
      await context.unroute('https://ko-fi.com/cueory');
    }
  });

  for (const width of [320, 390]) {
    test(`${width}px phone: the headline draws four large lines, each fitting the column`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/about');

      const heading = page.locator('main h1');
      const lines = await heading.evaluate((element) => {
        const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
        const column = element.getBoundingClientRect();
        // Each line's own text box (a block span is always as wide as the column, its words may not be).
        const spans = [...element.querySelectorAll('span')].map((span) => {
          const range = document.createRange();
          range.selectNodeContents(span);
          const box = range.getBoundingClientRect();
          return { top: Math.round(box.top), right: box.right, rows: range.getClientRects().length };
        });
        return {
          count: Math.round(column.height / lineHeight),
          tops: new Set(spans.map((span) => span.top)).size,
          fits: spans.every((span) => span.rows === 1 && span.right <= column.right + 1),
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        };
      });
      expect(lines.count).toBe(4);
      expect(lines.tops).toBe(4);
      expect(lines.fits).toBe(true);
      expect(lines.fontSize).toBeGreaterThan(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${viewport.name} ${colorScheme}: accessible, readable and without sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme });
        await page.goto('/about');

        await expect(page.getByRole('heading', { level: 1, name: 'we know nursing school is hard.' })).toBeVisible();
        await expect(page.locator('main .veil')).toHaveCount(4);

        const headingFont = await page.locator('main h1').evaluate((element) => getComputedStyle(element).fontFamily);
        const bodyFont = await page.locator('main p').first().evaluate((element) => getComputedStyle(element).fontFamily);
        expect(headingFont).toContain('Bodoni Moda');
        expect(bodyFont).toContain('Lato');

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        for (const link of await page.locator('main a').all()) {
          const bounds = await link.boundingBox();
          expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
          expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
        }

        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
      });
    }
  }
});
