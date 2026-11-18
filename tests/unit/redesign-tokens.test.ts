import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

it('publishes the isolated P1 rendering interface without duplicating brand primitives', () => {
  expect(css).toMatch(/--cueory-copper-start:\s*var\(--color-highlight\);/);
  expect(css).toMatch(/--cueory-copper-end:\s*var\(--color-button\);/);
  expect(css).toMatch(/--cueory-glass-bg:\s*rgb\(var\(--glass-rgb\) \/ var\(--glass-alpha\)\);/);
  expect(css).toMatch(/--cueory-mesh-base:\s*var\(--color-silk-base\);/);
  expect(css).toMatch(/--cueory-cell-min:\s*var\(--wordpath-cell-min\);/);
  expect(css).toMatch(/--cueory-result-card-bg:\s*var\(--veil-rgb\);/);
  expect(css).toMatch(/--cueory-result-card-shadow:\s*var\(--shadow-lift\);/);
  expect(css).toMatch(/--cueory-label-size:\s*0\.75rem;/);
  expect(css).toMatch(/--cueory-label-tracking:\s*0\.22em;/);
});
