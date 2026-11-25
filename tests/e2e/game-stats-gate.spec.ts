import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Game stats (played, % solved, streaks) are shown only to a signed-in player (Christian, 2026-11-25). The built
// pages run signed out (accounts are off in a test build), which the other specs cover. Here the real GameFrameStats
// island runs with built CSS, inside the frame's own sidebar markup, and only the shared session read
// (src/islands/supabaseclient.ts) is replaced by an in-page stand-in. Nothing is added to the app for tests.

let fixtureCode: string;
let fixtureCss: string[];
test.beforeAll(async () => {
  const html = readFileSync('dist/play/vialo.html', 'utf8');
  fixtureCss = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]!);
  if (fixtureCss.length === 0) throw new Error('The production stylesheets were not found. Run npm run build.');
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
    plugins: [{ name: 'fixture-session', setup(builder) {
      builder.onResolve({ filter: /\/supabaseclient(?:\.ts)?$/ }, () => ({ path: 'session', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        const params = new URLSearchParams(location.search);
        export async function getSessionState() {
          const wait = Number(params.get('wait') ?? 0);
          if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
          if (params.get('session') === 'fail') throw new Error('session-private-detail');
          return params.get('session') === 'in' ? { signedIn: true, userId: 'u-1', email: 'a@example.com' } : { signedIn: false };
        }
      `, loader: 'js' }));
    } }],
  });
  fixtureCode = result.outputFiles[0]!.text;
});

/** Opens the frame's sidebar with the stats island and this device's saved results (today and yesterday, both solved). */
async function open(page: Page, query: string) {
  await page.route('**/__stats-fixture.js', (route) => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__stats-fixture?*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>stats gate test</title>${fixtureCss.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head>
    <body><div class="game-frame"><div class="game-frame-layout"><aside class="game-frame-sidebar"><div class="game-frame-game-badge"><p class="game-frame-tagline">tagline</p></div><div id="fixture"></div></aside>
    <div class="game-frame-main"><div class="game-frame-board"></div></div></div></div><script src="/__stats-fixture.js"></script></body></html>` }));
  await page.goto('/__stats-fixture?none=1');
  await page.evaluate(() => {
    const day = (back: number) => {
      const d = new Date();
      d.setDate(d.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [
      { game: 'vialo', day: day(1), solved: true, tries: 3 },
      { game: 'vialo', day: day(0), solved: true, tries: 2 },
    ] }));
  });
  await page.goto(`/__stats-fixture?${query}`);
}
const panel = (page: Page) => page.getByTestId('game-frame-stats');
const value = (page: Page, label: string) => panel(page).locator('.game-frame-stat').filter({ hasText: label }).locator('.game-frame-stat-value');
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('game stats panel, signed in', () => {
  test('shows the saved numbers, labels at least 14 px on a phone and tablet, no sideways scroll', async ({ page }, info) => {
    await open(page, 'session=in');
    await expect(panel(page)).toBeVisible();
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

  test('announces the frame status line again', async ({ page }) => {
    await open(page, 'session=in');
    await expect(panel(page)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-stats-status', { detail: { message: 'vialo added to your stats.' } })));
    await expect(page.getByTestId('game-frame-stats-status')).toHaveText('vialo added to your stats.');
  });

  test('hello cards keeps its "questions asked" row, with zeros, as before', async ({ page }) => {
    await open(page, 'session=in&game=hello-cards');
    await expect(panel(page)).toHaveText(/0\s*questions asked\s*0\s*current streak\s*0\s*best streak\s*0\s*played/);
  });
});

test.describe('game stats panel, not signed in', () => {
  for (const query of ['session=out', 'session=fail']) {
    test(`renders nothing and announces nothing (${query}), and the page does not shift`, async ({ page }) => {
      await open(page, `${query}&wait=200`);
      await expect(page.locator('#fixture')).toBeAttached();
      const before = await page.locator('.game-frame-sidebar').evaluate((node) => node.getBoundingClientRect().height);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-stats-status', { detail: { message: 'vialo added to your stats.' } })));
      await page.waitForTimeout(500);
      await expect(panel(page)).toHaveCount(0);
      await expect(page.getByTestId('game-frame-stats-status')).toHaveCount(0);
      expect(await page.locator('#fixture').evaluate((node) => node.innerHTML)).toBe('');
      expect(await page.locator('.game-frame-sidebar').evaluate((node) => node.getBoundingClientRect().height)).toBe(before);
      expect(await noSideways(page)).toBe(true);
    });
  }
});
