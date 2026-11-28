import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';
import { SHARE_CARD_SIZE, socialImageMeta } from '../../src/config/socialimages';

const DIST = resolve('dist');
const SHARE = resolve('public/share');

/** The launch routes (SEO lane, 23 Nov launch) and their built files. */
const LAUNCH_PAGES: Readonly<Record<string, string>> = {
  '/': 'index.html',
  '/play': 'play.html',
  '/play/pillo': 'play/pillo.html',
  '/play/sudoku': 'play/sudoku.html',
  '/play/word-path': 'play/word-path.html',
  '/support': 'support.html',
  '/message': 'message.html',
  '/about': 'about.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
  '/disclaimer': 'disclaimer.html',
  '/404': '404.html',
};

const GAME_ROUTES = new Set(['/play', '/play/pillo', '/play/sudoku', '/play/word-path']);
const MOTTO = 'by nursing students, for nursing students.';

function htmlFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const file = join(folder, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : file.endsWith('.html') ? [file] : [];
  });
}

function head(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? '';
}

/** Decode HTML character references in one pass, so "&amp;quot;" stays "&quot;" instead of decoding twice. */
function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

/** A tag's attributes by lowercase name (double-quoted, single-quoted or bare values), each decoded once. */
function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  const body = tag.replace(/^<[a-z]+/i, '').replace(/\/?>$/, '');
  for (const match of body.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (!found.has(name)) found.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return found;
}

/** Every content value of the meta tags whose property or name is exactly this key, in order. */
function metaValues(html: string, key: string): string[] {
  return [...head(html).matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => attributes(match[0]))
    .filter((attrs) => attrs.get('property') === key || attrs.get('name') === key)
    .map((attrs) => attrs.get('content') ?? '');
}

function one(html: string, key: string): string | undefined {
  const values = metaValues(html, key);
  return values.length === 1 ? values[0] : undefined;
}

function pngSize(file: string): [number, number] {
  const bytes = readFileSync(file);
  expect([...bytes.subarray(0, 8)], `${file}: PNG signature`).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('the meta-tag reader used below', () => {
  it('matches keys exactly, reads any quoting, and decodes each value once', () => {
    const html = '<head><meta property="og:image:alt" content="a &amp;quot;b&amp;quot; &#39;c&#39;">'
      + "<meta content='x' name=twitter:image:alt><meta property=\"og:imageXalt\" content=\"no\">"
      + '<meta property="og:image" content="https://cueory.app/share/study-ivory.png?a=1&amp;b=2" /></head>';
    expect(metaValues(html, 'og:image:alt')).toEqual(['a &quot;b&quot; \'c\'']);
    expect(metaValues(html, 'twitter:image:alt')).toEqual(['x']);
    expect(metaValues(html, 'og:image')).toEqual(['https://cueory.app/share/study-ivory.png?a=1&b=2']);
    expect(metaValues(html, 'og:image.alt')).toEqual([]);
    expect(metaValues(html, 'og:image\\:alt')).toEqual([]);
    expect(metaValues('<!-- <head><meta name="x" content="hidden"></head> --><head></head>', 'x')).toEqual([]);
  });
});

describe('share card facts (src/config/socialimages.ts)', () => {
  it('knows every share card in public/share/, with its real size', () => {
    const cards = readdirSync(SHARE).filter((name) => name.endsWith('.png')).sort();
    expect(cards).toEqual([
      'games-bronze-coin.png', 'games-ivory.png', 'games-scene.png',
      'study-bronze-coin.png', 'study-ivory.png', 'study-scene.png',
    ]);
    for (const card of cards) {
      const meta = socialImageMeta(`/share/${card}`);
      expect(meta, card).toBeDefined();
      expect([meta!.width, meta!.height], card).toEqual(pngSize(join(SHARE, card)));
      expect(meta!.type).toBe('image/png');
    }
    expect(SHARE_CARD_SIZE).toEqual({ width: 1200, height: 630 });
  });

  it('describes each card with the words drawn on it', () => {
    expect(socialImageMeta('/share/study-ivory.png')?.alt).toBe(`cueory · study skills · ${MOTTO}`);
    expect(socialImageMeta('/share/study-scene.png')?.alt).toBe(`cueory · study skills · ${MOTTO}`);
    expect(socialImageMeta('/share/games-scene.png')?.alt).toBe(`cueory · daily games · ${MOTTO}`);
    expect(socialImageMeta('/share/games-ivory.png')?.alt).toBe(`cueory · daily games · ${MOTTO}`);
    // The bronze-coin card has no motto (scripts/build-share-cards.mjs).
    expect(socialImageMeta('/share/games-bronze-coin.png')?.alt).toBe('cueory · daily games');
    expect(socialImageMeta('/share/study-bronze-coin.png')?.alt).toBe('cueory · study skills');
    const source = readFileSync(resolve('scripts/build-share-cards.mjs'), 'utf8');
    expect(source).toContain(`const MOTTO = '${MOTTO}';`);
    expect(source).toContain("name: 'daily games'");
    expect(source).toContain("name: 'study skills'");
  });

  it('knows nothing about other images, so Layout fails the build for them', () => {
    for (const path of ['/share/previews/games-scene-560.webp', '/share/other.png', '/brand/v1/icon-512.png',
      'https://example.com/share/games-scene.png', '/share/games-scene.png?x=1', '']) {
      expect(socialImageMeta(path), path).toBeUndefined();
    }
    expect(readFileSync(resolve('src/layouts/Layout.astro'), 'utf8'))
      .toMatch(/if \(!socialImageInfo\) throw new Error\(/);
  });
});

describe('link-preview metadata on the built launch pages', () => {
  it('gives each launch page a site name, locale, and an image with its size, type and text alternative', () => {
    for (const [route, file] of Object.entries(LAUNCH_PAGES)) {
      const html = readFileSync(join(DIST, file), 'utf8');
      const image = `/share/${GAME_ROUTES.has(route) ? 'games-scene' : 'study-ivory'}.png`;
      const meta = socialImageMeta(image)!;
      expect(one(html, 'og:site_name'), `${route}: og:site_name`).toBe('cueory');
      expect(one(html, 'og:locale'), `${route}: og:locale`).toBe('en_US');
      expect(one(html, 'og:image'), `${route}: og:image`).toBe(new URL(image, site.url).href);
      expect(existsSync(join(DIST, image)), `${route}: ${image} is built`).toBe(true);
      expect(pngSize(join(DIST, image)), `${route}: built image size`).toEqual([1200, 630]);
      expect(one(html, 'og:image:type'), `${route}: og:image:type`).toBe('image/png');
      expect(one(html, 'og:image:width'), `${route}: og:image:width`).toBe('1200');
      expect(one(html, 'og:image:height'), `${route}: og:image:height`).toBe('630');
      expect(one(html, 'og:image:alt'), `${route}: og:image:alt`).toBe(meta.alt);
      expect(one(html, 'twitter:image'), `${route}: twitter:image`).toBe(one(html, 'og:image'));
      expect(one(html, 'twitter:image:alt'), `${route}: twitter:image:alt`).toBe(meta.alt);
      expect(/<html\b[^>]*\slang="en"/.test(html), `${route}: lang`).toBe(true);
    }
  });

  it('gives every built page the same complete set, matched to its own image', () => {
    const problems: string[] = [];
    for (const file of htmlFiles(DIST)) {
      const page = relative(DIST, file);
      const html = readFileSync(file, 'utf8');
      const image = one(html, 'og:image');
      if (!image) { problems.push(`${page}: needs one og:image`); continue; }
      const url = new URL(image);
      const meta = url.origin === site.url ? socialImageMeta(url.pathname) : undefined;
      if (!meta) { problems.push(`${page}: og:image ${image} is not one of our share cards`); continue; }
      const expected: Readonly<Record<string, string>> = {
        'og:site_name': 'cueory',
        'og:locale': 'en_US',
        'og:image:type': meta.type,
        'og:image:width': String(meta.width),
        'og:image:height': String(meta.height),
        'og:image:alt': meta.alt,
        'twitter:image:alt': meta.alt,
      };
      for (const [key, value] of Object.entries(expected)) {
        const values = metaValues(html, key);
        if (values.length !== 1 || values[0] !== value) problems.push(`${page}: ${key} = ${JSON.stringify(values)}, expected ${value}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps /about, /message and /404 out of search while they keep their preview', () => {
    for (const file of ['about.html', 'message.html', '404.html']) {
      expect(metaValues(readFileSync(join(DIST, file), 'utf8'), 'robots'), file).toEqual(['noindex, nofollow']);
    }
  });
});
