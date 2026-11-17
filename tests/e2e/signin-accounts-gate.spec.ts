import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';

// The live site's situation before launch, as a whole hydrated page: the build HAS Supabase project settings (made up
// here), but accountsOpen is false and the build is not a preview, so the accounts gate is closed. Then /signin and
// /signup must never create the auth client: not in the sign-in island, the account corner or the flag button.
// The pages come from a second build with those settings, written to a temporary folder and served by page.route,
// so nothing leaves the browser. The home page is the control: there the account corner does load the client.
const PROJECT = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_fixture_not_a_real_key';
// Code that only the supabase-js package contains: its auth client class.
const AUTH_CLIENT_MARK = 'GoTrueClient';

/**
 * A build of the site with the settings above, in a fresh private folder (mkdtemp makes a new, unique one each time, so
 * nothing is checked first and nothing is shared between workers). About 7 seconds per worker.
 */
function settingsBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cueory-gate-'));
  const env: NodeJS.ProcessEnv = { ...process.env, PUBLIC_SUPABASE_URL: PROJECT, PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY };
  // The gate must be closed the way it is on the live site: no preview flag, not a Workers preview build.
  delete env.CUEORY_ACCOUNTS_PREVIEW;
  delete env.WORKERS_CI;
  delete env.WORKERS_CI_BRANCH;
  execFileSync('npx', ['astro', 'build', '--outDir', join(dir, 'site')], { env, stdio: 'ignore' });
  return dir;
}

/** The first of these files that can be read, or undefined. Reading is the only check, so nothing can change between. */
function readFirst(files: readonly string[]): { file: string; body: Buffer } | undefined {
  for (const file of files) {
    try {
      return { file, body: readFileSync(file) };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'EISDIR' && code !== 'ENOTDIR') throw error;
    }
  }
  return undefined;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon',
};

/** Serves the settings build for this site's address and records every script it hands out and every project call. */
async function serve(page: Page, site: string, origin: string) {
  const scripts: string[] = [];
  const projectCalls: string[] = [];
  await page.route(`${PROJECT}/**`, async route => {
    projectCalls.push(route.request().url());
    await route.abort();
  });
  await page.route(url => url.origin === origin, async route => {
    const url = new URL(route.request().url());
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index';
    const base = join(site, path);
    // Only files inside the build: a path that climbs out is refused.
    const found = base.startsWith(site + sep) ? readFirst(extname(base) ? [base] : [`${base}.html`, join(base, 'index.html')]) : undefined;
    if (!found) return route.fulfill({ status: 404, body: 'not found' });
    const { file, body } = found;
    if (extname(file) === '.js') scripts.push(body.toString('utf8'));
    await route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body });
  });
  return { scripts, projectCalls, createdClient: () => scripts.some(code => code.includes(AUTH_CLIENT_MARK)) };
}

let build: string;
let site: string;
test.beforeAll(() => {
  test.setTimeout(180_000);
  build = settingsBuild();
  site = join(build, 'site');
});
test.afterAll(() => {
  rmSync(build, { recursive: true, force: true });
});

test.describe('the accounts gate on whole pages, with Supabase settings in the build', () => {
  for (const [path, heading] of [['/signin', 'welcome back to cueory'], ['/signup', 'welcome to cueory']] as const) {
    test(`${path} never creates the auth client`, async ({ page, baseURL }) => {
      // A saved session would make a created client call the project to refresh it; none may happen.
      await page.addInitScript(() => localStorage.setItem('cueory-auth', JSON.stringify({
        access_token: 'expired.fixture.token', token_type: 'bearer', expires_in: 0, expires_at: 1, refresh_token: 'fixture-refresh',
        user: { id: '44444444-4444-4444-8444-444444444444', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
      })));
      const served = await serve(page, site, new URL(baseURL!).origin);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
      await expect(page.getByTestId('signin-unavailable')).toContainText('accounts open soon');
      await expect(page.locator('main form')).toHaveCount(0);
      // The account corner and the flag button hydrate when the browser is idle (at most 2.5 seconds), and the flag
      // checks again when it opens.
      await page.waitForTimeout(3500);
      await page.locator('[data-account-toggle]').click();
      await expect(page.getByTestId('account-menu').getByText('coming soon')).toHaveCount(2);
      await page.getByRole('button', { name: 'flag or comment', exact: true }).click();
      await page.waitForTimeout(1000);
      expect(served.createdClient()).toBe(false);
      expect(served.projectCalls).toEqual([]);
    });
  }

  test('control: the home page in the same build does create the client', async ({ page, baseURL }) => {
    const served = await serve(page, site, new URL(baseURL!).origin);
    await page.goto('/');
    await expect.poll(served.createdClient, { timeout: 15_000 }).toBe(true);
  });
});
