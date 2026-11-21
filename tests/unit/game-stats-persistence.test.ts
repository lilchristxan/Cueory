import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueStorage } from '../../src/scripts/storage';

const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));

// This component has no visible output; execute its real persistence effect without a browser renderer.
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useLayoutEffect: () => undefined,
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => undefined],
}));

import { GameStatsPersistence } from '../../src/islands/GameStatsPanel';
import { forgetHeldRounds, heldRounds, loadStats, reportRound } from '../../src/islands/gameresults';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const cleanups: (() => void)[] = [];
let storage: KeyValueStorage;

function hydratePersistence() {
  GameStatsPersistence();
  for (const effect of hooks.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T12:00:00'));
  storage = memoryStorage();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));
  forgetHeldRounds();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  hooks.effects.length = 0;
  forgetHeldRounds();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('framed game stats persistence', () => {
  it('keeps queued and later results without mounting a second stats panel', () => {
    const beforeHydration = { game: 'triage', day: '2026-11-01', solved: true, tries: 0 } as const;
    const afterHydration = { game: 'cueword', day: '2026-11-01', solved: true, tries: 0 } as const;

    // A game can finish before this client-only island hydrates.
    reportRound(beforeHydration);
    expect(heldRounds()).toEqual([beforeHydration]);

    hydratePersistence();
    expect(heldRounds()).toEqual([]);
    expect(loadStats(storage, '2026-11-01').stats).toEqual([beforeHydration]);

    // Its established listener keeps results that finish after hydration too.
    reportRound(afterHydration);
    expect(heldRounds()).toEqual([]);
    expect(loadStats(storage, '2026-11-01').stats).toEqual([beforeHydration, afterHydration]);
  });
});
