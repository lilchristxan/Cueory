import { expect, test, type Page } from '@playwright/test';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import { markPanelsSeen } from './clock';

/*
  A Light or Dark pick persists across page types, back/forward and reloads, and the page never shows the other palette
  first, not even for one frame (lane 9). theme-navigation.spec.ts covers the settled state; this spec checks the very
  first frame. An init script runs before the page's own scripts, watches for <body> to be created (the earliest the
  palette can paint) and for the first animation frame (the first paint), and records the theme both times and the page
  color at the first frame. Every
  record must match the settled page. The device is set to the opposite palette, so a late theme would show.
*/

const routes = ['/', '/learn/study-skills', '/play/pillo', '/privacy', '/no-such-page'];

interface Frame { at: string; theme: string | undefined; background: string }

async function recordFirstFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __themeFrames: Frame[] };
    w.__themeFrames = [];
    const record = (at: string) => {
      const body = document.body;
      w.__themeFrames.push({
        at,
        theme: document.documentElement.dataset.theme,
        // Only the first frame is a paint: when <body> is created the stylesheets may still be loading (they block
        // painting, not parsing), so its color then means nothing. Its theme attribute does.
        background: at === 'first frame' && body ? `${getComputedStyle(document.documentElement).backgroundColor} / ${getComputedStyle(body).backgroundColor}` : '',
      });
    };
    new MutationObserver((_changes, observer) => {
      if (document.body) {
        record('body created');
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
    // The browser does not paint until the stylesheets in <head> have loaded, so the first painted frame is the first
    // animation frame at which every stylesheet link has its sheet.
    const firstPaint = () => {
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
      if (document.body && links.every((l) => l.sheet)) record('first frame');
      else requestAnimationFrame(firstPaint);
    };
    requestAnimationFrame(firstPaint);
  });
}

async function settled(page: Page): Promise<Frame> {
  // Long enough for any transition on the page color to end.
  await page.waitForTimeout(600);
  return page.evaluate(() => ({
    at: 'settled',
    theme: document.documentElement.dataset.theme,
    background: `${getComputedStyle(document.documentElement).backgroundColor} / ${getComputedStyle(document.body).backgroundColor}`,
  }));
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __themeFrames: Frame[] }).__themeFrames);

async function pick(page: Page, choice: 'light' | 'dark') {
  const toggle = page.locator('[data-footer-toggle]');
  await toggle.scrollIntoViewIfNeeded();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.locator('[data-theme-picker]').getByRole('radio', { name: choice, exact: true }).check();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

for (const choice of ['light', 'dark'] as const) {
  test(`${choice}: persists everywhere and is right from the first frame`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: choice === 'light' ? 'dark' : 'light' });
    await page.goto('/');
    await pick(page, choice);
    await expect(page.locator('html')).toHaveAttribute('data-theme', choice);
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe(choice);

    await recordFirstFrames(page);
    const check = async (label: string) => {
      const end = await settled(page);
      expect(end.theme, `${label}: settled theme`).toBe(choice);
      const early = await frames(page);
      expect(early.length, `${label}: first frames recorded`).toBeGreaterThan(0);
      for (const frame of early) {
        expect(frame.theme, `${label}, ${frame.at}: theme`).toBe(choice);
        if (frame.background) expect(frame.background, `${label}, ${frame.at}: page color`).toBe(end.background);
      }
    };

    for (const route of routes) {
      await page.goto(route);
      await check(route);
      await page.reload();
      await check(`${route} after reload`);
    }
    await page.goBack();
    await check('back');
    await page.goForward();
    await check('forward');
  });
}

test('the theme is applied by a blocking script before any stylesheet or body', async ({ request }) => {
  for (const route of routes) {
    const html = await (await request.get(route)).text();
    const head = html.slice(0, html.indexOf('<body'));
    const script = head.indexOf(`localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})`);
    expect(script, `${route}: theme script in <head>`).toBeGreaterThan(-1);
    const firstSheet = head.search(/<link\b[^>]*rel="stylesheet"/);
    if (firstSheet > -1) expect(script, `${route}: theme script before the first stylesheet`).toBeLessThan(firstSheet);
    // Blocking: not deferred, async or a module.
    const tag = head.slice(head.lastIndexOf('<script', script), script);
    expect(tag).not.toMatch(/\b(defer|async|type="module")\b/);
  }
});
