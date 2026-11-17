import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

// #789: the review island stops the account sync's sign-in listener when it closes. The real ReviewSession and
// createReviewSync run over an in-page stand-in client (no network); the fixture is intercepted, never shipped.

let fixtureCode: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import ReviewSession from './src/islands/ReviewSession.tsx';
      import { createReviewSync } from './src/islands/reviewsync.ts';
      const listeners = new Set();
      window.listenerCount = () => listeners.size;
      const client = {
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'owner-sample', email: '' } } }, error: null }),
          onAuthStateChange(callback) {
            listeners.add(callback);
            return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
          },
        },
        from: () => { throw new Error('no request expected'); },
      };
      const sync = createReviewSync(client, 'owner-sample');
      const card = (id) => ({ id, front: 'sample front ' + id, back: 'sample back ' + id });
      const root = createRoot(document.getElementById('fixture'));
      const show = (ids) => root.render(
        <ReviewSession cards={ids.map(card)} histories={{}} today="2026-11-02" onSave={() => {}} sync={sync} />,
      );
      show(['sample-1']);
      window.newCards = () => show(['sample-1', 'sample-2']);
      window.closeReview = () => root.unmount();
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    // No accounts configuration in the fixture: the shared client module stays inert, and the sync uses the stand-in.
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  });
  fixtureCode = result.outputFiles[0]!.text;
});

test('closing the review stops the sync listening; new cards keep it', async ({ page }) => {
  await page.route('**/__review-sync-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__review-sync-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><title>review sync test</title></head>
    <body><main><div id="fixture"></div></main><script src="/__review-sync-fixture.js"></script></body></html>` }));
  await page.goto('/__review-sync-fixture');
  await expect(page.getByText('sample front sample-1')).toBeVisible();
  const count = () => page.evaluate(() => (window as unknown as { listenerCount: () => number }).listenerCount());
  expect(await count()).toBe(1);

  // A reset for new cards remounts the inner session but is the same review: the sync keeps listening.
  await page.evaluate(() => (window as unknown as { newCards: () => void }).newCards());
  await expect(page.getByText('2 cards to review today')).toBeVisible();
  expect(await count()).toBe(1);

  await page.evaluate(() => (window as unknown as { closeReview: () => void }).closeReview());
  await expect(page.getByText('sample front sample-1')).toHaveCount(0);
  expect(await count()).toBe(0);
});
