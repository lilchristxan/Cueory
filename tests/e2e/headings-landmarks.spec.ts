import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');

function builtPages(folder = dist): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) routes.push(...builtPages(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') routes.push('/headings-landmarks-page-does-not-exist');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return [...new Set(routes)].sort();
}

const routes = builtPages();

test.describe('Task 196: headings and landmarks', () => {
  for (const route of routes) {
    test(`${route} has one main, one h1, a skip target, and a valid heading outline`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(route === '/headings-landmarks-page-does-not-exist' ? 404 : 200);

      await expect(page.locator('main#main')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveCount(1);

      const skip = page.locator('a[href="#main"]', { hasText: 'skip to content' });
      await expect(skip).toHaveCount(1);
      await skip.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('main#main')).toBeFocused();

      const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((headings) =>
        headings.map((heading) => Number(heading.tagName.slice(1))),
      );
      expect(levels[0]).toBe(1);
      for (let index = 1; index < levels.length; index++) {
        expect(levels[index]! - levels[index - 1]!).toBeLessThanOrEqual(1);
      }
    });
  }
});
