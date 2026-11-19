/** Pillo and puzzle originality: brand-only hues (never green or yellow) and no borrowed third-party puzzle names. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function hue(hex: string): { h: number; s: number; v: number } {
  const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
  return rgbHue(r, g, b);
}
function rgbHue(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h, s: mx === 0 ? 0 : d / mx, v: mx };
}
/** Yellow through green (amber stays brown below 48 degrees; blue starts after 170). */
const greenOrYellow = ({ h, s, v }: { h: number; s: number; v: number }) => s >= 0.25 && v >= 0.2 && h >= 48 && h <= 170;

describe('pillo colours', () => {
  const tokens = read('src/styles/tokens.css');
  const pilloTokens = [...tokens.matchAll(/(--[\w-]*(?:pillo|puzzle)[\w-]*)\s*:\s*([^;]+);/g)];

  it('finds the pillo colour tokens it is meant to guard', () => {
    expect(pilloTokens.filter(([, , value]) => /#[0-9a-f]{3,8}\b/i.test(value!)).length).toBeGreaterThan(20);
  });

  it('never gives a pillo or puzzle token a green or yellow hex colour', () => {
    const bad = pilloTokens.flatMap(([, name, value]) =>
      [...value!.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi)]
        .filter(m => greenOrYellow(hue(m[1]!))).map(() => name));
    expect(bad).toEqual([]);
  });

  it('keeps pillo components free of literal colours outside tokens, and of green or yellow names', () => {
    for (const path of ['src/styles/pillo.css', 'src/components/PilloTitle.astro', 'src/pages/play/pillo.astro']) {
      const text = read(path);
      const literals = [...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].filter(m => greenOrYellow(hue(m[1]!)));
      expect(literals.map(m => m[0]), path).toEqual([]);
      expect(text, path).not.toMatch(/\b(?:green|yellow|lime|chartreuse|olive)\b|hsla?\(\s*(?:5\d|[6-9]\d|1[0-6]\d)\b/i);
    }
  });

  it.each(['public/design/pillo-blister-board.webp', 'public/design/logo-pillo.webp'])(
    '%s has no green or yellow pixels', async path => {
      const { data } = await sharp(join(root, path)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let bad = 0;
      for (let i = 0; i < data.length; i += 3) {
        if (greenOrYellow(rgbHue(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255))) bad++;
      }
      expect(bad / (data.length / 3)).toBeLessThan(0.0005);
    });
});

describe('puzzle originality', () => {
  // Built from pieces so this file never holds the names itself.
  const names = [['Word', 'le'], ['Str', 'ands'], ['Span', 'gram'], ['N', 'YT'], ['New York ', 'Times'], ['Quord', 'le'], ['Heard', 'le']]
    .map(parts => parts.join(''));
  const named = new RegExp(`\\b(?:${names.join('|')})\\b`, 'i');
  // The shared word is common English, so only a puzzle use of it counts.
  const shared = ['Connec', 'tions'].join('');
  const sharedUse = new RegExp(`\\b${shared}\\b(?=\\s+(?:game|puzzle|grid|clone|share|style))|\\b(?:like|as|from|named|called|copy of|clone of)\\s+${shared}\\b`, 'i');
  const textExt = new Set(['.ts', '.tsx', '.astro', '.css', '.md', '.json', '.csv', '.txt', '.html', '.svg', '.mjs', '.webmanifest', '.yml', '.yaml']);
  // Files whose job is to state the rule are allowed to say the names.
  const allowed = new Set(['src/config/games.ts', 'AGENTS.md', 'CLAUDE.md']);
  const stating = /\b(?:never|no|not|nor|forbidden|avoid|without|don't|do not|must not|refus\w*|banned)\b/i;

  function files(dir: string): string[] {
    if (!existsSync(join(root, dir))) return [];
    return readdirSync(join(root, dir)).flatMap(name => {
      const rel = `${dir}/${name}`;
      if (name === 'node_modules' || name === 'screenshots') return [];
      return statSync(join(root, rel)).isDirectory() ? files(rel) : textExt.has(extname(name)) ? [rel] : [];
    });
  }

  it('uses no third-party puzzle name in src, content or public', () => {
    const hits = ['src', 'content', 'public'].flatMap(files).filter(f => !allowed.has(f)).flatMap(file =>
      read(file).split('\n').flatMap((line, i) => (named.test(line) || sharedUse.test(line) ? [`${file}:${i + 1}`] : [])));
    expect(hits).toEqual([]);
  });

  it('mentions the names in docs only on lines that forbid them', () => {
    const hits = files('docs').flatMap(file => {
      const lines = read(file).split('\n');
      return lines.flatMap((line, i) => {
        if (!named.test(line) && !sharedUse.test(line)) return [];
        // A rule can wrap, so look one line each way for the prohibition.
        const near = lines.slice(Math.max(0, i - 1), i + 2).join(' ');
        return stating.test(near) ? [] : [`${relative(root, join(root, file))}:${i + 1}`];
      });
    });
    expect(hits).toEqual([]);
  });
});
