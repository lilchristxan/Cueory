import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ORIENTATIONS, VIEW_PRESETS, VIEW_WORDS, KEY_MAP } from '../../src/islands/anatomyviews';
import { contrastRatio } from './contrast';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const tokens = read('src/styles/tokens.css');
const labCss = read('src/styles/anatomy-lab.css');
const labSource = read('src/islands/AnatomyLab.tsx');

/** The value of a `--lab-*` token declared with a plain hex color. */
function labHex(name: string): string {
  const match = new RegExp(`--lab-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(tokens);
  if (!match) throw new Error(`--lab-${name} is not a hex token`);
  return match[1]!;
}

describe('anatomy lab: the views use only Christian\'s words (anterior, posterior, lateral)', () => {
  it('names the orientation panel\'s three views exactly', () => {
    expect(ORIENTATIONS.map((o) => o.label)).toEqual(['anterior', 'posterior', 'lateral']);
  });

  it('says nothing about a front, back or side anywhere a student reads a view name', () => {
    const words = [...Object.values(VIEW_WORDS), ...VIEW_PRESETS.map((p) => p.label), ...KEY_MAP.map((row) => row.does).filter((does) => /view$/.test(does))];
    for (const word of words) expect(word, word).not.toMatch(/\b(front|back|side|left|right)\b/i);
  });

  it('keeps the view words out of the lab component\'s own text too', () => {
    const quoted = [...labSource.matchAll(/'([^'\n]*)'|"([^"\n]*)"|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
    for (const text of quoted) expect(text, text).not.toMatch(/\b(front|back|left|right) (side )?view\b|\b(left|right) side\b/i);
  });
});

describe('anatomy lab: the dark look', () => {
  it('uses only exact Evening-palette and copper colors for its constants', () => {
    const allowed = ['#1c1917', '#3a2d24', '#6b5243', '#cbb8a4', '#f9f5ef', '#b87348', '#d9976a', '#f6d3ae', '#fff0de', '#eadccf', '#d3b7a1'];
    const block = tokens.slice(tokens.indexOf('Anatomy lab: the dark instrument look'));
    const found = [...block.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase());
    expect(found.length).toBeGreaterThan(8);
    for (const hex of found) expect(allowed, hex).toContain(hex);
  });

  it('keeps text readable (WCAG AA, 4.5:1) on the glass and the stage in the worst case', () => {
    const ivory = labHex('ivory');
    const sand = labHex('sand');
    const charcoal = labHex('charcoal');
    const walnut = labHex('walnut'); // the lightest thing under text: the glass at its most opaque
    for (const background of [charcoal, walnut]) {
      expect(contrastRatio(ivory, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(sand, background)).toBeGreaterThanOrEqual(4.5);
    }
    // Text on a copper button (selected states and the primary button) is Charcoal.
    for (const copper of ['copper-deep', 'copper', 'copper-glow', 'copper-shine']) {
      expect(contrastRatio(charcoal, labHex(copper)), copper).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws focus with Copper Shine, at least 3:1 against the stage and the glass', () => {
    expect(labCss).toMatch(/:focus-visible\s*\{[^}]*var\(--lab-copper-shine\)/);
    for (const background of [labHex('charcoal'), labHex('walnut')]) {
      expect(contrastRatio(labHex('copper-shine'), background)).toBeGreaterThanOrEqual(3);
    }
  });

  it('puts a word beside every dot and never animates', () => {
    expect(labCss).not.toMatch(/@keyframes|animation\s*:|transition\s*:/);
    expect(labSource).toMatch(/lab-dot[\s\S]{0,200}lab-state[^\n]*\{[^}]*'on' : 'off'/);
  });

  it('has no font but Lato (the interface font token) on the stage', () => {
    expect(labCss).not.toMatch(/font-family:\s+(?!var\(--font-body\))/);
  });

  it('centres the bottom bar without a transform, so its controls measure a true 44 px in every engine', () => {
    const bar = labSource.match(/className="([^"]*)" role="group" aria-label="bottom bar"/)![1]!;
    expect(bar).not.toMatch(/translate|transform|left-1\/2/);
    expect(bar).toMatch(/inset-x-0[^"]*mx-auto|mx-auto[^"]*inset-x-0/);
  });

  it('puts study text on a plain opaque panel: no gradient and no blur behind the question, cells or feedback', () => {
    const round = read('src/islands/AnatomyStudyRound.tsx');
    // Every study panel (the entry, the side panel, the finished card) and the answer-cell container are solid.
    expect((round.match(/className="lab-glass lab-solid /g) ?? []).length).toBe(3);
    expect(labSource).toMatch(/className="lab-glass lab-solid relative[^"]*"[^>]*data-testid="anatomy-round/);
    const solid = labCss.match(/\.lab-glass\.lab-solid \{([^}]*)\}/)![1]!;
    expect(solid).toMatch(/background:\s*var\(--lab-panel-solid\)/);
    expect(solid).not.toMatch(/gradient/);
    expect(solid).toMatch(/backdrop-filter:\s*none/);
    expect(tokens.match(/--lab-panel-solid:([^;]*);/)![1]).not.toMatch(/transparent|rgba/);
  });
});
