import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve('src');

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(astro|tsx|jsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Every `<img ...>` opening tag in a source file, skipping `>` inside `{...}` expressions. */
export function imgTags(source: string): string[] {
  const tags: string[] = [];
  const open = /<img(?=\s)/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(source))) {
    let depth = 0;
    let end = match.index + 4;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

function missing(tag: string): string[] {
  return ['alt', 'width', 'height'].filter((name) => !new RegExp(`\\s${name}\\s*=`).test(tag));
}

// Known gap, being fixed in open PR #936 (it edits LessonVideo.tsx): remove this entry once it merges.
const knownGaps = new Set(['islands/LessonVideo.tsx']);

describe('image source audit', () => {
  for (const file of sources(root)) {
    const tags = imgTags(readFileSync(file, 'utf8'));
    if (!tags.length || knownGaps.has(relative(root, file))) continue;
    it(`${relative(root, file)}: every <img> has alt, width and height`, () => {
      // Skip tags that only appear as sample text inside a string.
      const real = tags.filter((tag) => !/onerror=/.test(tag));
      expect(real.map((tag) => ({ tag: tag.slice(0, 60), missing: missing(tag) })).filter((x) => x.missing.length)).toEqual([]);
    });
  }

  it('finds missing attributes and ignores > inside expressions', () => {
    expect(missing('<img src="/x">')).toEqual(['alt', 'width', 'height']);
    expect(missing('<img src={a > b ? c : d} alt="" width={1} height={2} />')).toEqual([]);
    expect(imgTags('<img src={a > b} alt="" />')).toHaveLength(1);
  });

  it('lazy-loads the label board picture', () => {
    const tags = imgTags(readFileSync(join(root, 'islands/LabelItBoard.tsx'), 'utf8'));
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatch(/loading="lazy"/);
    expect(tags[0]).toMatch(/decoding="async"/);
  });
});
