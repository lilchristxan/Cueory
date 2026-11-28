import { describe, expect, it } from 'vitest';
import { markdownTable, seededRandom, simulate } from '../../scripts/simulate-module-path';

// A small fixed-seed run on synthetic students; every number is an unverified modelling assumption.
const options = { students: 80, seed: 11 };

describe('module path simulation', () => {
  it('the new rule places fewer levels too high than the old equal-weight rule', () => {
    const old = simulate('old', options);
    const next = simulate('new', options);
    expect(next.placedTooHigh).toBeLessThan(old.placedTooHigh);
    expect(next.shownButNotMasteredAtFinish).toBeLessThan(old.shownButNotMasteredAtFinish);
  });

  it('is deterministic for a fixed seed, and the seed matters', () => {
    expect(simulate('new', options)).toEqual(simulate('new', options));
    expect(simulate('old', options)).toEqual(simulate('old', options));
    expect(simulate('new', { ...options, seed: 12 })).not.toEqual(simulate('new', options));
    expect(seededRandom(5)()).toBe(seededRandom(5)());
  });

  it('prints a table with both rules and never a score or a prediction', () => {
    const table = markdownTable([simulate('old', { students: 20, seed: 1 }), simulate('new', { students: 20, seed: 1 })]);
    expect(table).toContain('Old rule');
    expect(table).toContain('New rule');
    expect(table).not.toMatch(/predict|chance of passing|exam score/i);
  });
});
