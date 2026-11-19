import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// A Tailwind button sized only by padding reaches 44 px by accident (padding plus one line of text) and drops below
// it when the text gets smaller. Every <button> that sets vertical padding utilities in its own class list must also
// carry an explicit tap-target size. Buttons styled by a named CSS class are checked by tests/e2e/tap-targets.spec.ts.
const root = new URL('../../src/', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}

// Opening tag text from "<button" to its closing ">", skipping quotes and {braces} so "=>" inside handlers is ignored.
function buttonTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<button(?=[\s/>])/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = match.index! + match[0].length;
    for (; i < source.length; i += 1) {
      const c = source[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0 && source[i - 1] !== '=') break;
    }
    tags.push(source.slice(match.index!, i + 1));
  }
  return tags;
}

// Known gaps owned by other open work. Remove an entry when its fix lands; the test fails if an entry goes stale.
const KNOWN_GAPS = new Set(['components/SignupForm.astro']);

describe('padding-sized buttons carry an explicit tap-target size', () => {
  const offenders = new Map<string, string[]>();
  for (const file of walk(root).filter((f) => /\.(tsx|astro)$/.test(f))) {
    for (const tag of buttonTags(readFileSync(file, 'utf8'))) {
      const classes = tag.match(/class(?:Name)?="([^"]*)"/)?.[1] ?? '';
      if (!/(^|\s)py-[\d.]+(\s|$)/.test(classes)) continue;
      if (/min-h-11|min-h-12|min-h-14|min-h-\(--tap-min\)|(^|\s)h-1[1-9]|size-\(--tap-min\)/.test(classes)) continue;
      const key = relative(root, file);
      offenders.set(key, [...(offenders.get(key) ?? []), classes]);
    }
  }

  it('has no new padding-only buttons', () => {
    const unexpected = [...offenders].filter(([file]) => !KNOWN_GAPS.has(file));
    expect(unexpected).toEqual([]);
  });

  it('keeps the known-gap list honest', () => {
    for (const file of KNOWN_GAPS) expect(offenders.has(file), `${file} is fixed: drop it from KNOWN_GAPS`).toBe(true);
  });
});
