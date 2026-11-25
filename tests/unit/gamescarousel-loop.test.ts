import { describe, expect, it } from 'vitest';
import { fitsClones, needsSnap, shortestDelta, wrapPosition } from '../../src/scripts/gamescarousel';

describe('games carousel loop', () => {
  it('goes the short way round the circle', () => {
    expect(shortestDelta(5, 0, 6)).toBe(1);
    expect(shortestDelta(0, 5, 6)).toBe(-1);
    expect(shortestDelta(0, 2, 6)).toBe(2);
    expect(shortestDelta(4, 1, 6)).toBe(3);
    expect(shortestDelta(2, 2, 6)).toBe(0);
    expect(shortestDelta(0, 0, 0)).toBe(0);
  });

  it('breaks a tie (half way round) forward', () => {
    expect(shortestDelta(0, 3, 6)).toBe(3);
    expect(shortestDelta(5, 2, 6)).toBe(3);
  });

  it('from any card, stepping the shortest delta lands on the target', () => {
    for (let from = 0; from < 6; from += 1) {
      for (let to = 0; to < 6; to += 1) {
        const delta = shortestDelta(from, to, 6);
        expect(Math.abs(delta)).toBeLessThanOrEqual(3);
        expect(wrapPosition(from + delta, 6)).toBe(to);
      }
    }
  });

  it('keeps virtual positions inside the look-alike cards and snaps the ones that sit on them', () => {
    expect(fitsClones(-6, 6)).toBe(true);
    expect(fitsClones(-7, 6)).toBe(false);
    expect(fitsClones(11, 6)).toBe(true);
    expect(fitsClones(12, 6)).toBe(false);
    expect(needsSnap(-1, 6)).toBe(true);
    expect(needsSnap(0, 6)).toBe(false);
    expect(needsSnap(5, 6)).toBe(false);
    expect(needsSnap(6, 6)).toBe(true);
    expect(needsSnap(0, 0)).toBe(false);
  });

  it('every position reached by going forward or back round the join maps to a real card', () => {
    const seen = new Set<number>();
    for (let v = -6; v < 12; v += 1) seen.add(wrapPosition(v, 6));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
