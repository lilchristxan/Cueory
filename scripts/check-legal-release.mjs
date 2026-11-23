/**
 * Fail closed before an automatic Workers production build can publish draft legal pages.
 *
 * Workers Builds injects WORKERS_CI=1 and WORKERS_CI_BRANCH=<branch>.
 * PR/main CI also uses this check. Staging previews and local development remain usable.
 * This is a placeholder check, not a substitute for founder/legal approval.
 *
 * Task 200. Two passes, both only for a production release:
 *   prebuild (`node scripts/check-legal-release.mjs`): structural. src/config/legal.ts must hold a minimum age that is
 *     one of the founder's allowed choices, and for every legal page an approval that is a real calendar date plus the
 *     digest of the page's current source and imported values (scripts/legal-digest.mjs; the same
 *     src/config/legalapproval.ts the build uses decides it, so the gate and the pages can never disagree). A passing
 *     scan never means the wording is approved; Christian's date and digest do, and an edit after approval unapproves.
 *   postbuild (`node scripts/check-legal-release.mjs --rendered`): the rendered pages in dist/. Their visible text,
 *     read by a character walk (comments, scripts and styles skipped; inline elements joined without spaces; entities
 *     decoded; user-facing attributes such as alt, title and aria-label included; also checked with all whitespace
 *     removed), must carry no "[[CHRISTIAN" mark or legacy placeholder wording, and must show the approval line. A literal rendered through an expression fails; an inert
 *     comment does not.
 * The gate runs only when this file is the program, never on import, so tests can use the helpers.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ALLOWED_MINIMUM_AGES, squeezed, visibleText } from './legal-digest.mjs';

function isProductionRelease(env) {
  return env.CUEORY_LEGAL_RELEASE_AUDIT === '1'
    || (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'main')
    || (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main')
    || (env.WORKERS_CI === '1' && ['main', 'refs/heads/main'].includes(env.WORKERS_CI_BRANCH?.trim()));
}

/** The pages whose wording Christian must approve, by the key used in src/config/legal.ts legalApprovals. */
export const APPROVED_PAGES = ['terms', 'privacy', 'disclaimer', 'copyright', 'accessibility', 'licenses'];

/** Legacy release gate markers preserved for tests/unit/legal-footer.test.ts */
export const LEGACY_PAGES = [
  ['terms', '../src/pages/terms.astro', /<PlaceholderBlock\b|Christian:\s*paste your terms of use here/i],
  ['disclaimer', '../src/pages/disclaimer.astro', /<PlaceholderBlock\b|Christian:\s*paste your disclaimer here/i],
  ['privacy', '../src/pages/privacy.astro', /Draft for review|Last updated:\s*not yet published/i],
];

/** An unresolved fact in rendered text: the visible mark, or the pre-Task-200 placeholder wording. */
export const RENDERED_DRAFT_MARKER = /\[\[CHRISTIAN|Christian:\s*paste your|Draft for review|Last updated:\s*not yet published/i;

/** The approval line every approved page shows (src/config/legal.ts approvalLine). */
export const APPROVAL_LINE = /Effective \d{4}-\d{2}-\d{2}\. Approved by Christian, founder, on \d{4}-\d{2}-\d{2}\./;

/** Pages whose rendered text still carries an unresolved mark or lacks the approval line. `rendered` maps label to HTML. */
export function renderedProblems(rendered) {
  return Object.entries(rendered).flatMap(([label, html]) => {
    const text = visibleText(html, { attributes: true });
    const marked = RENDERED_DRAFT_MARKER.test(text) || RENDERED_DRAFT_MARKER.test(squeezed(text));
    return [
      ...(marked ? [`${label} still shows placeholder or draft copy.`] : []),
      ...(APPROVAL_LINE.test(visibleText(html)) ? [] : [`${label} does not show Christian's approval line.`]),
    ];
  });
}

/** The minimum age is approved when it is exactly one of the founder's allowed choices. */
export function minimumAgeApproved(minimumAge) {
  return ALLOWED_MINIMUM_AGES.includes(minimumAge);
}

/**
 * Every structural reason the legal texts are not release-ready; an empty list means ready. `approved(page)` is the
 * build's own judgement (src/config/legalapproval.ts isLegalPageApproved).
 */
export function structuralProblems(minimumAge, approved) {
  return [
    ...(minimumAgeApproved(minimumAge) ? [] : ['src/config/legal.ts has no minimum age from Christian (16 or 18).']),
    ...APPROVED_PAGES.filter((page) => !approved(page)).map((page) =>
      `${page} is not approved by Christian in src/config/legal.ts (no date, no digest, or the text or an imported value changed since approval).`),
  ];
}

const runAsProgram = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (runAsProgram && isProductionRelease(process.env)) {
  let problems;
  if (process.argv.includes('--rendered')) {
    // A missing page fails the build rather than silently skipping a gate.
    const rendered = Object.fromEntries(APPROVED_PAGES.map((page) => {
      const file = resolve(process.cwd(), 'dist', `${page}.html`);
      if (!existsSync(file)) throw new Error(`legal release blocked: dist/${page}.html was not built.`);
      return [page, readFileSync(file, 'utf8')];
    }));
    problems = renderedProblems(rendered);
  } else {
    // Node runs the TypeScript directly (type stripping), the same modules the build imports.
    const { legal } = await import('../src/config/legal.ts');
    const { isLegalPageApproved } = await import('../src/config/legalapproval.ts');
    problems = structuralProblems(legal.minimumAge, (page) => isLegalPageApproved(page));
  }
  for (const problem of problems) console.error('legal release blocked: ' + problem);
  if (problems.length > 0) process.exitCode = 1;
}
