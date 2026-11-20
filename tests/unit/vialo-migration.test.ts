import { describe, expect, it } from 'vitest';
import {
  migratePilloStatsToVialo,
  dailyStats,
  type GameResult,
} from '../../src/islands/gamestats';
import { loadStats, STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import { vialoShareText } from '../../src/islands/vialo';
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
  it('copies historical pillo records to vialo so streaks are preserved', () => {
    const historical: GameResult[] = [
      { game: 'pillo', day: '2026-11-18', solved: true, tries: 4 },
      { game: 'pillo', day: '2026-11-19', solved: true, tries: 3 },
      { game: 'pillo', day: '2026-11-20', solved: true, tries: 2 },
    ];
    const migrated = migratePilloStatsToVialo(historical);
    const vialoStats = dailyStats(migrated, 'vialo', '2026-11-20', 6);

    expect(vialoStats.played).toBe(3);
    expect(vialoStats.currentStreak).toBe(3);
    expect(vialoStats.longestStreak).toBe(3);
    expect(vialoStats.winPercent).toBe(100);
    expect(vialoStats.distribution[1]).toBe(1); // 2 tries
    expect(vialoStats.distribution[2]).toBe(1); // 3 tries
    expect(vialoStats.distribution[3]).toBe(1); // 4 tries
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

  it('loadStats migrates old pillo stats from storage on first load and persists them', () => {
    const oldStorageData = JSON.stringify({
      version: 1,
      results: [
        { game: 'pillo', day: '2026-11-19', solved: true, tries: 4 },
        { game: 'pillo', day: '2026-11-20', solved: true, tries: 3 },
      ],
    });
    const storage = memoryStorage({ [STATS_STORAGE_KEY]: oldStorageData });
    const loaded = loadStats(storage, '2026-11-20');

    expect(loaded.on).toBe(true);
    expect(loaded.stats.some((r) => r.game === 'vialo' && r.day === '2026-11-19')).toBe(true);
    expect(loaded.stats.some((r) => r.game === 'vialo' && r.day === '2026-11-20')).toBe(true);

    // Stored string should now include migrated vialo results
    const savedText = storage.getItem(STATS_STORAGE_KEY)!;
    expect(savedText).toContain('"vialo"');
    const parsedBack = JSON.parse(savedText);
    expect(parsedBack.results.some((r: any) => r.game === 'vialo')).toBe(true);
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
});
