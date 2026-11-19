import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ABOUT_HREF, aboutShown } from '../../src/lessons/draftgate';
import { isProductionBuild, LIVE_HELD_PAGES, pruneHeldPages } from '../../scripts/prune-preview.mjs';

/**
 * Until Christian writes his story, the live build leaves /about out (it gets the normal 404 page), keeps it out of the
 * sitemap and the search index, and links to it nowhere. Staging, previews, local builds and the dev server keep it.
 */
const ENVS = [
  { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
  { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' },
  { WORKERS_CI: '1', WORKERS_CI_BRANCH: ' main ', CUEORY_ANATOMY_DRAFTS: '1' },
  { WORKERS_CI: '1', WORKERS_CI_BRANCH: '  ' },
  { WORKERS_CI: '1' },
  { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' },
  { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/staging' },
  { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-about/hide-live' },
  { CUEORY_ANATOMY_DRAFTS: '1' },
  {},
];

describe('about gate', () => {
  it('is closed on the live build only', () => {
    expect(aboutShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(false);
    expect(aboutShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' })).toBe(false);
    // A Workers build that names no branch counts as live, so a missing variable can't publish the page.
    expect(aboutShown({ WORKERS_CI: '1' })).toBe(false);
    expect(aboutShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe(true);
    expect(aboutShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-about/hide-live' })).toBe(true);
    // Plain local builds and the dev server have no Workers variables: the page shows there.
    expect(aboutShown({})).toBe(true);
  });

  it('agrees with the build step that deletes the page', () => {
    for (const env of ENVS) expect(aboutShown(env), JSON.stringify(env)).toBe(!isProductionBuild(env));
  });

  it('the build deletes held pages before Pagefind indexes the site', () => {
    const build: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts.build;
    expect(build.indexOf('node scripts/prune-preview.mjs')).toBeGreaterThan(-1);
    expect(build.indexOf('node scripts/prune-preview.mjs')).toBeLessThan(build.indexOf('pagefind'));
    expect(LIVE_HELD_PAGES).toContain('about.html');
  });

  it('the sitemap drops /about wherever the page is held', () => {
    const source = readFileSync(new URL('../../src/pages/sitemap.xml.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/\.filter\(\(page\) => aboutShown\(\) \|\| page !== ABOUT_HREF\)/);
  });

  it('no page, component or menu links to /about except through the gate', () => {
    const src = fileURLToPath(new URL('../../src/', import.meta.url));
    const files = (folder: string): string[] =>
      readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)],
      );
    const allowed = new Set(['pages/about.astro', 'lessons/draftgate.ts']);
    const linking = files(src)
      .filter((file) => !allowed.has(relative(src, file).split('\\').join('/')))
      .filter((file) => /['"`]\/about(?:['"`?#]|\/)/.test(readFileSync(file, 'utf8')));
    expect(linking).toEqual([]);
    expect(ABOUT_HREF).toBe('/about');
  });
});

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
function fakeDist() {
  const dist = mkdtempSync(join(tmpdir(), 'cueory-about-'));
  made.push(dist);
  mkdirSync(join(dist, 'learn'));
  for (const file of ['index.html', 'about.html', '404.html', 'learn/about-cueory.html']) writeFileSync(join(dist, file), 'x');
  return dist;
}

describe('pruning /about from a build', () => {
  it('the live build removes about.html and nothing else', () => {
    for (const env of [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, { WORKERS_CI: '1' }]) {
      const dist = fakeDist();
      expect(pruneHeldPages(env, dist)).toEqual(['about.html']);
      expect(existsSync(join(dist, 'about.html'))).toBe(false);
      for (const kept of ['index.html', '404.html', 'learn/about-cueory.html']) expect(existsSync(join(dist, kept))).toBe(true);
    }
  });

  it('staging, previews and local builds keep it', () => {
    for (const env of [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-1/x' }, {}, { CUEORY_ANATOMY_DRAFTS: '1' }]) {
      const dist = fakeDist();
      expect(pruneHeldPages(env, dist)).toEqual([]);
      expect(existsSync(join(dist, 'about.html'))).toBe(true);
    }
  });

  it('a live build where the page is already gone is not an error', () => {
    const dist = fakeDist();
    rmSync(join(dist, 'about.html'));
    expect(pruneHeldPages({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, dist)).toEqual([]);
  });
});
