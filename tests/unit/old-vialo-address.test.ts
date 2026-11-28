import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { followOldVialoAddress, followOldVialoAddressWhenSettled, SETTLE_LIMIT_MS, wordpillAddress } from '../../src/scripts/oldvialoaddress';

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

  it('waits for the load and for every island before it leaves, and leaves once, at the latest after the limit', () => {
    let loaded = () => {}, hydrated = () => {}, timer = () => {}, pending = true;
    const replace = vi.fn();
    const win = { location: { hash: '', replace } as unknown as Location,
      addEventListener: (_t: string, fn: () => void) => { loaded = fn; },
      setTimeout: ((fn: () => void, ms: number) => { expect(ms).toBe(SETTLE_LIMIT_MS); timer = fn; return 1; }) as unknown as Window['setTimeout'] };
    const doc = { readyState: 'loading',
      querySelector: () => (pending ? {} : null),
      addEventListener: (_t: string, fn: () => void, capture: boolean) => { expect(capture).toBe(true); hydrated = fn; } } as unknown as Document;
    followOldVialoAddressWhenSettled(win, doc);
    expect(replace).not.toHaveBeenCalled(); // still loading
    loaded();
    expect(replace).not.toHaveBeenCalled(); // an island is still hydrating
    pending = false;
    hydrated();
    expect(replace).toHaveBeenCalledExactlyOnceWith('/play/wordpill');
    timer();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('still leaves after the limit if an island never hydrates', () => {
    const replace = vi.fn();
    let timer = () => {};
    followOldVialoAddressWhenSettled(
      { location: { hash: '', replace } as unknown as Location, addEventListener: () => {},
        setTimeout: ((fn: () => void) => { timer = fn; return 1; }) as unknown as Window['setTimeout'] },
      { readyState: 'complete', querySelector: () => ({}) as Element, addEventListener: () => {} } as unknown as Document);
    expect(replace).not.toHaveBeenCalled();
    timer();
    expect(replace).toHaveBeenCalledExactlyOnceWith('/play/wordpill');
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
