import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { followOldVialoAddress, wordpillAddress } from '../../src/scripts/oldvialoaddress';

describe('the old /play/vialo address', () => {
  it('goes to /play/wordpill and keeps a plain #hash such as #print', () => {
    expect(wordpillAddress('')).toBe('/play/wordpill');
    expect(wordpillAddress('#print')).toBe('/play/wordpill#print');
    expect(wordpillAddress('#a b')).toBe('/play/wordpill');
    expect(wordpillAddress('#"><script>')).toBe('/play/wordpill');
  });

  it('replaces the history entry instead of adding one', () => {
    const replace = vi.fn();
    followOldVialoAddress({ hash: '#print', replace });
    expect(replace).toHaveBeenCalledExactlyOnceWith('/play/wordpill#print');
  });

  it('is a built, noindex page canonical to the new address, with a plain link, and is not in the sitemap', () => {
    const html = readFileSync(new URL('../../dist/play/vialo.html', import.meta.url), 'utf8');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('rel="canonical" href="https://cueory.app/play/wordpill"');
    expect(html).toContain('href="/play/wordpill"');
    expect(html).toMatch(/<script type="module">[^<]*\/play\/wordpill[^<]*replace/); // the redirect is a bundled module the CSP already hashes (build-output checks every hash)
    const sitemap = readFileSync(new URL('../../dist/sitemap.xml', import.meta.url), 'utf8');
    expect(sitemap).toContain('/play/wordpill');
    expect(sitemap).not.toContain('/play/vialo');
  });
});
