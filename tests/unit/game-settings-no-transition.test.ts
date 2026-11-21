import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/gamesettings.css', import.meta.url), 'utf8');

it('turns every transition off inside the settings dialog under both reduced-motion paths', () => {
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.game-settings,\s*\.game-settings \* \{\s*transition: none;/);
  expect(css).toMatch(/html:root\[data-game-motion="reduce"\] \.game-settings \* \{\s*transition: none;/);
});
