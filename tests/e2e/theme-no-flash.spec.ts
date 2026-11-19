import { expect, test, type Page } from '@playwright/test';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import { markPanelsSeen } from './clock';

/*
  A Light or Dark pick persists across page types, back/forward and reloads, and the page never shows the other palette
  first, not even for one frame (lane 9). theme-navigation.spec.ts covers the settled state; this spec checks the start.

  An init script runs before the page's own scripts and records:
  - "body created": the theme attribute the moment <body> exists (the earliest anything can paint);
  - "frame 1", "frame 2" ...: the theme and the page color (the <html> background, which carries the palette) at every
    animation frame from the very first one until the page has been styled for three frames, so the first styled frame
    is never skipped. Before the stylesheet applies the color is transparent: nothing of either palette is drawn then,
    so those frames are checked for the theme only.
  Every record's theme must match the settled page, every styled frame's color must too, and there must be a frame-1
  sample and a styled sample. The device is set to the opposite palette, so a theme applied late would show. A negative control removes the head theme script and applies
  the theme after load instead, and the same check must catch it.
*/

const routes = ['/', '/learn/study-skills', '/play/pillo', '/privacy', '/no-such-page'];
// Sample every frame until the page is styled, up to about a second, so the first styled frame is never skipped.
const FRAMES = 60;

const UNSTYLED = 'rgba(0, 0, 0, 0)';

interface Sample { at: string; theme: string | undefined; color?: string }

async function recordFirstFrames(page: Page) {
  await page.addInitScript((frames) => {
    const w = window as unknown as { __themeSamples: Sample[] };
    w.__themeSamples = [];
    const theme = () => document.documentElement.dataset.theme;
    new MutationObserver((_changes, observer) => {
      if (document.body) {
        w.__themeSamples.push({ at: 'body created', theme: theme() });
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
    let n = 0;
    let styled = 0;
    const frame = () => {
      n += 1;
      const color = getComputedStyle(document.documentElement).backgroundColor;
      w.__themeSamples.push({ at: `frame ${n}`, theme: theme(), color });
      // Keep a few styled frames after the first, then stop.
      if (color !== 'rgba(0, 0, 0, 0)') styled += 1;
      if (n < frames && styled < 3) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, FRAMES);
}

async function settled(page: Page): Promise<Sample> {
  // Long enough for any transition on the page color to end, and for every recorded frame to have run.
  await page.waitForTimeout(600);
  return page.evaluate(() => ({
    at: 'settled',
    theme: document.documentElement.dataset.theme,
    color: getComputedStyle(document.documentElement).backgroundColor,
  }));
}

const samples = (page: Page) => page.evaluate(() => (window as unknown as { __themeSamples: Sample[] }).__themeSamples);

/** Every early sample that disagrees with the settled page, or a reason the samples cannot prove anything. */
function problems(early: Sample[], end: Sample, choice: string): string[] {
  const found: string[] = [];
  if (end.theme !== choice) found.push(`settled theme is ${end.theme}, expected ${choice}`);
  if (!early.some((s) => s.at === 'body created')) found.push('no sample when <body> was created');
  if (!early.some((s) => s.at === 'frame 1')) found.push('no sample at frame 1');
  const styled = early.filter((s) => s.color !== undefined && s.color !== UNSTYLED);
  if (styled.length === 0) found.push('no styled frame was sampled');
  for (const s of early) {
    if (s.theme !== end.theme) found.push(`${s.at}: theme ${s.theme}, settled ${end.theme}`);
  }
  for (const s of styled) {
    if (s.color !== end.color) found.push(`${s.at}: page color ${s.color}, settled ${end.color}`);
  }
  return found;
}

async function pick(page: Page, choice: 'light' | 'dark') {
  const toggle = page.locator('[data-footer-toggle]');
  await toggle.scrollIntoViewIfNeeded();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.locator('[data-theme-picker]').getByRole('radio', { name: choice, exact: true }).check();
}

// No fake clock here: animation frames must run exactly as in a real visit. markPanelsSeen then uses the real time.
test.beforeEach(async ({ page }) => {
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
      const early = await samples(page);
      expect(problems(early, end, choice), `${label}\n${JSON.stringify(early)}`).toEqual([]);
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

test('negative control: a theme applied after load is caught', async ({ page }) => {
  // Dark is saved, the device is Light. The head theme script is removed and the theme is set only after load, the
  // flash this spec exists to catch. The same check must report it.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript((key) => {
    try { localStorage.setItem(key, 'dark'); } catch { /* the page works without storage */ }
    addEventListener('load', () => setTimeout(() => { document.documentElement.dataset.theme = 'dark'; }, 150));
  }, THEME_STORAGE_KEY);
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const html = (await response.text()).replace(/<script>try\{var t=localStorage\.getItem\([^<]*<\/script>/, '');
    await route.fulfill({ response, body: html });
  });
  await recordFirstFrames(page);
  await page.goto('/privacy');
  const end = await settled(page);
  expect(end.theme).toBe('dark');
  const found = problems(await samples(page), end, 'dark');
  expect(found.some((p) => /^frame \d+: (page color|theme)/.test(p)), found.join('\n')).toBe(true);
});

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
