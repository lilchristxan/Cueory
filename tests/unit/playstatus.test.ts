import { describe, expect, it } from 'vitest';
import { localDay } from '../../src/islands/gameresults';
import { heardKey, readHeard, STATUS_TEXT, statusFor, type GameId, type HeardToday } from '../../src/islands/playstatus';
import type { GameStats } from '../../src/islands/gamestats';

const TODAY = '2026-11-01';
const GAMES: readonly GameId[] = ['pulse', 'triage', 'cueword', 'suture'];
const nothing: HeardToday = { started: new Set(), finished: new Set() };
const heard = (started: string[], finished: string[] = []): HeardToday => ({ started: new Set(started), finished: new Set(finished) });

describe('today\'s status for each daily game (#735)', () => {
  it('is not started when this device has nothing for today', () => {
    for (const game of GAMES) expect(statusFor(game, TODAY, [], nothing)).toBe('not-started');
  });

  it('is done when the stats record has a result for today, solved or not', () => {
    const stats: GameStats = [
      { game: 'pulse', day: TODAY, solved: false, tries: 6 },
      { game: 'cueword', day: TODAY, solved: true, tries: 0 },
    ];
    expect(statusFor('pulse', TODAY, stats, nothing)).toBe('done');
    expect(statusFor('cueword', TODAY, stats, nothing)).toBe('done');
    expect(statusFor('suture', TODAY, stats, nothing)).toBe('not-started');
  });

  it('ignores results from other days and other games', () => {
    const stats: GameStats = [
      { game: 'pulse', day: '2026-10-31', solved: true, tries: 3 },
      { game: 'suture', day: TODAY, solved: true, tries: 1 },
    ];
    expect(statusFor('pulse', TODAY, stats, heard([heardKey('pulse', '2026-10-31')], [heardKey('pulse', '2026-10-31')]))).toBe('not-started');
  });

  it('is in progress once started on this page, and done once finished, which wins', () => {
    expect(statusFor('suture', TODAY, [], heard([heardKey('suture', TODAY)]))).toBe('in-progress');
    expect(statusFor('suture', TODAY, [], heard([heardKey('suture', TODAY)], [heardKey('suture', TODAY)]))).toBe('done');
    expect(statusFor('triage', TODAY, [], heard([], [heardKey('triage', TODAY)]))).toBe('done');
  });

  it('a stored result wins over a round only started on this page', () => {
    const stats: GameStats = [{ game: 'pulse', day: TODAY, solved: true, tries: 2 }];
    expect(statusFor('pulse', TODAY, stats, heard([heardKey('pulse', TODAY)]))).toBe('done');
  });

  it('uses the visitor\'s local day, the same rule the games pick their puzzle by', () => {
    // 23:30 on 1 November local time is still 1 November, whatever the UTC date is.
    expect(localDay(new Date(2026, 10, 1, 23, 30))).toBe(TODAY);
    expect(localDay(new Date(2026, 10, 2, 0, 5))).toBe('2026-11-02');
  });

  it('every status has its own words and its own symbol, so color is never the signal', () => {
    const labels = Object.values(STATUS_TEXT).map((text) => text.label);
    const symbols = Object.values(STATUS_TEXT).map((text) => text.symbol);
    expect(labels).toEqual(['not started', 'in progress', 'done']);
    expect(new Set(symbols).size).toBe(3);
    for (const symbol of symbols) expect(symbol.trim()).not.toBe('');
  });
});

describe('reading game events', () => {
  it('reads a round result or a progress event into a key', () => {
    expect(readHeard({ game: 'pulse', day: TODAY, solved: true, tries: 1 }, GAMES)).toBe('pulse:2026-11-01');
    expect(readHeard({ game: 'suture', day: TODAY }, GAMES)).toBe('suture:2026-11-01');
  });

  it('takes the game id from the caller for sudoku\'s own event', () => {
    expect(readHeard({ day: TODAY, level: 'easy', solved: true }, GAMES, 'triage')).toBe('triage:2026-11-01');
  });

  it('ignores anything that is not a known game on a real-looking day', () => {
    for (const detail of [null, undefined, 'pulse', 42, [], {}, { game: 'stat', day: TODAY }, { game: 'pulse' },
      { game: 'pulse', day: '1 nov' }, { game: 'pulse', day: 20261101 }]) {
      expect(readHeard(detail, GAMES)).toBeUndefined();
    }
  });

  it('survives an object whose fields throw', () => {
    const hostile = { get game(): string { throw new Error('no'); }, day: TODAY };
    expect(readHeard(hostile, GAMES)).toBeUndefined();
  });
});
