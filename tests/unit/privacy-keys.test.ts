/**
 * This test checks the built /privacy page. npm run verify builds before unit tests.
 * Keys from unfinished features are disclosed now, without saying those features are live.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { legacyStarsKey, PROGRESS_STORAGE_KEY } from '../../src/scripts/progress';
import { BREAK_STORAGE_KEY } from '../../src/scripts/breakstore';
import {
  AUTH_STORAGE_KEY, PKCE_FLOW_LIST_STORAGE_KEY, PKCE_VERIFIER_STORAGE_KEY, pkceFlowStorageKey,
} from '../../src/islands/supabaseclient';
import { GUEST_IMPORT_MARKER_PREFIX } from '../../src/islands/guestimportrun';
import { STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import { HOME_TIP_STORAGE_KEY } from '../../src/islands/home-screen-tip';
import { SUDOKU_SETTINGS_KEY } from '../../src/islands/sudoku';
import { afterDeletion } from '../../src/islands/deleteaccount';
import { VISIT_STORAGE_KEY, LAST_WELCOME_STORAGE_KEY } from '../../src/islands/stickynote';
import { NOTE_SOUND_STORAGE_KEY } from '../../src/scripts/notesound';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import { PROMO_STORAGE_KEY } from '../../src/scripts/promo';
import { RESUME_STORAGE_KEY } from '../../src/scripts/resume';

const privacyPath = fileURLToPath(new URL('../../dist/privacy.html', import.meta.url));

function privacyHtml(): string {
  return readFileSync(privacyPath, 'utf8');
}

/** Only look at visible <code> elements, not incidental text in bundled scripts. */
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
    RESUME_STORAGE_KEY,
    STATS_STORAGE_KEY,
    HOME_TIP_STORAGE_KEY,
    SUDOKU_SETTINGS_KEY,
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
    const disclosed = visibleCodeKeys(privacyHtml()).filter((key) => key.startsWith('cueory-'));
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

  it('stays true whether or not accounts are switched on in the build', () => {
    const html = privacyHtml();
    for (const stale of ['no accounts yet', 'Accounts are not open yet', 'When accounts arrive', 'Until accounts exist',
      'When accounts open', 'Once accounts are on']) {
      expect(html, stale).not.toContain(stale);
    }
    expect(html).toContain('When you create one, we store only:');
  });

  it('names flag reports, what Google sign-in shares and that the launch list is separate', () => {
    const html = privacyHtml();
    expect(html).toContain('Reports you send with the "Flag or comment" button');
    expect(html).toContain('the reason you picked and your comment');
    expect(html).toContain('until your');
    expect(html).toContain('account is deleted');
    expect(html).toContain('Supabase keeps them with');
    expect(html).toContain('deleting an account won\'t take you off it');
    expect(html).toContain('unsubscribe link');
    expect(html.replace(/\s+/g, ' ')).toContain('Signing out removes them.');
    // Task 200: the list is not live (src/config/site.ts formAction is empty), so the page must not say it is.
    expect(html).toContain('The launch-updates list is not open yet');
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
    expect(text).toContain('when the account was created, when you last signed in, which sign-in methods it has');
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
});
