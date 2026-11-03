import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');
const missing = '/no-javascript-route-does-not-exist';
function builtRoutes(folder = dist): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return builtRoutes(path);
    if (!entry.isFile() || !entry.name.endsWith('.html')) return [];
    const name = relative(dist, path).split(sep).join('/');
    if (name === '404.html') return [missing];
    if (name === 'index.html') return ['/'];
    return ['/' + name.replace(/(?:\/index)?\.html$/, '')];
  });
}
const routes = [...new Set(builtRoutes())].sort();
// These optional enhancements add no primary page content. Every other
// client-only island must have a local static explanation/alternative.
const optionalIslands = new Set(['ContinueBar', 'GameStatsPanel', 'GuestImportOffer']);

test.describe('Task 231 all routes without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  for (const route of routes) {
    test(`${route} keeps main content and island fallbacks`, async ({ page }, testInfo) => {
      test.skip(!['phone', 'desktop'].includes(testInfo.project.name), 'Phone and desktop Chromium boundary');
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(route === missing ? 404 : 200);
      const main = page.getByRole('main');
      await expect(main).toBeVisible();
      expect((await main.innerText()).trim().length, `${route}: main must not be blank`).toBeGreaterThan(0);
      const fallbacks = main.locator('noscript');
      for (const island of await main.locator('astro-island[client="only"]').all()) {
        const options = JSON.parse((await island.getAttribute('opts')) ?? '{}') as { name?: string };
        if (optionalIslands.has(options.name ?? '')) continue;
        const localFallback = island.locator('..').locator('noscript');
        expect(await localFallback.count(), `${route}: ${options.name} needs a local static alternative`).toBeGreaterThan(0);
      }
      for (const fallback of await fallbacks.all()) {
        await expect(fallback).toContainText(/\S/);
        await expect(fallback.locator(':scope > *').first()).toBeVisible();
      }
    });
  }
});
