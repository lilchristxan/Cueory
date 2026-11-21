import { describe, expect, it } from 'vitest';
import { pause, startBreak, startBreaks, tick, turnOn } from '../../src/islands/breaks';
import { BREAK_STORAGE_KEY, readBreakState, writeBreakState } from '../../src/scripts/breakstore';
import type { KeyValueStorage } from '../../src/scripts/storage';

const NOW = Date.UTC(2026, 10, 1, 12);
const MINUTE = 60_000;
const settings = { focusMinutes: 20, breakMinutes: 4 };

function memory(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, text) => void values.set(key, text),
    removeItem: (key) => void values.delete(key),
  };
}

const store = (storage: KeyValueStorage, state: unknown, savedAt: unknown = NOW) =>
  storage.setItem(BREAK_STORAGE_KEY, JSON.stringify({ version: 1, savedAt, state }));

describe('break timer storage edges', () => {
  it('accepts a running deadline exactly one full phase after the save time, and rejects one millisecond more', () => {
    const storage = memory();
    const focusing = turnOn(startBreaks(settings), NOW);
    expect(focusing.endsAt).toBe(NOW + 20 * MINUTE);
    store(storage, focusing);
    expect(readBreakState(storage, NOW)).toEqual(focusing);
    store(storage, { ...focusing, endsAt: NOW + 20 * MINUTE + 1 });
    expect(readBreakState(storage, NOW)).toEqual(startBreaks());
  });

  it('applies the same one-phase limit to a break using the break length', () => {
    const storage = memory();
    const due = tick(turnOn(startBreaks(settings), NOW - 20 * MINUTE), NOW);
    const onBreak = startBreak(due, NOW);
    expect(onBreak.status).toBe('on break');
    store(storage, onBreak);
    expect(readBreakState(storage, NOW)).toEqual(onBreak);
    store(storage, { ...onBreak, endsAt: NOW + 4 * MINUTE + 1 });
    expect(readBreakState(storage, NOW)).toEqual(startBreaks());
  });

  it('accepts a paused timer with exactly a full phase left, and rejects one millisecond more', () => {
    const storage = memory();
    const paused = pause(turnOn(startBreaks(settings), NOW), NOW);
    expect(paused.pausedRemainingMs).toBe(20 * MINUTE);
    store(storage, paused);
    expect(readBreakState(storage, NOW + 121 * MINUTE)).toEqual(startBreaks());
    expect(readBreakState(storage, NOW + 30 * MINUTE)).toEqual(paused);
    store(storage, { ...paused, pausedRemainingMs: 20 * MINUTE + 1 });
    expect(readBreakState(storage, NOW)).toEqual(startBreaks());
  });

  it('reads as off when the caller passes a non-finite or negative clock, even with a good record', () => {
    const storage = memory();
    store(storage, turnOn(startBreaks(settings), NOW));
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(readBreakState(storage, now)).toEqual(startBreaks());
    }
  });

  it('rejects a saved time that is not a finite, non-negative number', () => {
    const storage = memory();
    const state = turnOn(startBreaks(settings), NOW);
    for (const savedAt of ['2026-11-01', null, -1, true, {}]) {
      store(storage, state, savedAt);
      expect(readBreakState(storage, NOW)).toEqual(startBreaks());
    }
  });

  it('treats an empty stored string as no record', () => {
    const storage = memory();
    storage.setItem(BREAK_STORAGE_KEY, '');
    expect(readBreakState(storage, NOW)).toEqual(startBreaks());
  });

  it('refuses to write a paused state whose paused-from is missing or whose time left is negative', () => {
    const storage = memory();
    const paused = pause(turnOn(startBreaks(settings), NOW), NOW);
    expect(writeBreakState(storage, { ...paused, pausedFrom: null }, NOW)).toBe(false);
    expect(writeBreakState(storage, { ...paused, pausedRemainingMs: -1 }, NOW)).toBe(false);
    expect(storage.getItem(BREAK_STORAGE_KEY)).toBeNull();
  });
});
