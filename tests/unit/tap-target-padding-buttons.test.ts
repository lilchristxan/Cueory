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

// A class list that sets vertical padding but no explicit tap-target size.
function paddingOnly(classes: string): boolean {
  if (!/(^|\s)py-[\d.]+(\s|$)/.test(classes)) return false;
  // A responsive-only size does not guarantee a tap target at phone widths.
  return !/(?:^|\s)(?:min-h-(?:11|12|14|\(--tap-min\))|h-1[1-9]|size-\(--tap-min\))(?=\s|$)/.test(classes);
}

// Known gaps owned by other open work, pinned to the exact class list so nothing else in the file is excused.
// The sign-up button is fixed by the open Home redesign pull request (#890), which this pull request must not touch.
// An entry is NOT required to still be a gap: this test has to pass both before and after that fix lands, in either
// merge order. Delete the entry once the fix is in `staging`.
const KNOWN_GAPS = new Map<string, string[]>([
  ['components/SignupForm.astro', ['rounded-pill bg-button px-6 py-3 text-on-button hover:bg-button-hover']],
]);

function unexpectedOffenders(offenders: Map<string, string[]>): string[] {
  return [...offenders].flatMap(([file, lists]) =>
    lists.filter((classes) => !(KNOWN_GAPS.get(file) ?? []).includes(classes)).map((classes) => `${file}: ${classes}`));
}

describe('padding-sized buttons carry an explicit tap-target size', () => {
  const offenders = new Map<string, string[]>();
  for (const file of walk(root).filter((f) => /\.(tsx|astro)$/.test(f))) {
    for (const tag of buttonTags(readFileSync(file, 'utf8'))) {
      const classes = tag.match(/class(?:Name)?="([^"]*)"/)?.[1] ?? '';
      if (!paddingOnly(classes)) continue;
      const key = relative(root, file);
      offenders.set(key, [...(offenders.get(key) ?? []), classes]);
    }
  }

  it('has no new padding-only buttons', () => {
    expect(unexpectedOffenders(offenders)).toEqual([]);
  });

  it('pins every known gap to a class list the rule would flag', () => {
    for (const lists of KNOWN_GAPS.values()) for (const classes of lists) expect(paddingOnly(classes), classes).toBe(true);
  });

  it('excuses only the pinned class list, not the whole file', () => {
    const pinned = 'rounded-pill bg-button px-6 py-3 text-on-button hover:bg-button-hover';
    const other = 'rounded-pill px-3 py-2 text-ink';
    expect(unexpectedOffenders(new Map([['components/SignupForm.astro', [pinned]]]))).toEqual([]);
    expect(unexpectedOffenders(new Map([['components/SignupForm.astro', [pinned, other]]])))
      .toEqual([`components/SignupForm.astro: ${other}`]);
    expect(unexpectedOffenders(new Map([['components/Other.astro', [pinned]]]))).toEqual([`components/Other.astro: ${pinned}`]);
  });

  it('requires a complete phone-applicable size class even when a larger breakpoint sets one', () => {
    expect(paddingOnly('py-1 sm:min-h-11')).toBe(true);
    expect(paddingOnly('py-1 h-11/12')).toBe(true);
    expect(paddingOnly('py-1 min-h-(--tap-min) sm:min-h-14')).toBe(false);
    expect(paddingOnly('py-1 h-12')).toBe(false);
    expect(paddingOnly('py-1 size-(--tap-min)')).toBe(false);
  });

  it('passes once a known gap is fixed, so merge order does not matter', () => {
    expect(paddingOnly('signup-action min-h-11 rounded-pill px-6 py-3 font-bold')).toBe(false);
    expect(unexpectedOffenders(new Map())).toEqual([]);
  });
});
