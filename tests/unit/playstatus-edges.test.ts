import { describe, expect, it } from 'vitest';
import type { GameStats } from '../../src/islands/gamestats';
import {
  heardKey,
  readHeard,
  statusDisplayFor,
  statusFor,
  type GameId,
  type HeardToday,
} from '../../src/islands/playstatus';

const TODAY = '2026-03-10';
const nothing: HeardToday = { started: new Set(), finished: new Set() };
const heard = (started: string[], finished: string[] = []): HeardToday => ({ started: new Set(started), finished: new Set(finished) });
const result = (game: string, day: string) => ({ game, day, solved: true }) as unknown as GameStats[number];

describe('play status: the vialo and pulse names count as one game', () => {
  it.each([
    ['vialo', 'pulse'],
    ['pulse', 'vialo'],
  ] as const)('%s hears a start and a finish sent under %s', (game, other) => {
    expect(statusFor(game, TODAY, [], heard([heardKey(other, TODAY)]))).toBe('in-progress');
    expect(statusFor(game, TODAY, [], heard([], [heardKey(other, TODAY)]))).toBe('done');
  });
  it.each([
    ['vialo', 'pulse'],
    ['pulse', 'vialo'],
  ] as const)('%s counts a stored result saved under %s', (game, other) => {
    expect(statusFor(game, TODAY, [result(other, TODAY)], nothing)).toBe('done');
  });
  it('does not mix other games into the alias', () => {
    expect(statusFor('triage', TODAY, [result('vialo', TODAY)], heard([heardKey('pulse', TODAY)]))).toBe('not-started');
  });
  it('does not hear the alias on another day', () => {
    expect(statusFor('vialo', TODAY, [result('pulse', '2026-03-09')], heard([heardKey('pulse', '2026-03-09')]))).toBe('not-started');
  });
});

describe('play status precedence edges', () => {
  it('a finish heard for the alias wins over a start heard for the game', () => {
    expect(statusFor('vialo', TODAY, [], heard([heardKey('vialo', TODAY)], [heardKey('pulse', TODAY)]))).toBe('done');
  });
  it('a finish on one day does not finish another day', () => {
    expect(statusFor('triage', TODAY, [], heard([], [heardKey('triage', '2026-03-09')]))).toBe('not-started');
  });
  it('is not started with an empty stats record and nothing heard', () => {
    expect(statusFor('suture', TODAY, [], nothing)).toBe('not-started');
  });
});

describe('play status word count display', () => {
  it.each([
    [{ wordsFound: 0, totalWords: 5 }, 'done · 0 of 5 words'],
    [{ wordsFound: 5, totalWords: 5 }, 'done · 5 of 5 words'],
    [{ wordsFound: 3, totalWords: 5 }, 'done · 3 of 5 words'],
  ])('shows %j as %s', (details, label) => {
    expect(statusDisplayFor('suture', 'done', details)).toEqual({ label, symbol: '✓' });
  });
  it.each([
    [{ wordsFound: 6, totalWords: 5 }],
    [{ wordsFound: -1, totalWords: 5 }],
    [{ wordsFound: 1, totalWords: 0 }],
    [{ wordsFound: 1.5, totalWords: 5 }],
    [{ wordsFound: Number.NaN, totalWords: 5 }],
    [{ wordsFound: Infinity, totalWords: Infinity }],
    [{ wordsFound: 2 }],
    [{ totalWords: 5 }],
    [{}],
  ])('falls back to plain done for %j', (details) => {
    expect(statusDisplayFor('suture', 'done', details)).toEqual({ label: 'done', symbol: '✓' });
  });
  it('never adds a word count for a game that is not suture', () => {
    const games: GameId[] = ['vialo', 'pulse', 'cueword', 'triage'];
    for (const game of games) {
      expect(statusDisplayFor(game, 'done', { wordsFound: 2, totalWords: 5 }).label).toBe('done');
    }
  });
  it('ignores word counts unless the round is done', () => {
    const details = { wordsFound: 2, totalWords: 5 };
    expect(statusDisplayFor('suture', 'in-progress', details).label).toBe('in progress');
    expect(statusDisplayFor('suture', 'not-started', details).label).toBe('not started');
  });
});

describe('play status event reading edges', () => {
  const games: readonly GameId[] = ['triage', 'cueword'];
  it('accepts the vialo name when pulse is listed, and the reverse', () => {
    expect(readHeard({ game: 'vialo', day: TODAY }, ['pulse'])).toBe(heardKey('vialo', TODAY));
    expect(readHeard({ game: 'pulse', day: TODAY }, ['vialo'])).toBe(heardKey('pulse', TODAY));
  });
  it('rejects a game that is not listed', () => {
    expect(readHeard({ game: 'suture', day: TODAY }, games)).toBeUndefined();
    expect(readHeard({ game: 'vialo', day: TODAY }, games)).toBeUndefined();
  });
  it.each([
    [{ game: 'triage', day: '2026-3-10' }],
    [{ game: 'triage', day: '2026-03-10 ' }],
    [{ game: 'triage', day: 20260310 }],
    [{ game: 'triage' }],
    [{ game: 5, day: TODAY }],
    ['text'],
    [null],
    [undefined],
  ])('ignores detail %j', (detail) => {
    expect(readHeard(detail, games)).toBeUndefined();
  });
  it('lets the caller name the game and ignores the detail game then', () => {
    expect(readHeard({ game: 'cueword', day: TODAY }, games, 'triage')).toBe(heardKey('triage', TODAY));
    expect(readHeard({ day: TODAY }, games, 'cueword')).toBe(heardKey('cueword', TODAY));
  });
  it('still rejects a caller-named game that is not listed', () => {
    expect(readHeard({ day: TODAY }, games, 'suture')).toBeUndefined();
  });
});
