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
      if (name === '404.html') routes.push('/tap-targets-page-does-not-exist');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return routes;
}

const pages = [...new Set(builtPages())].sort();

test.describe('Task 209: main-content tap targets', () => {
  test('the build supplies routes to the sweep', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const route of pages) {
    test(`${route} has usable button and link targets`, async ({ page }) => {
      const response = await page.goto(route);
      const expectedStatus = route === '/tap-targets-page-does-not-exist' ? 404 : 200;
      expect(response?.status(), `${route} should return HTTP ${expectedStatus}`).toBe(expectedStatus);
      await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const smallTargets = await page.locator('main a[href], main button').evaluateAll((elements) =>
        elements.flatMap((element) => {
          const el = element as HTMLElement;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (el.matches(':disabled, [aria-disabled="true"]') || style.visibility === 'hidden' ||
              style.display === 'none' || rect.width === 0 || rect.height === 0) return [];

          // Inline prose links are intentionally exempt. A link with a visual box, padding, or a button role is a
          // deliberate control and must still meet the minimum target size.
          // Tailwind's zero-width border reset may still report border-style: solid; test visible widths.
          const inlineTextLink = el.tagName === 'A' && style.display === 'inline' &&
            el.getAttribute('role') !== 'button' &&
            [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].every((value) => value === '0px') &&
            style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none' &&
            [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
              .every((width) => Number.parseFloat(width) === 0);
          if (inlineTextLink) return [];
          // Task 97 explicitly permits 24 px square letter targets on the fixed 11×11 Suture board.
          // This is limited to that grid. All other interactive controls still require 44 px.
          const sutureLetterCell = el.matches('button[data-cell]') && !!el.closest('[data-testid="suture"]');
          // D-pending (claude/sudoku-layout): sudoku squares shrink so the whole 9 × 9 board fits a phone, never under
          // 24 px (WCAG 2.2). Limited to the grid's squares; sudoku's number pad and other controls still need 44 px.
          const sudokuSquare = el.matches('button[role="gridcell"]') && !!el.closest('[data-testid="sudoku"] .sudoku-board');
          // D-pending (task-games-v2/vialo-keys; Christian, 23 Nov 2026): vialo's letter keys are a three-row phone
          // keyboard, so on a phone ten of them share one row. He approved letter keys at least 32 px wide there as long
          // as they are at least 52 px tall (a phone's own keyboard keys are narrower). Limited to vialo's letter keys on
          // a phone-width screen: enter, delete, every other control, and the same keys on tablet and desktop still need
          // 44 px. tests/e2e/vialo-keys.spec.ts checks the exact sizes and gaps.
          const vialoPhoneLetterKey = el.matches('.vialo-key:not(.vialo-key-wide)') && !!el.closest('[data-testid="vialo"]') &&
            window.innerWidth < 640;
          if (vialoPhoneLetterKey && rect.width >= 32 && rect.height >= 52) return [];
          const minimum = sutureLetterCell || sudokuSquare ? 24 : 44;
          if (rect.width >= minimum && rect.height >= minimum) return [];
          return [{
            tag: el.tagName.toLowerCase(),
            label: (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            minimum,
          }];
        }),
      );

      expect(smallTargets, `${route} has undersized main controls`).toEqual([]);
    });
  }
});
