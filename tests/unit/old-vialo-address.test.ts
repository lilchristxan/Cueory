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
    // the redirect is an external script in the head, ahead of the body, so no island has started fetching when it runs
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('<script src="/old-vialo-address.js"></script>');
    const script = readFileSync(new URL('../../dist/old-vialo-address.js', import.meta.url), 'utf8');
    expect(script).toContain('/play/wordpill');
    expect(script).toContain('followOldVialoAddress(window.location)');
    expect(script).not.toMatch(/\bimport\b|\bexport\b/);
    const sitemap = readFileSync(new URL('../../dist/sitemap.xml', import.meta.url), 'utf8');
    expect(sitemap).toContain('/play/wordpill');
    expect(sitemap).not.toContain('/play/vialo');
  });
});
