/**
 * Facts the legal pages and the sign-up form share (Task 200), so the Terms and the sign-up line can never disagree.
 * A value in double brackets is a fact only Christian can supply; scripts/check-legal-release.mjs refuses a
 * production build while one remains anywhere in the legal sources.
 */
export const legal = {
  /** The youngest age that may open an account: 16, Christian's decision of 2026-11-05 (the gate allows 16 or 18). */
  minimumAge: '16',
} as const;

export type LegalPage = 'terms' | 'privacy' | 'disclaimer' | 'copyright' | 'accessibility' | 'licenses';

/**
 * Christian's approval of each page's wording: the day he approved it (YYYY-MM-DD, also the page's effective date) and
 * the SHA-256 digest of the page source as he read it (scripts/legal-digest.mjs). Only Christian approves: he tells the
 * lead which page and version, and a tiny pull request records the date and digest here. Empty means "not approved".
 * If the page's text changes after approval the digest stops matching and the page is unapproved again: it shows that
 * plainly, is noindex and out of the sitemap, and scripts/check-legal-release.mjs refuses to build the live site.
 * Engineers and agents never fill these in.
 */
export interface LegalApproval {
  date: string;
  digest: string;
}

export const legalApprovals: Record<LegalPage, LegalApproval> = {
  terms: { date: '', digest: '' },
  privacy: { date: '', digest: '' },
  disclaimer: { date: '', digest: '' },
  copyright: { date: '', digest: '' },
  accessibility: { date: '', digest: '' },
  licenses: { date: '', digest: '' },
};

/** The approval line shown at the top of a legal page. `approved` is decided by src/config/legalapproval.ts. */
export function approvalLine(page: LegalPage, approved: boolean, approvals: Record<LegalPage, LegalApproval> = legalApprovals): string {
  const date = approvals[page].date;
  return approved
    ? `Effective ${date}. Approved by Christian, founder, on ${date}.`
    : '[[CHRISTIAN: not yet approved. Once you have read this page (and, for the Terms, Privacy and Copyright pages, a lawyer has reviewed it), tell the lead which version you approve; the approval date and digest are then recorded in src/config/legal.ts.]]';
}

/** Each legal page's route, so the sitemap and the indexing tests can ask whether a route is approved. */
export const legalRoutes: Record<string, LegalPage> = {
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/disclaimer': 'disclaimer',
  '/copyright': 'copyright',
  '/accessibility': 'accessibility',
  '/licenses': 'licenses',
};

/** The one sentence under the sign-up button. Plain text, no HTML: the component adds the two links. */
export function signupAgreement(minimumAge: string = legal.minimumAge): {
  before: string;
  between: string;
  after: string;
} {
  return {
    before: 'by creating an account you agree to the ',
    between: ' and the ',
    after: `, and confirm you are ${minimumAge} or older.`,
  };
}
