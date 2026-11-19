import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 320px reflow guard: a fixed (non-max) width wider than a 320px phone minus page padding
// forces sideways scroll. Source scan; the Playwright 320 specs cover rendered pages.
const PHONE_WIDTH_PX = 320;
const LIMIT_PX = PHONE_WIDTH_PX - 2 * 16; // 1rem page padding on each side
const root = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root).filter((f) => /\.(astro|tsx|css)$/.test(f));
const toPx = (n: number, unit: string) => (unit === 'px' ? n : n * 16);

// Tailwind utilities (w-80, min-w-96, w-[400px], basis-[30rem]) that have no responsive prefix.
// A breakpoint prefix (sm:, md:, lg:...) and container variants are fine; only bare ones apply at 320px.
const twScale = /(?:^|[\s"'`])(?:min-w|w|basis)-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)(px|rem)\])(?=[\s"'`]|$)/g;
// Raw CSS declarations of a fixed width (not max-, not inside a media query).
const cssWidth = /(?<![-\w(])(?:min-width|min-inline-size|width|inline-size|flex-basis)\s*:\s*(\d+(?:\.\d+)?)(px|rem)\b/g;

function inWideMinWidthMedia(text: string, index: number): boolean {
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < index; i++) {
    const ch = text[i];
    if (ch === '{') {
      stack.push(text.slice(start, i));
      start = i + 1;
    } else if (ch === '}') {
      stack.pop();
      start = i + 1;
    } else if (ch === ';') start = i + 1;
  }
  // Only exempt a simple query whose minimum is strictly wider than the phone viewport.
  return stack.some((header) => {
    const minimum = /@media\s*\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)(px|rem)\s*\)\s*$/i.exec(header);
    return minimum !== null && toPx(Number(minimum[1]), minimum[2]!.toLowerCase()) > PHONE_WIDTH_PX;
  });
}

function oversizedCssWidths(text: string): string[] {
  return [...text.matchAll(cssWidth)]
    .filter((m) => toPx(Number(m[1]), m[2]!) > LIMIT_PX && !inWideMinWidthMedia(text, m.index!))
    .map((m) => m[0]);
}

describe('320px fixed-width source guard', () => {
  it('has no unprefixed Tailwind width wider than a 320px phone', () => {
    const bad: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(twScale)) {
        // Tailwind spacing scale: w-N is N * 0.25rem = N * 4px.
        const px = m[1] !== undefined ? Number(m[1]) * 4 : toPx(Number(m[2]), m[3]!);
        if (px > LIMIT_PX) bad.push(`${file.replace(root, 'src')}: ${m[0].trim()} (${px}px)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has no raw CSS fixed width wider than a 320px phone outside a min-width media query above the phone viewport', () => {
    const bad: string[] = [];
    for (const file of files.filter((f) => /\.(css|astro)$/.test(f))) {
      for (const hit of oversizedCssWidths(readFileSync(file, 'utf8'))) bad.push(`${file.replace(root, 'src')}: ${hit}`);
    }
    expect(bad).toEqual([]);
  });

  it('tracks real brace nesting, so a declaration after an indented media block is still flagged', () => {
    const css = [
      '  @media (min-width: 40rem) {',
      '    .a { width: 400px; }',
      '  }',
      '  .phone { min-width: 400px; }',
    ].join('\n');
    expect(oversizedCssWidths(css)).toEqual(['min-width: 400px']);
    expect(oversizedCssWidths('@media (min-width: 40rem) {\n  .a {\n    width: 30rem;\n  }\n}')).toEqual([]);
  });

  it.each(['(min-width: 20rem)', '(min-width: 320px)', '(min-width: 40rem), (orientation: portrait)'])(
    'still flags a fixed width inside a media query that can apply at 320px: %s',
    (query) => {
      expect(oversizedCssWidths(`@media ${query} { .wide { width: 400px; } }`)).toEqual(['width: 400px']);
    },
  );

  it('only uses whitespace-nowrap inside an overflow-x scroller or a size-fitted label', () => {
    const allowed = new Map([
      ['src/islands/AdminFlags.tsx', 'table cells sit in a max-w-full overflow-x-auto wrapper'],
      ['src/islands/AnatomyLab.tsx', 'short absolutely positioned labels'],
      ['src/components/HomeHero.astro', 'sm:flex-nowrap is breakpoint-gated'],
    ]);
    const found = new Set<string>();
    for (const file of files) {
      if (/(?<![:\w-])(?:whitespace-nowrap|flex-nowrap)\b/.test(readFileSync(file, 'utf8'))) found.add(file.replace(process.cwd() + '/', ''));
    }
    expect([...found].filter((f) => !allowed.has(f))).toEqual([]);
    const admin = readFileSync(join(root, 'islands/AdminFlags.tsx'), 'utf8');
    expect(admin).toMatch(/max-w-full overflow-x-auto/);
  });
});
