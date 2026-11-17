import { describe, expect, it } from 'vitest';
import { approvalLine, legal, legalApprovals, legalRoutes, signupAgreement } from '../../src/config/legal';
import { isRouteIndexable } from '../../src/config/legalapproval';
import { legalDigest } from '../../scripts/legal-digest.mjs';
import { legalManifest } from '../../src/config/legalapproval';
import { readFileSync } from 'node:fs';

describe('Task 200: the sign-up agreement line', () => {
  it('names the terms, the privacy page and the minimum age from one place', () => {
    const line = signupAgreement();
    expect(line.before + 'terms of use' + line.between + 'privacy page' + line.after).toBe(
      `by creating an account you agree to the terms of use and the privacy page, and confirm you are ${legal.minimumAge} or older.`,
    );
  });

  it('keeps the minimum age a visible open fact until Christian decides it', () => {
    // scripts/check-legal-release.mjs blocks a production build on this mark; once set it must be a plain age.
    expect(legal.minimumAge).toMatch(/^(\[\[CHRISTIAN: .+\]\]|1[6-8])$/);
    expect(signupAgreement('16').after).toBe(', and confirm you are 16 or older.');
  });

  it('shows a visible open mark until a page is approved, then the date', () => {
    expect(approvalLine('terms', false)).toMatch(/^\[\[CHRISTIAN: not yet approved/);
    expect(approvalLine('terms', true, { ...legalApprovals, terms: { date: '2026-11-01', digest: 'x' } }))
      .toBe('Effective 2026-11-01. Approved by Christian, founder, on 2026-11-01.');
  });

  it('is approved only by a date and digest Christian gave, never by default', () => {
    // Engineers and agents leave these empty; the release gate (scripts/check-legal-release.mjs) reads them.
    for (const { date, digest } of Object.values(legalApprovals)) {
      expect(date).toMatch(/^(\d{4}-\d{2}-\d{2})?$/);
      expect(digest).toMatch(/^([0-9a-f]{64})?$/);
    }
  });
});

describe('Task 200: indexing follows approval', () => {
  const none = Object.fromEntries(Object.keys(legalApprovals).map((page) => [page, { date: '', digest: '' }])) as typeof legalApprovals;
  const termsSource = readFileSync(new URL('../../src/pages/terms.astro', import.meta.url), 'utf8');

  it('keeps a legal page noindex and out of the sitemap until Christian approves its current text', () => {
    const manifest = legalManifest();
    const digest = legalDigest(termsSource, manifest);
    expect(isRouteIndexable('/terms', none, manifest)).toBe(false);
    expect(isRouteIndexable('/terms', { ...none, terms: { date: '2026-11-01', digest } }, manifest)).toBe(true);
    expect(isRouteIndexable('/terms', { ...none, terms: { date: '2026-11-01', digest: legalDigest(termsSource + ' edited', manifest) } }, manifest)).toBe(false);
    expect(isRouteIndexable('/terms', { ...none, terms: { date: '2026-11-01', digest } }, { ...manifest, minimumAge: '18' })).toBe(false);
    expect(isRouteIndexable('/terms', { ...none, terms: { date: '2026-13-45', digest } }, manifest)).toBe(false);
    expect(isRouteIndexable('/terms', { ...none, terms: { date: '2999-01-01', digest } }, manifest)).toBe(false);
    expect(isRouteIndexable('/support', none, manifest)).toBe(true);
    expect(Object.keys(legalRoutes).sort()).toEqual(['/accessibility', '/copyright', '/disclaimer', '/licenses', '/privacy', '/terms']);
  });
});
