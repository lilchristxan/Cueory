/**
 * Which legal pages the footer may link to (#747, Christian's decision of 2026-11-16): for the games-only launch, a
 * legal page that is not approved yet gets no footer link. Privacy always keeps its link, because /privacy must exist
 * and stay true (CLAUDE.md).
 *
 * Build-time only: it reads page sources from disk, so the footer component and tests import it, never browser code.
 *
 * "Approved" here is the same fail-closed state the release gate (scripts/check-legal-release.mjs) uses on staging
 * today: a page is unapproved while its source still holds the placeholder copy. When Christian's recorded approvals
 * (src/config/legal.ts, pull request #659) reach staging, `isLegalPageApproved` from src/config/legalapproval.ts takes
 * the place of `legalPageHasFinalCopy` below, so a link comes back on its own once its page is approved.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Each legal route the footer can link to, and the page source it is built from. */
export const legalFooterRoutes: Record<string, string> = {
  '/terms': 'terms',
  '/disclaimer': 'disclaimer',
};

/** Routes that always keep their footer link, approved or not. */
export const alwaysShownLegalRoutes: readonly string[] = ['/privacy'];

/**
 * The placeholder copy each legal page holds until Christian supplies the final text. The same markers as
 * scripts/check-legal-release.mjs (tests/unit/legal-footer.test.ts keeps the two in step).
 */
export const legalPlaceholderMarkers: Record<string, RegExp> = {
  terms: /<PlaceholderBlock\b|Christian:\s*paste your terms of use here/i,
  disclaimer: /<PlaceholderBlock\b|Christian:\s*paste your disclaimer here/i,
};

export function legalPageSource(page: string): string {
  // From the project root: a bundled build moves this module, so import.meta.url cannot be used.
  return readFileSync(resolve(process.cwd(), 'src', 'pages', `${page}.astro`), 'utf8');
}

/** Fail closed: a page with no known marker, or whose source can't be read, counts as unapproved. */
export function legalPageHasFinalCopy(page: string, readSource: (page: string) => string = legalPageSource): boolean {
  const marker = legalPlaceholderMarkers[page];
  if (!marker) return false;
  try {
    return !marker.test(readSource(page));
  } catch {
    return false;
  }
}

/** The footer links that may show: every non-legal link, Privacy, and each legal page that is approved. */
export function visibleFooterLinks<T extends { href: string }>(
  links: readonly T[],
  isApproved: (page: string) => boolean = legalPageHasFinalCopy,
): T[] {
  return links.filter((link) => {
    if (alwaysShownLegalRoutes.includes(link.href)) return true;
    const page = legalFooterRoutes[link.href];
    return page === undefined || isApproved(page);
  });
}
