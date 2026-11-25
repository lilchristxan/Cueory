import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

// WebKit pays for every backdrop-filter on every frame, even where the blur cannot show (#634).
it('the preview buttons, which sit on the opaque surface, have no backdrop blur', () => {
  expect(css).toMatch(
    /\.mode-preview \.corner-button \{\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;\s*\}/,
  );
});
