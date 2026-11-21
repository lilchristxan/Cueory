import { describe, expect, it } from 'vitest';
import {
  OPEN_REPORT_SELECTOR,
  POPUP_WAIT_MS,
  SIGNUP_POPUP_STORAGE_KEY,
  isGamePath,
  isStudyPath,
  mayShowPopup,
  popupAllowedOn,
  rememberPopup,
} from '../../src/scripts/signuppopup';
import type { KeyValueStorage } from '../../src/scripts/storage';

const NOW = Date.UTC(2026, 2, 10, 12);
const store = (saved?: string): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>(saved === undefined ? [] : [[SIGNUP_POPUP_STORAGE_KEY, saved]]);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

describe('pop-up timing edges', () => {
  it('stays away until exactly the wait has passed, and may show at the boundary', () => {
    expect(mayShowPopup(store(String(NOW - POPUP_WAIT_MS + 1)), NOW)).toBe(false);
    expect(mayShowPopup(store(String(NOW - POPUP_WAIT_MS)), NOW)).toBe(true);
  });
  it('also treats a time in the future as recent, until the wait away from it has passed', () => {
    expect(mayShowPopup(store(String(NOW + 1000)), NOW)).toBe(false);
    expect(mayShowPopup(store(String(NOW + POPUP_WAIT_MS - 1)), NOW)).toBe(false);
    expect(mayShowPopup(store(String(NOW + POPUP_WAIT_MS)), NOW)).toBe(true);
  });
  it('accepts a saved time with spaces around it', () => {
    expect(mayShowPopup(store(` ${NOW - 1000} `), NOW)).toBe(false);
  });
  it.each(['', ' ', 'abc', '12abc', '-5', '1.5', '1e9', '0x10', '+5'])('may show when the saved value is %j', (saved) => {
    expect(mayShowPopup(store(saved), NOW)).toBe(true);
  });
  it('may show for a saved zero, because it is long ago', () => {
    expect(mayShowPopup(store('0'), NOW)).toBe(true);
  });
  it('uses a custom wait', () => {
    expect(mayShowPopup(store(String(NOW - 5000)), NOW, 4000)).toBe(true);
    expect(mayShowPopup(store(String(NOW - 5000)), NOW, 6000)).toBe(false);
  });
  it('never shows when reading storage throws', () => {
    const blocked: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); }, setItem: () => undefined, removeItem: () => undefined,
    };
    expect(mayShowPopup(blocked, NOW)).toBe(false);
  });
});

describe('pop-up remembering edges', () => {
  it('writes whole milliseconds under its own key only', () => {
    const storage = store();
    expect(rememberPopup(storage, NOW + 0.6)).toBe(true);
    expect([...storage.data.entries()]).toEqual([[SIGNUP_POPUP_STORAGE_KEY, String(NOW + 1)]]);
  });
  it('then waits, which a second remember does not shorten for the first time seen', () => {
    const storage = store();
    rememberPopup(storage, NOW);
    expect(mayShowPopup(storage, NOW + 1000)).toBe(false);
    expect(mayShowPopup(storage, NOW + POPUP_WAIT_MS)).toBe(true);
  });
  it('returns false when writing throws, and does not throw', () => {
    const full: KeyValueStorage = {
      getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => undefined,
    };
    expect(rememberPopup(full, NOW)).toBe(false);
  });
});

describe('pop-up page rules edges', () => {
  it.each(['/learn', '/learn/', '/learn/unit/cards', '/learn.json', '/learn.html'])('treats %s as a study path', (path) => {
    expect(isStudyPath(path)).toBe(true);
    expect(popupAllowedOn(path)).toBe(false);
  });
  it.each(['/learner', '/learning', '/Learn', '/en/learn', '/', '/play', '/play/', '/support', '/learn-more'])(
    'does not treat %s as a study path', (path) => {
      expect(isStudyPath(path)).toBe(false);
    });
  it.each(['/play/sort', '/play/a', '/play/sort/extra'])('treats %s as a game page', (path) => {
    expect(isGamePath(path)).toBe(true);
    expect(popupAllowedOn(path)).toBe(false);
  });
  it.each(['/play', '/play/', '/playground', '/play2/x', '/', '/about'])('does not treat %s as a game page', (path) => {
    expect(isGamePath(path)).toBe(false);
  });
  it('allows the hub, the home page and other marketing pages', () => {
    for (const path of ['/', '/play', '/play/', '/support', '/privacy', '/terms', '/404']) {
      expect(popupAllowedOn(path)).toBe(true);
    }
  });
  it('ignores query strings only if the caller removes them, since it matches the path text', () => {
    expect(isStudyPath('/learn?x=1')).toBe(false);
  });
});

describe('open report selector edges', () => {
  it('names both report panels and only expanded triggers', () => {
    expect(OPEN_REPORT_SELECTOR).toContain('[data-footer-flag]');
    expect(OPEN_REPORT_SELECTOR).toContain('[data-testid="flag-form"]');
    expect(OPEN_REPORT_SELECTOR.match(/aria-expanded="true"/g)).toHaveLength(2);
    expect(OPEN_REPORT_SELECTOR).not.toContain('aria-expanded="false"');
  });
  it('is a selector list with two parts', () => {
    expect(OPEN_REPORT_SELECTOR.split(',')).toHaveLength(2);
  });
});
