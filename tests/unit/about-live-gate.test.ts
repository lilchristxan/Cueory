import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ABOUT_HREF, aboutShown } from '../../src/lessons/draftgate';
import { sitemapPages } from '../../src/pages/sitemap.xml';
import { isProductionBuild, LIVE_HELD_PAGES, pruneHeldPages } from '../../scripts/prune-preview.mjs';

// For the sitemap tests below. Today /about never reaches the sitemap's gate: it is not in the page list and its
// Layout says noindex. These three stand-ins take both of those out of the way, so the gate is the only thing left that
// can keep /about out. Nothing else in this file reads the page list, and every other file read is the real one.
// 1. No generated lesson pages, so the tests don't need Astro's content layer.
vi.mock('../../src/lessons/load', () => ({ lessonCatalog: async () => ({ lessons: [], problems: [] }) }));
// 2. The page list also names /about, as it will once the page is ready to be found.
vi.mock('../../src/config/routes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/routes')>();
  return { ...actual, indexablePages: [...actual.indexablePages, '/about'] };
});
// 3. readFileSync can be told to hand back an indexable about page (see sitemapPagesFor). Until then it is the real one.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

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

type BuildVars = { WORKERS_CI?: string; WORKERS_CI_BRANCH?: string; CUEORY_ANATOMY_DRAFTS?: string };
const BUILD_VARS = ['WORKERS_CI', 'WORKERS_CI_BRANCH', 'CUEORY_ANATOMY_DRAFTS'] as const;
/** The about page as it will be once it may be indexed: the same Layout without noindex. */
const INDEXABLE_ABOUT = '---\nimport Layout from \'../layouts/Layout.astro\';\n---\n<Layout title="about us" description="about cueory"></Layout>\n';

/** The real sitemapPages() for a build with these variables, with /about listed and indexable (see the mocks above). */
async function sitemapPagesFor(env: BuildVars): Promise<string[]> {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const aboutSource = resolve('src/pages/about.astro');
  for (const name of BUILD_VARS) vi.stubEnv(name, env[name]);
  vi.mocked(readFileSync).mockImplementation(((...args: Parameters<typeof readFileSync>) =>
    resolve(String(args[0])) === aboutSource ? INDEXABLE_ABOUT : Reflect.apply(actual.readFileSync, undefined, args)) as typeof readFileSync);
  try {
    return await sitemapPages();
  } finally {
    vi.mocked(readFileSync).mockImplementation(actual.readFileSync);
    vi.unstubAllEnvs();
  }
}

describe('about in the sitemap, once the page is listed and indexable', () => {
  it('the live build still leaves /about out', async () => {
    for (const env of [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' }, { WORKERS_CI: '1' }]) {
      const pages = await sitemapPagesFor(env);
      expect(pages, JSON.stringify(env)).not.toContain(ABOUT_HREF);
      // The rest of the sitemap is there, so /about is missing because of the gate and not because the list is empty.
      expect(pages, JSON.stringify(env)).toContain('/');
      expect(pages, JSON.stringify(env)).toContain('/support');
    }
  });

  it('staging, previews and local builds list /about', async () => {
    for (const env of [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-about/hide-live' }, {}]) {
      expect(await sitemapPagesFor(env), JSON.stringify(env)).toContain(ABOUT_HREF);
    }
  });

  it('every kind of build lists /about exactly where the page is shown', async () => {
    for (const env of ENVS) expect((await sitemapPagesFor(env)).includes(ABOUT_HREF), JSON.stringify(env)).toBe(aboutShown(env));
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
