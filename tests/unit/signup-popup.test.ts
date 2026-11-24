import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { storageKeys } from '../../src/config/storage-keys';
import {
  OPEN_REPORT_SELECTOR, POPUP_DELAY_MS, POPUP_WAIT_MS, SIGNUP_POPUP_STORAGE_KEY, isGamePath, isStudyPath, mayShowPopup, popupAllowedOn,
  rememberPopup,
} from '../../src/scripts/signuppopup';
import type { KeyValueStorage } from '../../src/scripts/storage';
import { contrastRatio } from './contrast';

function memory(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  } as KeyValueStorage & { data: Record<string, string> };
}

const HOUR = 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 17, 12);

describe('launch-updates pop-up timing (lane 14)', () => {
  it('opens 10 seconds after a page opens and waits 3 hours between showings', () => {
    expect(POPUP_DELAY_MS).toBe(10_000);
    expect(POPUP_WAIT_MS).toBe(3 * HOUR);
  });

  it('may show when nothing is remembered, or the saved value is not a time', () => {
    expect(mayShowPopup(memory(), now)).toBe(true);
    expect(mayShowPopup(memory({ [SIGNUP_POPUP_STORAGE_KEY]: 'yesterday' }), now)).toBe(true);
  });

  it('stays away for 3 hours after it was shown or closed, then may show again', () => {
    const at = (offset: number) => memory({ [SIGNUP_POPUP_STORAGE_KEY]: String(now - offset) });
    expect(mayShowPopup(at(0), now)).toBe(false);
    expect(mayShowPopup(at(HOUR), now)).toBe(false);
    expect(mayShowPopup(at(3 * HOUR - 1), now)).toBe(false);
    expect(mayShowPopup(at(3 * HOUR), now)).toBe(true);
    expect(mayShowPopup(at(5 * HOUR), now)).toBe(true);
    // A time far in the future (a clock that was wrong) doesn't keep it away for ever.
    expect(mayShowPopup(at(-4 * HOUR), now)).toBe(true);
    expect(mayShowPopup(at(-HOUR), now)).toBe(false);
  });

  it('never shows in a browser that cannot remember it', () => {
    expect(mayShowPopup(undefined, now)).toBe(false);
    const blocked: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => undefined,
    } as KeyValueStorage;
    expect(mayShowPopup(blocked, now)).toBe(false);
    expect(rememberPopup(blocked, now)).toBe(false);
    expect(rememberPopup(undefined, now)).toBe(false);
  });

  it('remembers the time it was shown or closed, as whole milliseconds', () => {
    const storage = memory();
    expect(rememberPopup(storage, now + 0.4)).toBe(true);
    expect(storage.data[SIGNUP_POPUP_STORAGE_KEY]).toBe(String(now));
    expect(mayShowPopup(storage, now + HOUR)).toBe(false);
    expect(mayShowPopup(storage, now + 3 * HOUR)).toBe(true);
  });
});

describe('where the pop-up may appear', () => {
  it('never on lesson or study screens, or a game in progress', () => {
    for (const path of ['/learn', '/learn/', '/learn/study-skills', '/learn/study-skills/cards', '/learn.html']) {
      expect(isStudyPath(path), path).toBe(true);
      expect(popupAllowedOn(path), path).toBe(false);
    }
    for (const path of ['/play/pillo', '/play/sudoku', '/play/crossword.html']) {
      expect(isGamePath(path), path).toBe(true);
      expect(popupAllowedOn(path), path).toBe(false);
    }
  });

  it('on marketing pages and the games hub', () => {
    for (const path of ['/', '/play', '/play/', '/privacy', '/about', '/learning-tips', '/courses']) {
      expect(popupAllowedOn(path), path).toBe(true);
    }
  });
});

describe('open reports make the pop-up wait', () => {
  it('matches the footer report trigger (also opened by the per-game corner flag) and any report form trigger', () => {
    const rules = OPEN_REPORT_SELECTOR.split(',').map((rule) => rule.trim());
    expect(rules).toEqual([
      '[data-footer-flag] button[aria-expanded="true"]',
      '[data-testid="flag-form"] > button[aria-expanded="true"]',
    ]);
  });
});

describe('pop-up storage key and privacy', () => {
  it('is listed for /privacy and cleared on account deletion', () => {
    const entry = storageKeys.find((key) => key.name === SIGNUP_POPUP_STORAGE_KEY);
    expect(entry).toMatchObject({ storage: 'local', onDeletion: 'cleared' });
    const privacy = readFileSync(new URL('../../src/pages/privacy.astro', import.meta.url), 'utf8');
    expect(privacy).toContain(`<code>${SIGNUP_POPUP_STORAGE_KEY}</code>`);
    expect(privacy.replace(/\s+/g, ' ')).toContain('keep the pop-up away for three hours');
  });
});

describe('pop-up colors (outside brand v1.0, at Christian\'s request)', () => {
  const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
  const token = (name: string) => {
    const value = new RegExp(`--popup-${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(css)?.[1];
    if (!value) throw new Error(`--popup-${name} is missing`);
    return value;
  };

  it('uses the Kit page green as its base, and Ivory for text', () => {
    expect(token('green')).toBe('#26492a');
    expect(token('cream')).toBe('#f9f5ef');
  });

  it('keeps text readable (AA) on every green and on the button', () => {
    for (const background of ['green', 'green-deep', 'green-light']) {
      expect(contrastRatio(token('cream'), token(background)), background).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(token('button-ink'), token('button'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('button-ink'), token('button-hover'))).toBeGreaterThanOrEqual(4.5);
    // The button and the focus ring (cream) stand out from the green (3:1 for controls).
    expect(contrastRatio(token('button'), token('green'))).toBeGreaterThanOrEqual(3);
  });

  it('are not --color-* tokens, so the brand-only palette checks stay as they are', () => {
    expect(css).not.toMatch(/--color-popup/);
  });

  it('ship with no photo: the background-image hook is empty until Christian supplies one', () => {
    expect(css).toMatch(/--popup-photo:\s*none;/);
  });
});

describe('the page behind the open pop-up', () => {
  it('is held by the same lock as the game results, which also fixes the body in place', () => {
    const source = readFileSync(new URL('../../src/components/SignupPopup.astro', import.meta.url), 'utf8');
    expect(source).toContain("import { lockPageScroll } from '../scripts/scrolllock';");
    expect(source).toMatch(/lockPageScroll\(document\.documentElement, document\.body, window\)/);
    const results = readFileSync(new URL('../../src/islands/gameresults.ts', import.meta.url), 'utf8');
    expect(results).toContain("export { lockPageScroll } from '../scripts/scrolllock';");
  });
});
