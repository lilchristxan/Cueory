import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPicclineSave, PICCLINE_SAVE_KEY, savePicclineBoard } from '../../src/islands/picclinesave';
import { parsePathPuzzle, startPath, type PathState } from '../../src/islands/suturepath';
import { storageKeys } from '../../src/config/storage-keys';
import type { KeyValueStorage } from '../../src/scripts/storage';

const puzzle = parsePathPuzzle({ id: 'sample-01', sample: true, ...JSON.parse(readFileSync(new URL('../../content/games/suture/sample-01.json', import.meta.url), 'utf8')) });
const other = { ...puzzle, id: 'sample-02' };

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}
const played = (): PathState => ({ ...startPath(), found: [1, 0], extras: puzzle.extras.slice(0, 4), hintsUsed: 1, hint: { answer: 2, order: false }, misses: 3 });

describe('piccline autosave (device only)', () => {
  it('restores found words, other words, cues used and the cue marker for the same day', () => {
    const storage = memory();
    savePicclineBoard(puzzle, '2026-11-24', played(), storage);
    expect(loadPicclineSave(puzzle, '2026-11-24', storage)).toEqual(played());
  });

  it('keeps a finished board finished, and a printed flag', () => {
    const storage = memory();
    const finished: PathState = { ...startPath(), found: puzzle.words.map((_, i) => i), printed: true };
    savePicclineBoard(puzzle, '2026-11-24', finished, storage);
    const back = loadPicclineSave(puzzle, '2026-11-24', storage)!;
    expect(back.found).toHaveLength(puzzle.words.length);
    expect(back.printed).toBe(true);
  });

  it('starts fresh on a new day, and saving on a new day drops yesterday', () => {
    const storage = memory();
    savePicclineBoard(puzzle, '2026-11-24', played(), storage);
    expect(loadPicclineSave(puzzle, '2026-11-25', storage)).toBeNull();
    savePicclineBoard(puzzle, '2026-11-25', startPath(), storage);
    expect(loadPicclineSave(puzzle, '2026-11-24', storage)).toBeNull();
  });

  it('keeps boards for different puzzles on one day apart', () => {
    const storage = memory();
    savePicclineBoard(puzzle, '2026-11-24', played(), storage);
    savePicclineBoard(other, '2026-11-24', startPath(), storage);
    expect(loadPicclineSave(puzzle, '2026-11-24', storage)).toEqual(played());
    expect(loadPicclineSave(other, '2026-11-24', storage)).toEqual(startPath());
  });

  it('stores no answers, letters being picked or personal data', () => {
    const storage = memory();
    savePicclineBoard(puzzle, '2026-11-24', { ...played(), picked: [[0, 0]] }, storage);
    const text = storage.data.get(PICCLINE_SAVE_KEY)!;
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['boards', 'day', 'owner', 'v']);
    expect(text).not.toContain('picked');
    for (const answer of puzzle.words) expect(text).not.toContain(answer.answer);
  });

  it('ignores damaged, foreign or impossible records', () => {
    const storage = memory();
    const put = (value: unknown) => storage.setItem(PICCLINE_SAVE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
    const file = (board: unknown, extra: Record<string, unknown> = {}) => ({ v: 1, owner: 'device', day: '2026-11-24', boards: { [puzzle.id]: board }, ...extra });
    const good = { found: [0], extras: [], hintsUsed: 0, hint: null, misses: 0 };
    put(file(good));
    expect(loadPicclineSave(puzzle, '2026-11-24', storage)).not.toBeNull();
    for (const bad of [
      'not json', '[]', file(good, { owner: 'someone-else' }), file(good, { v: 2 }),
      file({ ...good, found: [99] }), file({ ...good, found: [0, 0] }), file({ ...good, extras: ['NOTAWORD'] }),
      file({ ...good, hintsUsed: 1 }), file({ ...good, misses: -1 }), file({ ...good, hint: { answer: 0, order: false } }),
      file({ ...good, hint: { answer: 5, order: 'yes' } }), file(null),
    ]) {
      put(bad);
      expect(loadPicclineSave(puzzle, '2026-11-24', storage), JSON.stringify(bad)).toBeNull();
    }
  });

  it('does nothing, and does not throw, when storage is missing, blocked or full', () => {
    expect(() => savePicclineBoard(puzzle, '2026-11-24', played(), undefined)).not.toThrow();
    expect(loadPicclineSave(puzzle, '2026-11-24', undefined)).toBeNull();
    const broken: KeyValueStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => undefined };
    expect(() => savePicclineBoard(puzzle, '2026-11-24', played(), broken)).not.toThrow();
    expect(loadPicclineSave(puzzle, '2026-11-24', broken)).toBeNull();
  });

  it('a wrong submit count survives a restore, and the key is registered for /privacy and delete-my-account', () => {
    const storage = memory();
    savePicclineBoard(puzzle, '2026-11-24', { ...startPath(), misses: 2 }, storage);
    expect(loadPicclineSave(puzzle, '2026-11-24', storage)!.misses).toBe(2);
    expect(storageKeys.some((key) => key.name === PICCLINE_SAVE_KEY && key.onDeletion === 'cleared')).toBe(true);
  });
});
