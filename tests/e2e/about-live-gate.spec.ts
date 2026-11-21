import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { pruneHeldPages, prunePreview } from '../../scripts/prune-preview.mjs';
import { isStaticCheckProject, runStaticCheckOnce } from './projects';

// Until Christian writes his story, /about is left out of the live build: the address gets the site's normal 404 page,
// it is not in the sitemap, and nothing links to it. Staging, previews and local builds (this suite's own server) keep it.

test.describe('staging and local builds', () => {
  test('/about is served', async ({ page }) => {
    const response = await page.goto('/about');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: "that page isn't here." })).toHaveCount(0);
  });
});

/**
 * A second build with the live site's variables, written to a fresh private folder and pruned the way the build script
 * prunes it. Served below by page.route, so nothing leaves the browser.
 */
function liveBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cueory-about-live-'));
  try {
    const site = join(dir, 'site');
    const env: NodeJS.ProcessEnv = { ...process.env, WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' };
    delete env.CUEORY_ANATOMY_DRAFTS;
    execFileSync('npx', ['astro', 'build', '--outDir', site], { env, stdio: 'ignore' });
    prunePreview(env, site);
    // The build does make the page; it is the prune step that takes it out.
    const removed = pruneHeldPages(env, site);
    if (!removed.includes('about.html')) throw new Error(`the live build should have pruned about.html, pruned: ${removed.join(', ')}`);
    return dir;
  } catch (error) {
    // The caller never gets the path if setup fails, so the half-made build is removed here.
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

function builtPages(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? builtPages(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon',
  '.xml': 'application/xml',
};

/**
 * Serves the live build for this site's address. A missing page gets 404.html with status 404, which is what Workers
 * static assets do with not_found_handling "404-page" (wrangler.jsonc).
 */
async function serve(page: Page, site: string, origin: string) {
  await page.route((url) => url.origin === origin, async (route) => {
    const url = new URL(route.request().url());
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index';
    const base = join(site, path);
    const candidates = extname(base) ? [base] : [`${base}.html`, join(base, 'index.html')];
    const file = base.startsWith(site + sep) ? candidates.find((candidate) => existsSync(candidate)) : undefined;
    if (!file) return route.fulfill({ status: 404, contentType: 'text/html', body: readFileSync(join(site, '404.html')) });
    await route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
}

test.describe('the live build', () => {
  // Static checks of a second build (files, status, links): window size, palette and engine can't change the answer,
  // so they run once, in Chromium's desktop project, and only that project pays for the build.
  test.beforeEach(({}, testInfo) => runStaticCheckOnce(testInfo));

  let build: string | undefined;
  let site: string;
  test.beforeAll(({}, testInfo) => {
    if (!isStaticCheckProject(testInfo)) return;
    test.setTimeout(240_000);
    build = liveBuild();
    site = join(build, 'site');
  });
  test.afterAll(() => {
    if (build) rmSync(build, { recursive: true, force: true });
  });

  test('/about gets the normal 404 page', async ({ page, baseURL }) => {
    expect(existsSync(join(site, 'about.html'))).toBe(false);
    await serve(page, site, new URL(baseURL!).origin);
    const response = await page.goto('/about');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: "that page isn't here." })).toBeVisible();
  });

  test('/about is not in the sitemap and no built page links to it', async () => {
    expect(readFileSync(join(site, 'sitemap.xml'), 'utf8')).not.toMatch(/\/about</);
    for (const file of builtPages(site)) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/href="(?:https:\/\/cueory\.app)?\/about["?#/]/);
    }
  });

  test('the menu and footer show no about-page link', async ({ page, baseURL }) => {
    await serve(page, site, new URL(baseURL!).origin);
    await page.goto('/');
    await expect(page.locator('a[href="/about"], a[href^="/about?"], a[href^="/about#"]')).toHaveCount(0);
  });
});
