import { describe, expect, it } from 'vitest';
import { followOldGameHash, gamePageForHash } from '../../src/scripts/playhash';

describe('old /play game links (each game on its own page)', () => {
  it('sends each old section link to its game page', () => {
    expect(gamePageForHash('#pulse-heading')).toBe('/play/pillo');
    expect(gamePageForHash('#triage-heading')).toBe('/play/sudoku');
    expect(gamePageForHash('#sudoku-heading')).toBe('/play/sudoku');
    expect(gamePageForHash('#crossword-heading')).toBe('/play/crossword');
    expect(gamePageForHash('#word-path-heading')).toBe('/play/word-path');
    expect(gamePageForHash('#PILLO')).toBe('/play/pillo');
  });

  it('stays on the hub for anything else, including object property names', () => {
    for (const hash of ['', '#', '#today-status-heading', '#stats-heading', '#constructor', '#__proto__', '#toString']) {
      expect(gamePageForHash(hash), hash).toBeUndefined();
    }
  });

  it('replaces the address, so back does not return to the old link', () => {
    const calls: string[] = [];
    followOldGameHash({ hash: '#crossword-heading', replace: (url: string | URL) => { calls.push(String(url)); } });
    followOldGameHash({ hash: '#stats-heading', replace: (url: string | URL) => { calls.push(String(url)); } });
    expect(calls).toEqual(['/play/crossword']);
  });
});
