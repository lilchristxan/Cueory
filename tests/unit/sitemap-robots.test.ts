/**
 * The sitemap may list only pages search engines are allowed to index, and robots.txt must agree with it: it points at
 * the sitemap and blocks none of its pages. Checks dist/; run `npm run build` first (CI does).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const read = (name: string) => readFileSync(`${dist}${name}`, 'utf8');

const sitemap = read('sitemap.xml');
const robots = read('robots.txt');
const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

/** The built file behind a sitemap address (format: 'file', trailingSlash: 'never'). */
function builtFile(loc: string): string | undefined {
  const path = new URL(loc).pathname.replace(/^\/|\/$/g, '');
  return [`${path || 'index'}.html`, `${path}/index.html`].find((f) => existsSync(`${dist}${f}`));
}

/** Disallow rules that apply to every crawler. */
function disallows(): string[] {
  const rules: string[] = [];
  let applies = false;
  let inRecord = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(field)) {
      if (inRecord) applies = false;
      inRecord = false;
      if (value === '*') applies = true;
    } else {
      inRecord = true;
      if (applies && /^disallow$/i.test(field) && value) rules.push(value);
    }
  }
  return rules;
}

describe('sitemap.xml', () => {
  it('lists at least the home page, each address once, on our own site', () => {
    expect(locs).toContain(new URL('/', site.url).href);
    expect(new Set(locs).size, 'duplicate sitemap entries').toBe(locs.length);
    const foreign = locs.filter((l) => new URL(l).origin !== new URL(site.url).origin);
    expect(foreign).toEqual([]);
  });

  it('lists only pages that exist in the build', () => {
    const missing = locs.filter((l) => !builtFile(l));
    expect(missing, `sitemap addresses with no built page: ${missing.join(', ')}`).toEqual([]);
  });

  it('lists no page marked noindex', () => {
    const noindex = locs.filter((l) => {
      const f = builtFile(l);
      return f && /<meta\b[^>]*name="robots"[^>]*noindex/i.test(read(f));
    });
    expect(noindex, `noindex pages in the sitemap: ${noindex.join(', ')}`).toEqual([]);
  });

  it('lists only pages whose canonical link is their own address', () => {
    const wrong = locs.filter((l) => {
      const f = builtFile(l);
      const m = f && /<link\b[^>]*rel="canonical"[^>]*href="([^"]*)"/i.exec(read(f));
      return !m || m[1] !== l;
    });
    expect(wrong, `sitemap addresses whose canonical differs: ${wrong.join(', ')}`).toEqual([]);
  });
});

describe('robots.txt', () => {
  it('points at the sitemap this build produces', () => {
    const lines = robots.split(/\r?\n/).filter((l) => /^sitemap:/i.test(l.trim()));
    expect(lines.map((l) => l.split(/:(.+)/)[1].trim())).toEqual([new URL('/sitemap.xml', site.url).href]);
  });

  it('blocks no page the sitemap lists', () => {
    const rules = disallows();
    const blocked = locs.filter((l) => {
      const path = new URL(l).pathname;
      return rules.some((rule) => path.startsWith(rule.replace(/\*$/, '')));
    });
    expect(blocked, `sitemap pages blocked by robots.txt: ${blocked.join(', ')}`).toEqual([]);
  });
});
