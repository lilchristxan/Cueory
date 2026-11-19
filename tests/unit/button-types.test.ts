import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A <button> with no type submits the form around it, so a stray "show hint" button inside a form would send it.
 * Every button says what it is: type="button", or type="submit" only when it really sends a form (inside a <form>).
 * Lint-style: reads the source in src/ (Astro pages and components, React islands, page scripts).
 */
const root = fileURLToPath(new URL('../../', import.meta.url));

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p, ext);
    return ext.test(p) ? [p] : [];
  });
}

const markupFiles = files(join(root, 'src'), /\.(astro|tsx)$/);
const scriptFiles = files(join(root, 'src'), /\.(astro|tsx|ts)$/);
const lineOf = (s: string, i: number) => s.slice(0, i).split('\n').length;
const where = (f: string, s: string, i: number) => `${relative(root, f)}:${lineOf(s, i)}`;

/** Opening <button ...> tags, allowing JSX expressions with ">" inside braces. */
function buttonTags(source: string) {
  return [...source.matchAll(/<button\b((?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g)].map((m) => ({ attrs: m[1], index: m.index }));
}

describe('button types', () => {
  it('finds buttons to check', () => {
    expect(markupFiles.flatMap((f) => buttonTags(readFileSync(f, 'utf8'))).length).toBeGreaterThan(50);
  });

  it('every <button> has an explicit type of button, submit or reset', () => {
    const bad = markupFiles.flatMap((f) => {
      const s = readFileSync(f, 'utf8');
      return buttonTags(s)
        .filter((b) => !/\btype=(?:"(?:button|submit|reset)"|'(?:button|submit|reset)'|\{)/.test(b.attrs))
        .map((b) => where(f, s, b.index));
    });
    expect(bad, `buttons without type="button" (or "submit" in a form):\n${bad.join('\n')}`).toEqual([]);
  });

  it('a type="submit" button sits inside a <form> in the same file', () => {
    const bad = markupFiles.flatMap((f) => {
      const s = readFileSync(f, 'utf8');
      return buttonTags(s)
        .filter((b) => /\btype=["']submit["']/.test(b.attrs))
        .filter((b) => {
          const before = s.slice(0, b.index);
          const open = (before.match(/<form\b/g) ?? []).length;
          const close = (before.match(/<\/form>/g) ?? []).length;
          return open <= close;
        })
        .map((b) => where(f, s, b.index));
    });
    expect(bad, `submit buttons outside a <form>:\n${bad.join('\n')}`).toEqual([]);
  });

  it('a button made in script sets its type', () => {
    const bad = scriptFiles.flatMap((f) => {
      const s = readFileSync(f, 'utf8');
      return [...s.matchAll(/const (\w+) = document\.createElement\(['"]button['"]\)/g)]
        .filter((m) => !new RegExp(`\\b${m[1]}\\.type = ['"](button|submit)['"]`).test(s.slice(m.index, m.index + 600)))
        .map((m) => where(f, s, m.index));
    });
    expect(bad, `scripted buttons without a type:\n${bad.join('\n')}`).toEqual([]);
  });
});
