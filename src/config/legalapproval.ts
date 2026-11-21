/**
 * Whether each legal page is approved today (Task 200): build-time only, because it reads the page source from disk and
 * compares its digest with Christian's recorded approval (src/config/legal.ts, scripts/legal-digest.mjs). Browser code
 * imports src/config/legal.ts, never this file. The release gate imports this file too, so the build and the gate
 * can never disagree.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isApproved, legalDigest } from '../../scripts/legal-digest.mjs';
import { allowedBooks } from '../visuals/sources.ts';
import { approvalLine, legal, legalApprovals, legalRoutes, type LegalApproval, type LegalPage } from './legal.ts';
import { newsletter, promo, site } from './site.ts';

export function legalPageSource(page: LegalPage): string {
  // From the project root: a bundled build moves this module, so import.meta.url cannot be used.
  return readFileSync(resolve(process.cwd(), 'src', 'pages', `${page}.astro`), 'utf8');
}

/**
 * Every imported value a legal page renders. Changing one of these changes the rendered text, so it changes the
 * digest and unapproves the page, exactly as editing the page source would.
 */
export function legalManifest(): Record<string, unknown> {
  return {
    minimumAge: legal.minimumAge,
    site: { name: site.name, contactEmail: site.contactEmail, contentNotice: site.contentNotice, url: site.url },
    newsletterProvider: newsletter.provider,
    // The privacy page says the list is not open while this is empty, and that support goes to Ko-fi.
    // The origin (not just the boolean) is tracked so switching from Kit to another service invalidates approval.
    newsletterOpen: Boolean(newsletter.formAction),
    newsletterFormActionOrigin: newsletter.formAction ? new URL(newsletter.formAction).origin : '',
    tipPageUrl: site.tipPageUrl,
    promoRememberDays: promo.rememberDays,
    // The approval line is legal text on every page: its component and both of its wordings.
    approvalComponent: readFileSync(resolve(process.cwd(), 'src', 'components', 'LegalApproval.astro'), 'utf8').replace(/\s+/g, ' ').trim(),
    approvalLineApproved: approvalLine('terms', true, { ...legalApprovals, terms: { date: '0000-00-00', digest: '' } }),
    approvalLinePending: approvalLine('terms', false),
    allowedBooks: allowedBooks.map((book) => ({
      book: book.book, license: book.license, licenseUrl: book.licenseUrl, credit: book.credit,
      licenseTitle: book.licenseTitle ?? null,
    })),
  };
}

/** The digest Christian's approval must match for a page as it stands now. */
export function currentLegalDigest(page: LegalPage, manifest: Record<string, unknown> = legalManifest()): string {
  return legalDigest(legalPageSource(page), manifest);
}

/** True only when the recorded date is a real day, not after today, and the recorded digest is the current page's digest. */
export function isLegalPageApproved(
  page: LegalPage,
  approvals: Record<LegalPage, LegalApproval> = legalApprovals,
  manifest: Record<string, unknown> = legalManifest(),
): boolean {
  return isApproved(approvals[page], legalPageSource(page), manifest);
}

/** Whether a route may be indexed today: every non-legal indexable page, plus the legal pages Christian has approved. */
export function isRouteIndexable(
  route: string,
  approvals: Record<LegalPage, LegalApproval> = legalApprovals,
  manifest: Record<string, unknown> = legalManifest(),
): boolean {
  const page = legalRoutes[route];
  return page === undefined || isLegalPageApproved(page, approvals, manifest);
}
