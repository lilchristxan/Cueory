/**
 * Every internal link in the built site must land on something that exists: no 404s. Checks dist/; run
 * `npm run build` first (CI does). Cloudflare serves /about from about.html (the default for static assets), and a
 * folder's index.html at its folder address.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const origin = new URL(site.url).origin;

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

/** Does this address resolve to a built file? */
function resolves(pathname: string): boolean {
  const path = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (path === '') return existsSync(`${dist}index.html`);
  const file = `${dist}${path}`;
  if (existsSync(file) && statSync(file).isFile()) return true;
  const bare = path.replace(/\/$/, '');
  return existsSync(`${dist}${bare}.html`) || existsSync(`${dist}${bare}/index.html`);
}

const skipScheme = /^(mailto:|tel:|sms:|data:|javascript:|blob:)/i;

interface Link {
  from: string;
  href: string;
  target: string;
}

const links: Link[] = [];
for (const file of htmlFiles(dist)) {
  const route = `/${relative(dist, file).replace(/\\/g, '/').replace(/\.html$/, '')}`.replace(/^\/index$/, '/');
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<a\b[^>]*?\shref=(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = (m[1] ?? m[2]).replace(/&amp;/g, '&').trim();
    if (href === '' || href.startsWith('#') || skipScheme.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, new URL(route, site.url));
    } catch {
      links.push({ from: route, href, target: '(not a valid address)' });
      continue;
    }
    // External links are not ours to check; our own absolute links are.
    if (url.origin !== origin) continue;
    links.push({ from: route, href, target: url.pathname });
  }
}

describe('internal links', () => {
  it('finds links to check', () => {
    expect(links.length).toBeGreaterThan(50);
  });

  it('every internal link resolves to a built page or file', () => {
    const broken = links.filter((l) => l.target.startsWith('(') || !resolves(l.target));
    const lines = [...new Set(broken.map((l) => `${l.from} -> ${l.href}`))];
    expect(lines, `broken internal links:\n${lines.join('\n')}`).toEqual([]);
  });
});
