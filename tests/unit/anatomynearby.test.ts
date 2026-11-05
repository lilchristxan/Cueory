import { describe, expect, it } from 'vitest';
import { boxCenter, boxesFromMeshes, expandNearby, nearbyStructures, type Bounds } from '../../src/islands/anatomynearby';

/** A unit cube centered at (x, y, z): synthetic test shapes, not anatomy. */
function cube(x: number, y: number, z: number): Bounds {
  return { min: [x - 0.5, y - 0.5, z - 0.5], max: [x + 0.5, y + 0.5, z + 0.5] };
}

const boxes = new Map<string, Bounds>([
  ['center', cube(0, 0, 0)],
  ['far', cube(10, 0, 0)],
  ['near', cube(1, 0, 0)],
  ['mid', cube(0, 3, 0)],
  ['tieA', cube(0, 0, 2)],
  ['tieB', cube(0, 0, -2)],
]);

describe('boxCenter', () => {
  it('is the middle of the box', () => {
    expect(boxCenter({ min: [0, 2, -4], max: [2, 4, 0] })).toEqual([1, 3, -2]);
  });
});

describe('nearbyStructures', () => {
  it('ranks by center distance, nearest first, without the structure itself', () => {
    expect(nearbyStructures(boxes, 'center').map((n) => n.id)).toEqual(['near', 'tieA', 'tieB', 'mid', 'far']);
    expect(nearbyStructures(boxes, 'center')[0]?.distance).toBeCloseTo(1);
  });

  it('keeps insertion order for equal distances, so the list is stable', () => {
    const ids = nearbyStructures(boxes, 'center').map((n) => n.id);
    expect(ids.indexOf('tieA')).toBeLessThan(ids.indexOf('tieB'));
    expect(nearbyStructures(boxes, 'center')).toEqual(nearbyStructures(boxes, 'center'));
  });

  it('respects the limit and defaults to 8', () => {
    expect(nearbyStructures(boxes, 'center', 2).map((n) => n.id)).toEqual(['near', 'tieA']);
    const many = new Map<string, Bounds>();
    for (let i = 0; i <= 12; i++) many.set(`s${i}`, cube(i, 0, 0));
    expect(nearbyStructures(many, 's0')).toHaveLength(8);
    expect(nearbyStructures(boxes, 'center', 0)).toEqual([]);
  });

  it('gives nothing for an unknown id', () => {
    expect(nearbyStructures(boxes, 'ghost')).toEqual([]);
  });

  it('uses the box center, not its corner', () => {
    const skewed = new Map<string, Bounds>([
      ['a', { min: [0, 0, 0], max: [10, 0, 0] }],
      ['b', { min: [5, 1, 0], max: [5, 1, 0] }],
      ['c', { min: [0, 2, 0], max: [0, 2, 0] }],
    ]);
    expect(nearbyStructures(skewed, 'a').map((n) => n.id)).toEqual(['b', 'c']);
  });
});

describe('expandNearby', () => {
  it('reveals the nearby structures without changing the given set', () => {
    const hidden = new Set(['near', 'far', 'mid']);
    const next = expandNearby(hidden, ['near', 'mid', 'not-hidden']);
    expect([...next]).toEqual(['far']);
    expect([...hidden]).toEqual(['near', 'far', 'mid']);
  });

  it('works straight from nearbyStructures', () => {
    const hidden = new Set(['near', 'far', 'mid', 'tieA', 'tieB']);
    const next = expandNearby(
      hidden,
      nearbyStructures(boxes, 'center', 2).map((n) => n.id),
    );
    expect([...next].sort()).toEqual(['far', 'mid', 'tieB']);
  });
});

describe('boxesFromMeshes', () => {
  it('accepts number triples and x/y/z corners (three.js Box3 shape)', () => {
    const result = boxesFromMeshes([
      { id: 'a', box: { min: [0, 0, 0], max: [1, 1, 1] } },
      { id: 'b', box: { min: { x: 2, y: 2, z: 2 }, max: { x: 3, y: 3, z: 3 } } },
    ]);
    expect(result.get('a')).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    expect(result.get('b')).toEqual({ min: [2, 2, 2], max: [3, 3, 3] });
  });

  it('skips empty boxes (Box3 starts at +Infinity/-Infinity) so unloaded structures never rank', () => {
    const result = boxesFromMeshes([
      { id: 'empty', box: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] } },
      { id: 'nan', box: { min: [Number.NaN, 0, 0], max: [1, 1, 1] } },
      { id: 'ok', box: { min: [0, 0, 0], max: [0, 0, 0] } },
    ]);
    expect([...result.keys()]).toEqual(['ok']);
  });
});
