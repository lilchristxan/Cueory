import { expect, test, type Locator, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');

function builtRoutes(folder = dist): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) routes.push(...builtRoutes(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') routes.push('/sticky-header-page-does-not-exist');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return routes;
}

const routes = [...new Set(builtRoutes())].sort();

async function waitForIslands(page: Page, route: string): Promise<void> {
  try {
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0, undefined, {
      timeout: 10_000,
    });
  } catch {
    throw new Error(`${route}: islands did not finish loading within 10 s`);
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    throw new Error(`${route}: network requests did not settle within 10 s`);
  });
}

async function assertNotCovered(element: Locator, route: string, label: string): Promise<void> {
  const result = await element.evaluate((target) => {
    const header = document.querySelector<HTMLElement>('header[data-scroll-header]');
    if (!header) return { skipped: true as const };
    const headerRect = header.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const visibleHeader = headerRect.height > 0 && headerRect.bottom > 0;
    const overlaps = visibleHeader && targetRect.top < headerRect.bottom && targetRect.bottom > headerRect.top;
    return { skipped: false as const, overlaps, headerBottom: headerRect.bottom, targetTop: targetRect.top };
  });
  expect(result, `${route}: ${label} did not produce a focus target`).not.toEqual({ skipped: true });
  if (!result.skipped) {
    expect(result.overlaps, `${route}: ${label} is covered by the sticky header (header bottom ${result.headerBottom}, target top ${result.targetTop})`).toBe(false);
  }
}

test.describe('Task 270: sticky header overlap', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage unavailable */ }
    });
  });

  const cases = routes.flatMap((route) => {
    const states = route === '/preview/anatomy-text' ? ['closed', 'outer-open', 'all-open'] : ['closed'];
    return states.map((disclosureState) => ({ route, disclosureState }));
  });
  for (const { route, disclosureState } of cases) {
    test(`${route}: first heading and focused controls stay below the header (${disclosureState})`, async ({ page }) => {
      await page.goto(route);
      await waitForIslands(page, route);

      if (disclosureState !== 'closed') {
        for (const summary of await page.locator('[data-anatomy-text-practice] > summary').all()) {
          await summary.focus();
          await page.keyboard.press('Enter');
        }
        if (disclosureState === 'all-open') {
          for (const summary of await page.locator('[data-anatomy-text-practice] ol details > summary').all()) {
            await summary.focus();
            await page.keyboard.press('Enter');
          }
        }
        await page.locator('a[href="#main"]').focus();
        await page.keyboard.press('Shift+Tab');
      }

      const header = page.locator('header[data-scroll-header]');
      const heading = page.locator('main :is(h1, h2, h3, h4, h5, h6)').first();
      await expect(heading, `${route}: expected a heading in main`).toHaveCount(1);
      // The home hero deliberately uses an absolute overlay, not a sticky header.
      // Assert that contract explicitly. Every other route must provide the sticky header.
      if (route === '/') {
        await expect(header, 'home must not have a sticky scroll header').toHaveCount(0);
        const overlay = page.locator('header').first();
        await expect(overlay, 'home must retain its hero overlay header').toHaveCount(1);
        await expect(overlay).toHaveCSS('position', 'absolute');
        return;
      }
      await expect(header, `${route}: expected a sticky header`).toHaveCount(1);
      await heading.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
      await expect.poll(() => header.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(0);
      await assertNotCovered(heading, route, 'first heading');

      // One browser-side scan avoids a separate Playwright round trip for every
      // control. Large pages such as /play otherwise exceed the test timeout.
      const scan = await page.evaluate(() => {
        const stickyHeader = document.querySelector<HTMLElement>('header[data-scroll-header]');
        if (!stickyHeader) throw new Error('Sticky header disappeared before the control scan');
        const controls = Array.from(document.querySelectorAll<HTMLElement>(
          'main a[href], main button, main input, main select, main textarea, main [tabindex]:not([tabindex="-1"]), main details > summary:first-of-type',
        ));
        const isHiddenByDisclosure = (el: HTMLElement) => {
          // Layout rectangles and CSS visibility can include closed details content.
          // Each closed ancestor exposes only its first summary and that summary's descendants.
          for (let details = el.parentElement?.closest('details'); details; details = details.parentElement?.closest('details')) {
            if (!details.open && !details.querySelector(':scope > summary')?.contains(el)) return true;
          }
          return false;
        };
        const failures: string[] = [];
        let checked = 0;
        for (const [index, control] of controls.entries()) {
          if (!control.isConnected || control.getClientRects().length === 0 ||
              getComputedStyle(control).visibility === 'hidden' || control.matches(':disabled') ||
              control.closest('[inert], [aria-disabled="true"]') || isHiddenByDisclosure(control)) continue;
          control.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
          control.focus({ preventScroll: true });
          checked++;
          if (document.activeElement !== control) {
            failures.push('control ' + index + ': focus did not land on the target');
            continue;
          }
          const headerRect = stickyHeader.getBoundingClientRect();
          const targetRect = control.getBoundingClientRect();
          if (headerRect.height > 0 && headerRect.bottom > 0 &&
              targetRect.top < headerRect.bottom && targetRect.bottom > headerRect.top) {
            failures.push('control ' + index + ': covered (header bottom ' + headerRect.bottom +
              ', target top ' + targetRect.top + ')');
          }
        }
        return { found: controls.length, checked, failures };
      });
      expect(scan.failures, `${route}: ${scan.checked}/${scan.found} focus targets checked`).toEqual([]);
    });
  }
});
