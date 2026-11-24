import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

it('publishes the isolated P1 rendering interface without duplicating brand primitives', () => {
  expect(css).toMatch(/--cueory-glass-bg:\s*rgb\(var\(--glass-rgb\) \/ var\(--glass-alpha\)\);/);
  expect(css).toMatch(/--cueory-mesh-base:\s*var\(--color-silk-base\);/);
  expect(css).toMatch(/--cueory-cell-min:\s*var\(--wordpath-cell-min\);/);
  // Daytime: solid Ivory, not frosted (PilloDone); both Evening copies keep the Walnut veil.
  expect(css).toMatch(/--cueory-result-card-bg:\s*var\(--color-page\);/);
  expect(css.match(/--cueory-result-card-bg:\s*rgb\(var\(--veil-rgb\) \/ var\(--veil-alpha\)\);/g)).toHaveLength(2);
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

const copper = { deep: '#b87348', body: '#d9976a', glow: '#f6d3ae', shine: '#fff0de', ink: '#1c1917' };

it('defines the copper palette group and maps the gradient to it in every theme', () => {
  expect(css).toMatch(/--color-copper-deep:\s*#b87348;/);
  expect(css).toMatch(/--color-copper:\s*#d9976a;/);
  expect(css).toMatch(/--color-copper-glow:\s*#f6d3ae;/);
  expect(css).toMatch(/--color-copper-shine:\s*#fff0de;/);
  expect(css).toMatch(/--cueory-copper-start:\s*var\(--color-copper-deep\);/);
  expect(css).toMatch(/--cueory-copper-end:\s*var\(--color-copper\);/);
  expect(css).toMatch(/--cueory-copper-glow:\s*var\(--color-copper-glow\);/);
  expect(css).toMatch(/--cueory-copper-shine:\s*var\(--color-copper-shine\);/);
  expect(css).toMatch(/--cueory-copper-ink:\s*#1c1917;/);
  // One definition serves Daytime and Evening: no theme block overrides the copper aliases.
  expect(css.match(/--cueory-copper-start:/g)).toHaveLength(1);
});

it('lists the copper group in docs/BRAND.md with the same values', () => {
  const brand = readFileSync(new URL('../../docs/BRAND.md', import.meta.url), 'utf8');
  for (const hex of [copper.deep, copper.body, copper.glow, copper.shine]) expect(brand).toContain('`' + hex.toUpperCase() + '`');
  expect(brand).toMatch(/added 18 Nov 2026 by Christian's decision/i);
});

it('keeps normal text on every copper stop at or above 4.5:1', () => {
  for (const stop of [copper.deep, copper.body, copper.glow, copper.shine]) {
    expect(contrast(copper.ink, stop)).toBeGreaterThanOrEqual(4.5);
  }
});
