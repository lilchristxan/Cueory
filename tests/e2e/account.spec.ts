import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/** Tab through every visible control; each one must be reached and show a focus outline. */
async function keyboardWalk(page: Page) {
  const controls = page.locator('main a[href]:visible, main button:visible, main input:visible');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  const reached = new Set<number>();
  // Start Tab at the top of the page. The second walk begins right after a click on "delete my account", and Tab goes on
  // from the clicked control. Chromium wraps round to the controls above it after the last stop; Firefox keeps focus
  // on the last control, so those controls above were never reached. Focus and drop a marker at the very start of the
  // page (the browser then starts sequential focus navigation from there).
  await page.evaluate(() => {
    const marker = document.createElement('span');
    marker.tabIndex = -1;
    document.body.prepend(marker);
    marker.focus();
    marker.remove();
  });
  for (let press = 0; press < count + 30 && reached.size < count; press++) {
    await page.keyboard.press('Tab');
    for (let index = 0; index < count; index++) {
      if (await controls.nth(index).evaluate(element => element === document.activeElement)) {
        reached.add(index);
        expect(await controls.nth(index).evaluate(element => {
          const style = getComputedStyle(element);
          return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        })).toBe(true);
      }
    }
  }
  expect(reached.size).toBe(count);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(results.violations.map(result => `${result.id}: ${result.help}`)).toEqual([]);
}

// These run in every Playwright project: phone, tablet and desktop sizes, and the Evening palette.
test.describe('/account with accounts off', () => {
  test('renders a plain, unindexed page that says accounts open soon', async ({ page }) => {
    const errors: string[] = [];
    const remote: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/supabase/.test(new URL(request.url()).hostname)) remote.push(request.url()); });
    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1, name: 'account settings', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('account settings · cueory');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByTestId('signin-unavailable')).toContainText('accounts open soon');
    await expect(page.locator('main input')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/silk/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(remote).toEqual([]);
  });

  test('is keyboard-complete with visible focus', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByTestId('signin-unavailable')).toBeVisible();
    await keyboardWalk(page);
  });

  test('passes accessibility checks', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByTestId('signin-unavailable')).toBeVisible();
    await axe(page);
  });
});

// Browser-only component fixture, intercepted by Playwright and never shipped. The real island and built CSS; only the
// shared client module is replaced, with a fake Supabase client and no network traffic.
let fixtureCode: string;
let fixtureCss: string;
test.beforeAll(async () => {
  const html = readFileSync('dist/account.html', 'utf8');
  fixtureCss = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  if (!fixtureCss) throw new Error('The production stylesheet was not found. Run npm run build.');
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import AccountSettings from './src/islands/AccountSettings.tsx';
      import { adaptersFor } from './src/islands/accountsettings.ts';
      const params = new URLSearchParams(location.search);
      const calls = window.accountCalls = [];
      const when = '2026-11-01T08:00:00.000Z';
      const uuid = n => '0000000' + n + '-0000-4000-8000-000000000000';
      const tables = {
        profiles: [{ display_name: 'Sample Student', created_at: when, name_change_window_start: when, name_changes_in_window: 1 }],
        attempts: [],
        exam_plans: [{ id: uuid(1), course: 'med-surg-1', exam_date: '2026-12-15', created_at: when }],
        review_state: [],
        study_events: [{ id: uuid(2), item_id: uuid(3), item_version_id: uuid(4), kind: 'answered', ms_on_item: 900, mark: null, at: when, created_at: when }],
        my_flags: [],
        // Task 309: one made-up signed-in session, read in a separate user-owned RPC.
        my_sessions: [{
          id: uuid(5), created_at: when, updated_at: when, not_after: null,
          user_agent: 'sample browser', ip: '203.0.113.5',
        }],
      };
      let name = 'Sample Student';
      const firstUser = uuid(9);
      const secondUser = uuid(8);
      let activeUser = firstUser;
      const subscribers = new Set();
      window.fixtureOriginalUserId = firstUser;
      window.fixtureOtherUserId = secondUser;
      window.fixtureServerDeletes = 0;
      window.fixtureSwitchUser = next => {
        activeUser = next;
        for (const listener of subscribers) {
          listener(next ? 'SIGNED_IN' : 'SIGNED_OUT', next ? { user: { id: next } } : null);
        }
      };
      const query = table => {
        const q = {
          order: () => q, gt: () => q,
          range: async () => {
            // '&export-held': the attempts read waits until the test releases it, so the account can change meanwhile.
            if (params.has('export-held') && table === 'attempts') {
              await new Promise(resolve => { window.fixtureReleaseExport = resolve; });
            }
            return params.has('export-fails') && table === 'attempts'
              ? { data: null, error: { message: 'provider-private-detail' } } : { data: tables[table], error: null };
          },
        };
        return q;
      };
      const client = {
        auth: {
          getSession: async () => ({ data: { session: params.has('signed-out') || !activeUser ? null : { user: { id: activeUser, email: 'student@example.test', user_metadata: { full_name: 'Sample Student' } } } }, error: params.has('session-read-error') ? { message: 'unavailable' } : null }),
          signOut: async options => { calls.push('signOut:' + options.scope); return { error: null }; },
          onAuthStateChange(callback) {
            subscribers.add(callback);
            return { data: { subscription: { unsubscribe: () => subscribers.delete(callback) } } };
          },
          // Task 309 requires the authenticated user's own Auth record in addition to the five data tables.
          getUser: async () => ({ data: { user: {
            id: uuid(9), created_at: when, last_sign_in_at: when,
            app_metadata: { providers: ['google'] },
            user_metadata: { full_name: 'Sample Student' }, identities: [],
          } }, error: null }),
        },
        from(table) {
          return {
            select() {
              const q = query(table);
              q.eq = (_column, ownerId) => ({ maybeSingle: async () => ({
                data: { display_name: ownerId === firstUser ? name : 'Second Student' }, error: null,
              }) });
              return q;
            },

          };
        },
        rpc(fn, args) {
          // Read-only RPCs do not belong in the mutation-call log used below.
          if (fn === 'my_flags' || fn === 'my_sessions') return query(fn);
          if (fn === 'update_display_name') {
            calls.push('rpc:update_display_name:' + args.new_name);
            if (params.has('name-limited')) {
              return Promise.resolve({ data: null, error: { message: 'that is a lot of name changes; please try again later', code: '54000' } });
            }
            name = args.new_name;
            return Promise.resolve({ data: name, error: null });
          }
          calls.push('rpc:' + fn);
          if (fn === 'delete_my_account' && params.has('delete-held')) {
            let signal;
            let finish;
            const held = new Promise(resolve => {
              finish = () => {
                const succeeded = params.has('force-delete-success') || !signal?.aborted;
                if (succeeded) window.fixtureServerDeletes += 1;
                resolve(succeeded
                  ? { data: null, error: null }
                  : { data: null, error: { message: 'request was cancelled before dispatch' } });
              };
            });
            window.fixtureReleaseDelete = finish;
            // Models the abortSignal method on the PostgREST request builder.
            held.abortSignal = nextSignal => { signal = nextSignal; return held; };
            return held;
          }
          return Promise.resolve(params.has('auth-stale-refresh')
            ? { data: null, error: { message: 'please sign in again to delete your account', code: '28R01' } }
            : params.has('delete-refused')
              ? { data: null, error: { message: 'sign in to delete your account', code: '28000' } } : { data: null, error: null });
        },
      };
      window.fixtureClient = client;
      createRoot(document.getElementById('fixture')).render(params.has('deletion-closed')
        ? <AccountSettings adapters={{ ...adaptersFor(client), deleteAccount: null }} />
        : <AccountSettings />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-client', setup(builder) {
      builder.onResolve({ filter: /\/supabaseclient(?:\.ts)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export const AUTH_STORAGE_KEY = 'cueory-auth';
        // Task 170's PKCE verifier names, which deleteaccount.ts imports (same values as supabaseclient.ts).
        export const PKCE_VERIFIER_STORAGE_KEY = AUTH_STORAGE_KEY + '-code-verifier';
        export const PKCE_FLOW_LIST_STORAGE_KEY = AUTH_STORAGE_KEY + '-flows-code-verifier';
        export const pkceFlowStorageKey = flowId => AUTH_STORAGE_KEY + '-flow-' + flowId + '-code-verifier';
        export function isPkceVerifierKey(key) {
          return key.startsWith(AUTH_STORAGE_KEY + '-') && key.endsWith('-code-verifier');
        }
        export async function getSupabase() {
          return new URLSearchParams(location.search).has('off') ? null : window.fixtureClient;
        }
        export async function sessionStateFrom(client) {
          const { data } = await client.auth.getSession();
          const user = data.session && data.session.user;
          return user ? { signedIn: true, userId: user.id, email: user.email } : { signedIn: false };
        }
        export async function sessionCheckFrom(client) {
          if (!client) return { signedIn: false };
          try {
            const { data, error } = await client.auth.getSession();
            if (error) return { error: true };
            const user = data.session && data.session.user;
            return user ? { signedIn: true, userId: user.id, email: user.email } : { signedIn: false };
          } catch {
            return { error: true };
          }
        }
      `, loader: 'js' }));
    } }],
  });
  fixtureCode = result.outputFiles[0].text;
});

async function fixture(page: Page, query = '') {
  // Count object URLs, so the test can check each one is revoked after its download.
  await page.addInitScript(() => {
    const urls = { made: 0, revoked: 0 };
    (window as unknown as { urls: typeof urls }).urls = urls;
    const make = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob) => { urls.made += 1; return make(blob); };
    URL.revokeObjectURL = (url: string) => { urls.revoked += 1; revoke(url); };
  });
  await page.route('**/__account-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__account-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>account component test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main class="mx-auto max-w-prose p-6 font-body leading-relaxed"><h1>account settings</h1>
    <div id="fixture"></div></main><script src="/__account-fixture.js"></script></body></html>` }));
  await page.goto(`/__account-fixture?fixture=1${query}`);
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { accountCalls: string[] }).accountCalls);
const urls = (page: Page) => page.evaluate(() => (window as unknown as { urls: { made: number; revoked: number } }).urls);
const deleteButton = (page: Page) => page.getByRole('button', { name: 'delete my account forever', exact: true });

test.describe('/account signed out and accounts off (fake client)', () => {
  test('signed out: one sentence and a link to sign in', async ({ page }) => {
    await fixture(page, '&signed-out');
    await expect(page.getByTestId('account-signed-out')).toHaveText("you're signed out. sign in");
    await expect(page.getByRole('link', { name: 'sign in', exact: true })).toHaveAttribute('href', '/signin?next=%2Faccount');
    await keyboardWalk(page);
    await axe(page);
  });

  test('a failed session read never presents the old account as deletable', async ({ page }) => {
    await fixture(page, '&session-read-error');
    await expect(page.getByRole('alert')).toHaveText('your account could not load. please try again.');
    await expect(page.getByRole('button', { name: 'delete my account', exact: true })).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
    await axe(page);
  });

  test('no client: accounts open soon', async ({ page }) => {
    await fixture(page, '&off');
    await expect(page.getByTestId('signin-unavailable')).toContainText('accounts open soon');
  });
});

test.describe('/account signed in (fake client)', () => {
  test('shows the sections in order and is keyboard-complete and axe-clean, with the delete panel open too', async ({ page }) => {
    await fixture(page);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['display name', 'your data', 'delete account']);
    const order = await page.locator('main button').evaluateAll(buttons => buttons.map(button => button.textContent?.trim()));
    expect(order).toEqual(['save', 'download my data', 'delete my account', 'delete my account forever', 'keep my account', 'sign out']);
    await expect(page.getByRole('textbox')).toHaveValue('Sample Student');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await keyboardWalk(page);
    await axe(page);
    await page.getByRole('button', { name: 'delete my account', exact: true }).click();
    await expect(page.getByText('your display name and email address')).toBeVisible();
    await keyboardWalk(page);
    await axe(page);
  });

  test('saves the display name, and refuses an empty one without writing', async ({ page }) => {
    await fixture(page);
    const field = page.getByRole('textbox', { name: 'display name' });
    await field.fill('   ');
    await page.getByRole('button', { name: 'save', exact: true }).click();
    await expect(page.getByRole('status').first()).toHaveText('a name is required.');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(await calls(page)).toEqual([]);
    await field.fill('  New Name ');
    await page.getByRole('button', { name: 'save', exact: true }).click();
    await expect(page.getByRole('status').first()).toHaveText('your display name is saved.');
    await expect(field).toHaveValue('New Name');
    expect(await calls(page)).toEqual(['rpc:update_display_name:New Name']);
  });

  test('says so in one sentence when the server limit refuses a name change (Codex on #230)', async ({ page }) => {
    await fixture(page, '&name-limited');
    const field = page.getByRole('textbox', { name: 'display name' });
    await field.fill('New Name');
    await page.getByRole('button', { name: 'save', exact: true }).click();
    await expect(page.getByRole('status').first()).toHaveText("you've changed your name a lot this hour. please try again later.");
    await expect(page.locator('body')).not.toContainText('that is a lot of name changes');
    expect(await calls(page)).toEqual(['rpc:update_display_name:New Name']);
  });

  test('downloads the JSON file and the spreadsheet files, and revokes each object URL', async ({ page }) => {
    await fixture(page);
    const json = page.waitForEvent('download');
    await page.getByRole('button', { name: 'download my data', exact: true }).click();
    const file = await json;
    expect(file.suggestedFilename()).toMatch(/^cueory-data-\d{4}-\d{2}-\d{2}\.json$/);
    const saved = JSON.parse(readFileSync((await file.path())!, 'utf8'));
    expect(saved.profile).toMatchObject({ displayName: 'Sample Student', email: 'student@example.test' });
    // The display-name limit's two profile fields are personal data too (Codex on #230).
    expect(saved.profile).toMatchObject({ nameChangeWindowStart: '2026-11-01T08:00:00.000Z', nameChangesInWindow: 1 });
    expect(saved.studyEvents).toHaveLength(1);
    // The session's user_metadata: what the sign-in provider shared.
    expect(saved.signInDetails).toEqual([{ name: 'full_name', value: 'Sample Student' }]);
    expect(saved.account).toMatchObject({
      providers: ['google'], userMetadata: { full_name: 'Sample Student' },
    });
    expect(saved.sessions).toEqual([{
      createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', notAfter: null,
      userAgent: 'sample browser', ip: '203.0.113.5',
    }]);
    await expect(page.getByText('your data file is downloading.')).toBeVisible();

    const files: Download[] = [];
    page.on('download', download => files.push(download));
    await page.getByRole('button', { name: 'download spreadsheet files', exact: true }).click();
    await expect(page.getByText('your spreadsheet files are downloading.')).toBeVisible();
    // 15 spreadsheet files since sudokuStats.csv joined the export (#720), README.txt first (lane 2), plus the JSON
    // file: 17 object URLs.
    await expect.poll(() => files.length, { timeout: 15_000 }).toBe(16);
    expect(files[0]!.suggestedFilename()).toBe(`${file.suggestedFilename().slice(0, -5)}-README.txt`);
    expect(readFileSync((await files[0]!.path())!, 'utf8')).toContain(`${file.suggestedFilename().slice(0, -5)}-studyEvents.csv`);
    expect(files.map(download => download.suggestedFilename())).toContain(`${file.suggestedFilename().slice(0, -5)}-studyEvents.csv`);
    expect(files.map(download => download.suggestedFilename())).toContain(`${file.suggestedFilename().slice(0, -5)}-sudokuStats.csv`);
    await expect.poll(async () => (await urls(page)).revoked, { timeout: 15_000 }).toBe(17);
    expect((await urls(page)).made).toBe(17);
  });

  test('offers no file when a read fails, and never shows provider detail', async ({ page }) => {
    await fixture(page, '&export-fails');
    const files: Download[] = [];
    page.on('download', download => files.push(download));
    await page.getByRole('button', { name: 'download my data', exact: true }).click();
    await expect(page.getByText("we couldn't load all your saved data. please try again.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'download spreadsheet files' })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
    expect(files).toEqual([]);
    expect((await urls(page)).made).toBe(0);
  });

  test('switching A to B to A while the data is read offers no file and reloads for the current account (#757)', async ({ page }) => {
    await fixture(page, '&export-held');
    const files: Download[] = [];
    page.on('download', download => files.push(download));
    await page.getByRole('button', { name: 'download my data', exact: true }).click();
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { fixtureReleaseExport?: unknown }).fixtureReleaseExport)).toBe('function');
    await page.evaluate(() => {
      const w = window as unknown as { fixtureSwitchUser: (userId: string) => void; fixtureOtherUserId: string; fixtureOriginalUserId: string };
      w.fixtureSwitchUser(w.fixtureOtherUserId);
      w.fixtureSwitchUser(w.fixtureOriginalUserId);
    });
    await page.evaluate(() => (window as unknown as { fixtureReleaseExport: () => void }).fixtureReleaseExport());
    await expect(page.getByRole('alert')).toContainText('the account signed in on this device changed, so nothing was done.');
    await expect(page.getByRole('button', { name: 'download my data', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'download spreadsheet files' })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(files).toEqual([]);
    expect((await urls(page)).made).toBe(0);
    await axe(page);
  });

  test('switching to B while the spreadsheet files are on their way stops the rest (#757)', async ({ page }) => {
    await fixture(page);
    const json = page.waitForEvent('download');
    await page.getByRole('button', { name: 'download my data', exact: true }).click();
    await json;
    const files: Download[] = [];
    page.on('download', download => files.push(download));
    await page.getByRole('button', { name: 'download spreadsheet files', exact: true }).click();
    await expect.poll(() => files.length).toBeGreaterThan(0);
    await page.evaluate(() => {
      const w = window as unknown as { fixtureSwitchUser: (userId: string) => void; fixtureOtherUserId: string };
      w.fixtureSwitchUser(w.fixtureOtherUserId);
    });
    await expect(page.getByRole('alert')).toContainText('the account signed in on this device changed, so nothing was done.');
    const offered = files.length;
    // 15 files 300 ms apart would take over four seconds; wait past that and check none came after the switch.
    await page.waitForTimeout(5_000);
    expect(files.length).toBe(offered);
    expect(offered).toBeLessThan(15);
    await expect(page.getByRole('button', { name: 'download spreadsheet files' })).toHaveCount(0);
  });

  test('delete stays disabled until "delete" is typed, then deletes and clears only this device', async ({ page }) => {
    await fixture(page);
    await page.evaluate(() => {
      for (const key of [
        'cueory-auth', 'cueory-progress', 'cueory-theme', 'cueory-stars-old-deck',
        'cueory-auth-code-verifier', 'cueory-auth-flow-abc-code-verifier', 'cueory-auth-flows-code-verifier',
      ]) localStorage.setItem(key, '1');
      localStorage.setItem('not-cueory', 'kept');
      sessionStorage.setItem('cueory-break-timer', '1');
    });
    const toggle = page.getByRole('button', { name: 'delete my account', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listitem')).toHaveText([
      'your display name and email address',
      'your sign-in details', '1 exam date', '1 sign-in session', '1 study history entry',
    ]);
    const confirm = page.getByLabel('type delete to confirm');
    await expect(confirm).toBeFocused();
    await expect(deleteButton(page)).toHaveAttribute('aria-disabled', 'true');
    await confirm.fill('delet');
    await expect(page.getByText('type the word delete to confirm')).toBeVisible();
    await expect(deleteButton(page)).toHaveAttribute('aria-disabled', 'true');
    await deleteButton(page).click({ force: true });
    await confirm.press('Enter');
    expect(await calls(page)).toEqual([]);
    await confirm.fill('delete');
    await expect(deleteButton(page)).toHaveAttribute('aria-disabled', 'false');
    await deleteButton(page).click();
    const done = page.getByText('your account is deleted, and this device no longer keeps your cueory data.');
    await expect(done).toBeFocused();
    await expect(page.getByRole('link', { name: 'go to the home page' })).toHaveAttribute('href', '/');
    expect(await calls(page)).toEqual(['rpc:delete_my_account']); // Never sign out a replacement account.
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['not-cueory']);
    expect(await page.evaluate(() => sessionStorage.getItem('cueory-break-timer'))).toBeNull();
    await axe(page);
  });

  test('switching A to B during the deletion response never clears B after A is deleted', async ({ page }) => {
    await fixture(page, '&delete-held&force-delete-success');
    await page.evaluate(() => {
      localStorage.setItem('cueory-auth', 'a-session');
      localStorage.setItem('cueory-progress', 'a-progress');
    });
    await page.getByRole('button', { name: 'delete my account', exact: true }).click();
    await page.getByLabel('type delete to confirm').fill('delete');
    await deleteButton(page).click();
    await expect.poll(() => calls(page)).toContain('rpc:delete_my_account');
    await page.evaluate(() => {
      const w = window as unknown as {
        fixtureSwitchUser: (userId: string) => void;
        fixtureOtherUserId: string;
      };
      localStorage.setItem('cueory-auth', 'b-session');
      localStorage.setItem('cueory-progress', 'b-progress');
      w.fixtureSwitchUser(w.fixtureOtherUserId);
    });
    await page.evaluate(() => (window as unknown as { fixtureReleaseDelete: () => void }).fixtureReleaseDelete());
    await expect(page.getByText('your account is deleted, but this browser changed or could not confirm its sign-in, so its saved data was left alone.')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { fixtureServerDeletes: number }).fixtureServerDeletes)).toBe(1);
    expect(await calls(page)).toEqual(['rpc:delete_my_account']);
    expect(await page.evaluate(() => [localStorage.getItem('cueory-auth'), localStorage.getItem('cueory-progress')]))
      .toEqual(['b-session', 'b-progress']);
    await axe(page);
  });

  test('switching A to B to A before delayed dispatch cancels deletion and reloads account settings', async ({ page }) => {
    await fixture(page, '&delete-held');
    await page.evaluate(() => {
      localStorage.setItem('cueory-auth', 'a-session');
      localStorage.setItem('cueory-progress', 'a-progress');
    });
    await page.getByRole('button', { name: 'delete my account', exact: true }).click();
    await page.getByLabel('type delete to confirm').fill('delete');
    await deleteButton(page).click();
    await expect.poll(() => calls(page)).toContain('rpc:delete_my_account');
    await page.evaluate(() => {
      const w = window as unknown as {
        fixtureSwitchUser: (userId: string) => void;
        fixtureOtherUserId: string;
        fixtureOriginalUserId: string;
      };
      w.fixtureSwitchUser(w.fixtureOtherUserId);
      localStorage.setItem('cueory-auth', 'b-session');
      w.fixtureSwitchUser(w.fixtureOriginalUserId);
      localStorage.setItem('cueory-auth', 'a-new-session');
    });
    await page.evaluate(() => (window as unknown as { fixtureReleaseDelete: () => void }).fixtureReleaseDelete());
    await expect(page.getByRole('alert')).toContainText('we could not confirm deletion after the sign-in changed');
    await expect(page.getByRole('button', { name: 'delete my account', exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { fixtureServerDeletes: number }).fixtureServerDeletes)).toBe(0);
    expect(await calls(page)).toEqual(['rpc:delete_my_account']);
    expect(await page.evaluate(() => [localStorage.getItem('cueory-auth'), localStorage.getItem('cueory-progress')]))
      .toEqual(['a-new-session', 'a-progress']);
    await axe(page);
  });

  test('a refused deletion keeps everything and says what to do', async ({ page }) => {
    await fixture(page, '&delete-refused');
    await page.evaluate(() => localStorage.setItem('cueory-auth', '1'));
    await page.getByRole('button', { name: 'delete my account', exact: true }).click();
    await page.getByLabel('type delete to confirm').fill('delete');
    await deleteButton(page).click();
    await expect(page.getByText('please sign in again to delete your account.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'sign in again', exact: true })).toHaveAttribute('href', '/signin?next=%2Faccount%23delete');
    expect(await calls(page)).toEqual(['rpc:delete_my_account']);
    expect(await page.evaluate(() => localStorage.getItem('cueory-auth'))).toBe('1');
  });

  test('a refreshed token with stale credentials cannot delete, and keeps browser data', async ({ page }) => {
    await fixture(page, '&auth-stale-refresh');
    await page.evaluate(() => localStorage.setItem('cueory-auth', 'existing-session'));
    await page.getByRole('button', { name: 'delete my account', exact: true }).click();
    await page.getByLabel('type delete to confirm').fill('delete');
    await deleteButton(page).click();
    await expect(page.getByText('for your safety, please sign in again to delete your account.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'sign in again', exact: true }))
      .toHaveAttribute('href', '/signin?next=%2Faccount%23delete');
    expect(await calls(page)).toEqual(['rpc:delete_my_account']);
    expect(await page.evaluate(() => localStorage.getItem('cueory-auth'))).toBe('existing-session');
    await axe(page);
  });

  test('keep my account closes the panel and returns focus', async ({ page }) => {
    await fixture(page);
    const toggle = page.getByRole('button', { name: 'delete my account', exact: true });
    await toggle.click();
    await page.getByLabel('type delete to confirm').fill('delete');
    await page.getByRole('button', { name: 'keep my account', exact: true }).click();
    await expect(toggle).toBeFocused();
    await expect(deleteButton(page)).toBeHidden();
    expect(await calls(page)).toEqual([]);
  });

  test('says deletion opens soon when no delete callback is provided', async ({ page }) => {
    await fixture(page, '&deletion-closed');
    await expect(page.getByText('account deletion opens soon.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'delete my account', exact: true })).toHaveCount(0);
  });

  test('signs out this device and goes home', async ({ page }) => {
    await fixture(page);
    await page.getByRole('button', { name: 'sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
