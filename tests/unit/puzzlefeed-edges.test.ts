import { describe, expect, it } from 'vitest';
import { acceptPuzzle, loadTodayPuzzle, selectTodayPuzzle, type GameId } from '../../src/islands/puzzlefeed';

const TODAY = '2026-03-10';
const pulse = (changes: Record<string, unknown> = {}) => ({ game: 'pulse', date: TODAY, puzzle: { word: 'abcde', cue: 'a sample cue' }, ...changes });
const triagePuzzle = {
  groups: [
    { name: 'group a', terms: ['a1', 'a2', 'a3'] },
    { name: 'group b', terms: ['b1', 'b2', 'b3'] },
    { name: 'group c', terms: ['c1', 'c2', 'c3'] },
  ],
  oddOne: 'odd',
};
const triage = (puzzle: unknown) => ({ game: 'triage', date: TODAY, puzzle });
const message = (result: ReturnType<typeof acceptPuzzle>) => (result.ok ? '' : result.message);

describe('accept puzzle edges', () => {
  it.each([null, undefined, 'text', 5, [], true])('refuses payload %j', (payload) => {
    expect(message(acceptPuzzle(payload, TODAY))).toMatch(/must be an object/);
  });
  it.each(['', '2026-3-10', '2026-03-10 ', 'today', '20260310'])('refuses today value %j', (today) => {
    expect(message(acceptPuzzle(pulse(), today))).toMatch(/YYYY-MM-DD/);
  });
  it('refuses a date that is not a string, even if it prints the same', () => {
    expect(acceptPuzzle(pulse({ date: new String(TODAY) }), TODAY).ok).toBe(false);
    expect(acceptPuzzle(pulse({ date: 20260310 }), TODAY).ok).toBe(false);
  });
  it('lists the four games in the unknown-game message', () => {
    expect(message(acceptPuzzle(pulse({ game: 'sudoku' }), TODAY))).toBe('game must be one of: pulse, cueword, triage, suture.');
  });
  it.each(['Pulse', 'pulse ', 'constructor', '__proto__', 'toString'])('refuses game name %j', (game) => {
    expect(acceptPuzzle(pulse({ game }), TODAY).ok).toBe(false);
  });
});

describe('pulse puzzle edges', () => {
  it.each(['abcd1', 'abcd ', 'abcd\n', 'ab-de', 'ábcde', 'ABCDE', '', 5, null, undefined])('refuses word %j', (word) => {
    expect(acceptPuzzle(pulse({ puzzle: { word, cue: 'cue' } }), TODAY).ok).toBe(false);
  });
  it.each(['', '   ', '\n', 5, null, undefined, ['cue']])('refuses cue %j', (cue) => {
    expect(acceptPuzzle(pulse({ puzzle: { word: 'abcde', cue } }), TODAY).ok).toBe(false);
  });
  it.each([null, 'abcde', ['abcde'], 5])('refuses puzzle %j', (puzzle) => {
    expect(message(acceptPuzzle(pulse({ puzzle }), TODAY))).toMatch(/must be an object/);
  });
  it('keeps the cue as given, with its spaces', () => {
    const result = acceptPuzzle(pulse({ puzzle: { word: 'abcde', cue: '  spaced cue ' } }), TODAY);
    expect(result.ok && result.game === 'pulse' && result.puzzle.cue).toBe('  spaced cue ');
  });
  it('does not put the word in any error message', () => {
    for (const cue of ['', 5]) {
      expect(message(acceptPuzzle(pulse({ puzzle: { word: 'abcde', cue } }), TODAY))).not.toContain('abcde');
    }
  });
});

describe('triage puzzle edges', () => {
  it('accepts one group with one term, since only the shape is checked here', () => {
    const result = acceptPuzzle(triage({ groups: [{ name: 'only', terms: ['x'] }], oddOne: 'y' }), TODAY);
    expect(result.ok).toBe(true);
  });
  it('numbers the group in the error message from 1', () => {
    const groups = [{ name: 'ok', terms: ['a'] }, { name: ' ', terms: ['b'] }];
    expect(message(acceptPuzzle(triage({ groups, oddOne: 'o' }), TODAY))).toBe('group 2 needs a name.');
  });
  it.each([null, 'text', 5, []])('refuses group %j', (group) => {
    expect(message(acceptPuzzle(triage({ groups: [group], oddOne: 'o' }), TODAY))).toBe('group 1 must be an object.');
  });
  it.each([[[1]], [['']], [['  ']], [[null]]])('refuses terms %j', (terms) => {
    expect(message(acceptPuzzle(triage({ groups: [{ name: 'g', terms }], oddOne: 'o' }), TODAY))).toBe('group 1 has an empty term.');
  });
  it('refuses terms that are not a list', () => {
    expect(message(acceptPuzzle(triage({ groups: [{ name: 'g', terms: 'abc' }], oddOne: 'o' }), TODAY))).toBe('group 1 needs at least one term.');
  });
  it('refuses duplicates that differ only by case or outer spaces, inside one group', () => {
    const groups = [{ name: 'g', terms: ['Same', ' same '] }];
    expect(message(acceptPuzzle(triage({ groups, oddOne: 'o' }), TODAY))).toBe('each term must appear only once.');
  });
  it('does not repeat any term in the duplicate message', () => {
    const groups = [{ name: 'g', terms: ['secretterm', 'SECRETTERM'] }];
    expect(message(acceptPuzzle(triage({ groups, oddOne: 'o' }), TODAY))).not.toMatch(/secretterm/i);
  });
  it('returns copies, so changing the result leaves the payload alone', () => {
    const payload = triage(structuredClone(triagePuzzle));
    const result = acceptPuzzle(payload, TODAY);
    if (!result.ok || result.game !== 'triage') throw new Error('expected a triage puzzle');
    result.puzzle.groups[0]!.terms.push('extra');
    result.puzzle.groups[0]!.name = 'changed';
    expect(payload.puzzle).toEqual(triagePuzzle);
  });
});

describe('select today puzzle edges', () => {
  it.each([null, undefined, {}, 'feed', 5])('fails for a feed that is %j', (feed) => {
    expect(selectTodayPuzzle(feed, TODAY, 'pulse')).toEqual({ status: 'failed' });
  });
  it('fails for a bad today value or an unknown game id', () => {
    expect(selectTodayPuzzle([], '2026/03/10', 'pulse')).toEqual({ status: 'failed' });
    expect(selectTodayPuzzle([], TODAY, 'sudoku' as GameId)).toEqual({ status: 'failed' });
  });
  it.each([null, 'row', 5, [pulse()]])('fails for a feed entry that is %j', (entry) => {
    expect(selectTodayPuzzle([entry], TODAY, 'pulse')).toEqual({ status: 'failed' });
  });
  it('fails when an entry has no game and no date, since it could hide today', () => {
    expect(selectTodayPuzzle([{ puzzle: {} }], TODAY, 'pulse')).toEqual({ status: 'failed' });
  });
  it('fails when an entry has the right game but no date', () => {
    expect(selectTodayPuzzle([{ game: 'pulse', puzzle: {} }], TODAY, 'pulse')).toEqual({ status: 'failed' });
  });
  it('fails when an entry has today but no game', () => {
    expect(selectTodayPuzzle([{ date: TODAY, puzzle: {} }], TODAY, 'pulse')).toEqual({ status: 'failed' });
  });
  it('fails when the right game and day has the wrong type of date', () => {
    expect(selectTodayPuzzle([{ game: 'pulse', date: 5, puzzle: {} }], TODAY, 'pulse')).toEqual({ status: 'failed' });
  });
  it('ignores rows for other games and days around one good match', () => {
    const feed = [
      pulse({ date: '2026-03-09' }),
      { game: 'triage', date: TODAY, puzzle: 'bad' },
      pulse(),
      { game: 'cueword', date: '2026-03-11' },
    ];
    expect(selectTodayPuzzle(feed, TODAY, 'pulse')).toMatchObject({ status: 'puzzle', ok: true, game: 'pulse' });
  });
  it('fails for two good matches of the same game and day', () => {
    expect(selectTodayPuzzle([pulse(), pulse()], TODAY, 'pulse')).toEqual({ status: 'failed' });
  });
  it('reports none-today when only other days and games are listed', () => {
    expect(selectTodayPuzzle([pulse({ date: '2026-03-11' }), triage(triagePuzzle)], TODAY, 'cueword')).toEqual({ status: 'none-today' });
  });
  it('does not change the feed it is given', () => {
    const feed = [pulse()];
    const copy = structuredClone(feed);
    selectTodayPuzzle(feed, TODAY, 'pulse');
    expect(feed).toEqual(copy);
  });
});

describe('load today puzzle edges', () => {
  it('fails, with no detail, when the loader rejects with an error that holds an answer', async () => {
    const result = await loadTodayPuzzle(() => Promise.reject(new Error('secret-answer')), TODAY, 'pulse');
    expect(result).toEqual({ status: 'failed' });
    expect(JSON.stringify(result)).not.toContain('secret-answer');
  });
  it('fails when the loader gives back something that is not a feed', async () => {
    expect(await loadTodayPuzzle(async () => ({ game: 'pulse' }), TODAY, 'pulse')).toEqual({ status: 'failed' });
  });
  it('returns the validated puzzle from the loader', async () => {
    const result = await loadTodayPuzzle(async () => [pulse()], TODAY, 'pulse');
    expect(result).toMatchObject({ status: 'puzzle', game: 'pulse', puzzle: { word: 'abcde' } });
  });
});
