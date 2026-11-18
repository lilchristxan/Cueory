import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

it('publishes the isolated P1 rendering interface without duplicating brand primitives', () => {
  expect(css).toMatch(/--cueory-glass-bg:\s*rgb\(var\(--glass-rgb\) \/ var\(--glass-alpha\)\);/);
  expect(css).toMatch(/--cueory-mesh-base:\s*var\(--color-silk-base\);/);
  expect(css).toMatch(/--cueory-cell-min:\s*var\(--wordpath-cell-min\);/);
  expect(css).toMatch(/--cueory-result-card-bg:\s*rgb\(var\(--veil-rgb\) \/ var\(--veil-alpha\)\);/);
  expect(css).toMatch(/--cueory-result-card-shadow:\s*var\(--shadow-lift\);/);
  expect(css).toMatch(/--cueory-label-size:\s*0\.75rem;/);
  expect(css).toMatch(/--cueory-label-tracking:\s*0\.22em;/);
});

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string) {
  const foregroundL = relativeLuminance(foreground);
  const backgroundL = relativeLuminance(background);
  return (Math.max(foregroundL, backgroundL) + 0.05) / (Math.min(foregroundL, backgroundL) + 0.05);
}

function copperBlocks() {
  // Daytime sits in @theme; Evening is set twice (device setting and the footer's Dark choice).
  const daytime = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)'));
  const evening = [...css.matchAll(/--cueory-copper-start:\s*(#[0-9a-f]{6});[^\n]*\n\s*--cueory-copper-end:\s*(#[0-9a-f]{6});[^\n]*\n\s*--cueory-copper-shine:\s*(#[0-9a-f]{6});[^\n]*\n\s*--cueory-copper-ink:\s*(#[0-9a-f]{6});/g)]
    .map((m) => ({ start: m[1], end: m[2], shine: m[3], ink: m[4] }));
  return { daytime: evening[0], evening: evening.slice(1), source: daytime };
}

it('maps the copper gradient to exact brand colours, not to the button roles', () => {
  const { daytime, evening } = copperBlocks();
  expect(daytime).toEqual({ start: '#d3b7a1', end: '#eadccf', shine: '#f9f5ef', ink: '#3e2c23' });
  expect(evening).toHaveLength(2);
  for (const block of evening) expect(block).toEqual({ start: '#d3b7a1', end: '#cbb8a4', shine: '#eadccf', ink: '#1c1917' });
  expect(css).not.toMatch(/--cueory-copper-(start|end|shine|ink):\s*var\(/);
});

it('uses only palette colours for the copper gradient', () => {
  const palette = new Set(['#f9f5ef', '#eadccf', '#d3b7a1', '#8b6f5b', '#6b5243', '#3e2c23', '#3a2d24', '#cbb8a4', '#1c1917']);
  const { daytime, evening } = copperBlocks();
  for (const block of [daytime, ...evening]) for (const hex of Object.values(block)) expect(palette.has(hex)).toBe(true);
});

it('keeps normal copper-gradient text at or above 4.5:1 at every gradient colour in both themes', () => {
  const { daytime, evening } = copperBlocks();
  for (const palette of [daytime, ...evening]) {
    for (const background of [palette.start, palette.end, palette.shine]) {
      expect(contrast(palette.ink, background)).toBeGreaterThanOrEqual(4.5);
    }
  }
});
