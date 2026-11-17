/** Task 719: pillo's Hard Mode, word list, stats, guess distribution and streak day rule (docs/GAMES-PARITY.md). */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GAME_PROGRESS_EVENT, reportProgress } from '../../src/islands/gameresults';
import { forbiddenGameWords } from '../../src/config/games';
import { parseWordList } from '../../src/islands/pillowords';
import {
  canSetHardMode,
  GUESSES,
  hardModeProblem,
  markGuess,
  playGuess,
  setHardMode,
  shareText,
  startPulse,
  untilNextPuzzle,
  waitInWords,
  wordProblem,
} from '../../src/islands/pulse';
import { dailyStats, parseStats, recordResult, serialize, type GameResult, type GameStats } from '../../src/islands/gamestats';

const words = new Set(['crane', 'grace', 'grape', 'plant', 'trace', 'brace', 'eerie', 'geese', 'cacao']);

describe('pillo hard mode', () => {
  it('can be switched only before the first guess', () => {
    const start = startPulse('grace');
    expect(canSetHardMode(start)).toBe(true);
    const hard = setHardMode(start, true);
    expect(hard.hard).toBe(true);
    expect(setHardMode(hard, false).hard).toBe(false);
    const played = playGuess(hard, 'crane', words);
    expect(played.guesses).toHaveLength(1);
    expect(canSetHardMode(played)).toBe(false);
    expect(setHardMode(played, false)).toBe(played);
    expect(setHardMode(playGuess(start, 'crane', words), true).hard).toBeUndefined();
  });

  it('keeps letters shown in place where they are, and uses letters shown elsewhere', () => {
    // crane against grace: c elsewhere, r a in place, n absent, e in place.
    const state = playGuess(setHardMode(startPulse('grace'), true), 'crane', words);
    expect(wordProblem(state, 'plant', words)).toBe('hard mode: the 2nd letter must be r.');
    expect(wordProblem(state, 'brane', new Set([...words, 'brane']))).toBe('hard mode: the guess must use c.');
    expect(wordProblem(state, 'trace', words)).toBeUndefined();
    expect(playGuess(state, 'plant', words)).toBe(state);
    expect(playGuess(state, 'trace', words).guesses).toHaveLength(2);
  });

  it('asks for a repeated letter as many times as one guess showed it', () => {
    const guess = { word: 'geese', marks: markGuess('geese', 'eerie') };
    expect(hardModeProblem([guess], 'eerie')).toBeUndefined();
    const once = [{ word: 'eeeee', marks: ['here', 'here', 'absent', 'absent', 'here'] as const }].map((g) => ({
      ...g,
      marks: [...g.marks],
    }));
    expect(hardModeProblem(once, 'eexxe')).toBeUndefined();
    const twice = [{ word: 'abcee', marks: ['absent', 'absent', 'absent', 'elsewhere', 'elsewhere'] as ('here' | 'elsewhere' | 'absent')[] }];
    expect(hardModeProblem(twice, 'exxxx')).toBe('hard mode: the guess must use e twice.');
  });

  it('is off unless turned on, and then says so in the share line', () => {
    const plain = playGuess(startPulse('grace'), 'grace', words);
    expect(shareText(plain, 'sun 1 nov')).toBe('cueory pillo, sun 1 nov: solved in 1 of 6');
    const hard = playGuess(setHardMode(startPulse('grace'), true), 'grace', words);
    expect(shareText(hard, 'sun 1 nov')).toBe('cueory pillo, sun 1 nov: solved in 1 of 6, hard mode');
  });
});

describe('pillo invalid words', () => {
  it("never uses up a guess, and says why in plain words", () => {
    const state = startPulse('grace');
    expect(wordProblem(state, 'zzzzz', words)).toBe("zzzzz isn't in the word list. it didn't use a guess.");
    expect(playGuess(state, 'zzzzz', words)).toBe(state);
    expect(wordProblem(state, 'gra', words)).toBe('the word has 5 letters.');
    expect(playGuess(state, 'crane', words).guesses).toHaveLength(1);
  });

  it("always accepts the word of the day, and any five letters when the list couldn't load", () => {
    expect(wordProblem(startPulse('qqqqq'), 'qqqqq', words)).toBeUndefined();
    expect(wordProblem(startPulse('grace'), 'zzzzz')).toBeUndefined();
  });

  it('reads the list: skips notes, wrong shapes and the words games must never use', () => {
    const list = parseWordList(`# a note\ncrane\nGRACE\nabc\n${forbiddenGameWords.join('\n')}\nplant\n`);
    expect([...list]).toEqual(['crane', 'plant']);
  });

  it('ships a list that accepts every sample word and keeps its license notice', () => {
    const text = readFileSync(new URL('../../src/islands/pillowords.txt', import.meta.url), 'utf8');
    const list = parseWordList(text);
    expect(list.size).toBeGreaterThan(10_000);
    for (const word of ['grace', 'blend', 'pilot', 'music', 'olive', 'candy', 'lemon', 'coast', 'kneel', 'plane', 'crane', 'plant']) {
      expect(list.has(word), word).toBe(true);
    }
    expect(text).toContain('MIT License');
    expect(text).toContain('Copyright (c) Sindre Sorhus');
  });

  it('keeps marking repeated letters by count', () => {
    expect(markGuess('geese', 'eerie')).toEqual(['absent', 'here', 'elsewhere', 'absent', 'here']);
    expect(markGuess('cacao', 'cocoa')).toEqual(['here', 'elsewhere', 'here', 'absent', 'elsewhere']);
  });
});

const r = (day: string, solved: boolean, tries: number, extra: Partial<GameResult> = {}): GameResult => ({
  game: 'pulse',
  day,
  solved,
  tries,
  ...extra,
});

describe('pillo stats', () => {
  it('counts played, win % and the guess distribution 1 to 6', () => {
    const stats: GameStats = [
      r('2026-11-01', true, 3),
      r('2026-11-02', true, 3),
      r('2026-11-03', false, 6),
      r('2026-11-04', true, 1),
      { game: 'cueword', day: '2026-11-04', solved: true, tries: 2 },
    ];
    const value = dailyStats(stats, 'pulse', '2026-11-04', GUESSES);
    expect(value.played).toBe(4);
    expect(value.winPercent).toBe(75);
    expect(value.distribution).toEqual([1, 0, 2, 0, 0, 0]);
    expect(dailyStats([], 'pulse', '2026-11-04', GUESSES)).toEqual({
      played: 0,
      winPercent: 0,
      currentStreak: 0,
      longestStreak: 0,
      distribution: [0, 0, 0, 0, 0, 0],
    });
  });

  it('counts current and longest streaks of days in a row solved', () => {
    const stats: GameStats = [
      r('2026-11-01', true, 2),
      r('2026-11-02', true, 2),
      r('2026-11-03', true, 2),
      r('2026-11-05', true, 2),
      r('2026-11-06', true, 2),
    ];
    expect(dailyStats(stats, 'pulse', '2026-11-06', GUESSES)).toMatchObject({ currentStreak: 2, longestStreak: 3 });
    // Today not played yet: yesterday's streak still stands. A missed day ends it.
    expect(dailyStats(stats, 'pulse', '2026-11-07', GUESSES).currentStreak).toBe(2);
    expect(dailyStats(stats, 'pulse', '2026-11-08', GUESSES).currentStreak).toBe(0);
    // A puzzle lost today ends the streak.
    const lost = recordResult(stats, r('2026-11-07', false, 6));
    expect(dailyStats(lost, 'pulse', '2026-11-07', GUESSES)).toMatchObject({ currentStreak: 0, longestStreak: 3 });
  });

  it('counts the daily puzzle toward a streak only on its own local day', () => {
    const stats: GameStats = [
      r('2026-11-01', true, 2),
      r('2026-11-02', true, 4, { offDay: true }),
      r('2026-11-03', true, 2),
    ];
    const value = dailyStats(stats, 'pulse', '2026-11-03', GUESSES);
    expect(value).toMatchObject({ played: 3, winPercent: 100, currentStreak: 1, longestStreak: 1 });
    expect(value.distribution).toEqual([0, 2, 0, 1, 0, 0]);
  });

  it('saves the off-day note only when it is set, and reads old records unchanged', () => {
    const old = serialize([r('2026-11-01', true, 1)]);
    expect(JSON.parse(old)).toEqual({ version: 1, results: [{ game: 'pulse', day: '2026-11-01', solved: true, tries: 1 }] });
    const late = serialize([r('2026-11-02', true, 2, { offDay: true })]);
    expect(parseStats(late)).toEqual([r('2026-11-02', true, 2, { offDay: true })]);
    expect(parseStats(JSON.stringify({ version: 1, results: [{ ...r('2026-11-02', true, 2), offDay: false }] }))).toEqual([]);
    // A round's other fields (such as its result card) are never kept.
    expect(recordResult([], { ...r('2026-11-03', true, 2), card: { name: 'x' } })).toEqual([r('2026-11-03', true, 2)]);
  });
});

describe('pillo next puzzle', () => {
  it('counts down to local midnight in plain words', () => {
    expect(untilNextPuzzle(new Date(2026, 10, 1, 15, 0))).toBe(9 * 3_600_000);
    expect(waitInWords(9 * 3_600_000)).toBe('9 h');
    expect(waitInWords(5 * 3_600_000 + 12 * 60_000)).toBe('5 h 12 min');
    expect(waitInWords(40 * 60_000 - 1)).toBe('40 min');
    expect(waitInWords(0)).toBe('1 min');
  });
});

describe('pillo first guess of the day', () => {
  it("tells the page today's round has started, with the game and the local day only", () => {
    const sent: Event[] = [];
    vi.stubGlobal('window', { dispatchEvent: (event: Event) => sent.push(event) });
    try {
      reportProgress({ game: 'pulse', day: '2026-11-01', ...({ extra: 'x' } as object) });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(GAME_PROGRESS_EVENT).toBe('cueory:game-progress');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe('cueory:game-progress');
    expect((sent[0] as CustomEvent).detail).toEqual({ game: 'pulse', day: '2026-11-01' });
  });

  it('sends it from the game on the first guess only', () => {
    const source = readFileSync(new URL('../../src/islands/PulseGame.tsx', import.meta.url), 'utf8');
    expect(source).toContain("if (state.guesses.length === 0) reportProgress({ game: 'pulse', day: localDay(today) });");
  });
});
