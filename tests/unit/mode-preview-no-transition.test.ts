import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

it('creates no transition or animation inside the study-mode preview under reduced motion', () => {
  expect(css).toMatch(
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.mode-preview,\s*\.mode-preview \*,\s*\.mode-preview \*::before,\s*\.mode-preview \*::after \{\s*transition: none;\s*animation-name: none;/,
  );
});
