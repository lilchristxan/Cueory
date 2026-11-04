import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { builtPages } from './built-pages';
import { isEveningProject } from './projects';
import { waitForIslands } from './wait-for-islands';

/**
 * Sweeps every built HTML file in dist/ with axe, checking the accessibility
 * standards listed in docs/ACCESSIBILITY.md.
 *
 * `npm run verify` builds `dist/` before Playwright starts. Pagefind's own
 * fragments and Astro assets aren't pages, so they are not part of the sweep.
 */
const missingPage = '/a11y-sweep-page-does-not-exist';
const pages = builtPages(missingPage);
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

test.describe('Task 196: headings and landmarks on every built route', () => {
  for (const route of pages) {
    test(`${route}: heading hierarchy, main and skip focus`, async ({ page }) => {
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* unavailable */ }
      });
      await page.goto(route);
      await waitForIslands(page, route);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      const skipped = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((headings) => {
        let previous = 0;
        const problems: string[] = [];
        for (const heading of headings) {
          // Closed dialogs are absent from the accessibility tree. Their menu
          // headings precede main in DOM order but are not part of this page state.
          if (heading.closest('dialog:not([open]), [hidden], [inert], [aria-hidden="true"]')) continue;
          const level = Number(heading.tagName.slice(1));
          if (level > previous + 1) problems.push(`${heading.tagName}: ${heading.textContent?.trim()}`);
          previous = level;
        }
        return problems;
      });
      expect(skipped, `${route}: skipped heading levels`).toEqual([]);
      const skip = page.locator('a[href="#main"]', { hasText: 'skip to content' });
      await expect(skip).toHaveCount(1);
      await page.keyboard.press('Tab');
      await expect(skip).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('main#main')).toBeFocused();
    });
  }
});

/**
 * Playwright runs the test matrix across the browser projects in playwright.config.ts.
 * We run every page against axe-core once in Chromium daytime and once in WebKit evening.
 */
test.describe('accessibility sweep across every built page', () => {
  for (const route of pages) {
    test(`${route}: axe sweep in both modes`, async ({ page }, testInfo) => {
      // Keep promo banners and one-time announcements from opening during the test.
      await page.addInitScript(() => {
        try {
          localStorage.setItem('cueory-promo-seen', String(Date.now()));
        } catch {
          // storage blocked
        }
      });

      await page.goto(route);
      await waitForIslands(page, route);

      const isEvening = isEveningProject(testInfo.project.name);
      const rootTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(rootTheme).toBe(isEvening ? 'dark' : 'light');

      const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      expect(
        results.violations.map((violation) => ({
          id: violation.id,
          help: violation.help,
          nodes: violation.nodes.map((node) => node.target),
        })),
      ).toEqual([]);
    });
  }
});
