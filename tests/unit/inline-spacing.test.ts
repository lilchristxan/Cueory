import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Astro's HTML compression drops the line break between a word at the end of one source line and an inline tag or
// expression at the start of the next, so "stays away for\n{days} days" rendered as "away for30 days" (5 Nov 2026
// visual audit). Keep the word and the tag on one line, or end the line with {' '}.
function astroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? astroFiles(path) : path.endsWith('.astro') ? [path] : [];
  });
}

const root = new URL('../../src/', import.meta.url).pathname;
const inlineStart = /^(<(?:code|strong|em|kbd|abbr)(?:\s|>)|<a\s|\{[a-zA-Z_][\w.]*\})/;
const wordEnd = /[A-Za-z0-9,.)"']$/;

describe('no line break is left to vanish before an inline tag or expression', () => {
  it.each(astroFiles(root).map((p) => [p.slice(root.length)] as const))('%s', (rel) => {
    const lines = readFileSync(join(root, rel), 'utf8').split('\n');
    const bad: string[] = [];
    for (let i = 0; i < lines.length - 1; i++) {
      const a = lines[i].trimEnd();
      const b = lines[i + 1].trimStart();
      if (wordEnd.test(a) && !a.endsWith("{' '}") && inlineStart.test(b)) bad.push(`line ${i + 1}: …${a.slice(-30)} ⏎ ${b.slice(0, 30)}…`);
    }
    expect(bad, 'end the first line with {\' \'} or join the lines').toEqual([]);
  });
});
