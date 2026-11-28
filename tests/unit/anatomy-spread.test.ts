import { describe, expect, it } from 'vitest';
import { spreadBoard, type SpreadItem } from '../../src/islands/anatomyspread';

const item = (id: string, width: number, height: number): SpreadItem => ({ id, width, height });

describe('spread structures apart: the board', () => {
  it('gives every structure its own spot, and none overlap', () => {
    const items = Array.from({ length: 40 }, (_, i) => item(`s${i}`, 1 + (i % 5), 1 + (i % 7)));
    const spots = spreadBoard(items);
    expect(spots.size).toBe(items.length);
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const first = spots.get(items[a]!.id)!;
        const second = spots.get(items[b]!.id)!;
        const apartAcross = Math.abs(first.u - second.u) >= (items[a]!.width + items[b]!.width) / 2;
        const apartDown = Math.abs(first.v - second.v) >= (items[a]!.height + items[b]!.height) / 2;
        expect(apartAcross || apartDown, `${items[a]!.id} and ${items[b]!.id}`).toBe(true);
      }
    }
  });

  it('lays the structures out in rows: the tallest on the top row, each row sharing one line', () => {
    const items = [item('small', 1, 1), item('tall', 1, 6), item('mid', 1, 3), item('tiny', 1, 0.5), ...Array.from({ length: 12 }, (_, i) => item(`n${i}`, 1, 1))];
    const spots = spreadBoard(items);
    const rows = new Set([...spots.values()].map((spot) => spot.v.toFixed(6)));
    expect(rows.size).toBeGreaterThan(1);
    expect(rows.size).toBeLessThan(items.length);
    const highest = Math.max(...[...spots.values()].map((spot) => spot.v));
    expect(spots.get('tall')!.v).toBe(highest);
  });

  it('centres the board on its middle and is the same for the same structures in any order', () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`s${i}`, 2, 2));
    const spots = spreadBoard(items);
    const us = [...spots.values()].map((spot) => spot.u);
    const vs = [...spots.values()].map((spot) => spot.v);
    expect(Math.max(...vs) + Math.min(...vs)).toBeCloseTo(0);
    expect(Math.abs(Math.max(...us) + Math.min(...us))).toBeLessThan(2.5);
    expect([...spreadBoard([...items].reverse())].sort()).toEqual([...spots].sort());
  });

  it('copes with nothing, one structure and bad sizes', () => {
    expect(spreadBoard([]).size).toBe(0);
    expect(spreadBoard([item('only', 3, 4)]).get('only')).toEqual({ u: 0, v: 0 });
    expect(spreadBoard([item('bad', Number.NaN, 1), item('good', 1, 1)]).has('bad')).toBe(false);
  });
});
