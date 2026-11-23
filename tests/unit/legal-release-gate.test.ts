import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_PAGES, minimumAgeApproved, renderedProblems, structuralProblems,
} from '../../scripts/check-legal-release.mjs';
import {
  isApproved, isCalendarDate, legalDigest, manifestText, normalizeLegalSource, squeezed, todayUtc, visibleText,
} from '../../scripts/legal-digest.mjs';
import { legal, legalApprovals, type LegalApproval, type LegalPage } from '../../src/config/legal';
import { currentLegalDigest, isLegalPageApproved, legalManifest } from '../../src/config/legalapproval';
import { newsletter } from '../../src/config/site';

/**
 * Task 200: the production legal gate must fail while the minimum age is not one of Christian's allowed choices, while
 * any page is not approved (a real calendar date plus the digest of the page's current source and imported values),
 * or while a rendered page still shows a mark; and a fully approved, mark-free set must pass. The script runs its
 * gate only as a program, so importing its helpers here is side-effect free.
 */
const script = fileURLToPath(new URL('../../scripts/check-legal-release.mjs', import.meta.url));
const run = (overrides: Record<string, string>, ...args: string[]) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8',
  env: { ...process.env, GITHUB_EVENT_NAME: '', GITHUB_BASE_REF: '', GITHUB_REF: '', WORKERS_CI: '', WORKERS_CI_BRANCH: '',
    CUEORY_LEGAL_RELEASE_AUDIT: '', ...overrides },
});

const none = Object.fromEntries(APPROVED_PAGES.map((page) => [page, { date: '', digest: '' }])) as Record<LegalPage, LegalApproval>;
const manifest = legalManifest();
/** Every real page approved against its current text and imported values, with a synthetic date. */
const allApproved = Object.fromEntries(APPROVED_PAGES.map((page) =>
  [page, { date: '2026-11-01', digest: currentLegalDigest(page as LegalPage, manifest) }])) as Record<LegalPage, LegalApproval>;
const approvedHtml = (body: string) => `<!doctype html><html><head><title>t</title><style>p { color: red }</style>
<script>const mark = "[[CHRISTIAN: a script literal never counts]]";</script></head><body>
<!-- [[CHRISTIAN: an inert HTML comment never counts --><main><p data-legal-approval="approved">Effective 2026-12-01. Approved by Christian, founder, on 2026-12-01.</p><p>${body}</p></main></body></html>`;

describe('legal digest (Task 200)', () => {
  it('collapses whitespace only, keeps comments, and changes with one sentence or one imported value', () => {
    const a = '<p>One sentence.   Two.</p>\n';
    expect(legalDigest(a, { x: 1 })).toBe(legalDigest('<p>One sentence. Two.</p>', { x: 1 }));
    expect(legalDigest(a, { x: 1 })).not.toBe(legalDigest('<p>One sentence. Three.</p>', { x: 1 }));
    expect(legalDigest(a, { x: 1 })).not.toBe(legalDigest(a, { x: 2 }));
    expect(legalDigest(a + '<!-- note -->', { x: 1 })).not.toBe(legalDigest(a, { x: 1 }));
    expect(manifestText({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(manifestText({ a: [{ c: 2, d: 1 }], b: 1 }));
    expect(normalizeLegalSource(' a\n\n b ')).toBe('a b');
  });

  it('accepts only real calendar days', () => {
    expect(isCalendarDate('2026-12-01')).toBe(true);
    for (const bad of ['2026-13-45', '2026-02-30', 'soon', '', '2026-12-1', undefined]) expect(isCalendarDate(bad)).toBe(false);
  });

  it('approves only a real date with the matching digest', () => {
    const source = '<p>Version A.</p>';
    expect(isApproved({ date: '2026-11-01', digest: legalDigest(source) }, source)).toBe(true);
    expect(isApproved({ date: '2026-13-45', digest: legalDigest(source) }, source)).toBe(false);
    expect(isApproved({ date: '2026-11-01', digest: legalDigest(source) }, '<p>Version B.</p>')).toBe(false);
    expect(isApproved({ date: '2026-11-01', digest: '' }, source)).toBe(false);
    expect(isApproved(undefined, source)).toBe(false);
  });

  it('refuses an approval dated in the future, with today as the last accepted day (#726)', () => {
    const source = '<p>Version A.</p>';
    const digest = legalDigest(source);
    expect(isApproved({ date: '2026-11-16', digest }, source, {}, '2026-11-16')).toBe(true);
    expect(isApproved({ date: '2026-11-15', digest }, source, {}, '2026-11-16')).toBe(true);
    expect(isApproved({ date: '2026-11-17', digest }, source, {}, '2026-11-16')).toBe(false);
    expect(isApproved({ date: '2027-01-01', digest }, source, {}, '2026-12-31')).toBe(false);
    expect(isApproved({ date: '2026-12-01', digest }, source, {}, '2026-11-30')).toBe(false);
    // A broken "today" never approves anything.
    expect(isApproved({ date: '2026-11-16', digest }, source, {}, 'soon')).toBe(false);
  });

  it('uses the real clock by default: tomorrow is refused, today is accepted (#726 regression)', () => {
    const source = '<p>Version A.</p>';
    const digest = legalDigest(source);
    const today = todayUtc();
    const tomorrow = todayUtc(new Date(Date.parse(`${today}T00:00:00.000Z`) + 86_400_000));
    expect(todayUtc(new Date('2026-11-16T23:59:59.999Z'))).toBe('2026-11-16');
    expect(isApproved({ date: today, digest }, source)).toBe(true);
    expect(isApproved({ date: tomorrow, digest }, source)).toBe(false);
    const pages = Object.fromEntries(APPROVED_PAGES.map((page) =>
      [page, { date: tomorrow, digest: currentLegalDigest(page as LegalPage, manifest) }])) as Record<LegalPage, LegalApproval>;
    for (const page of APPROVED_PAGES) expect(isLegalPageApproved(page as LegalPage, pages, manifest)).toBe(false);
  });

  it('reads the visible text of a page: comments, scripts and styles skipped, entities decoded', () => {
    const text = visibleText(approvedHtml('Hello &amp; welcome &#39;x&#39; <b>bold</b>'));
    expect(text).toContain("Hello & welcome 'x' bold");
    // Inline elements join without an inserted space, so a split mark still reads as one.
    expect(visibleText('<p>[[</span><span>CHRISTIAN: x</p>')).toBe('[[CHRISTIAN: x');
    expect(visibleText('<p>&lbrack;&lsqb;CHRISTIAN &#91;&#x5b;</p>')).toBe('[[CHRISTIAN [[');
    expect(visibleText('<img alt="[[CHRISTIAN: alt]]"><p>hi</p>', { attributes: true })).toContain('[[CHRISTIAN: alt]]');
    expect(visibleText('<img alt="[[CHRISTIAN: alt]]"><p>hi</p>')).toBe('hi');
    expect(squeezed('[ [ CHRISTIAN')).toBe('[[CHRISTIAN');
    expect(text).not.toContain('CHRISTIAN');
    expect(text).not.toContain('color');
    expect(visibleText('<p>a<!-- unterminated')).toBe('a');
    expect(visibleText('<script>x</script')).toBe('');
  });

  it('handles > inside quoted attributes without splitting the tag (htmlparser2 regression)', () => {
    expect(visibleText('<a href="x" title="a > b">link</a> end')).toBe('link end');
    expect(visibleText('<a href="x" title="a > b">link</a> end', { attributes: true })).toContain('a > b');
    expect(visibleText('<img alt="x > y"> text')).toBe('text');
    expect(visibleText('<img alt="x > y"> text', { attributes: true })).toContain('x > y');
    expect(visibleText('<img alt="[[CHRISTIAN: unresolved > date]]">', { attributes: true }))
      .toContain('[[CHRISTIAN: unresolved > date]]');
  });

  it('decodes named entities without a trailing semicolon (htmlparser2 regression)', () => {
    expect(visibleText('<p>a&amp b</p>')).toBe('a& b');
    expect(visibleText('<p>1&lt2&gt3</p>')).toBe('1<2>3');
    expect(visibleText('<p>&#91&#91CHRISTIAN: address]]</p>')).toBe('[[CHRISTIAN: address]]');
  });

  it('reads user-facing attributes: alt, title, aria-label, aria-description, placeholder', () => {
    expect(visibleText('<img alt="photo">', { attributes: true })).toContain('photo');
    expect(visibleText('<span title="tip">x</span>', { attributes: true })).toContain('tip');
    expect(visibleText('<button aria-label="close">x</button>', { attributes: true })).toContain('close');
    expect(visibleText('<div aria-description="desc">y</div>', { attributes: true })).toContain('desc');
    expect(visibleText('<input placeholder="type here">', { attributes: true })).toContain('type here');
    // Non-user-facing attributes are excluded.
    expect(visibleText('<a href="/x" class="link">y</a>', { attributes: true })).toBe('y');
  });
});

describe('legal release gate (Task 200)', () => {
  it('a fully approved set passes the structural check, with the real pages and manifest', () => {
    const approved = (page: string) => isLegalPageApproved(page as LegalPage, allApproved, manifest);
    expect(structuralProblems('16', approved)).toEqual([]);
    expect(structuralProblems('18', approved)).toEqual([]);
  });

  it('changing one imported value, with every .astro file untouched, unapproves every page that renders it', () => {
    const changed = { ...manifest, site: { ...(manifest.site as object), contactEmail: 'other@example.test' } };
    const approved = (page: string) => isLegalPageApproved(page as LegalPage, allApproved, changed);
    expect(structuralProblems('16', approved)).toEqual(APPROVED_PAGES.map((page) =>
      `${page} is not approved by Christian in src/config/legal.ts (no date, no digest, or the text or an imported value changed since approval).`));
    for (const change of [
      { minimumAge: '18' }, { newsletterOpen: !manifest.newsletterOpen }, { newsletterFormActionOrigin: 'https://other-service.example.test' },
      { tipPageUrl: 'https://example.test/support' },
      { approvalComponent: 'changed component source' }, { approvalLineApproved: 'changed wording' }, { approvalLinePending: 'changed wording' },
    ]) {
      expect(isLegalPageApproved('terms', allApproved, { ...manifest, ...change }), JSON.stringify(change)).toBe(false);
    }
    // The manifest reads these from the live modules, so flipping them in code changes the digest.
    expect(manifest.newsletterOpen).toBe(Boolean(newsletter.formAction));
    expect(manifest.newsletterFormActionOrigin).toBe(new URL(newsletter.formAction).origin);
    expect(manifest.tipPageUrl).toBe('https://ko-fi.com/cueory');
    expect(manifest.approvalComponent).toContain('data-legal-approval');
    expect(manifest.approvalLinePending).toMatch(/^\[\[CHRISTIAN/);
  });

  it('changing the newsletter destination (not just open/closed) invalidates approval', () => {
    // Switching from Kit to another service changes the origin, which must invalidate the digest.
    const kitOrigin = { ...manifest, newsletterOpen: true, newsletterFormActionOrigin: 'https://app.kit.com' };
    const otherOrigin = { ...manifest, newsletterOpen: true, newsletterFormActionOrigin: 'https://other.example.test' };
    const kitApproved = Object.fromEntries(APPROVED_PAGES.map((page) =>
      [page, { date: '2026-11-01', digest: currentLegalDigest(page as LegalPage, kitOrigin) }])) as Record<LegalPage, LegalApproval>;
    // Approved against Kit origin passes.
    expect(isLegalPageApproved('privacy', kitApproved, kitOrigin)).toBe(true);
    // Same pages checked against a different origin fail.
    expect(isLegalPageApproved('privacy', kitApproved, otherOrigin)).toBe(false);
  });

  it('an impossible date, an empty digest or a changed sentence unapproves the page', () => {
    expect(isLegalPageApproved('terms', { ...allApproved, terms: { ...allApproved.terms, date: '2026-13-45' } }, manifest)).toBe(false);
    expect(isLegalPageApproved('terms', { ...allApproved, terms: { ...allApproved.terms, digest: '' } }, manifest)).toBe(false);
    const edited = legalDigest(readFileSync(new URL('../../src/pages/terms.astro', import.meta.url), 'utf8') + ' One more sentence.', manifest);
    expect(isLegalPageApproved('terms', { ...allApproved, terms: { date: '2026-11-01', digest: edited } }, manifest)).toBe(false);
    expect(isLegalPageApproved('terms', none, manifest)).toBe(false);
  });

  it('accepts only the founder\'s allowed minimum ages', () => {
    for (const age of ['16', '18']) expect(minimumAgeApproved(age)).toBe(true);
    for (const age of ['0', '12', '15', '19', '99', '', 'sixteen', '[[CHRISTIAN: choose 16 or 18]]', 16 as unknown as string]) {
      expect(minimumAgeApproved(age), String(age)).toBe(false);
    }
    expect(structuralProblems('', () => true)).toEqual(['src/config/legal.ts has no minimum age from Christian (16 or 18).']);
  });

  it('rendered pages: a visible mark fails, even through an expression; an inert comment or script literal does not', () => {
    expect(renderedProblems({ terms: approvedHtml('Plain approved text.') })).toEqual([]);
    expect(renderedProblems({ terms: approvedHtml('Venue: [[CHRISTIAN: confirm]]') })).toEqual(['terms still shows placeholder or draft copy.']);
    expect(renderedProblems({ privacy: approvedHtml('Christian: paste your text here') })).toEqual(['privacy still shows placeholder or draft copy.']);
    expect(renderedProblems({ copyright: '<main><p>No approval line.</p></main>' })).toEqual(["copyright does not show Christian's approval line."]);
    for (const evasion of [
      'Venue: [[</span><span>CHRISTIAN: split', 'Venue: &lbrack;&lbrack;CHRISTIAN: entities', 'Venue: [ [ CHRISTIAN: spaced',
      '<img alt="[[CHRISTIAN: alt]]">', '<span title="[[CHRISTIAN: title]]">x</span>', '<button aria-label="[[CHRISTIAN: label]]">x</button>',
      '<img alt="[[CHRISTIAN: unresolved > date]]">', '&#91&#91CHRISTIAN: address]]',
    ]) {
      expect(renderedProblems({ terms: approvedHtml(evasion) }), evasion).toEqual(['terms still shows placeholder or draft copy.']);
    }
    expect(renderedProblems({ terms: approvedHtml('<img alt="a nurse studying" title="study"><a href="/x?christian=1">link</a>') })).toEqual([]);
  });

  it('the postbuild pass runs the real script against a built dist: a rendered mark fails, a clean approved set passes', () => {
    const root = mkdtempSync(join(tmpdir(), 'cueory-legal-gate-'));
    try {
      mkdirSync(join(root, 'dist'));
      for (const page of APPROVED_PAGES) writeFileSync(join(root, 'dist', `${page}.html`), approvedHtml(`The ${page} page.`));
      const clean = spawnSync(process.execPath, [script, '--rendered'], { cwd: root, encoding: 'utf8',
        env: { ...process.env, GITHUB_EVENT_NAME: '', GITHUB_BASE_REF: '', GITHUB_REF: '', WORKERS_CI: '', WORKERS_CI_BRANCH: '', CUEORY_LEGAL_RELEASE_AUDIT: '1' } });
      expect(clean.stderr).toBe('');
      expect(clean.status).toBe(0);
      writeFileSync(join(root, 'dist', 'privacy.html'), approvedHtml('Address: [[CHRISTIAN: mailing address]]'));
      const bad = spawnSync(process.execPath, [script, '--rendered'], { cwd: root, encoding: 'utf8',
        env: { ...process.env, GITHUB_EVENT_NAME: '', GITHUB_BASE_REF: '', GITHUB_REF: '', WORKERS_CI: '', WORKERS_CI_BRANCH: '', CUEORY_LEGAL_RELEASE_AUDIT: '1' } });
      expect(bad.status).toBe(1);
      expect(bad.stderr).toContain('legal release blocked: privacy still shows placeholder or draft copy.');
      rmSync(join(root, 'dist', 'licenses.html'));
      const missing = spawnSync(process.execPath, [script, '--rendered'], { cwd: root, encoding: 'utf8',
        env: { ...process.env, GITHUB_EVENT_NAME: '', GITHUB_BASE_REF: '', GITHUB_REF: '', WORKERS_CI: '', WORKERS_CI_BRANCH: '', CUEORY_LEGAL_RELEASE_AUDIT: '1' } });
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain('dist/licenses.html was not built');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the real sources today: both passes block for the open facts and name them; staging never runs the gate', () => {
    const structural = structuralProblems(legal.minimumAge, (page: string) => isLegalPageApproved(page as LegalPage, legalApprovals, manifest));
    const result = run({ CUEORY_LEGAL_RELEASE_AUDIT: '1' });
    expect(result.status).toBe(structural.length === 0 ? 0 : 1);
    for (const problem of structural) expect(result.stderr).toContain(`legal release blocked: ${problem}`);
    expect(run({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'staging', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }).status).toBe(0);
    expect(run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }, '--rendered').status).toBe(0);
  });
});
