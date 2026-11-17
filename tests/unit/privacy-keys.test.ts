/**
 * This test checks the built /privacy page. npm run verify builds before unit tests.
 * The Privacy Notice describes each browser key in plain words (it names only the signup pop-up's key), so every key in
 * src/config/storage-keys.ts says which section describes it and a phrase that section must contain.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BREAK_STORAGE_MAX_AGE_MS } from '../../src/scripts/breakstore';
import { GUEST_IMPORT_MARKER_PREFIX } from '../../src/islands/guestimportrun';
import { KEEP_DAYS } from '../../src/islands/gameresults';
import { afterDeletion, SESSION_KEYS_AFTER_DELETION } from '../../src/islands/deleteaccount';
import { storageKeys } from '../../src/config/storage-keys';
import { RESUME_TTL_MS } from '../../src/scripts/resume';
import { DAYS_NEEDED } from '../../src/islands/home-screen-tip';
import { accountsOpen, promo } from '../../src/config/site';

const privacyPath = fileURLToPath(new URL('../../dist/privacy.html', import.meta.url));

function privacyHtml(): string {
  return readFileSync(privacyPath, 'utf8');
}

/** The built page's plain text under each h2, keyed by heading. */
function privacySections(html: string): Map<string, string> {
  const main = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  const text = (part: string) => part.replace(/<[^>]+>/g, ' ').replaceAll('&amp;', '&').replaceAll('&#39;', "'").replace(/\s+/g, ' ').trim();
  const sections = new Map<string, string>();
  const parts = main.split(/<h2[^>]*>/).slice(1);
  for (const part of parts) {
    const [heading, ...rest] = part.split('</h2>');
    sections.set(text(heading!), text(rest.join(' ')));
  }
  return sections;
}

describe.skipIf(!existsSync(privacyPath))('privacy page browser storage disclosures', () => {
  it.each(storageKeys.map((key) => [key.name, key] as const))('describes %s in plain words in its section', (_name, key) => {
    if (key.disclosure === 'accounts-closed') {
      // Only sign-in keys, and only while public accounts are closed: reopening accounts needs a privacy update.
      expect(accountsOpen, `${key.name}: accounts are open, so /privacy must describe this key`).toBe(false);
      expect(key.name.startsWith('cueory-auth') || key.name.startsWith(GUEST_IMPORT_MARKER_PREFIX), key.name).toBe(true);
      return;
    }
    const section = privacySections(privacyHtml()).get(key.disclosure.section);
    expect(section, `/privacy has no "${key.disclosure.section}" section`).toBeDefined();
    expect(section, `${key.name} is not described under "${key.disclosure.section}"`).toContain(key.disclosure.phrase);
  });

  it('says public accounts are closed, which is only true while accountsOpen is false', () => {
    expect(privacyHtml()).toContain('Public accounts are closed.');
    expect(accountsOpen).toBe(false);
  });

  it('states the same time limits the code uses', () => {
    const text = [...privacySections(privacyHtml()).values()].join(' ');
    expect(RESUME_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(text).toContain('That saved place expires after 14 days.');
    expect(KEEP_DAYS).toBe(400);
    expect(text).toContain('deletes general results and sudoku solve times older than 400 days');
    expect(promo.rememberDays).toBe(30);
    expect(text).toContain('so it can stay out of the way for 30 days');
    expect(DAYS_NEEDED).toBe(3);
    expect(text).toContain('up to three dates on which you finished a puzzle');
    expect(BREAK_STORAGE_MAX_AGE_MS).toBe(2 * 60 * 60 * 1000);
    expect(text).toContain('in this tab for up to two hours');
  });

  it('keeps the offline cache, the video player and the no-tracking statements', () => {
    const text = [...privacySections(privacyHtml()).values()].join(' ');
    expect(text).toContain('Cueory’s offline cache excludes daily games.');
    expect(text).toContain('its YouTube player loads only when you choose to play it');
    expect(text).toContain('Cueory does not track you across other websites');
  });
});

describe('the one list of browser keys (src/config/storage-keys.ts)', () => {
  it('names each key once, every one starting with cueory-', () => {
    const names = storageKeys.map((key) => key.name);
    expect(new Set(names).size).toBe(names.length);
    for (const key of storageKeys) {
      expect(key.name.startsWith('cueory-'), key.name).toBe(true);
      if (key.prefix) expect(key.name.startsWith(key.prefix), key.name).toBe(true);
      expect(key.holds.trim(), key.name).not.toBe('');
      expect(key.purpose.trim(), key.name).not.toBe('');
    }
  });

  it('delete-my-account clears every key the list marks as cleared, and leaves the session to sign-out', () => {
    const examples = storageKeys.filter((key) => key.prefix).map((key) => key.prefix + 'example');
    const plan = afterDeletion({
      length: examples.length,
      key: (index: number) => examples[index] ?? null,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    for (const key of storageKeys) {
      if (key.onDeletion !== 'cleared') {
        expect(plan, key.name).not.toContain(key.name);
        continue;
      }
      if (key.storage === 'session') expect(SESSION_KEYS_AFTER_DELETION, key.name).toContain(key.name);
      else if (key.prefix) expect(plan, key.name).toContain(key.prefix + 'example');
      else expect(plan, key.name).toContain(key.name);
    }
  });
});

// ── Guard: every cueory- string in src/ is a listed key or a known non-storage name ──────────────────────────────

/**
 * Strings that start with cueory- but are not browser storage keys, each with the reason. Anything else that starts
 * with cueory- must be in src/config/storage-keys.ts (and so on /privacy and cleared by delete-my-account).
 */
const NOT_STORAGE: readonly { match: RegExp; why: string }[] = [
  { match: /^cueory-(resume-heading|resume-summary|guest-import-heading)$/, why: 'element ids for aria-labelledby' },
  { match: /^cueory-csp-header$/, why: 'name of the build plugin that writes the security header' },
  { match: /^cueory-export-1$/, why: 'format name written inside the data download' },
  { match: /^cueory-data-(\$\{|<date>-)/, why: 'file name of the account data download (and its README text)' },
  { match: /^cueory-progress-\$\{.*\.json$/, why: 'file name of the progress download' },
  { match: /^cueory-\$\{/, why: 'file names of share images and worksheets, built from the page' },
  { match: /^cueory-sudoku:\$\{/, why: "seed for the day's sudoku, never stored" },
  { match: /^cueory-guest-import:\$\{/, why: 'Web Locks name so two tabs never import at once; locks are not storage' },
  { match: /^cueory-offline-\*?$/, why: 'Cache Storage name for offline copies of public pages, described on /privacy and kept on purpose' },
];

/** Every quoted string literal in a source file that starts with cueory-. */
function cueoryStrings(source: string): string[] {
  return [...source.matchAll(/(['"`])(cueory-(?:(?!\1)[^\n])*)\1/g)].map((match) => match[2]!);
}

/** The cueory- strings that are neither a listed storage key (or key family) nor a known non-storage name. */
function unlistedCueoryStrings(source: string): string[] {
  const names = new Set(storageKeys.map((key) => key.name));
  const prefixes = storageKeys.flatMap((key) => (key.prefix ? [key.prefix] : []));
  return cueoryStrings(source).filter((text) =>
    !names.has(text)
    && !prefixes.some((prefix) => text === prefix || (text.startsWith(prefix) && !text.slice(prefix.length).includes('-')))
    && !NOT_STORAGE.some(({ match }) => match.test(text)));
}

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|astro|mjs|js)$/.test(name) ? [path] : [];
  });
}

describe('every cueory- string in src/ is accounted for', () => {
  it('finds no storage key missing from src/config/storage-keys.ts', () => {
    const missing = sourceFiles(srcRoot).flatMap((file) =>
      unlistedCueoryStrings(readFileSync(file, 'utf8')).map((text) => `${relative(srcRoot, file)}: ${text}`));
    expect(missing, 'add each to src/config/storage-keys.ts and /privacy, or to NOT_STORAGE with the reason').toEqual([]);
  });

  it('catches a new key that is not listed, in any quote style', () => {
    expect(unlistedCueoryStrings("const KEY = 'cueory-new-thing';")).toEqual(['cueory-new-thing']);
    expect(unlistedCueoryStrings('const KEY = "cueory-new-thing";')).toEqual(['cueory-new-thing']);
    expect(unlistedCueoryStrings('const KEY = `cueory-new-${id}`;')).toEqual(['cueory-new-${id}']);
    // A listed family's prefix doesn't cover a different key that merely starts the same way.
    expect(unlistedCueoryStrings("'cueory-stars-x-y'")).toEqual(['cueory-stars-x-y']);
  });

  it('accepts listed keys, listed key families and the known non-storage names', () => {
    expect(unlistedCueoryStrings("'cueory-progress' 'cueory-stars-' 'cueory-stars-deck1' 'cueory-guest-imported:<id>'")).toEqual([]);
    expect(unlistedCueoryStrings("'cueory-csp-header' `cueory-data-${today}` 'cueory-offline-'")).toEqual([]);
  });

  it('gives a reason for every non-storage name', () => {
    for (const entry of NOT_STORAGE) expect(entry.why.trim(), entry.match.source).not.toBe('');
  });
});
