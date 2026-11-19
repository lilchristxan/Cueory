/**
 * Every built page needs its own <title>, a meta description and a canonical link, so search results and shared links
 * never show two pages with the same name. Checks dist/; run `npm run build` first (CI does).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/** Decodes the named entities Astro writes in one pass, so "&amp;lt;" becomes "&lt;" and is never decoded twice. */
function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (match, name: string) => ENTITIES[name] ?? match).trim();
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}=("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? '') : undefined;
}

function metaContent(html: string, key: 'name' | 'property', value: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (attr(tag, key) === value) return attr(tag, 'content');
  }
  return undefined;
}

function canonicalHref(html: string): string | undefined {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (attr(tag, 'rel') === 'canonical') return attr(tag, 'href');
  }
  return undefined;
}

/** The URL path a built file is served at (format: 'file', trailingSlash: 'never'). */
function routeOf(file: string): string {
  const rel = relative(dist, file).replace(/\\/g, '/').replace(/\.html$/, '');
  return rel === 'index' ? '/' : `/${rel.replace(/\/index$/, '')}`;
}

const pages = htmlFiles(dist).map((file) => {
  const html = readFileSync(file, 'utf8');
  return {
    route: routeOf(file),
    title: decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''),
    description: metaContent(html, 'name', 'description') ?? '',
    canonical: canonicalHref(html),
  };
});

describe('page metadata', () => {
  it('finds the built pages', () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it('gives every page a non-empty <title>', () => {
    const missing = pages.filter((p) => p.title === '').map((p) => p.route);
    expect(missing, `pages with no <title>: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every page a unique <title>', () => {
    const byTitle = new Map<string, string[]>();
    for (const p of pages) byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p.route]);
    const dupes = [...byTitle].filter(([, routes]) => routes.length > 1).map(([t, r]) => `"${t}": ${r.join(', ')}`);
    expect(dupes, `pages sharing a <title>:\n${dupes.join('\n')}`).toEqual([]);
  });

  it('gives every page a non-empty meta description', () => {
    const missing = pages.filter((p) => p.description === '').map((p) => p.route);
    expect(missing, `pages with no meta description: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every page a unique meta description', () => {
    const byDescription = new Map<string, string[]>();
    for (const p of pages) byDescription.set(p.description, [...(byDescription.get(p.description) ?? []), p.route]);
    const dupes = [...byDescription].filter(([, routes]) => routes.length > 1).map(([d, r]) => `"${d}": ${r.join(', ')}`);
    expect(dupes, `pages sharing a meta description:\n${dupes.join('\n')}`).toEqual([]);
  });

  it('gives every page exactly one canonical link to its own address on the site', () => {
    const wrong = pages.filter((p) => p.canonical !== new URL(p.route, site.url).href).map((p) => `${p.route} -> ${p.canonical}`);
    expect(wrong, `canonical links that do not match the page:\n${wrong.join('\n')}`).toEqual([]);
  });
});
