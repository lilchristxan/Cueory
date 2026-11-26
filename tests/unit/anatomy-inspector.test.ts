import { describe, expect, it } from 'vitest';
import { groupIndex, indexHeading, indexStep, inspectorRows, leaderSegment } from '../../src/islands/anatomyinspector';

// Names here are made-up test labels, not anatomy.
const structures = [
  { id: 'T1', text: 'test shape one', group: 'set a' },
  { id: 'T2', text: 'test shape two', group: 'set a' },
  { id: 'T3', text: 'test shape three', group: 'set b' },
  { id: 'T4', text: 'test shape four' },
];

describe('inspectorRows', () => {
  it('gives system, group, dataset and source id, in that order', () => {
    expect(inspectorRows({ id: 'T1', group: 'set a', layer: 'skeleton' }, 'test system', 'release 1', 'set a')).toEqual([
      { label: 'system', value: 'skeleton' },
      { label: 'group', value: 'set a' },
      { label: 'dataset', value: 'release 1' },
      { label: 'source id', value: 'T1' },
    ]);
  });
  it('falls back to the body system title when the source gives no layer', () => {
    expect(inspectorRows({ id: 'T1' }, 'test system', 'release 1', undefined)[0]).toEqual({ label: 'system', value: 'test system' });
  });
  it('leaves out a group or dataset that is not there', () => {
    expect(inspectorRows({ id: 'T4' }, 'test system', undefined, undefined).map((row) => row.label)).toEqual(['system', 'source id']);
  });
  it('shows the group it is given, not always the structure\'s own', () => {
    expect(inspectorRows({ id: 'T1', group: 'set a' }, 's', 'r', undefined).some((row) => row.label === 'group')).toBe(false);
  });
});

describe('groupIndex', () => {
  it('lists the structures that share the selected one\'s group, in source order, with their ids', () => {
    const index = groupIndex(structures, 'T1', 'set a')!;
    expect(index.items).toEqual([{ id: 'T1', text: 'test shape one' }, { id: 'T2', text: 'test shape two' }]);
    expect(indexHeading(index)).toBe('index · set a · 2 structures');
  });
  it('says "1 structure" for a group of one', () => {
    expect(indexHeading(groupIndex(structures, 'T3', 'set b')!)).toBe('index · set b · 1 structure');
  });
  it('is null with no group or an unknown selection', () => {
    expect(groupIndex(structures, 'T4', undefined)).toBeNull();
    expect(groupIndex(structures, 'nope', 'set a')).toBeNull();
  });
  it('can be limited to one hierarchy tree', () => {
    const index = groupIndex(structures, 'T1', 'set a', (structure) => structure.id !== 'T2')!;
    expect(index.items.map((item) => item.id)).toEqual(['T1']);
  });
});

describe('indexStep (keyboard through the index)', () => {
  it('steps one row with the arrows and stops at the ends', () => {
    expect(indexStep('ArrowDown', 0, 3)).toBe(1);
    expect(indexStep('ArrowUp', 2, 3)).toBe(1);
    expect(indexStep('ArrowDown', 2, 3)).toBeNull();
    expect(indexStep('ArrowUp', 0, 3)).toBeNull();
  });
  it('jumps to the ends with Home and End', () => {
    expect(indexStep('Home', 2, 3)).toBe(0);
    expect(indexStep('End', 0, 3)).toBe(2);
    expect(indexStep('End', 2, 3)).toBeNull();
  });
  it('ignores other keys and an empty list', () => {
    expect(indexStep('Enter', 0, 3)).toBeNull();
    expect(indexStep('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('leaderSegment', () => {
  it('starts on the ring\'s edge facing the card and ends at the card', () => {
    expect(leaderSegment({ x: 0, y: 0 }, 10, { x: 100, y: 0 })).toEqual({ x1: 10, y1: 0, x2: 100, y2: 0 });
    const diagonal = leaderSegment({ x: 0, y: 0 }, 5, { x: 30, y: 40 })!;
    expect(diagonal.x1).toBeCloseTo(3);
    expect(diagonal.y1).toBeCloseTo(4);
  });
  it('draws nothing when the card is inside the ring', () => {
    expect(leaderSegment({ x: 0, y: 0 }, 10, { x: 3, y: 4 })).toBeNull();
  });
});
