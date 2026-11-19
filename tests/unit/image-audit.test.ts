import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every <img> in src must have alt (empty when decorative), width and height (no layout shift), and a loading
// attribute: lazy by default, eager only for the first thing on the page (marked data-image-priority).
const root = fileURLToPath(new URL('../../', import.meta.url));
const srcDir = join(root, 'src');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.(astro|tsx)$/.test(name) ? [file] : [];
  });
}

/** The text of each `<img ...>` opening tag, skipping quoted values and `{...}` expressions. */
function imgTags(source: string): string[] {
  // Comments may mention <img>; drop them (keeping line breaks) before looking for real tags.
  const markup = source.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:'"`])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
  const found: string[] = [];
  const open = /(?<![\w'"`])<img(?=[\s/>])/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(markup))) {
    let quote: string | undefined;
    let depth = 0;
    let end = match.index;
    for (let i = match.index + 4; i < markup.length; i += 1) {
      const c = markup[i];
      if (quote) {
        if (c === quote) quote = undefined;
      } else if (c === '"' || c === "'" || (c === '`' && depth > 0)) quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) {
        end = i;
        break;
      }
    }
    found.push(markup.slice(match.index, end + 1));
  }
  return found;
}

const has = (tag: string, name: string) => new RegExp(`\\s${name}(=|\\s|/|>)`).test(tag);

// Images that show at once on their page (or are data: URLs), so they carry no loading attribute.
const loadsAtOnce: Record<string, string> = {
  'src/islands/SignIn.tsx': 'the sign-in button is the page',
  'src/islands/TwoFactor.tsx': 'a data: URL QR code, no request',
  'src/islands/LabelItBoard.tsx': 'the game picture is the main content',
  'src/islands/AnatomyLab.tsx': 'worksheet picture; lazy loading waits for the open anatomy PRs',
};

describe('image audit', () => {
  const all = sources(srcDir).flatMap((file) =>
    imgTags(readFileSync(file, 'utf8')).map((tag) => ({ file: relative(root, file), tag })),
  );

  it('finds the images', () => {
    expect(all.length).toBeGreaterThan(10);
  });

  it('every img has alt, width and height', () => {
    const bad = all.filter(({ tag }) => !has(tag, 'alt') || !has(tag, 'width') || !has(tag, 'height'));
    expect(bad.map((b) => `${b.file}: ${b.tag.slice(0, 80)}`)).toEqual([]);
  });

  it('every img says how it loads: lazy, or eager only for a marked priority image', () => {
    const bad = all.filter(({ file, tag }) => {
      if (/loading=["{]*eager/.test(tag)) return !has(tag, 'data-image-priority');
      if (/loading=["{]*lazy/.test(tag)) return false;
      // A prop such as loading={loading} is fine when the component defaults it to lazy.
      if (/loading=\{\w+\}/.test(tag)) return !/loading\s*=\s*'lazy'/.test(readFileSync(join(root, file), 'utf8'));
      return !(file in loadsAtOnce);
    });
    expect(bad.map((b) => `${b.file}: ${b.tag.slice(0, 80)}`)).toEqual([]);
  });

  it('the at-once list names only files that still hold images without loading', () => {
    for (const file of Object.keys(loadsAtOnce)) {
      const tags = all.filter((a) => a.file === file);
      expect(tags.length, file).toBeGreaterThan(0);
      expect(tags.some(({ tag }) => !/loading=/.test(tag)), file).toBe(true);
    }
  });
});
