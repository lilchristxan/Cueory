import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('the reading preview gates its filler text on draftsAllowed, so the live build has no lorem ipsum', () => {
  const source = readFileSync(new URL('../../src/pages/preview/prose.astro', import.meta.url), 'utf8');
  expect(source).toContain("import { draftsAllowed } from '../../islands/anatomylab'");
  expect(source).toMatch(/const shown = draftsAllowed\(\{[^}]*WORKERS_CI_BRANCH: process\.env\.WORKERS_CI_BRANCH/s);
  expect(source).toContain('{shown && (');
});
