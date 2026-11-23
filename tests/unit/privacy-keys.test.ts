/**
 * This test checks the built /privacy page. npm run verify builds before unit tests.
 * Keys from unfinished features are disclosed now, without saying those features are live.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUTH_STORAGE_KEY, PKCE_FLOW_LIST_STORAGE_KEY, PKCE_VERIFIER_STORAGE_KEY, pkceFlowStorageKey,
} from '../../src/islands/supabaseclient';
import { legacyStarsKey, PROGRESS_STORAGE_KEY } from '../../src/scripts/progress';
import { BREAK_STORAGE_KEY, BREAK_STORAGE_MAX_AGE_MS } from '../../src/scripts/breakstore';
import { GUEST_IMPORT_MARKER_PREFIX } from '../../src/islands/guestimportrun';
import { STATS_STORAGE_KEY, SUDOKU_STATS_STORAGE_KEY, KEEP_DAYS } from '../../src/islands/gameresults';
import { HOME_TIP_STORAGE_KEY, DAYS_NEEDED } from '../../src/islands/home-screen-tip';
import { SUDOKU_SETTINGS_KEY } from '../../src/islands/sudoku';
import { afterDeletion, SESSION_KEYS_AFTER_DELETION } from '../../src/islands/deleteaccount';
import { VISIT_STORAGE_KEY, LAST_WELCOME_STORAGE_KEY } from '../../src/islands/stickynote';
import { NOTE_SOUND_STORAGE_KEY } from '../../src/scripts/notesound';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import { PROMO_STORAGE_KEY } from '../../src/scripts/promo';
import { RESUME_STORAGE_KEY, RESUME_TTL_MS } from '../../src/scripts/resume';
import { SIGNUP_POPUP_STORAGE_KEY } from '../../src/scripts/signuppopup';
import { CROSSWORD_SETTINGS_KEY } from '../../src/islands/cuewordkeys';
import { PILLO_HARD_MODE_STORAGE_KEY, VIALO_HARD_MODE_STORAGE_KEY } from '../../src/islands/vialokeys';
import { GAME_SETTINGS_STORAGE_KEY } from '../../src/islands/gamesettings';
import { GAME_HELP_STORAGE_KEY } from '../../src/islands/gamehelpkeys';
import { storageKeys } from '../../src/config/storage-keys';
import { newsletter, promo } from '../../src/config/site';

const privacyPath = fileURLToPath(new URL('../../dist/privacy.html', import.meta.url));

function privacyHtml(): string {
  return readFileSync(privacyPath, 'utf8');
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes HTML entities in one pass, so a decoded "&" is never decoded again (no double unescaping). */
function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal?: string, hex?: string, name?: string) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED_ENTITIES[name!.toLowerCase()] ?? entity;
  });
}

function visibleCodeKeys(html: string): string[] {
  return [...html.matchAll(/<code(?:\s[^>]*)?>([^<]*)<\/code>/g)].map((match) =>
    match[1]!.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'),
  );
}

describe.skipIf(!existsSync(privacyPath))('privacy page browser storage disclosures', () => {
  it.each([
    PROGRESS_STORAGE_KEY,
    VISIT_STORAGE_KEY,
    LAST_WELCOME_STORAGE_KEY,
    NOTE_SOUND_STORAGE_KEY,
    THEME_STORAGE_KEY,
    PROMO_STORAGE_KEY,
    SIGNUP_POPUP_STORAGE_KEY,
    RESUME_STORAGE_KEY,
    STATS_STORAGE_KEY,
    SUDOKU_STATS_STORAGE_KEY,
    HOME_TIP_STORAGE_KEY,
    SUDOKU_SETTINGS_KEY,
    CROSSWORD_SETTINGS_KEY,
    GAME_SETTINGS_STORAGE_KEY,
    VIALO_HARD_MODE_STORAGE_KEY,
    PILLO_HARD_MODE_STORAGE_KEY,
    GAME_HELP_STORAGE_KEY,
    legacyStarsKey('<deck>'),
  ])('includes the exported browser key %s in built markup', (key) => {
    expect(visibleCodeKeys(privacyHtml())).toContain(key);
  });

  it.each([
    AUTH_STORAGE_KEY, PKCE_VERIFIER_STORAGE_KEY, PKCE_FLOW_LIST_STORAGE_KEY, pkceFlowStorageKey('<id>'),
    `${GUEST_IMPORT_MARKER_PREFIX}<id>`, BREAK_STORAGE_KEY,
  ])(
    'discloses the planned storage key %s',
    (key) => {
      expect(visibleCodeKeys(privacyHtml())).toContain(key);
    },
  );

  it.each([
    VISIT_STORAGE_KEY,
    LAST_WELCOME_STORAGE_KEY,
    NOTE_SOUND_STORAGE_KEY,
    BREAK_STORAGE_KEY,
  ])('labels the unfinished feature %s as conditional, in its own list item', (key) => {
    const listItems = privacyHtml().match(/<li(?:\s[^>]*)?>[\s\S]*?<\/li>/g) ?? [];
    const item = listItems.find((part) => part.includes('<code>' + key + '</code>'));
    expect(item, 'missing list item for ' + key).toBeDefined();
    expect(item).toContain('when this feature is on');
  });

  it('discloses legacy stars and says account deletion also clears local settings', () => {
    const html = privacyHtml();
    expect(visibleCodeKeys(html)).toContain(legacyStarsKey('<deck>'));
    expect(html).toContain('until they are moved into');
    expect(html.replace(/\s+/g, ' ')).toContain('removes your account and all study data linked to it in one step, all or nothing, and signs you out of this browser');
    expect(html.replace(/\s+/g, ' ')).toContain('tries to clear the progress and settings it saved in this browser; if the browser blocks that, the page tells you so');
  });

  it('does not assert optional audit-table storage or copyright-agent registration is already configured', () => {
    const privacy = privacyHtml().replace(/\s+/g, ' ');
    const copyright = readFileSync(new URL('../../dist/copyright.html', import.meta.url), 'utf8').replace(/\s+/g, ' ');
    expect(privacy).toContain('The project may optionally write audit entries to a database table');
    expect(privacy).toContain('auth.audit_log_entries');
    expect(privacy).toContain('We have not confirmed whether that setting is enabled for Cueory');
    expect(privacy).toContain('Depending on the provider and payment method');
    expect(copyright).toContain('We have not verified whether a designated agent is registered');
    expect(copyright).not.toContain('we have not registered a designated agent');
  });

  it('explains local export sections, safe deletion, sample keys and private copyright reports', () => {
    const privacy = privacyHtml().replace(/\s+/g, ' ');
    const terms = readFileSync(new URL('../../dist/terms.html', import.meta.url), 'utf8').replace(/\s+/g, ' ');
    const copyright = readFileSync(new URL('../../dist/copyright.html', import.meta.url), 'utf8').replace(/\s+/g, ' ');
    expect(privacy).toContain('data saved only in the browser you are using');
    expect(privacy).toContain('saved daily-game results if you turned on game stats');
    expect(privacy).toContain('not uploaded to Cueory just to make the download');
    expect(privacy).toContain('may require you to sign in again');
    expect(privacy).toContain('Public demonstration questions are different');
    expect(privacy).toContain('sample keys in the browser');
    expect(privacy).toContain('additional provider profile fields');
    expect(terms).toContain('sign in again if your current sign-in is not recent enough');
    expect(copyright).toContain('privacy page');
    expect(copyright).toContain('not posted for other visitors');
    expect(copyright).not.toContain('The only things a student can send us');
    expect(copyright).not.toContain('while we review and tell that user');
  });

  it('covers every named Cueory browser key with local cleanup, session cleanup or Task 59 sign-out', () => {
    const legacy = legacyStarsKey('<deck>');
    const imported = `${GUEST_IMPORT_MARKER_PREFIX}<id>`;
    const examples = [legacy, imported, pkceFlowStorageKey('<id>')];
    const storage = {
      length: examples.length,
      key: (index: number) => examples[index] ?? null,
      getItem: (_key: string) => null,
      setItem: (_key: string, _value: string) => {},
      removeItem: (_key: string) => {},
    };
    const plan = afterDeletion(storage);
    const covered = new Set([...plan, ...plan.sessionKeys, AUTH_STORAGE_KEY]);
    const disclosed = visibleCodeKeys(privacyHtml()).filter((key) =>
      key.startsWith('cueory-') && !NOT_STORAGE.some(({ match }) => match.test(key)),
    );
    expect(new Set(disclosed).size).toBeGreaterThanOrEqual(15);
    for (const key of disclosed) {
      expect(covered.has(key), `no deletion or sign-out path for ${key}`).toBe(true);
    }
    expect(plan).not.toContain(AUTH_STORAGE_KEY);
  });

  it('lists study resume as in use now, in the "It is only:" list, and words its answers truthfully', () => {
    const html = privacyHtml();
    // The still-being-built section runs to its next heading; later sections (sign-out, Task 200) may name live keys.
    const [inUse, rest] = html.split('Features that are still being built');
    const building = rest?.split('<h2>')[0];
    expect(building, 'missing the still-being-built section').toBeDefined();
    expect(inUse).toContain(`<code>${RESUME_STORAGE_KEY}</code>`);
    expect(building).not.toContain(RESUME_STORAGE_KEY);
    const only = inUse!.slice(inUse!.indexOf('It is only:'));
    const list = only.slice(0, only.indexOf('</ul>'));
    expect(list).toContain('where you stopped in a study activity');
    expect(html).toContain('It never holds the answer key, but it can hold');
    expect(html).toContain('answers you got right');
    expect(html).not.toContain('never holds correct answers');
  });

  it('states the same time limits the code uses', () => {
    const text = privacyHtml().replace(/\s+/g, ' ');
    expect(RESUME_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(text).toContain('After 14 days it is no longer offered');
    expect(KEEP_DAYS).toBe(400);
    expect(text).toContain('Anything older than 400 days is deleted');
    expect(promo.rememberDays).toBe(30);
    expect(text).toContain('30 days');
    expect(DAYS_NEEDED).toBe(3);
    expect(text).toContain('three different days');
    expect(BREAK_STORAGE_MAX_AGE_MS).toBe(2 * 60 * 60 * 1000);
    expect(text).toContain('for up to two hours');
  });

  it('names flag reports, what Google sign-in shares and that the launch list is separate', () => {
    const html = privacyHtml();
    expect(html).toContain('Reports you send with the "Flag or comment" button');
    expect(html).toContain('the reason you picked and your comment');
    expect(html).toContain('until your');
    expect(html).toContain('account is deleted');
    expect(html.replace(/\s+/g, ' ')).toContain('Supabase keeps the identity details with your account');
    expect(html).toContain('deleting an account won\'t take you off it');
    expect(html).toContain('unsubscribe link');
    expect(html.replace(/\s+/g, ' ')).toContain('Signing out removes them.');
    // The form is live (src/config/site.ts formAction posts straight to Kit).
    expect(html).toContain('sends the email address you type straight to ' + newsletter.provider);
  });

  it('names each detail Google shares, the sign-in sessions and the service logs (Task 309, CLAUDE.md rule 2)', () => {
    const text = privacyHtml().replace(/\s+/g, ' ');
    for (const detail of ['your name', 'a link to your profile photo', 'your Google account id', 'your email address',
      'whether Google has checked it']) {
      expect(text).toContain(detail);
    }
    expect(text).toContain('does not display your Google profile photo');
    expect(text).toContain('your account data export includes the photo URL');
    expect(text).toContain('Supabase keeps a sign-in session with your IP address and the kind of browser and device you used. A session lasts until you sign out or until it expires');
    expect(text).toContain('which include IP addresses, are kept for a short period');
    expect(text).toContain('Your sign-in sessions, with the IP address and browser of each, until you sign out or the session expires.');
    // Task 200: the password hash, the PKCE code verifier and the export's account timestamps are disclosed.
    expect(text).toContain('a bcrypt hash');
    expect(text).toContain('PKCE code verifier');
    expect(text).toContain('account creation and last sign-in dates, sign-in methods and the details each provider shared');
    expect(text).toContain('The download is all or nothing, and it has limits');
  });

  it('describes live account export and deletion without hiding the Google sign-in disclosures', () => {
    const html = privacyHtml();
    const account = html.slice(html.indexOf('If you create an account'));
    expect(account).toContain('<code>/account</code>');
    expect(account.toLowerCase()).toContain('download your account data');
    expect(account.toLowerCase()).toContain('delete your account');
    expect(html).toContain('Google sign-in');
    expect(html).not.toContain('request deletion of your account');
  });

  it('preserves the newer staging explanation of local and signed-in progress', () => {
    const html = privacyHtml();
    expect(html).not.toContain('It never reaches us. It is only:');
    expect(html.replace(/\s+/g, ' ')).toContain('Without an account, your study progress, your answers and anything you type stay in your browser; none of it is sent to us');
    expect(html).toContain('Unless you choose to bring it into your account, your study progress is kept by your browser');
    expect(html).toContain('your work on real questions is also saved to your account');
    expect(html).toContain('stars stay on this device');
  });

  it('keeps the offline cache, the video player and the no-tracking statements', () => {
    const text = privacyHtml().replace(/\s+/g, ' ');
    expect(text).toContain('daily games are never kept');
    expect(text).toContain('Nothing loads from YouTube until you tap play');
    expect(text).toContain('We never sell personal information, we don\'t share it for advertising');
  });
});

describe('decodeEntities', () => {
  it('decodes each entity once, never twice', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeEntities('&amp;#39;')).toBe('&#39;');
    expect(decodeEntities('Ko-fi&#39;s &lt;terms&gt; &amp; &#x2019; &quot;x&quot;')).toBe('Ko-fi\'s <terms> & \u2019 "x"');
    expect(decodeEntities('&unknown; stays')).toBe('&unknown; stays');
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
