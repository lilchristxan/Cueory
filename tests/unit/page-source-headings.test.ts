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

// Drop HTML comments and whole {/* ... */} template comments, so commented-out markup never counts.
const strip = (source: string) => source.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, ' ');

const h1Count = (markup: string) => (markup.match(/<h1\b/g) ?? []).length;

/** Default-imported local components and islands of a page, mapped to the number of h1 tags in their own source. */
function componentHeadings(file: string, source: string): Map<string, number> {
  const headings = new Map<string, number>();
  for (const match of source.matchAll(/^import\s+([A-Z]\w*)\s*(?:,\s*\{[^}]*\}\s*)?from\s+['"](\.[^'"]+)['"]/gm)) {
    const base = resolve(dirname(file), match[2]);
    if (/layouts\/Layout\.astro$/.test(base)) continue;
    const target = [base, `${base}.tsx`, `${base}.astro`].find((path) => /\.(astro|tsx)$/.test(path) && existsSync(path));
    if (target) headings.set(match[1], h1Count(strip(readFileSync(target, 'utf8'))));
  }
  return headings;
}

/** How many times the markup renders `<Name ...>` itself, not a longer tag that starts with the same letters. */
const renderCount = (markup: string, name: string) => (markup.match(new RegExp(`<${name}(?=[\\s/>])`, 'g')) ?? []).length;

/**
 * Heading problems in one page's source. Each Layout it renders needs exactly one h1: its own, or one rendered
 * component whose source holds an h1. A component counts once per time it renders, however many mutually exclusive
 * states with an h1 it has inside. An import alone never counts.
 */
function headingProblems(name: string, source: string, components: ReadonlyMap<string, number>): string[] {
  const markup = strip(source.replace(/^---[\s\S]*?\n---/, ' '));
  const blocks = markup.split(/<Layout\b/).slice(1).map((part) => part.split(/<\/Layout\s*>/)[0]);
  if (blocks.length === 0) return ['page must render the shared Layout'];
  const problems: string[] = [];
  blocks.forEach((block, index) => {
    const fromComponents = [...components]
      .reduce((sum, [component, count]) => sum + (count > 0 ? renderCount(block, component) : 0), 0);
    const total = h1Count(block) + fromComponents;
    if (total > 1 && !EXCLUSIVE_BRANCH_H1.has(name)) problems.push(`Layout ${index + 1} has ${total} h1 elements`);
    if (total > 1 && EXCLUSIVE_BRANCH_H1.has(name) && !/\{\s*!?shown\b/.test(block)) {
      problems.push(`Layout ${index + 1} has several h1 elements outside its shown branches`);
    }
    if (total === 0) problems.push(`Layout ${index + 1} has no h1 of its own or from a component it renders`);
  });
  return problems;
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

  it('reads the headings of a real imported island', () => {
    const file = join(PAGES_ROOT, 'admin/flags.astro');
    expect(componentHeadings(file, readFileSync(file, 'utf8')).get('AdminFlags')).toBeGreaterThan(0);
  });

  for (const file of pages) {
    const name = relative(PAGES_ROOT, file);
    it(`${name} gives every Layout it renders an h1, and never two in one Layout`, () => {
      const source = readFileSync(file, 'utf8');
      expect(headingProblems(name, source, componentHeadings(file, source))).toEqual([]);
    });
  }
});

describe('page source headings: synthetic pages', () => {
  const island = new Map([['AdminFlags', 3]]);
  const page = (body: string) =>
    `---\nimport Layout from '../layouts/Layout.astro';\nimport AdminFlags from '../islands/AdminFlags.tsx';\n---\n${body}\n`;
  const missing = (n: number) => `Layout ${n} has no h1 of its own or from a component it renders`;

  it('credits a component heading where the component renders', () => {
    expect(headingProblems('x.astro', page('<Layout title="x"><AdminFlags client:only="react" /></Layout>'), island)).toEqual([]);
  });

  it('rejects a component that is imported but never rendered', () => {
    expect(headingProblems('x.astro', page('<Layout title="x"><p>reports</p></Layout>'), island)).toEqual([missing(1)]);
  });

  it('rejects commented-out and similarly named components', () => {
    for (const body of ['<!-- <AdminFlags /> -->', '{/* <AdminFlags /> */}', '<AdminFlagsLegacy />']) {
      expect(headingProblems('x.astro', page(`<Layout title="x">${body}</Layout>`), island), body).toEqual([missing(1)]);
    }
  });

  it('checks each Layout branch on its own', () => {
    const body = '{ok ? (<Layout title="x"><AdminFlags /></Layout>) : (<Layout title="y"><p>soon</p></Layout>)}';
    expect(headingProblems('x.astro', page(body), island)).toEqual([missing(2)]);
  });

  it('rejects a direct h1 beside a heading component, or that component twice, in one Layout', () => {
    expect(headingProblems('x.astro', page('<Layout title="x"><h1>reports</h1><AdminFlags client:only="react" /></Layout>'), island))
      .toEqual(['Layout 1 has 2 h1 elements']);
    expect(headingProblems('x.astro', page('<Layout title="x"><AdminFlags /><AdminFlags /></Layout>'), island))
      .toEqual(['Layout 1 has 2 h1 elements']);
  });

  it('rejects two h1 in one Layout, a component without a heading, and a page without Layout', () => {
    expect(headingProblems('x.astro', page('<Layout title="x"><h1>a</h1><h1>b</h1></Layout>'), island))
      .toEqual(['Layout 1 has 2 h1 elements']);
    expect(headingProblems('x.astro', page('<Layout title="x"><Quiet /></Layout>'), new Map([['Quiet', 0]])))
      .toEqual([missing(1)]);
    expect(headingProblems('x.astro', '<html><body><h1>a</h1></body></html>', island))
      .toEqual(['page must render the shared Layout']);
  });
});
