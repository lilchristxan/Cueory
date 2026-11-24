import { describe, expect, it } from 'vitest';
import { dueItems, syntheticHistory, type ReviewStateRow } from '../../src/islands/reviewqueue';

const row = (item_id: string, next_review: string, last_reviewed = '2026-01-01', level: ReviewStateRow['level'] = 1): ReviewStateRow =>
  ({ item_id, level, last_reviewed, next_review });
const bad = (value: unknown) => value as ReviewStateRow;

describe('dueItems edges', () => {
  it('reports the index of the failing row, not the first row', () => {
    const rows = [row('a', '2026-02-01'), row('b', '2026-02-01'), row('', '2026-02-01')];
    expect(() => dueItems(rows, '2026-03-01')).toThrow('Row 2: item_id must be a nonempty string.');
  });

  it.each([null, undefined, 'row', 7])('rejects a non-object row (%j) with its position', (value) => {
    expect(() => dueItems([row('a', '2026-02-01'), bad(value)], '2026-03-01')).toThrow('Row 1: must be an object.');
  });

  it('rejects an item_id that is not a string', () => {
    expect(() => dueItems([bad({ ...row('a', '2026-02-01'), item_id: 12 })], '2026-03-01')).toThrow('item_id must be a nonempty string');
  });

  it.each(['1', 4, -1, 1.5, null])('rejects level %j', (level) => {
    expect(() => dueItems([bad({ ...row('a', '2026-02-01'), level })], '2026-03-01')).toThrow('level must be 0, 1, 2 or 3');
  });

  it('validates rows that are not due yet too, so a bad future row still fails', () => {
    expect(() => dueItems([row('a', '2030-13-01')], '2026-03-01')).toThrow('next_review must be a real calendar day');
  });

  it('rejects a today with a trailing time or whitespace', () => {
    expect(() => dueItems([], '2026-03-01T00:00')).toThrow('today must be a real calendar day');
    expect(() => dueItems([], ' 2026-03-01')).toThrow('today must be a real calendar day');
  });

  it('puts an earlier next_review first even when its item_id sorts later', () => {
    const rows = [row('a', '2026-02-05'), row('z', '2026-02-01'), row('m', '2026-02-01')];
    expect(dueItems(rows, '2026-03-01')).toEqual(['m', 'z', 'a']);
  });

  it('orders across a year boundary by date, not by item_id', () => {
    const rows = [row('a', '2027-01-02', '2026-12-30'), row('b', '2026-12-31', '2026-12-30')];
    expect(dueItems(rows, '2027-01-02')).toEqual(['b', 'a']);
  });

  it('does not change the rows it was given', () => {
    const rows = Object.freeze([Object.freeze(row('b', '2026-02-02')), Object.freeze(row('a', '2026-02-01'))]);
    expect(dueItems(rows, '2026-03-01')).toEqual(['a', 'b']);
    expect(rows.map((r) => r.item_id)).toEqual(['b', 'a']);
  });

  it('treats item ids that differ only by case as different items', () => {
    expect(dueItems([row('Card', '2026-02-01'), row('card', '2026-02-01')], '2026-02-01')).toEqual(['Card', 'card']);
  });
});

describe('syntheticHistory edges', () => {
  it('returns a fresh array each call', () => {
    const r = row('a', '2026-02-01', '2026-01-01', 2);
    const first = syntheticHistory(r);
    first.pop();
    expect(syntheticHistory(r)).toHaveLength(2);
  });

  it('reports row 0 for an invalid row', () => {
    expect(() => syntheticHistory(bad(null))).toThrow('Row 0: must be an object.');
    expect(() => syntheticHistory(row('a', '2026-01-01', '2026-01-01'))).toThrow('Row 0: next_review must be after last_reviewed.');
  });
});
