import { expect, test, type Page } from '@playwright/test';
import { build, type PluginBuild } from 'esbuild';
import { readFileSync } from 'node:fs';

// Game stats (played, % solved, streaks) are shown only to a signed-in player (Christian, 2026-11-25). The built
// pages run signed out (accounts are off in a test build), which the other specs cover. Here the real GameFrameStats
// island runs with built CSS, inside the frame's own sidebar markup, and only the shared session read
// (src/islands/supabaseclient.ts) is replaced by an in-page stand-in. Nothing is added to the app for tests.

let fixtureCode: string;
let pendingCode: string;
let fixtureCss: string[];
test.beforeAll(async () => {
  const html = readFileSync('dist/play/vialo.html', 'utf8');
  fixtureCss = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]!);
  if (fixtureCss.length === 0) throw new Error('The production stylesheets were not found. Run npm run build.');
  const bundle = async (pending: boolean) => {
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import GameFrameStats from './src/islands/GameFrameStats.tsx';
      const params = new URLSearchParams(location.search);
      createRoot(document.getElementById('fixture')).render(<GameFrameStats game={params.get('game') ?? 'vialo'} />);
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
        // The page's tests drive sign-in and sign-out through this, as another tab would.
        export async function getSupabase() {
          return { auth: { onAuthStateChange(cb) {
            window.fixtureAuth = cb;
            return { data: { subscription: { unsubscribe() { window.fixtureAuth = null; } } } };
          } } };
        }
        export async function getSessionState() {
          const wait = Number(params.get('wait') ?? 0);
          if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
          window.fixtureReadDone = true;
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

/** Opens the frame's sidebar with the stats island and this device's saved results (today and yesterday, both solved). */
async function open(page: Page, query: string, seedGame = 'vialo', pending = false) {
  await page.route('**/__stats-fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: pending ? pendingCode : fixtureCode }));
  await page.route('**/__stats-fixture?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>stats gate test</title>${fixtureCss.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head>
    <body><div class="game-frame"><div class="game-frame-layout"><aside class="game-frame-sidebar"><div class="game-frame-game-badge"><p class="game-frame-tagline">tagline</p></div><div id="fixture"></div></aside>
    <div class="game-frame-main"><div class="game-frame-board"></div></div></div></div><script src="/__stats-fixture.js"></script></body></html>` }));
  await page.goto('/__stats-fixture?none=1');
  await page.evaluate((seed) => {
    const day = (back: number) => {
      const d = new Date();
      d.setDate(d.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [
      { game: seed, day: day(1), solved: true, tries: 3 },
      { game: seed, day: day(0), solved: true, tries: 2 },
    ] }));
  }, seedGame);
  await page.goto(`/__stats-fixture?${query}`);
}
const panel = (page: Page) => page.getByTestId('game-frame-stats');
const value = (page: Page, label: string) => panel(page).locator('.game-frame-stat').filter({ hasText: label }).locator('.game-frame-stat-value');
const bar = (page: Page) => page.getByTestId('game-frame-account-bar');
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('game stats panel, signed in', () => {
  test('shows the saved numbers, labels at least 14 px on a phone and tablet, no sideways scroll', async ({ page }, info) => {
    await open(page, 'session=in');
    await expect(panel(page)).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(value(page, '% solved')).toHaveText('100');
    await expect(value(page, 'current streak')).toHaveText('2');
    await expect(value(page, 'best streak')).toHaveText('2');
    await expect(value(page, 'played')).toHaveText('2');
    const labels = panel(page).locator('.game-frame-stat-label');
    await expect(labels).toHaveCount(4);
    if (!info.project.name.includes('desktop')) {
      for (let i = 0; i < 4; i += 1) {
        const size = await labels.nth(i).evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(size).toBeGreaterThanOrEqual(14);
      }
    }
    expect(await noSideways(page)).toBe(true);
  });

  test('waits for the session before showing anything, so signed-in players see no flash of zeros', async ({ page }) => {
    await open(page, 'session=in&wait=700');
    await expect(page.locator('#fixture')).toBeAttached();
    await expect(panel(page)).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(value(page, 'played')).toHaveText('2');
  });

  test('a slow signed-in session read that lands after sign-out does not bring the stats back', async ({ page }) => {
    await open(page, 'session=in&wait=700');
    await page.waitForFunction(() => Boolean((window as unknown as { fixtureAuth?: unknown }).fixtureAuth));
    expect(await page.evaluate(() => (window as unknown as { fixtureReadDone?: boolean }).fixtureReadDone === true)).toBe(false);
    await page.evaluate(() => (window as unknown as { fixtureAuth: (e: string, s: unknown) => void }).fixtureAuth('SIGNED_OUT', null));
    await expect(bar(page)).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { fixtureReadDone?: boolean }).fixtureReadDone === true);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(panel(page)).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
  });

  test('follows sign-out and sign-in from another tab without a reload', async ({ page }) => {
    await open(page, 'session=in');
    await expect(panel(page)).toBeVisible();
    await page.waitForFunction(() => Boolean((window as unknown as { fixtureAuth?: unknown }).fixtureAuth));
    await page.evaluate(() => (window as unknown as { fixtureAuth: (e: string, s: unknown) => void }).fixtureAuth('SIGNED_OUT', null));
    await expect(panel(page)).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    await page.evaluate(() => (window as unknown as { fixtureAuth: (e: string, s: unknown) => void }).fixtureAuth('SIGNED_IN', { user: { id: 'u-1' } }));
    await expect(panel(page)).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(value(page, 'played')).toHaveText('2');
  });

  test('announces the frame status line again', async ({ page }) => {
    await open(page, 'session=in');
    await expect(panel(page)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-stats-status', { detail: { message: 'vialo added to your stats.' } })));
    await expect(page.getByTestId('game-frame-stats-status')).toHaveText('vialo added to your stats.');
  });

  test('a returning player with saved stats for every game renders their numbers without console errors', async ({ page }) => {
    // Moved here from game-qa-fixes.spec.ts: the built pages are signed out, so the signed-in numbers are drawn by the
    // real island in this harness (client-rendered, so this covers render errors, not server-HTML hydration).
    const problems: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
    page.on('pageerror', (error) => problems.push(error.message));
    for (const game of ['vialo', 'cueword', 'triage', 'suture', 'stat']) {
      await open(page, `session=in&game=${game}`, game);
      await expect(panel(page)).toBeVisible();
      const values = await page.locator('.game-frame-stat-value').allTextContents();
      expect(values.some((v) => v !== '0'), `${game} shows a saved number`).toBe(true);
    }
    expect(problems).toEqual([]);
  });

  test('hello cards keeps its "questions asked" row, with zeros, as before', async ({ page }) => {
    await open(page, 'session=in&game=hello-cards');
    await expect(panel(page)).toHaveText(/0\s*questions asked\s*0\s*current streak\s*0\s*best streak\s*0\s*played/);
  });
});

test.describe('game stats panel, not signed in', () => {
  for (const query of ['session=out', 'session=fail']) {
    test(`shows the copper create-an-account bar instead (${query}), and nothing moves when the check resolves`, async ({ page }) => {
      await open(page, `${query}&wait=400`);
      const link = bar(page).getByRole('link', { name: 'join the launch list' });
      await expect(link).toBeVisible();
      const sidebar = page.locator('.game-frame-sidebar');
      const before = await sidebar.evaluate((node) => node.getBoundingClientRect().height);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-stats-status', { detail: { message: 'vialo added to your stats.' } })));
      await page.waitForTimeout(800);
      await expect(panel(page)).toHaveCount(0);
      await expect(page.getByTestId('game-frame-stats-status')).toHaveCount(0);
      expect(await sidebar.evaluate((node) => node.getBoundingClientRect().height)).toBe(before);
      // Exact words, a real address, one accessible name with the line as its description, a 44 px target.
      await expect(link).toHaveText('join the launch list');
      await expect(link).toHaveAttribute('href', /^\/(#signup|signup)$/);
      await expect(link).toHaveAttribute('aria-describedby', 'game-frame-account-note');
      await expect(page.locator('#game-frame-account-note')).toHaveText('accounts open soon');
      expect(await page.locator('#game-frame-account-note').evaluate((n) => getComputedStyle(n).fontStyle)).toBe('normal');
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      expect(await link.evaluate((n) => getComputedStyle(n).outlineStyle)).not.toBe('none');
      expect(await noSideways(page)).toBe(true);
    });
  }
});

test.describe('game stats bar, accounts closed and neither Kit form nor landing page', () => {
  test('is a plain readable message: no link, nothing to tab to', async ({ page }) => {
    await open(page, 'session=out', 'vialo', true);
    await expect(page.getByTestId('game-frame-account-message')).toHaveText('sign ups open soon.');
    await expect(bar(page).getByRole('link')).toHaveCount(0);
    await expect(bar(page).getByRole('button')).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.locator('.game-frame-sidebar :focus')).toHaveCount(0);
    expect(await noSideways(page)).toBe(true);
  });
});
