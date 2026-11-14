import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

/**
 * Task 178: browser-level privacy regression for AnatomyLab's *parent*
 * report receipts. It renders the real AnatomyLab and code-made fixture with
 * a synthetic Supabase-compatible session interface. No real accounts, JWTs,
 * patient information or hosted RPCs are used. Transport/JWT binding is
 * tested separately in tests/unit/flagconnect.test.ts.
 */
let script = '';
let stylesheet = '';

test.beforeAll(async () => {
  const html = readFileSync('dist/index.html', 'utf8');
  stylesheet = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  if (!stylesheet) throw new Error('Built stylesheet not found.');

  // Keep the lab, FlagMount, report form, and receipt watcher real. Mock only
  // Supabase's account events and deferred RPC response so the switch occurs
  // deterministically, without network connections or real credentials.
  const fakeAuth = `
    let account = 'account-A';
    const listeners = new Set();
    let held = null;
    const reply = { data: '11111111-1111-4111-8111-111111111111', error: null };
    const session = () => account
      ? { user: { id: account, email: 'synthetic@example.test' }, access_token: 'test-only-token' }
      : null;
    const client = {
      auth: {
        async getSession() { return { data: { session: session() }, error: null }; },
        onAuthStateChange(callback) {
          listeners.add(callback);
          return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
        },
      },
      rpc(name, args) {
        let signal = null;
        let authorization = '';
        return {
          setHeader(header, value) {
            if (header === 'Authorization') authorization = value;
            return this;
          },
          abortSignal(value) { signal = value; return this; },
          then(onSuccess, onFailure) {
            const request = new Promise((resolve) => {
              held = { resolve, name, args, signal, authorization };
            });
            return request.then(onSuccess, onFailure);
          },
        };
      },
    };
    window.__cueoryTestUser = (id) => {
      account = id;
      for (const notify of listeners) notify(id ? 'SIGNED_IN' : 'SIGNED_OUT', session());
    };
    window.__cueoryTestFinishReport = () => {
      const call = held;
      held = null;
      // Model even a late server response after abort, to prove the parent
      // generation gate cannot publish the old user's completion.
      call?.resolve(reply);
    };
    window.__cueoryTestHasPendingReport = () => held !== null;
    export const getSupabase = async () => client;
    export async function sessionStateFrom(active) {
      const response = await active.auth.getSession();
      const user = response.data?.session?.user;
      if (!user || response.error) return { signedIn: false };
      return { signedIn: true, userId: user.id, email: user.email ?? '' };
    }
  `;
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import AnatomyLab from './src/islands/AnatomyLab.tsx';
        import { parseAnatomyFile } from './src/islands/anatomylab.ts';
        import fixture from './tests/fixtures/anatomy-fixture.json';
        const model = parseAnatomyFile(fixture, 'tests/fixtures/anatomy-fixture.json', { fixture: true });
        createRoot(document.getElementById('lab')).render(
          <AnatomyLab systems={[]} fixture={model} drafts={true} reportPage="/preview/anatomy-lab" />
        );
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'fixture-only-auth',
      setup(compiler) {
        compiler.onResolve({ filter: /supabaseclient(?:\.ts)?$/ }, () =>
          ({ path: 'supabase-test-auth', namespace: 'test-auth' }));
        compiler.onLoad({ filter: /.*/, namespace: 'test-auth' }, () =>
          ({ contents: fakeAuth, loader: 'ts' }));
      },
    }],
  });
  script = result.outputFiles[0]!.text;
});

test('a structure-report receipt belongs only to its original account after switching systems', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('**/__anatomy-report-fixture.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: script }));
  await page.route('**/__anatomy-report-fixture?*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="${stylesheet}"></head><body>
        <main id="lab"></main><script src="/__anatomy-report-fixture.js"></script>
        </body></html>`,
    }));

  await page.goto('/__anatomy-report-fixture?fixture=1');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  const catalog = page.getByRole('region', { name: 'structures' });
  await expect(catalog.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });

  const select = async (name: string) => {
    await catalog.getByRole('button', { name, exact: true }).click();
  };
  const send = async () => {
    await page.getByRole('button', { name: 'flag or comment', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'a typo' })).toBeVisible();
    await page.getByRole('radio', { name: 'a typo' }).check();
    await page.getByLabel('anything to add? (optional)').fill('synthetic name feedback');
    await page.getByRole('button', { name: 'send', exact: true }).click();
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __cueoryTestHasPendingReport?: () => boolean })
        .__cueoryTestHasPendingReport?.() ?? false)).toBe(true);
  };
  const switchUser = (account: string) =>
    page.evaluate((id) => {
      (window as typeof window & { __cueoryTestUser?: (userId: string) => void })
        .__cueoryTestUser?.(id);
    }, account);
  const finishReport = () => page.evaluate(() =>
    (window as typeof window & { __cueoryTestFinishReport?: () => void })
      .__cueoryTestFinishReport?.());

  // Account A sends a report for structure A. Changing the selected shape
  // should preserve the pending receipt for that SAME account.
  await select('fixture cube A');
  await send();
  await select('fixture cube B');
  const notices = page.getByTestId('anatomy-report-notices');
  await expect(notices).toContainText('report about anatomy structure FIX001');
  await expect(notices).toContainText('sending…');

  // Account B signs in from another tab (represented by the client's auth
  // broadcast). B must not inherit even the plain structure-report metadata.
  await switchUser('account-B');
  await expect(notices).toHaveCount(0);
  await finishReport(); // A's late RPC resolution cannot republish A's notice.
  await expect(notices).toHaveCount(0);

  // B's own report remains visible when selecting a different structure
  // and completes successfully if B does not switch accounts.
  await send();
  await select('fixture block C');
  await expect(notices).toContainText('report about anatomy structure FIX002');
  await finishReport();
  await expect(notices).toContainText('sent. thank you.');
  await expect(notices).not.toContainText('FIX001');
});
