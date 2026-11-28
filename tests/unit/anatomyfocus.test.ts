import { describe, expect, it } from 'vitest';
import {
  MAX_FOCUS, cleanFocus, decodeFocus, encodeFocus, fadedByFocus, focusCountWords, focusFromQuery,
  labHref, labelItHref, labelsForFocus, readFocus, saveFocus, toggleFocus, toggleFocusGroup, withFocus,
} from '../../src/islands/anatomyfocus';

const KEY = 'test-focus-key';
const known = new Set(['FMA1', 'FMA2', 'FMA3', 'FIX001']);

function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    key: () => null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

describe('anatomy focus set', () => {
  it('round-trips ids through the query value', () => {
    const value = encodeFocus(['FMA1', 'FMA3'], known);
    expect(value).toBe('FMA1,FMA3');
    expect(decodeFocus(value, known)).toEqual(['FMA1', 'FMA3']);
    expect(focusFromQuery('?x=1&focus=FMA2,FIX001', known)).toEqual(['FMA2', 'FIX001']);
  });

  it('drops unknown, malformed and repeated ids, and anything that is not an id', () => {
    expect(decodeFocus('FMA1,FMA999,<script>,FMA1,,%20,FMA2', known)).toEqual(['FMA1', 'FMA2']);
    expect(cleanFocus(['FMA1', 5, null, {}, 'fma1', 'FMA2 '], known)).toEqual(['FMA1']);
    expect(decodeFocus(null)).toEqual([]);
    expect(decodeFocus('')).toEqual([]);
  });

  it('caps the length of the set and of a query value', () => {
    const many = Array.from({ length: MAX_FOCUS + 25 }, (_, i) => `FMA${i + 1}`);
    expect(cleanFocus(many)).toHaveLength(MAX_FOCUS);
    expect(decodeFocus('FMA1,'.repeat(MAX_FOCUS * 40))).toEqual([]);
  });

  it('builds addresses, and the bare path for an empty set', () => {
    expect(labelItHref(['FMA2', 'FMA1'], known)).toBe('/learn/study-skills/label-it?focus=FMA2,FMA1');
    expect(labHref(['FMA1'], known)).toBe('/preview/anatomy-lab?focus=FMA1');
    expect(withFocus('/x', [], known)).toBe('/x');
    expect(withFocus('/x', ['nope'], known)).toBe('/x');
  });

  it('toggles one id and a group, and reports a full set', () => {
    expect(toggleFocus([], 'FMA1')).toEqual({ ids: ['FMA1'], full: false });
    expect(toggleFocus(['FMA1', 'FMA2'], 'FMA1')).toEqual({ ids: ['FMA2'], full: false });
    expect(toggleFocus(['FMA1'], 'bad id')).toEqual({ ids: ['FMA1'], full: false });
    const full = Array.from({ length: MAX_FOCUS }, (_, i) => `FMA${i + 1}`);
    expect(toggleFocus(full, 'FMA5000')).toEqual({ ids: full, full: true });
    expect(toggleFocusGroup(['FMA1'], ['FMA1', 'FMA2']).ids).toEqual(['FMA1', 'FMA2']);
    expect(toggleFocusGroup(['FMA1', 'FMA2', 'FMA3'], ['FMA1', 'FMA2']).ids).toEqual(['FMA3']);
    expect(toggleFocusGroup(full, ['FMA5000']).full).toBe(true);
  });

  it('says the count in words and fades only when something is chosen', () => {
    expect([0, 1, 4].map(focusCountWords)).toEqual(['none chosen', '1 chosen', '4 chosen']);
    expect([...fadedByFocus(['FMA1', 'FMA2', 'FMA3'], ['FMA2'])]).toEqual(['FMA1', 'FMA3']);
    expect(fadedByFocus(['FMA1', 'FMA2'], []).size).toBe(0);
    expect(fadedByFocus(['FMA1', 'FMA2'], ['FMA9']).size).toBe(0);
  });

  it('saves and restores the last set, and ignores storage that is missing or throws', () => {
    const store = memory();
    expect(saveFocus(store, KEY, ['FMA2', 'FMA9'], known)).toBe(true);
    expect(store.data.get(KEY)).toBe('FMA2');
    expect(readFocus(store, KEY, known)).toEqual(['FMA2']);
    saveFocus(store, KEY, [], known);
    expect(store.data.has(KEY)).toBe(false);
    store.setItem(KEY, 'junk,FMA3');
    expect(readFocus(store, KEY, known)).toEqual(['FMA3']);
    const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    expect(readFocus(broken, KEY, known)).toEqual([]);
    expect(saveFocus(broken, KEY, ['FMA1'], known)).toBe(false);
    expect(readFocus(null, KEY)).toEqual([]);
    expect(saveFocus(null, KEY, ['FMA1'])).toBe(false);
  });

  it('gives label it only the labels in the set, or null to ask everything as before', () => {
    const labels = [{ id: 'FMA1' }, { id: 'FMA2' }, { id: 'FMA3' }];
    expect(labelsForFocus(labels, '?focus=FMA3,FMA1')).toEqual([{ id: 'FMA1' }, { id: 'FMA3' }]);
    expect(labelsForFocus(labels, '?focus=FMA99')).toBeNull();
    expect(labelsForFocus(labels, '')).toBeNull();
  });
});
