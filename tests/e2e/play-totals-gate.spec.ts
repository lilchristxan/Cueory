import { expect, test, type Page } from '@playwright/test';
import { build, type PluginBuild } from 'esbuild';
import { readFileSync } from 'node:fs';

// The /play hub's left panel shows its four totals only to a signed-in player; everyone else sees the copper "create an
// account" bar (Christian, 2026-11-25), the same gate as the game frame's stats (game-stats-gate.spec.ts). The built
// pages run signed out (accounts are off in a test build), which play-status.spec.ts covers. Here the real PlayTotals
// island runs with built CSS inside the hub's own panel markup, and only the shared session read
// (src/islands/supabaseclient.ts) is replaced by an in-page stand-in. Nothing is added to the app for tests.

let fixtureCode: string;
let pendingCode: string;
let fixtureCss: string[];
test.beforeAll(async () => {
  const html = readFileSync('dist/play.html', 'utf8');
  fixtureCss = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]!);
  if (fixtureCss.length === 0) throw new Error('The production stylesheets were not found. Run npm run build.');
  const bundle = async (pending: boolean) => {
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import PlayTotals from './src/islands/PlayTotals.tsx';
      createRoot(document.getElementById('fixture')).render(<PlayTotals />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [...(pending ? [{ name: 'launch-box-pending', setup(builder: PluginBuild) {
      // The same site config with neither Kit's form nor its landing page: the launch box says only "sign ups open soon."
      builder.onLoad({ filter: /src[\\/]config[\\/]site\.ts$/ }, (args: { path: string }) => ({
        contents: readFileSync(args.path, 'utf8').replace(/formAction: '[^']*'/, "formAction: ''").replace(/landingUrl: '[^']*'/, "landingUrl: ''"), loader: 'ts',
      }));
    } }] : []), { name: 'fixture-session', setup(builder) {
      builder.onResolve({ filter: /\/supabaseclient(?:\.ts)?$/ }, () => ({ path: 'session', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        const params = new URLSearchParams(location.search);
        // The tests drive sign-in and sign-out through this, as another tab would.
        export async function getSupabase() {
          return { auth: { onAuthStateChange(cb) {
            window.fixtureAuth = cb;
            return { data: { subscription: { unsubscribe() { window.fixtureAuth = null; } } } };
          } } };
        }
        export async function getSessionState() {
          const wait = Number(params.get('wait') ?? 0);
          if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
          if (params.get('session') === 'fail') throw new Error('session-private-detail');
          return params.get('session') === 'in' ? { signedIn: true, userId: 'u-1', email: 'a@example.com' } : { signedIn: false };
        }
      `, loader: 'js' }));
    } }],
  });
    return result.outputFiles[0]!.text;
  };
  fixtureCode = await bundle(false);
  pendingCode = await bundle(true);
});

/** The hub's left panel with the totals island, and four results kept on this device. */
async function open(page: Page, query: string, pending = false) {
  await page.route('**/__totals-fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: pending ? pendingCode : fixtureCode }));
  await page.route('**/__totals-fixture?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>hub totals gate test</title>${fixtureCss.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head>
    <body><div class="@container mx-auto w-full max-w-(--play-hub-max)"><div class="grid gap-6 px-gutter py-4 sm:py-6 @5xl:grid-cols-(--play-hub-split) @5xl:gap-0 @5xl:p-0">
    <section id="panel" class="flex min-w-0 flex-col gap-5 rounded-xl bg-surface p-6 @5xl:rounded-none @5xl:p-12"><p>panel</p><div id="fixture"></div></section>
    <div id="below">rows</div></div></div><script src="/__totals-fixture.js"></script></body></html>` }));
  await page.goto('/__totals-fixture?none=1');
  await page.evaluate(() => {
    const day = (back: number) => {
      const d = new Date();
      d.setDate(d.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [
      { game: 'pulse', day: day(0), solved: true, tries: 4 },
      { game: 'pulse', day: day(1), solved: true, tries: 3 },
      { game: 'triage', day: day(1), solved: false, tries: 2 },
      { game: 'suture', day: day(3), solved: true, tries: 0 },
    ] }));
  });
  await page.goto(`/__totals-fixture?${query}`);
}
const totals = (page: Page) => page.getByTestId('play-totals');
const bar = (page: Page) => page.getByTestId('play-account-bar');
const belowTop = (page: Page) => page.locator('#below').evaluate((node) => node.getBoundingClientRect().top);
const slotHeight = (page: Page) => page.locator('.play-hub-account-slot').evaluate((node) => node.getBoundingClientRect().height);
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('hub totals, signed in', () => {
  test('show what this browser kept, and no bar', async ({ page }) => {
    await open(page, 'session=in');
    await expect(totals(page)).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByTestId('play-total-played')).toHaveText('4');
    await expect(page.getByTestId('play-total-solved')).toHaveText('75%');
    await expect(page.getByTestId('play-total-day-streak')).toHaveText('2');
    await expect(page.getByTestId('play-total-best-streak')).toHaveText('2');
    expect(await noSideways(page)).toBe(true);
  });

  test('draw nothing while the session check runs, then neither flash numbers nor move what is below', async ({ page }) => {
    await open(page, 'session=in&wait=700');
    await expect(page.locator('.play-hub-account-slot')).toBeAttached();
    await expect(totals(page)).toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
    const before = await belowTop(page);
    await expect(totals(page)).toBeVisible();
    expect(await belowTop(page)).toBe(before);
  });

  test('follow sign-out and sign-in from another tab without a reload, with the same room either way', async ({ page }) => {
    await open(page, 'session=in');
    await expect(totals(page)).toBeVisible();
    const before = await belowTop(page);
    await page.waitForFunction(() => Boolean((window as unknown as { fixtureAuth?: unknown }).fixtureAuth));
    await page.evaluate(() => (window as unknown as { fixtureAuth: (e: string, s: unknown) => void }).fixtureAuth('SIGNED_OUT', null));
    await expect(totals(page)).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    expect(await belowTop(page)).toBe(before);
    await page.evaluate(() => (window as unknown as { fixtureAuth: (e: string, s: unknown) => void }).fixtureAuth('SIGNED_IN', { user: { id: 'u-1' } }));
    await expect(totals(page)).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByTestId('play-total-played')).toHaveText('4');
    expect(await belowTop(page)).toBe(before);
  });
});

test.describe('hub totals, not signed in', () => {
  for (const query of ['session=out', 'session=fail']) {
    test(`show the copper create-an-account bar instead (${query}), on one line, and nothing moves when the check resolves`, async ({ page }) => {
      await open(page, `${query}&wait=500`);
      await expect(page.locator('.play-hub-account-slot')).toBeAttached();
      await expect(bar(page)).toHaveCount(0);
      const before = await belowTop(page);
      const link = bar(page).getByRole('link', { name: 'join the launch list' });
      await expect(link).toBeVisible();
      expect(await belowTop(page)).toBe(before);
      await expect(totals(page)).toHaveCount(0);
      await expect(link).toHaveClass(/copper-button/);
      await expect(link).toHaveText('join the launch list');
      await expect(link).toHaveAttribute('href', /^\/(#signup|signup)$/);
      await expect(link).toHaveAttribute('aria-describedby', 'play-account-note');
      await expect(page.locator('#play-account-note')).toHaveText('accounts open soon');
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeLessThan(60); // one line of text, never two
      const panel = (await page.locator('#panel').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(panel.x);
      expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      expect(await link.evaluate((n) => getComputedStyle(n).outlineStyle)).not.toBe('none');
      expect(await noSideways(page)).toBe(true);
    });
  }

  test('the bar and the totals take the same room, so the reserved holder fits both', async ({ page }) => {
    await open(page, 'session=in');
    await expect(totals(page)).toBeVisible();
    const withTotals = await slotHeight(page);
    await page.waitForFunction(() => Boolean((window as unknown as { fixtureAuth?: unknown }).fixtureAuth));
    await page.evaluate(() => (window as unknown as { fixtureAuth: (e: string, s: unknown) => void }).fixtureAuth('SIGNED_OUT', null));
    await expect(bar(page)).toBeVisible();
    expect(await slotHeight(page)).toBe(withTotals);
  });
});

test.describe('hub bar, accounts closed and neither Kit form nor landing page', () => {
  test('is a plain readable message: no link, nothing to tab to, the same room, no sideways scroll', async ({ page }) => {
    await open(page, 'session=out', true);
    await expect(page.getByTestId('play-account-message')).toHaveText('sign ups open soon.');
    await expect(page.getByTestId('play-account-bar').getByRole('link')).toHaveCount(0);
    await expect(page.getByTestId('play-account-bar').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('play-totals')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.locator('#panel :focus')).toHaveCount(0);
    expect(await slotHeight(page)).toBeGreaterThan(0);
    expect(await noSideways(page)).toBe(true);
  });
});
