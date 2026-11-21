import { describe, expect, it } from 'vitest';
import {
  WORKSHEET_MAX,
  worksheetBlockReason,
  worksheetFileName,
  worksheetLabels,
  worksheetLeftOutNote,
  worksheetOrder,
  worksheetRows,
} from '../../src/islands/anatomyworksheet';

describe('worksheet block reason edges', () => {
  it('blocks zero and negative counts, and allows exactly the limit', () => {
    expect(worksheetBlockReason(0)).toMatch(/at least one/);
    expect(worksheetBlockReason(-3)).toMatch(/at least one/);
    expect(worksheetBlockReason(1)).toBeNull();
    expect(worksheetBlockReason(WORKSHEET_MAX)).toBeNull();
    expect(worksheetBlockReason(WORKSHEET_MAX + 1)).toContain(String(WORKSHEET_MAX + 1));
  });
  it('uses a custom limit in the message', () => {
    expect(worksheetBlockReason(5, 4)).toContain('up to 4 structures and 5 are showing');
    expect(worksheetBlockReason(4, 4)).toBeNull();
  });
});

describe('worksheet order edges', () => {
  it('returns an empty list for no ids', () => {
    expect(worksheetOrder([], [{ id: 'a', x: 0, y: 0 }])).toEqual([]);
  });
  it('ignores points for ids that were not asked for', () => {
    expect(worksheetOrder(['a'], [{ id: 'a', x: 1, y: 1 }, { id: 'z', x: 0, y: 0 }])).toEqual(['a']);
  });
  it('keeps the given order when nothing can be placed', () => {
    expect(worksheetOrder(['c', 'a', 'b'], [])).toEqual(['c', 'a', 'b']);
  });
  it('puts two points exactly the tolerance apart in one row, and one pixel further in the next', () => {
    const same = worksheetOrder(['a', 'b'], [{ id: 'a', x: 50, y: 0 }, { id: 'b', x: 10, y: 12 }]);
    expect(same).toEqual(['b', 'a']);
    const next = worksheetOrder(['a', 'b'], [{ id: 'a', x: 50, y: 0 }, { id: 'b', x: 10, y: 13 }]);
    expect(next).toEqual(['a', 'b']);
  });
  it('honors a custom row tolerance, including zero', () => {
    const points = [{ id: 'a', x: 50, y: 0 }, { id: 'b', x: 10, y: 1 }];
    expect(worksheetOrder(['a', 'b'], points, 0)).toEqual(['a', 'b']);
    expect(worksheetOrder(['a', 'b'], points, 5)).toEqual(['b', 'a']);
  });
  it('measures a row from its top point, so a long slope starts a new row', () => {
    const points = [
      { id: 'a', x: 90, y: 0 }, { id: 'b', x: 50, y: 10 }, { id: 'c', x: 10, y: 20 },
    ];
    expect(worksheetOrder(['a', 'b', 'c'], points)).toEqual(['b', 'a', 'c']);
  });
  it('does not change the input arrays', () => {
    const ids = ['b', 'a'];
    const points = [{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 0, y: 1 }];
    const copyIds = [...ids];
    const copyPoints = structuredClone(points);
    worksheetOrder(ids, points);
    expect(ids).toEqual(copyIds);
    expect(points).toEqual(copyPoints);
  });
  it('treats negative and fractional positions normally', () => {
    const points = [{ id: 'a', x: 0.5, y: -20 }, { id: 'b', x: -5, y: -20 }, { id: 'c', x: 0, y: 30 }];
    expect(worksheetOrder(['c', 'a', 'b'], points)).toEqual(['b', 'a', 'c']);
  });
});

describe('worksheet labels, rows and note edges', () => {
  it('gives no labels or rows for an empty order', () => {
    expect(worksheetLabels([])).toEqual([]);
    expect(worksheetRows([], [], new Map())).toEqual([]);
    expect(worksheetLeftOutNote([], [])).toBe('');
  });
  it('numbers labels from 1 in order', () => {
    expect(worksheetLabels(['x', 'y'])).toEqual([{ id: 'x', text: '1' }, { id: 'y', text: '2' }]);
  });
  it('keeps original numbers when a middle one is left out', () => {
    const rows = worksheetRows(['a', 'b', 'c'], ['b'], new Map([['a', 'A'], ['c', 'C']]));
    expect(rows).toEqual([{ number: 1, id: 'a', name: 'A' }, { number: 3, id: 'c', name: 'C' }]);
  });
  it('ignores left-out ids that are not in the order', () => {
    expect(worksheetRows(['a'], ['zzz'], new Map())).toEqual([{ number: 1, id: 'a', name: 'a' }]);
    expect(worksheetLeftOutNote(['a'], ['zzz'])).toBe('');
  });
  it('lists every missing number in one note, in picture order', () => {
    const note = worksheetLeftOutNote(['a', 'b', 'c', 'd'], ['d', 'b']);
    expect(note).toContain('number 2, 4');
    expect(note).toMatch(/^no room in the picture/);
  });
  it('leaves everything out without producing rows', () => {
    expect(worksheetRows(['a', 'b'], ['a', 'b'], new Map())).toEqual([]);
  });
});

describe('worksheet file name edges', () => {
  it.each([
    ['', 'cueory-anatomy-worksheet.png'],
    ['---', 'cueory-anatomy-worksheet.png'],
    ['  Some System!  ', 'cueory-some-system-worksheet.png'],
    ['a/b\\c..d', 'cueory-a-b-c-d-worksheet.png'],
    ['UPPER_case', 'cueory-upper-case-worksheet.png'],
    ['é', 'cueory-anatomy-worksheet.png'],
  ])('turns %j into %s', (key, expected) => {
    expect(worksheetFileName(key)).toBe(expected);
  });
  it('cuts long keys at 60 characters', () => {
    expect(worksheetFileName('a'.repeat(100))).toBe(`cueory-${'a'.repeat(60)}-worksheet.png`);
  });
});
