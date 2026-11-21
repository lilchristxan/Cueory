import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fontsDir = resolve('public/fonts');
const css = readFileSync(resolve('src/styles/global.css'), 'utf8');

// Font files that are shipped on purpose but have no @font-face yet. Each needs a reason.
// Delete the entry when the feature adds its @font-face (the test below fails if it goes stale).
const staged = new Map([
  ['kalam-latin-400-normal.woff2', 'Kalam handwriting for glove notes (D-94, public/gloves/README.txt); the glove-note text is not wired to it yet'],
]);

const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(match => match[1]);
const fontFiles = readdirSync(fontsDir).filter(name => name.endsWith('.woff2'));

describe('font files and @font-face rules', () => {
  it('finds the font files and the rules', () => {
    expect(fontFiles.length).toBeGreaterThan(0);
    expect(faces.length).toBeGreaterThan(0);
  });

  it.each(fontFiles)('%s has an @font-face with a font-display (or is staged on purpose)', name => {
    const face = faces.find(body => body.includes(`/fonts/${name}`));
    if (!face) {
      expect(staged.has(name), `${name} has no @font-face in src/styles/global.css; wire it up, remove it, or stage it with a reason`).toBe(true);
      return;
    }
    expect(staged.has(name), `${name} now has an @font-face; remove it from the staged list`).toBe(false);
    expect(face).toMatch(/font-display:\s*(swap|optional|fallback)\s*;/);
  });

  it('every @font-face points at a file that exists', () => {
    for (const body of faces) {
      const url = /url\("\/fonts\/([^"]+)"\)/.exec(body)?.[1];
      expect(url, 'an @font-face has no /fonts/ url').toBeTruthy();
      expect(fontFiles, `missing font file ${url}`).toContain(url);
    }
  });

  it('every staged font file still exists', () => {
    for (const name of staged.keys()) expect(fontFiles, `${name} is staged but missing`).toContain(name);
  });
});
