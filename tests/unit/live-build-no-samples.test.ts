import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/**
 * Pages that carry labeled "[sample ...]" or "[... pending]" text must only build where drafts may show (staging,
 * previews, local and test builds). The live build (Workers Build of main) gets a plain coming-soon page instead.
 */
const pages = ['src/pages/resources.astro', 'src/pages/preview/concept-map.astro'];

for (const path of pages) {
  it(`${path} gates its placeholder text on draftsAllowed`, () => {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    expect(source).toMatch(/import \{ draftsAllowed \} from '[./]+\/islands\/anatomylab'/);
    expect(source).toMatch(/const shown = draftsAllowed\(\{[^}]*WORKERS_CI_BRANCH: process\.env\.WORKERS_CI_BRANCH/s);
    expect(source).toMatch(/shown \?|!shown \?/);
  });
}
