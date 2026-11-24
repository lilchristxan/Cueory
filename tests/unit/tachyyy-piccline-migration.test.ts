import { describe, expect, it } from 'vitest';
import {
  migrateStatAndSutureStatsToTachyyyAndPiccline,
  migrateLegacyGameStats,
  wordPathSummary,
  forget,
  recordResult,
  summary,
  type GameResult,
} from '../../src/islands/gamestats';
import { loadStats, STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import { picclineShareText } from '../../src/islands/piccline';
import { tachyyyShareText } from '../../src/islands/tachyyy';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, val: string) => { map.set(key, val); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
  };
}

describe('tachyyy and piccline stats migration', () => {
  it('copies historical suture records to piccline and stat records to tachyyy', () => {
    const historical: GameResult[] = [
      { game: 'suture', day: '2026-11-18', solved: true, tries: 0, hints: 0, specialFirst: true },
      { game: 'suture', day: '2026-11-19', solved: true, tries: 0, hints: 1, specialFirst: false },
      { game: 'stat', day: '2026-11-19', solved: true, tries: 2 },
    ];
    const migrated = migrateStatAndSutureStatsToTachyyyAndPiccline(historical);

    const picclineResults = migrated.filter((r) => r.game === 'piccline');
    expect(picclineResults).toHaveLength(2);
    expect(picclineResults[0]?.day).toBe('2026-11-18');
    expect(picclineResults[0]?.specialFirst).toBe(true);

    const tachyyyResults = migrated.filter((r) => r.game === 'tachyyy');
    expect(tachyyyResults).toHaveLength(1);
    expect(tachyyyResults[0]?.day).toBe('2026-11-19');

    const summary = wordPathSummary(migrated, '2026-11-19');
    expect(summary.completed).toBe(2);
    expect(summary.currentStreak).toBe(2);
    expect(summary.withoutHints).toBe(1);
    expect(summary.specialFirst).toBe(1);
  });

  it('does not overwrite existing piccline or tachyyy records if already present for a day', () => {
    const mixed: GameResult[] = [
      { game: 'suture', day: '2026-11-20', solved: false, tries: 3 },
      { game: 'piccline', day: '2026-11-20', solved: true, tries: 0 },
      { game: 'stat', day: '2026-11-20', solved: false, tries: 5 },
      { game: 'tachyyy', day: '2026-11-20', solved: true, tries: 1 },
    ];
    const migrated = migrateStatAndSutureStatsToTachyyyAndPiccline(mixed);
    const piccline = migrated.filter((r) => r.game === 'piccline');
    expect(piccline).toHaveLength(1);
    expect(piccline[0]?.solved).toBe(true);

    const tachyyy = migrated.filter((r) => r.game === 'tachyyy');
    expect(tachyyy).toHaveLength(1);
    expect(tachyyy[0]?.solved).toBe(true);
  });

  it('migrateLegacyGameStats migrates all three games: pillo, suture, stat', () => {
    const legacy: GameResult[] = [
      { game: 'pillo', day: '2026-11-18', solved: true, tries: 4 },
      { game: 'suture', day: '2026-11-18', solved: true, tries: 0 },
      { game: 'stat', day: '2026-11-18', solved: true, tries: 2 },
    ];
    const migrated = migrateLegacyGameStats(legacy);
    expect(migrated.some((r) => r.game === 'vialo' && r.day === '2026-11-18')).toBe(true);
    expect(migrated.some((r) => r.game === 'piccline' && r.day === '2026-11-18')).toBe(true);
    expect(migrated.some((r) => r.game === 'tachyyy' && r.day === '2026-11-18')).toBe(true);
  });

  it('migrateLegacyGameStats migrates legacy data and preserves valid history', () => {
    const rawResults: GameResult[] = [
      { game: 'suture', day: '2026-11-19', solved: true, tries: 0 },
      { game: 'stat', day: '2026-11-19', solved: true, tries: 1 },
    ];

    const migrated = migrateLegacyGameStats(rawResults);
    expect(migrated.some((r) => r.game === 'piccline')).toBe(true);
    expect(migrated.some((r) => r.game === 'tachyyy')).toBe(true);
  });

  it('formats share lines correctly', () => {
    expect(picclineShareText({ found: [0, 1, 2], totalWords: 3 }, '20 nov 2026')).toBe(
      'piccline · 20 nov 2026 · 3/3 · cueory.app',
    );
    expect(tachyyyShareText(14, '20 nov 2026', 15)).toBe(
      'tachyyy · 20 nov 2026 · 14/15 · cueory.app',
    );
  });

  it('forget clears both canonical and legacy aliases of a game', () => {
    const stats: GameResult[] = [
      { game: 'suture', day: '2026-11-18', solved: true, tries: 0 },
      { game: 'piccline', day: '2026-11-18', solved: true, tries: 0 },
      { game: 'stat', day: '2026-11-18', solved: true, tries: 2 },
      { game: 'tachyyy', day: '2026-11-18', solved: true, tries: 2 },
      { game: 'vialo', day: '2026-11-18', solved: true, tries: 4 },
      { game: 'pulse', day: '2026-11-18', solved: true, tries: 4 },
    ];
    const forgottenSuture = forget(stats, 'suture');
    expect(forgottenSuture.some((r) => r.game === 'suture' || r.game === 'piccline')).toBe(false);
    expect(forgottenSuture.some((r) => r.game === 'tachyyy')).toBe(true);

    const forgottenStat = forget(stats, 'stat');
    expect(forgottenStat.some((r) => r.game === 'stat' || r.game === 'tachyyy')).toBe(false);

    const forgottenPulse = forget(stats, 'pulse');
    expect(forgottenPulse.some((r) => r.game === 'pulse' || r.game === 'pillo' || r.game === 'vialo')).toBe(false);
  });

  it('summary and recordResult normalize suture and piccline aliases', () => {
    const historical: GameResult[] = [
      { game: 'suture', day: '2026-11-18', solved: true, tries: 0 },
      { game: 'piccline', day: '2026-11-19', solved: true, tries: 0 },
    ];
    // Both aliases report 2 played
    expect(summary(historical, 'suture').played).toBe(2);
    expect(summary(historical, 'piccline').played).toBe(2);

    // Recording piccline when suture already exists for that day is a no-op
    const noDuplicate = recordResult(historical, {
      game: 'piccline',
      day: '2026-11-18',
      solved: true,
      tries: 0,
    });
    expect(noDuplicate).toHaveLength(2);
  });
});
