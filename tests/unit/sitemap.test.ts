import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { indexablePages, sampleLessonPages } from '../../src/config/routes';
import { crosswordOpen } from '../../src/config/site';
import { draftsAllowed } from '../../src/islands/anatomylab';
import { draftBuildEnv } from '../../src/lessons/draftgate';
import { legalRoutes } from '../../src/config/legal';
import { isRouteIndexable } from '../../src/config/legalapproval';
import { GET, pageSourcePath, routeDeclaresNoindex, sitemapPages, sitemapXml, sourceDeclaresNoindex } from '../../src/pages/sitemap.xml';

// Keep this response test independent of Astro's live content collection.
vi.mock('../../src/lessons/load', () => ({ lessonCatalog: async () => ({ lessons: [], problems: [] }) }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readdirSync: vi.fn(actual.readdirSync) };
});

const noindexPages = [
  '/auth/callback', '/reset-password', '/signin', '/signup', '/start', '/subscribed',
  '/progress', '/breaks', '/play/hello-cards', '/play/stat', '/account/two-factor',
];

describe('sitemap', () => {
  it('lists every indexable page and no noindex page', () => {
    const xml = sitemapXml();
    const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    expect(listed).toEqual(indexablePages.filter((page) => !routeDeclaresNoindex(page)).map((page) => `https://cueory.app${page}`));
    for (const page of noindexPages) expect(listed).not.toContain(`https://cueory.app${page}`);
    // A legal page is included only after its exact text is approved.
    for (const route of Object.keys(legalRoutes)) {
      expect(indexablePages).toContain(route);
      expect(listed.includes(`https://cueory.app${route}`)).toBe(isRouteIndexable(route));
    }
  });

  it('rejects noindex routes even when someone mistakenly supplies them to the sitemap', () => {
    const xml = sitemapXml(['/', '/signin', '/progress', '/preview/states']);
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]))
      .toEqual(['https://cueory.app/']);
    expect(routeDeclaresNoindex('/signin')).toBe(true);
    expect(routeDeclaresNoindex('/preview/states')).toBe(true);
    expect(routeDeclaresNoindex('/privacy')).toBe(!isRouteIndexable('/privacy'));
    expect(routeDeclaresNoindex('/')).toBe(false);
  });

  it('finds the source for static and generated lesson routes', () => {
    expect(pageSourcePath('/learn/study-skills/label-it')?.replaceAll('\\', '/'))
      .toMatch(/src\/pages\/learn\/study-skills\/label-it\.astro$/);
    expect(pageSourcePath('/learn/study-skills/cards')?.replaceAll('\\', '/'))
      .toMatch(/src\/pages\/learn\/\[lesson\]\/cards\.astro$/);
  });

  it.each(['fill-in', 'organizer'])('ignores nested folders excluded by the %s collection loader', async (collection) => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    const flatRoot = resolve('content', collection);
    const ignored = resolve(flatRoot, 'ignored-nested');
    const nestedDirectory = {
      name: 'ignored-nested', isDirectory: () => true, isFile: () => false,
    } as unknown as ReturnType<typeof readdirSync>[number];
    vi.mocked(readdirSync).mockImplementation((...args: Parameters<typeof readdirSync>) => {
      const directory = String(args[0]);
      if (directory === ignored) throw new Error('This folder is outside the collection glob.');
      const entries = Reflect.apply(actual.readdirSync, undefined, args) as ReturnType<typeof readdirSync>;
      return directory === flatRoot ? [...entries, nestedDirectory] : entries;
    });
    try {
      expect(pageSourcePath('/learn/study-skills/cards')?.replaceAll('\\', '/'))
        .toMatch(/src\/pages\/learn\/\[lesson\]\/cards\.astro$/);
      expect(sitemapXml(['/learn/study-skills/cards']))
        .toContain('<loc>https://cueory.app/learn/study-skills/cards</loc>');
    } finally {
      vi.mocked(readdirSync).mockImplementation(actual.readdirSync);
    }
  });

  it('distinguishes boolean noindex={false} from truthy string values', () => {
    expect(sourceDeclaresNoindex('<Layout title="public" noindex={false} />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout title="private" noindex="false" />')).toBe(true);
    expect(sourceDeclaresNoindex("<Layout title='private' noindex='false' />")).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="private" noindex={true} />')).toBe(true);
  });

  it('rejects unbuilt dynamic lesson slugs and modes even when the template exists', () => {
    expect(pageSourcePath('/learn/study-skills')?.replaceAll('\\', '/'))
      .toMatch(/src\/pages\/learn\/\[lesson\]\/index\.astro$/);
    for (const route of [
      '/learn/not-a-real-lesson',
      '/learn/not-a-real-lesson/cards',
      '/learn/study-skills/not-a-real-mode',
    ]) {
      expect(pageSourcePath(route), route).toBeUndefined();
      expect(routeDeclaresNoindex(route), route).toBe(true);
    }
    const xml = sitemapXml(['/learn/not-a-real-lesson', '/learn/study-skills/cards', '/learn/study-skills/not-a-real-mode']);
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]))
      .toEqual(['https://cueory.app/learn/study-skills/cards']);
  });

  it('detects only Layout noindex, including a conditional value', () => {
    expect(sourceDeclaresNoindex('<!-- <Layout noindex /> --><Layout title="public" />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout title="private" noindex />')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="private" noindex={page.noindex} />')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="public" noindex={false} />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout title="public" description="noindex is a word" />')).toBe(false);
    // Removing a comment must not join the surrounding text into a new comment opener.
    expect(sourceDeclaresNoindex('<<!-- sample -->!--<Layout noindex />')).toBe(true);
  });

  it('ignores > inside attribute values and recognizes a tight noindex/> attribute', () => {
    expect(sourceDeclaresNoindex('<Layout description={a > b ? "yes" : "no"} noindex />')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout description="a > b" noindex/>')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout description={"text with >"} noindex/>')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="public" noindex={false}/>')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout description="some noindex words" />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout description={"some noindex words"} />')).toBe(false);
    expect(sourceDeclaresNoindex('{/* <Layout noindex /> */}<Layout title="public" />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout title="public" description={a > b} />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout description={{ text: "noindex" }} title="public" />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout description={a > b} noindex={page.hidden}/>')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout {...Astro.props} title="hidden" />')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="hidden" noindex={false} {...meta}/>')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout {...meta} noindex={false}/>')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="public" noindex={false} />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout title="public" description="{...meta}"/>')).toBe(false);
    expect(sourceDeclaresNoindex('<!-- <Layout noindex /> -->')).toBe(true); // No real Layout is fail closed.
  });

  it('fails closed when a page source is missing or outside the site', () => {
    expect(pageSourcePath('/this-page-does-not-exist')).toBeUndefined();
    expect(routeDeclaresNoindex('/this-page-does-not-exist')).toBe(true);
    expect(routeDeclaresNoindex('/invalid_%')).toBe(true);
    expect(routeDeclaresNoindex('https://unrelated.example/play')).toBe(true);
    const xml = sitemapXml(['/', '/this-page-does-not-exist', 'https://unrelated.example/play']);
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]))
      .toEqual(['https://cueory.app/']);
  });

  it('excludes noindex pages from sitemapPages as well as sitemapXml', async () => {
    const pages = await sitemapPages();
    // The two hand-built sample-lesson pages join the sitemap only on builds that show the sample lesson.
    expect(pages).toEqual([...indexablePages, ...(draftsAllowed(draftBuildEnv(process.env)) ? sampleLessonPages : [])].filter((page) => !routeDeclaresNoindex(page)));
    expect(pages.every((page) => !routeDeclaresNoindex(page))).toBe(true);
  });

  it('returns a public sitemap with the documented browser and edge cache limits', async () => {
    const response = await GET({} as Parameters<typeof GET>[0]);
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=86400');
    expect(await response.text()).toContain('<urlset');
  });

  it('configures real Cloudflare static-asset cache headers for /sitemap.xml', () => {
    const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(/^\/sitemap\.xml\r?\n[ \t]+Cache-Control: public, max-age=3600, s-maxage=86400(?:\r?\n|$)/m);
  });

  it('escapes XML values in the generated loc', () => {
    expect(sitemapXml(['/?term=a&b'])).toContain('term=a&amp;b');
  });
});

describe('crossword page while it is closed', () => {
  it.skipIf(crosswordOpen)('is noindex in the built page', () => {
    const html = readFileSync(resolve('dist/play/crossword.html'), 'utf8');
    expect(html).toContain('data-testid="crossword-soon"');
    expect(html).toMatch(/<meta name="robots" content="noindex/);
  });

  it('is listed in the built sitemap exactly when the switch is open', () => {
    const xml = readFileSync(resolve('dist/sitemap.xml'), 'utf8');
    expect(xml.includes('https://cueory.app/play/crossword</loc>')).toBe(crosswordOpen);
  });
});

describe('study-skills sample lesson in the built sitemap', () => {
  // Same gate as the lesson pages (draftsAllowed, src/lessons/draftgate.ts): absent when closed, present when open.
  const open = draftsAllowed(draftBuildEnv(process.env));
  const routes = ['/learn/study-skills', '/learn/study-skills/cards', '/learn/study-skills/label-it', '/learn/study-skills/questions'];

  it('lists the sample lesson pages exactly when the build shows drafts', () => {
    const xml = readFileSync(resolve('dist/sitemap.xml'), 'utf8');
    for (const route of routes) expect(xml.includes(`https://cueory.app${route}</loc>`), route).toBe(open);
  });

  it('keeps the sample lesson out of indexablePages, which the live build shares', () => {
    for (const route of routes) expect(indexablePages).not.toContain(route);
  });
});
