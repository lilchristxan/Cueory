import { describe, expect, it } from 'vitest';
import { centresActiveCard, pagerCurrentFlags, pagerDotLabel, wrapPosition } from '../../src/scripts/gamescarousel';

describe('games carousel pager', () => {
  it('wraps positions round and round', () => {
    expect(wrapPosition(6, 6)).toBe(0);
    expect(wrapPosition(-1, 6)).toBe(5);
    expect(wrapPosition(3, 6)).toBe(3);
    expect(wrapPosition(2, 0)).toBe(0);
  });

  it('marks exactly one dot as current', () => {
    for (let i = 0; i < 6; i += 1) {
      const flags = pagerCurrentFlags(6, i);
      expect(flags).toHaveLength(6);
      expect(flags.filter(Boolean)).toHaveLength(1);
      expect(flags[i]).toBe(true);
    }
    expect(pagerCurrentFlags(6, 9).some(Boolean)).toBe(false);
    expect(pagerCurrentFlags(0, 0)).toEqual([]);
  });

  it('names each dot with its game and place', () => {
    expect(pagerDotLabel('vialo', 0, 6)).toBe('vialo, 1 of 6');
    expect(pagerDotLabel('hello cards', 5, 6)).toBe('hello cards, 6 of 6');
  });

  it('centres the active card only where fewer than two whole cards fit (phones in portrait)', () => {
    expect(centresActiveCard(390, 250, 264)).toBe(true);
    expect(centresActiveCard(740, 280, 308)).toBe(false);
    expect(centresActiveCard(796, 186, 198)).toBe(false);
    expect(centresActiveCard(390, 0, 264)).toBe(false);
  });
});
