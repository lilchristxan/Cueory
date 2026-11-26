import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readColors, readExportTokens } from '../../src/islands/anatomyscene';

/** Fake getComputedStyle so the token readers run without a browser. */
function stubStyle(values: Record<string, string>) {
  vi.stubGlobal('document', { documentElement: {} });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => values[name] ?? '' }));
}

const EXPORT_NAMES = [
  'reference', 'title', 'label', 'credit', 'pad', 'offset', 'gap', 'radius',
  'line', 'dash', 'dash-gap', 'dot', 'leading', 'label-pad-x', 'label-pad-y', 'label-room',
].map((n) => `--export-${n}`);

describe('Anatomy Lab scene token readers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('readColors trims values and parses the dim alpha', () => {
    stubStyle({
      '--color-page': ' #fff ', '--color-surface': '#eee', '--color-ink': '#111', '--color-ink-soft': '#333',
      '--color-line': '#ccc', '--color-model': '#a00', '--color-model-alt': '#0a0', '--color-model-selected': '#00a',
      '--model-dim-alpha': ' 0.3 ', '--font-body': ' Body Font ',
    });
    const c = readColors({} as HTMLElement);
    expect(c.page).toBe('#fff');
    expect(c.dimAlpha).toBe(0.3);
    expect(c.font).toBe('Body Font');
  });

  it('readColors falls back when the dim alpha or font is missing or invalid', () => {
    stubStyle({ '--model-dim-alpha': 'abc' });
    expect(readColors({} as HTMLElement)).toMatchObject({ dimAlpha: 0.2, font: 'sans-serif', page: '' });
    stubStyle({});
    expect(readColors({} as HTMLElement).dimAlpha).toBe(0.2);
  });

  it('readColors reads the lab\'s rim lights and skin outline, and switches the rim off when the tokens are missing', () => {
    stubStyle({
      '--lab-rim': ' #d9976a ', '--lab-rim-strength': '3.2', '--lab-rim-soft': '#f6d3ae', '--lab-rim-soft-strength': '2.4',
      '--lab-skin-outline': '#f6d3ae', '--lab-skin-outline-power': '2.6', '--lab-skin-outline-alpha': '0.55',
    });
    expect(readColors({} as HTMLElement)).toMatchObject({
      rim: '#d9976a', rimStrength: 3.2, rimSoft: '#f6d3ae', rimSoftStrength: 2.4,
      skinOutline: '#f6d3ae', skinOutlinePower: 2.6, skinOutlineAlpha: 0.55,
    });
    stubStyle({});
    expect(readColors({} as HTMLElement)).toMatchObject({ rim: '', rimStrength: 0, rimSoftStrength: 0, skinOutlinePower: 2.6 });
  });

  it('readExportTokens parses every size as a number', () => {
    stubStyle(Object.fromEntries(EXPORT_NAMES.map((n, i) => [n, `${i + 1}px`])));
    const t = readExportTokens({} as HTMLElement);
    expect(Object.keys(t)).toHaveLength(16);
    expect(t.reference).toBe(1);
    expect(t.labelRoom).toBe(16);
  });

  it('readExportTokens names the missing token instead of returning NaN', () => {
    const values = Object.fromEntries(EXPORT_NAMES.map((n) => [n, '4']));
    delete values['--export-dash-gap'];
    stubStyle(values);
    expect(() => readExportTokens({} as HTMLElement)).toThrow('--export-dash-gap');
  });

  it('every token the readers ask for is defined in tokens.css', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    for (const name of [...EXPORT_NAMES, '--model-dim-alpha', '--lab-rim', '--lab-rim-strength', '--lab-rim-soft', '--lab-rim-soft-strength', '--lab-skin-outline', '--lab-skin-outline-power', '--lab-skin-outline-alpha', '--color-model', '--color-model-alt', '--color-model-selected', '--font-body']) {
      expect(css, name).toMatch(new RegExp(`${name}\\s*:`));
    }
  });
});
