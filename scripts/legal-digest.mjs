/**
 * How a legal page's approved text is fingerprinted and how its rendered text is read (Task 200). Pure: no file
 * reads, no side effects, so the release gate (scripts/check-legal-release.mjs), the build
 * (src/config/legalapproval.ts) and the tests share one definition.
 *
 * Christian approves a page by giving the date and the digest of the page as he read it. The digest covers the page
 * source (whitespace collapsed, comments included: a changed comment simply asks for re-approval) plus a manifest of
 * every imported value the page renders (the minimum age, the contact address, the content notice, the sources'
 * credits…), so a change to either unapproves the page: noindex, out of the sitemap, production build blocked.
 *
 * Nothing here strips comments or markup with regular expressions: the rendered text is read by a small character
 * walk (comments, tags, script and style bodies skipped; entities decoded), the same way a parser tokenizes.
 */
import { createHash } from 'node:crypto';
import { Parser } from 'htmlparser2';

/** The page source as approved: whitespace runs collapsed, trimmed. Comments are kept on purpose. */
export function normalizeLegalSource(source) {
  return source.replace(/\s+/g, ' ').trim();
}

/** Stable JSON of the imported values a page renders. Keys are sorted so object order can't change the digest. */
export function manifestText(manifest) {
  const sortKeys = (value) => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
    }
    return value;
  };
  return JSON.stringify(sortKeys(manifest ?? {}));
}

/** Hex SHA-256 of the normalized page source and its manifest. */
export function legalDigest(source, manifest = {}) {
  return createHash('sha256')
    .update(normalizeLegalSource(source), 'utf8')
    .update('\n', 'utf8')
    .update(manifestText(manifest), 'utf8')
    .digest('hex');
}

/** A real calendar day as YYYY-MM-DD (2026-13-45 is not one). */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Today's calendar day in UTC as YYYY-MM-DD. UTC is never behind Arizona, so a same-day approval is never rejected. */
export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Approved only when the date is a real day that is not after today and the stored digest is the current page's
 * digest. A future date is refused: an approval can only record a day that has already come. `today` (YYYY-MM-DD)
 * exists for tests; real callers use the clock.
 */
export function isApproved(approval, source, manifest = {}, today = todayUtc()) {
  return !!approval && isCalendarDate(approval.date) && isCalendarDate(today) && approval.date <= today &&
    typeof approval.digest === 'string' && approval.digest.length === 64 &&
    approval.digest === legalDigest(source, manifest);
}

/** The founder's allowed choices for the minimum account age. The gate accepts nothing else; nobody else chooses. */
export const ALLOWED_MINIMUM_AGES = ['16', '18'];

/** Attributes whose values a visitor sees or hears. */
const USER_FACING_ATTRIBUTES = new Set(
  ['alt', 'title', 'aria-label', 'aria-description', 'placeholder', 'content', 'aria-roledescription', 'aria-valuetext'],
);

/**
 * The user-visible text of an HTML document: text nodes outside comments, <script> and <style>, entities decoded
 * (including without a trailing semicolon), `>` inside quoted attributes handled correctly, joined without inserted
 * spaces (so "[[</span><span>CHRISTIAN" reads as "[[CHRISTIAN"), whitespace collapsed. `attributes` collects the
 * user-facing attribute values (alt, title, aria-label, …) too. Uses htmlparser2 for correct tokenization.
 */
export function visibleText(html, { attributes = false } = {}) {
  const out = [];
  const attrs = [];
  let skip = 0; // depth inside <script>/<style>

  const parser = new Parser({
    onopentag(name, attribs) {
      if (name === 'script' || name === 'style') skip++;
      for (const [attr, value] of Object.entries(attribs)) {
        if (USER_FACING_ATTRIBUTES.has(attr.toLowerCase())) attrs.push(value);
      }
    },
    onclosetag(name) {
      if ((name === 'script' || name === 'style') && skip > 0) skip--;
    },
    ontext(text) {
      if (skip === 0) out.push(text);
    },
  }, { decodeEntities: true, recognizeSelfClosing: true });

  parser.write(html);
  parser.end();

  const text = out.join('').replace(/\s+/g, ' ').trim();
  return attributes ? [text, ...attrs].join(' \n ').replace(/[ \t]+/g, ' ').trim() : text;
}

/** Text with every whitespace character removed, for a marker check that spacing cannot evade. */
export function squeezed(text) {
  return text.replace(/\s+/g, '');
}
