/**
 * #747: the footer hides a legal page's link until the page is approved, and shows it again on its own once it is.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { footerLinks } from '../../src/config/site';
import {
  legalFooterRoutes,
  legalPageHasFinalCopy,
  legalPlaceholderMarkers,
  visibleFooterLinks,
} from '../../src/config/legalfooter';

const hrefs = (links: readonly { href: string }[]) => links.map((link) => link.href);

describe('visibleFooterLinks', () => {
  it('hides an unapproved legal page and keeps every other link', () => {
    const shown = hrefs(visibleFooterLinks(footerLinks, () => false));
    expect(shown).not.toContain('/terms');
    expect(shown).not.toContain('/disclaimer');
    expect(shown).toEqual(hrefs(footerLinks).filter((href) => !(href in legalFooterRoutes)));
  });

  it('shows an approved legal page, in its configured place', () => {
    expect(hrefs(visibleFooterLinks(footerLinks, (page) => page === 'terms'))).toEqual(
      hrefs(footerLinks).filter((href) => href !== '/disclaimer'),
    );
    expect(hrefs(visibleFooterLinks(footerLinks, () => true))).toEqual(hrefs(footerLinks));
  });

  it('always keeps Privacy, approved or not', () => {
    expect(hrefs(visibleFooterLinks(footerLinks, () => false))).toContain('/privacy');
  });

  it('covers every legal link in the footer config', () => {
    for (const href of ['/terms', '/disclaimer']) expect(hrefs(footerLinks)).toContain(href);
    for (const page of Object.values(legalFooterRoutes)) expect(legalPlaceholderMarkers[page]).toBeInstanceOf(RegExp);
  });
});

describe('legalPageHasFinalCopy', () => {
  it('is false while the page holds placeholder copy, true once it does not', () => {
    expect(legalPageHasFinalCopy('terms', () => '<PlaceholderBlock label="Terms of use">')).toBe(false);
    expect(legalPageHasFinalCopy('disclaimer', () => 'Christian: paste your disclaimer here.')).toBe(false);
    expect(legalPageHasFinalCopy('terms', () => '<h1>terms of use</h1><p>final wording</p>')).toBe(true);
  });

  it('fails closed for an unknown page or an unreadable source', () => {
    expect(legalPageHasFinalCopy('copyright', () => 'final wording')).toBe(false);
    expect(legalPageHasFinalCopy('terms', () => {
      throw new Error('missing');
    })).toBe(false);
  });

  it('agrees with the release gate: the same markers as scripts/check-legal-release.mjs', () => {
    const gate = readFileSync(fileURLToPath(new URL('../../scripts/check-legal-release.mjs', import.meta.url)), 'utf8');
    for (const [page, marker] of Object.entries(legalPlaceholderMarkers)) {
      expect(gate).toContain(`['${page}', '../src/pages/${page}.astro', ${marker.toString()}]`);
    }
  });

  it("reads the real pages: Terms and Disclaimer hold Christian's approved text", () => {
    expect(legalPageHasFinalCopy('terms')).toBe(true);
    expect(legalPageHasFinalCopy('disclaimer')).toBe(true);
  });
});

// Checks the built site in dist/ when it exists (CI builds first): no footer anywhere links to an unapproved page.
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

describe.runIf(existsSync(join(dist, 'index.html')))('built footer', () => {
  it('links only to approved legal pages, and always to Privacy', () => {
    const hidden = Object.entries(legalFooterRoutes)
      .filter(([, page]) => !legalPageHasFinalCopy(page))
      .map(([href]) => href);
    for (const file of htmlFiles(dist)) {
      const footer = readFileSync(file, 'utf8').match(/<footer\b[^>]*data-site-footer[\s\S]*?<\/footer>/)?.[0];
      if (!footer) continue;
      for (const href of hidden) expect(footer, `${file} footer links to ${href}`).not.toContain(`href="${href}"`);
      expect(footer, `${file} footer links to /privacy`).toContain('href="/privacy"');
    }
  });
});
