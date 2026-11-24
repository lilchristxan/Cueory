import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { draftBuildEnv, onboardingShown } from '../../src/lessons/draftgate';
import { draftsAllowed } from '../../src/islands/anatomylab';
import { indexablePages } from '../../src/config/routes';

/**
 * While accounts are closed the live build holds /start (the setup questions) behind a coming-soon page, links to it
 * nowhere, and keeps it out of the sitemap (Christian, 18 Nov). Staging, previews and test builds keep the real page.
 */
describe('onboarding gate', () => {
  it('is closed on the live build and open where drafts show', () => {
    expect(onboardingShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(false);
    expect(onboardingShown({ WORKERS_CI: '1' })).toBe(false);
    expect(onboardingShown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe(true);
    expect(onboardingShown({ CUEORY_ANATOMY_DRAFTS: '1' })).toBe(true);
    expect(onboardingShown({})).toBe(false);
  });

  it('start.astro renders a noindex coming-soon page when held back, and the real questions otherwise', () => {
    const source = readFileSync(new URL('../../src/pages/start.astro', import.meta.url), 'utf8');
    expect(source).toContain("onboardingShown } from '../lessons/draftgate'");
    expect(source).toMatch(/const shown = onboardingShown\(\)/);
    expect(source).toMatch(/\{shown \? \(/);
    expect(source).toContain('data-testid="start-soon"');
    expect(source.match(/\bnoindex\b/g)?.length).toBe(2);
  });

  it('the progress page hides its link to /start when held back', () => {
    const page = readFileSync(new URL('../../src/pages/progress.astro', import.meta.url), 'utf8');
    expect(page).toMatch(/setupHref=\{onboardingShown\(\) \? '\/start' : null\}/);
    const panel = readFileSync(new URL('../../src/islands/ProgressPanel.tsx', import.meta.url), 'utf8');
    expect(panel).toMatch(/setupHref = '\/start'/);
    expect(panel).not.toMatch(/href="\/start"/);
  });

  it('/start is never in the sitemap list', () => {
    expect(indexablePages).not.toContain('/start');
  });
});

function builtPages(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? builtPages(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const closed = !draftsAllowed(draftBuildEnv(process.env));

describe.runIf(closed)('a drafts-closed build', () => {
  it('serves /start as noindex coming-soon without the questions', () => {
    const html = readFileSync(join(dist, 'start.html'), 'utf8');
    expect(html).toContain('data-testid="start-soon"');
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(html).not.toMatch(/exam-date|Onboarding/);
  });

  it('is not in the sitemap and no page links to /start', () => {
    expect(readFileSync(join(dist, 'sitemap.xml'), 'utf8')).not.toMatch(/\/start</);
    for (const page of builtPages(dist)) {
      expect(readFileSync(page, 'utf8'), page).not.toMatch(/href="\/start["?#]/);
    }
  });
});
