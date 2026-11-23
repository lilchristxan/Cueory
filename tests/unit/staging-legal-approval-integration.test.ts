import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHeldPath } from '../../scripts/automerge/decide.ts';
import { indexablePages } from '../../src/config/routes.ts';
import { isRouteIndexable } from '../../src/config/legalapproval.ts';

// Integration guard: the legal pages are public and indexable since Task 200, so the release gate
// (scripts/check-legal-release.mjs) is what keeps a draft off the live site, and #607 keeps the legal sources and the
// indexability allowlist founder-held in either mode.
const legalPages = [
  { route: '/privacy', file: 'src/pages/privacy.astro' },
  { route: '/terms', file: 'src/pages/terms.astro' },
  { route: '/disclaimer', file: 'src/pages/disclaimer.astro' },
] as const;

describe('staging integration: legal page indexing and founder-held paths', () => {
  it.each(legalPages)('$route is noindex until Christian approves it, listed for indexing, and founder-held', ({ route, file }) => {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    expect(source).toMatch(/<Layout\b[^>]*\bnoindex=\{!isLegalPageApproved\(/);
    expect(indexablePages).toContain(route);
    expect(typeof isRouteIndexable(route)).toBe('boolean');
    expect(isHeldPath(file, 'prelaunch')).toBe(true);
    expect(isHeldPath(file, 'launched')).toBe(true);
  });

  it('keeps the release gate on every legal source, so an indexable draft can never build for main', () => {
    const gate = readFileSync(new URL('../../scripts/check-legal-release.mjs', import.meta.url), 'utf8');
    for (const file of ['terms', 'privacy', 'disclaimer', 'copyright', 'accessibility', 'licenses']) {
      expect(gate).toContain(`'${file}'`);
    }
    expect(gate).toContain('../src/config/legalapproval.ts');
    expect(gate).toContain("'--rendered'");
    expect(gate).toMatch(/\\\[\\\[CHRISTIAN/);
  });

  it('keeps all robots-noindex pages excluded from the Pagefind body index', () => {
    const layout = readFileSync(new URL('../../src/layouts/Layout.astro', import.meta.url), 'utf8');
    expect(layout).toContain('content="noindex, nofollow"');
    expect(layout).toContain("data-pagefind-body={noindex ? undefined : ''}");
    expect(layout).toContain('data-pagefind-meta={noindex ? undefined :');
  });

  it('holds the public indexability allowlist in both modes without blocking public support', () => {
    expect(isHeldPath('src/config/routes.ts', 'prelaunch')).toBe(true);
    expect(isHeldPath('src/config/routes.ts', 'launched')).toBe(true);
    expect(indexablePages).toContain('/support');
    expect(indexablePages).toContain('/');
  });
});
