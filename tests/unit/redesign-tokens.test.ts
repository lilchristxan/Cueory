import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

it('publishes the isolated P1 rendering interface without duplicating brand primitives', () => {
  expect(css).toMatch(/--cueory-copper-start:\s*var\(--color-button-hover\);/);
  expect(css).toMatch(/--cueory-copper-end:\s*var\(--color-button\);/);
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

it('keeps normal copper-gradient text at or above 4.5:1 at every theme endpoint', () => {
  const daytime = { ink: '#f9f5ef', start: '#6b5243', end: '#3e2c23' };
  const evening = { ink: '#1c1917', start: '#f9f5ef', end: '#cbb8a4' };
  for (const palette of [daytime, evening]) {
    expect(contrast(palette.ink, palette.start)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.ink, palette.end)).toBeGreaterThanOrEqual(4.5);
  }
});
