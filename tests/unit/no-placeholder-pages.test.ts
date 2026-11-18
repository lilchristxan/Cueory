/** Lane 23: run after npm run build. A page that search engines may index must not show bracketed placeholder text. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indexablePages } from '../../src/config/routes';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const PLACEHOLDER = /\[(christian writes this|sample step[^\]]*|page introduction[^\]]*)\]|data-placeholder=/i;

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? htmlFiles(path) : name.endsWith('.html') ? [path] : [];
  });
}

function fileFor(route: string): string {
  return route === '/' ? join(root, 'index.html') : join(root, route.slice(1) + '.html');
}

describe('placeholder pages stay out of the public site', () => {
  it('no page in indexablePages shows placeholder text', () => {
    expect(existsSync(root), 'dist is missing: run npm run build before npm test').toBe(true);
    for (const route of indexablePages) {
      const file = fileFor(route);
      expect(existsSync(file), `${route} is not built`).toBe(true);
      expect(PLACEHOLDER.test(readFileSync(file, 'utf8')), `${route} shows placeholder text`).toBe(false);
    }
  });

  it('every built page with placeholder text is noindex', () => {
    expect(existsSync(root), 'dist is missing: run npm run build before npm test').toBe(true);
    for (const file of htmlFiles(root)) {
      const html = readFileSync(file, 'utf8');
      if (PLACEHOLDER.test(html)) expect(html, `${file} has placeholders and is indexable`).toMatch(/<meta name="robots" content="noindex/);
    }
  });
});
