import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source-level guard (complements accessibility-names.test.ts, which reads built HTML): every icon-only control,
// form control and svg picture in the components and islands has an accessible name or is hidden as decoration.
// Same-length blanking keeps line numbers; comments and docs may mention tags like <select>.
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/[^\n]*|<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
const folders = ['src/components', 'src/islands'];
const files = folders.flatMap((dir) =>
  readdirSync(resolve(dir))
    .filter((name) => /\.(astro|tsx)$/.test(name))
    .map((name) => ({ name: join(dir, name), source: stripComments(readFileSync(resolve(dir, name), 'utf8')) })),
);
// An opening tag whose attribute text may hold quoted strings and {braced} expressions.
const TAG = (names: string) =>
  new RegExp(`<(${names})\\b((?:[^>"'{]|"[^"]*"|'[^']*'|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*?)(/?)>`, 'g');
const line = (source: string, index: number) => source.slice(0, index).split('\n').length;
const NAMED = /aria-label=|aria-labelledby=|\btitle=|\{\.\.\./;

// Repeats the removal until nothing changes, so stripped markup cannot leave a new tag behind.
function removeUntilStable(text: string, pattern: RegExp): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(pattern, '');
  } while (current !== previous);
  return current;
}

function scan(test: (file: string, source: string, m: RegExpExecArray) => boolean) {
  const bad: string[] = [];
  for (const { name, source } of files) {
    for (const m of source.matchAll(TAG('button|a|input|select|textarea|svg|img')) as Iterable<RegExpExecArray>) {
      if (!test(name, source, m)) bad.push(`${name}:${line(source, m.index)} <${m[1]}>`);
    }
  }
  return bad;
}

describe('accessible names in component and island source', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('gives every button and link a name: label attributes or visible text', () => {
    expect(
      scan((_n, source, m) => {
        if (!['button', 'a'].includes(m[1]) || m[3] === '/' || NAMED.test(m[2])) return true;
        const end = source.indexOf(`</${m[1]}>`, m.index + m[0].length);
        const inner = removeUntilStable(source.slice(m.index + m[0].length, end), /<svg[\s\S]*?<\/svg>/g);
        const text = removeUntilStable(inner, /<[^>]+>/g);
        return /[A-Za-z0-9]/.test(text) || /\{[^}]+\}/.test(text);
      }),
    ).toEqual([]);
  });

  it('gives every image alt text', () => {
    expect(scan((_n, _s, m) => m[1] !== 'img' || /\balt=|\{\.\.\./.test(m[2]))).toEqual([]);
  });

  it('labels every form control: id, aria name, or a wrapping label', () => {
    expect(
      scan((_n, source, m) => {
        if (!['input', 'select', 'textarea'].includes(m[1])) return true;
        if (/type="(hidden|submit|button)"/.test(m[2]) || NAMED.test(m[2]) || /\bid=/.test(m[2])) return true;
        const before = source.slice(Math.max(0, m.index - 1500), m.index);
        // Wrapped in a <label>, or a radiogroup/fieldset that names its options (FillInBoard dropdown mode).
        return before.lastIndexOf('<label') > before.lastIndexOf('</label>') || /role="radiogroup"/.test(before);
      }),
    ).toEqual([]);
  });

  it('hides decorative svgs or names them with role="img"', () => {
    expect(
      scan((_n, source, m) => {
        if (m[1] !== 'svg' || /aria-hidden=|\{\.\.\./.test(m[2])) return true;
        if (/role="img"/.test(m[2])) return /aria-label=|aria-labelledby=/.test(m[2]);
        return /aria-hidden="true"/.test(source.slice(Math.max(0, m.index - 1500), m.index));
      }),
    ).toEqual([]);
  });

  it('keeps live regions coherent: status and alert roles are never switched off', () => {
    const bad: string[] = [];
    for (const { name, source } of files) {
      for (const m of source.matchAll(/<[a-zA-Z][^<>]*?(?:role="(?:status|alert)"|aria-live=)[^<>]*>/g)) {
        const tag = m[0];
        if (/role="(status|alert)"/.test(tag) && /aria-live="off"/.test(tag)) bad.push(`${name}:${line(source, m.index)} off`);
        const live = /aria-live="([^"]*)"/.exec(tag)?.[1];
        if (live !== undefined && !['polite', 'assertive', 'off'].includes(live)) bad.push(`${name}:${line(source, m.index)} ${live}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps at least the known status regions present (announce form and account messages)', () => {
    const text = (n: string) => files.find((f) => f.name.endsWith(n))!.source;
    expect(text('AccountCorner.astro')).toMatch(/role="status"[^>]*aria-live="polite"/);
    expect(text('AccountSettings.tsx')).toContain('role="status"');
    expect(text('SiteMenu.astro')).toMatch(/aria-live="polite"[^>]*data-search-status/);
  });
});
