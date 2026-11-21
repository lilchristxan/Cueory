import { describe, expect, it } from 'vitest';
import { editItem, readyToPublish, REVIEWERS, setResult, summary, validateRow, type ReviewRow } from '../../src/islands/adminreview';

function sample(result: 'pass' | 'fail' | 'pending' = 'pending'): ReviewRow {
  return {
    version: 2, risk: 'low', publicLabel: 'sample label',
    reviews: Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer, result])) as ReviewRow['reviews'],
  };
}
const fail = (checked: { ok: boolean }) => expect(checked.ok).toBe(false);

describe('admin review row edges', () => {
  it('accepts an empty public label and a null-prototype row', () => {
    expect(validateRow({ ...sample(), publicLabel: '' }).ok).toBe(true);
    const bare = Object.assign(Object.create(null), { ...sample(), reviews: Object.assign(Object.create(null), sample().reviews) });
    expect(validateRow(bare).ok).toBe(true);
  });
  it.each([0, -1, 1.5, Number.NaN, Infinity, '2', null, undefined, Number.MAX_SAFE_INTEGER + 1])(
    'rejects version %s', (version) => {
      fail(validateRow({ ...sample(), version }));
    });
  it('accepts the biggest safe version', () => {
    expect(validateRow({ ...sample(), version: Number.MAX_SAFE_INTEGER }).ok).toBe(true);
  });
  it.each(['High', '', 'critical', 3, null])('rejects risk %j', (risk) => {
    fail(validateRow({ ...sample(), risk }));
  });
  it('rejects reviewer names that only exist on Object.prototype', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const reviews = JSON.parse(JSON.stringify(sample().reviews)) as Record<string, string>;
      Object.defineProperty(reviews, name, { value: 'pass', enumerable: true, configurable: true, writable: true });
      fail(validateRow({ ...sample(), reviews }));
    }
  });
  it('rejects a check with a wrong-case or non-string result', () => {
    for (const bad of ['Pass', 'PASS', true, 1, null, undefined, '']) {
      fail(validateRow({ ...sample(), reviews: { ...sample().reviews, codex: bad } }));
    }
  });
  it('rejects a row missing one reviewer', () => {
    const { christian: _christian, ...rest } = sample().reviews;
    fail(validateRow({ ...sample(), reviews: rest }));
  });
  it('rejects a Map, a class instance and an array as the row or its reviews', () => {
    class Row { version = 1; }
    fail(validateRow(new Map()));
    fail(validateRow(new Row()));
    fail(validateRow({ ...sample(), reviews: [] }));
  });
});

describe('admin review edit edges', () => {
  it('changes only the risk and keeps the label', () => {
    const edited = editItem(sample('pass'), { risk: 'high' });
    expect(edited.ok && edited.row).toMatchObject({ version: 3, risk: 'high', publicLabel: 'sample label' });
  });
  it('rejects an edit that names the version or the reviews', () => {
    fail(editItem(sample(), { version: 9 }));
    fail(editItem(sample(), { reviews: {} }));
  });
  it('rejects a key that is set to undefined for the risk or label', () => {
    fail(editItem(sample(), { risk: undefined }));
    fail(editItem(sample(), { publicLabel: undefined }));
  });
  it.each([null, undefined, [], 'text', 5])('rejects changes %j', (changes) => {
    fail(editItem(sample(), changes));
  });
  it('does not edit a bad row, and reports the row problem first', () => {
    const result = editItem({ ...sample(), version: 0 }, { bogus: 1 });
    expect(!result.ok && result.message).toMatch(/version/);
  });
  it('leaves its inputs untouched', () => {
    const row = sample('pass');
    const copy = structuredClone(row);
    const changes = { publicLabel: 'new' };
    editItem(row, changes);
    expect(row).toEqual(copy);
    expect(changes).toEqual({ publicLabel: 'new' });
  });
});

describe('admin review result edges', () => {
  it('changes only the named reviewer and returns fresh objects', () => {
    const row = sample();
    const result = setResult(row, 'codex', 'pass', 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.reviews.codex).toBe('pass');
    expect(REVIEWERS.filter((name) => result.row.reviews[name] !== 'pending')).toEqual(['codex']);
    expect(row.reviews.codex).toBe('pending');
    expect(result.row.reviews).not.toBe(row.reviews);
  });
  it('lets a reviewer change a result back to pending', () => {
    const result = setResult(sample('pass'), 'gpt1', 'pending', 2);
    expect(result.ok && result.row.reviews.gpt1).toBe('pending');
  });
  it.each(['constructor', 'Codex', '', 5, null, undefined])('rejects reviewer %j', (reviewer) => {
    fail(setResult(sample(), reviewer, 'pass', 2));
  });
  it.each([2.0000001, '2', 0, null])('rejects version %j', (version) => {
    fail(setResult(sample(), 'codex', 'pass', version));
  });
  it('rejects a result for a different version, older or newer', () => {
    fail(setResult(sample(), 'codex', 'pass', 1));
    fail(setResult(sample(), 'codex', 'pass', 3));
  });
});

describe('admin review publish and summary edges', () => {
  it('is not ready when one reviewer is pending or failed, or the row is bad', () => {
    for (const bad of ['pending', 'fail'] as const) {
      const row = sample('pass');
      row.reviews.christian = bad;
      expect(readyToPublish(row)).toBe(false);
    }
    expect(readyToPublish(null)).toBe(false);
    expect(readyToPublish(undefined)).toBe(false);
    expect(readyToPublish({})).toBe(false);
  });
  it('is ready only when all eight pass', () => {
    expect(readyToPublish(sample('pass'))).toBe(true);
  });
  it('summarizes an empty list as zeros', () => {
    expect(summary([])).toBe('0 ready, 0 waiting on reviews, 0 failed');
  });
  it('counts a mix of rows once each', () => {
    const waiting = sample();
    const mixed = sample('pass');
    mixed.reviews.gpt2 = 'fail';
    mixed.reviews.gpt3 = 'pending';
    expect(summary([sample('pass'), waiting, mixed, sample('fail')])).toBe('1 ready, 1 waiting on reviews, 2 failed');
  });
  it('names the first bad row by its number, even after good rows', () => {
    expect(summary([sample('pass'), sample(), { version: 0 }])).toMatch(/^row 3: /);
  });
  it('reports a hole in a sparse list as a bad row', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(summary([sample(), , sample()])).toMatch(/^row 2: /);
  });
  it.each([null, undefined, {}, 'rows', 5])('says to use a list for %j', (input) => {
    expect(summary(input)).toBe('use a list of review rows.');
  });
});
