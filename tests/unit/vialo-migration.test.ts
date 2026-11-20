import { describe, expect, it } from 'vitest';
import {
  migratePilloStatsToVialo,
  dailyStats,
  forget,
  type GameResult,
} from '../../src/islands/gamestats';
import {
  canSetVialoHardMode,
  loadVialoHardMode,
  rememberVialoHardMode,
  setVialoHardMode,
  startVialo,
  vialoShareText,
  PILLO_HARD_MODE_STORAGE_KEY,
  VIALO_HARD_MODE_STORAGE_KEY,
} from '../../src/islands/vialo';
import { startPulse } from '../../src/islands/pulse';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, val: string) => { map.set(key, val); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
  };
}

describe('vialo stats migration and share format', () => {
  it('copies historical pillo and pulse records to vialo so streaks are preserved', () => {
    const historical: GameResult[] = [
      { game: 'pulse' as any, day: '2026-11-17', solved: true, tries: 5 },
      { game: 'pillo', day: '2026-11-18', solved: true, tries: 4 },
      { game: 'pillo', day: '2026-11-19', solved: true, tries: 3 },
      { game: 'pulse' as any, day: '2026-11-20', solved: true, tries: 2 },
    ];
    const migrated = migratePilloStatsToVialo(historical);
    const vialoStats = dailyStats(migrated, 'vialo', '2026-11-20', 6);

    expect(vialoStats.played).toBe(4);
    expect(vialoStats.currentStreak).toBe(4);
    expect(vialoStats.longestStreak).toBe(4);
    expect(vialoStats.winPercent).toBe(100);
    expect(vialoStats.distribution[1]).toBe(1); // 2 tries
    expect(vialoStats.distribution[2]).toBe(1); // 3 tries
    expect(vialoStats.distribution[3]).toBe(1); // 4 tries
    expect(vialoStats.distribution[4]).toBe(1); // 5 tries
  });

  it('does not overwrite existing vialo results if already recorded for a day', () => {
    const mixed: GameResult[] = [
      { game: 'pillo', day: '2026-11-20', solved: false, tries: 6 },
      { game: 'vialo', day: '2026-11-20', solved: true, tries: 3 },
    ];
    const migrated = migratePilloStatsToVialo(mixed);
    const vialoResults = migrated.filter((r) => r.game === 'vialo');
    expect(vialoResults).toHaveLength(1);
    expect(vialoResults[0]?.solved).toBe(true);
    expect(vialoResults[0]?.tries).toBe(3);
  });

  it('migratePilloStatsToVialo migrates old pillo and pulse stats', () => {
    const oldResults: GameResult[] = [
      { game: 'pulse' as any, day: '2026-11-18', solved: true, tries: 5 },
      { game: 'pillo', day: '2026-11-19', solved: true, tries: 4 },
      { game: 'pillo', day: '2026-11-20', solved: true, tries: 3 },
    ];
    const migrated = migratePilloStatsToVialo(oldResults);

    expect(migrated.some((r) => r.game === 'vialo' && r.day === '2026-11-18')).toBe(true);
    expect(migrated.some((r) => r.game === 'vialo' && r.day === '2026-11-19')).toBe(true);
    expect(migrated.some((r) => r.game === 'vialo' && r.day === '2026-11-20')).toBe(true);
  });

  it('formats vialo share line as "vialo · [date] · [score] · cueory.app"', () => {
    const solvedState = {
      ...startPulse('crane'),
      status: 'solved' as const,
      guesses: [
        { word: 'slate', marks: ['absent', 'absent', 'here', 'absent', 'here'] as any },
        { word: 'crane', marks: ['here', 'here', 'here', 'here', 'here'] as any },
      ],
    };
    expect(vialoShareText(solvedState, 'fri 20 nov')).toBe('vialo · fri 20 nov · 2/6 · cueory.app');

    const lostState = {
      ...startPulse('crane'),
      status: 'out' as const,
      guesses: Array.from({ length: 6 }, () => ({
        word: 'slate',
        marks: ['absent', 'absent', 'here', 'absent', 'here'] as any,
      })),
    };
    expect(vialoShareText(lostState, 'fri 20 nov')).toBe('vialo · fri 20 nov · x/6 · cueory.app');
  });

  it('forget removes vialo and all legacy aliases so stats are not recreated on next load', () => {
    const historical: GameResult[] = [
      { game: 'pulse' as any, day: '2026-11-18', solved: true, tries: 4 },
      { game: 'vialo', day: '2026-11-19', solved: true, tries: 3 },
    ];
    const forgotten = forget(historical, 'vialo');
    expect(forgotten.some((r) => r.game === 'vialo' || r.game === 'pulse' || r.game === 'pillo')).toBe(false);
  });

  it('honors the restored hard mode lock when hasPlayed is true', () => {
    const freshState = startVialo('crane', false, false);
    expect(canSetVialoHardMode(freshState)).toBe(true);
    const updated = setVialoHardMode(freshState, true);
    expect(updated.hard).toBe(true);

    const reloadedLockedState = startVialo('crane', true, true);
    expect(reloadedLockedState.hard).toBe(true);
    expect(canSetVialoHardMode(reloadedLockedState)).toBe(false);
    // Setting hard mode when locked is a no-op
    const triedSwitch = setVialoHardMode(reloadedLockedState, false);
    expect(triedSwitch.hard).toBe(true);
  });

  it('remembers hard mode on the same day and migrates legacy pillo hard mode', () => {
    const storage = memoryStorage();
    expect(loadVialoHardMode(storage, '2026-11-20')).toBeUndefined();

    // Migrates legacy pillo setting
    storage.setItem(PILLO_HARD_MODE_STORAGE_KEY, JSON.stringify({ day: '2026-11-20', hard: true }));
    expect(loadVialoHardMode(storage, '2026-11-20')).toBe(true);
    // Different day does not restore lock
    expect(loadVialoHardMode(storage, '2026-11-21')).toBeUndefined();

    // Canonical vialo takes precedence
    rememberVialoHardMode(storage, '2026-11-20', false);
    expect(JSON.parse(storage.getItem(VIALO_HARD_MODE_STORAGE_KEY)!)).toEqual({ day: '2026-11-20', hard: false });
    expect(loadVialoHardMode(storage, '2026-11-20')).toBe(false);
  });
});
