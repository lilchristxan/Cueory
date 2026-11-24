import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHeldPath } from '../../scripts/automerge/decide.ts';
import { legalPageHasFinalCopy } from '../../src/config/legalfooter.ts';
import { indexablePages } from '../../src/config/routes.ts';

// Integration guard for the two founder-held changes combined on staging:
// #601 keeps draft legal pages out of search, and #607 prevents those
// indexability decisions from bypassing founder approval in either mode.
// A legal page joins search only once it holds Christian's final text. Privacy p4 joins Terms and Disclaimer once the
// explicit finalization decision records its source and removes the release-gate draft marker.
const legalPages = [
  { route: '/privacy', page: 'privacy', file: 'src/pages/privacy.astro' },
  { route: '/terms', page: 'terms', file: 'src/pages/terms.astro' },
  { route: '/disclaimer', page: 'disclaimer', file: 'src/pages/disclaimer.astro' },
] as const;

describe('staging integration: legal indexing and founder-held paths', () => {
  it.each(legalPages)('$route is indexed only with final text, and stays founder-held', ({ route, page, file }) => {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    if (legalPageHasFinalCopy(page)) {
      expect(source).not.toMatch(/<Layout\b[^>]*\bnoindex\b/);
      expect(indexablePages).toContain(route);
    } else {
      expect(source).toMatch(/<Layout\b[^>]*\bnoindex\b/);
      expect(indexablePages).not.toContain(route);
    }
    expect(isHeldPath(file, 'prelaunch')).toBe(true);
    expect(isHeldPath(file, 'launched')).toBe(true);
  });

  it('lists /privacy once its approved p4 source has final text', () => {
    expect(legalPageHasFinalCopy('privacy')).toBe(true);
    expect(indexablePages).toContain('/privacy');
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
