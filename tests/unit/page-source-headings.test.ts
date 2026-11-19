import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES_ROOT = resolve('src/pages');

function astroPages(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = join(folder, entry.name);
    return entry.isDirectory() ? astroPages(file) : file.endsWith('.astro') ? [file] : [];
  }).sort();
}

// Pages whose single Layout holds mutually exclusive branches (coming-soon vs shown), each with its own h1.
const EXCLUSIVE_BRANCH_H1 = new Set(['preview/prose.astro', 'resources.astro']);

const strip = (source: string) => source.replace(/<!--[\s\S]*?-->/g, ' ');

/** Local components and islands a page imports; they may supply the page's h1. */
function importedH1Count(file: string, source: string): number {
  let count = 0;
  for (const match of source.matchAll(/^import\s+(?:[\w{}\s,]+)\s+from\s+['"](\.[^'"]+)['"]/gm)) {
    const target = resolve(dirname(file), match[1]);
    if (/layouts\/Layout\.astro$/.test(target)) continue;
    if (!/\.(astro|tsx)$/.test(target) || !existsSync(target)) continue;
    count += (strip(readFileSync(target, 'utf8')).match(/<h1\b/g) ?? []).length;
  }
  return count;
}

describe('page source: one h1 per rendered page, main landmark owned by Layout', () => {
  const pages = astroPages(PAGES_ROOT);

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThan(40);
  });

  it('Layout.astro is the only place that renders the main landmark', () => {
    expect(readFileSync('src/layouts/Layout.astro', 'utf8')).toMatch(/<main\b[^>]*\bid="main"/);
    const offenders = pages
      .filter((file) => /<main\b/i.test(strip(readFileSync(file, 'utf8'))))
      .map((file) => relative(PAGES_ROOT, file));
    expect(offenders).toEqual([]);
  });

  for (const file of pages) {
    const name = relative(PAGES_ROOT, file);
    it(`${name} gives every Layout it renders an h1, and never two in one Layout`, () => {
      const source = strip(readFileSync(file, 'utf8'));
      const blocks = source.split(/<Layout\b/).slice(1).map((part) => part.split(/<\/Layout\s*>/)[0]);
      expect(blocks.length, 'page must render the shared Layout').toBeGreaterThan(0);
      const viaImports = importedH1Count(file, source);
      for (const block of blocks) {
        const own = (block.match(/<h1\b/g) ?? []).length;
        if (!EXCLUSIVE_BRANCH_H1.has(name)) expect(own, 'two h1 elements inside one Layout').toBeLessThanOrEqual(1);
        else expect(block, 'multiple h1 only in conditional branches').toMatch(/\{\s*!?shown\b|\{\s*\n?\s*!shown/);
        if (own === 0) expect(viaImports, 'Layout has no h1 of its own or from an imported component').toBeGreaterThan(0);
      }
    });
  }
});
