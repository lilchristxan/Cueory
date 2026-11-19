import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reduced-motion audit. Every script-driven motion (Web Animations, smooth scrolling) and every stylesheet animation
 * outside the two global files must sit next to a prefers-reduced-motion check, and the global fallbacks must stay.
 */
const root = resolve('src');
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(astro|tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}
const files = walk(root).map((path) => ({ name: relative(root, path), text: readFileSync(path, 'utf8') }));
const REDUCED = /prefers-reduced-motion|reducedMotion|motion-reduce|motion-safe/;

describe('reduced motion audit', () => {
  it('keeps the global fallbacks', () => {
    const global = files.find((f) => f.name === 'styles/global.css')!.text;
    expect(global).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after \{[^}]*scroll-behavior: auto !important/);
    const none = files.find((f) => f.name === 'styles/reduced-motion.css')!.text;
    expect(none).toContain('transition-property: none !important');
  });

  it('guards every Web Animations call', () => {
    const bad = files.filter((f) => /\.animate\(/.test(f.text) && !REDUCED.test(f.text)).map((f) => f.name);
    expect(bad).toEqual([]);
  });

  it('never asks for smooth scrolling without a reduced-motion check', () => {
    const bad = files
      .filter((f) => /behavior:\s*['"]smooth['"]|scroll-behavior:\s*smooth|['"]smooth['"]/.test(f.text) && !REDUCED.test(f.text))
      .map((f) => f.name);
    expect(bad).toEqual([]);
  });

  it('guards keyframe animations declared outside global.css', () => {
    const bad = files
      .filter((f) => f.name !== 'styles/global.css' && /\banimation(-name)?\s*:\s*(?!none)[a-z]/.test(f.text) && !REDUCED.test(f.text))
      .map((f) => f.name);
    expect(bad).toEqual([]);
  });

  it('guards looping animations in global.css with a none override', () => {
    const global = files.find((f) => f.name === 'styles/global.css')!.text;
    expect(global).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.modes \.ill \* \{\s*animation: none !important/);
    expect(global).toMatch(/\.modes\[data-motion\]:not\(\[data-paused\]\)/);
  });
});
