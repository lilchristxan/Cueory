import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS, GAME_SETTINGS_STORAGE_KEY, applyGameSettings, gameSoundAllowed, loadGameSettings,
  motionReduced, parseGameSettings, saveGameSettings, tabStops, trappedFocusIndex,
} from '../../src/islands/gamesettings';
import type { KeyValueStorage } from '../../src/scripts/storage';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const blocked: KeyValueStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
};

describe('shared game settings storage', () => {
  it('defaults to normal contrast, following the device for motion, and sound on', () => {
    expect(DEFAULT_GAME_SETTINGS).toEqual({ highContrast: false, motion: 'device', sound: true });
    expect(loadGameSettings(new MemoryStorage())).toEqual(DEFAULT_GAME_SETTINGS);
    expect(loadGameSettings(undefined)).toEqual(DEFAULT_GAME_SETTINGS);
    expect(loadGameSettings(blocked)).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it('round-trips a change and stores nothing for the defaults', () => {
    const storage = new MemoryStorage();
    saveGameSettings(storage, { highContrast: true, motion: 'reduce', sound: false });
    expect(JSON.parse(storage.getItem(GAME_SETTINGS_STORAGE_KEY)!)).toEqual({ highContrast: true, motion: 'reduce', sound: false });
    expect(loadGameSettings(storage)).toEqual({ highContrast: true, motion: 'reduce', sound: false });
    saveGameSettings(storage, { ...DEFAULT_GAME_SETTINGS });
    expect(storage.data.size).toBe(0);
  });

  it('ignores blocked storage when saving', () => {
    expect(() => saveGameSettings(blocked, { highContrast: true, motion: 'device', sound: true })).not.toThrow();
  });

  it.each([
    ['not json', '{'],
    ['an array', '[true]'],
    ['null', 'null'],
    ['a number', '3'],
  ])('falls back to the defaults for %s', (_name, raw) => {
    expect(parseGameSettings(raw)).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it('keeps valid fields and defaults the unknown ones, one by one', () => {
    expect(parseGameSettings(JSON.stringify({ highContrast: 'yes', motion: 'fast', sound: false, extra: 1 })))
      .toEqual({ highContrast: false, motion: 'device', sound: false });
    expect(parseGameSettings(JSON.stringify({ highContrast: true }))).toEqual({ highContrast: true, motion: 'device', sound: true });
  });
});

describe('motion and sound', () => {
  it('reduces motion when the visitor chooses it or the device asks, and never forces motion on', () => {
    expect(motionReduced({ motion: 'device' }, false)).toBe(false);
    expect(motionReduced({ motion: 'device' }, true)).toBe(true);
    expect(motionReduced({ motion: 'reduce' }, false)).toBe(true);
    expect(motionReduced({ motion: 'reduce' }, true)).toBe(true);
  });

  it('plays a game sound only when the shared switch and the game agree', () => {
    expect(gameSoundAllowed({ sound: true })).toBe(true);
    expect(gameSoundAllowed({ sound: true }, false)).toBe(false);
    expect(gameSoundAllowed({ sound: false }, true)).toBe(false);
  });
});

describe('applyGameSettings', () => {
  it('marks <html> for high contrast and reduced motion, and clears the marks again', () => {
    const root = { dataset: {} as DOMStringMap };
    applyGameSettings(root, { highContrast: true, motion: 'reduce', sound: true }, false);
    expect(root.dataset).toEqual({ gameContrast: 'high', gameMotion: 'reduce' });
    applyGameSettings(root, { highContrast: false, motion: 'device', sound: true }, true);
    expect(root.dataset).toEqual({ gameMotion: 'reduce' });
    applyGameSettings(root, { ...DEFAULT_GAME_SETTINGS }, false);
    expect(root.dataset).toEqual({});
  });
});

describe('dialog focus trap', () => {
  it('wraps Tab from the last control to the first and Shift+Tab from the first to the last', () => {
    expect(trappedFocusIndex(4, 3, false)).toBe(0);
    expect(trappedFocusIndex(4, 0, true)).toBe(3);
  });

  it('lets the browser move focus inside the dialog', () => {
    expect(trappedFocusIndex(4, 1, false)).toBeUndefined();
    expect(trappedFocusIndex(4, 2, true)).toBeUndefined();
  });

  it('pulls focus back in from outside, and does nothing with no controls', () => {
    expect(trappedFocusIndex(4, -1, false)).toBe(0);
    expect(trappedFocusIndex(4, -1, true)).toBe(3);
    expect(trappedFocusIndex(0, -1, false)).toBeUndefined();
  });

  it('counts each radio group as one stop: its checked radio, or its first', () => {
    const close = { type: 'button' };
    const light = { type: 'radio', name: 'theme', checked: false };
    const dark = { type: 'radio', name: 'theme', checked: true };
    const device = { type: 'radio', name: 'motion', checked: false };
    const reduce = { type: 'radio', name: 'motion', checked: false };
    const sound = { type: 'checkbox', checked: true };
    expect(tabStops([close, light, dark, device, reduce, sound])).toEqual([close, dark, device, sound]);
  });
});
