import { describe, expect, it } from 'vitest';
import { markdownTable, seededRandom, simulate, type Count } from '../../scripts/simulate-module-path';

// A small fixed-seed run on synthetic students; every number is an unverified modelling assumption.
const options = { students: 40, seed: 11, stepCap: 150 };
const share = ({ n, of }: Count): number => (of === 0 ? 0 : n / of);

describe('module path simulation', () => {
  const old = simulate('old', options);
  const next = simulate('new', options);

  it('the new rule marks fewer levels shown that the student has not mastered than the old equal-weight rule', () => {
    expect(old.placedTooHigh.of).toBeGreaterThan(0);
    expect(share(next.placedTooHigh)).toBeLessThan(share(old.placedTooHigh));
    expect(share(next.finalTooHigh)).toBeLessThan(share(old.finalTooHigh));
  });

  it('measures the diagnostic right after it ends, with denominators, and at the moment of readiness', () => {
    for (const report of [old, next]) {
      // Both gate levels of every concept are counted after the diagnostic: 6 concepts, 2 levels.
      expect(report.diagnosticTooLow.of).toBe(report.diagnosticMasteredAtGap.of);
      expect(report.diagnosticTooHigh.of).toBeLessThanOrEqual(options.students * 12);
      // The authored diagnostic asks one understand item per concept and one follow-up after a right answer: 6 to 12.
      expect(report.diagnosticItems).toBeGreaterThanOrEqual(6);
      expect(report.diagnosticItems).toBeLessThanOrEqual(12);
      expect(report.diagnosticDevelopingTooHigh.n).toBeLessThanOrEqual(report.diagnosticDevelopingTooHigh.of);
      expect(report.falselyReady.of).toBe(options.students - report.neverDone.n);
    }
    // The old rule declares students ready who have not mastered every level; the new rule is stricter.
    expect(old.falselyReady.n).toBeGreaterThan(0);
    expect(share(next.falselyReady)).toBeLessThan(share(old.falselyReady));
    expect(next.falselyReady.of).toBeGreaterThan(0); // there are readiness decisions to measure
  });

  it('some prepared students are ready from the diagnostic alone, and almost none of the others are', () => {
    expect(next.preparedSkipped.of).toBeGreaterThan(0);
    expect(next.preparedSkipped.n).toBeGreaterThan(0);
    expect(old.preparedSkipped.n).toBe(0); // the old rule has no fast track
    expect(next.falselyReadyAtDiagnostic.n).toBeLessThanOrEqual(1);
  });

  it('is deterministic for a fixed seed, and the seed matters', () => {
    expect(simulate('new', options)).toEqual(next);
    expect(simulate('old', options)).toEqual(old);
    expect(simulate('new', { ...options, seed: 12 })).not.toEqual(next);
    expect(seededRandom(5)()).toBe(seededRandom(5)());
  });

  it('prints a table with all rules and never a score or a prediction', () => {
    const table = markdownTable([old, next, simulate('new', { ...options, retention: false })]);
    expect(table).toContain('Old rule');
    expect(table).toContain('New rule, no retention drop');
    expect(table).toContain('At the moment of "ready"');
    expect(table).not.toMatch(/predict|chance of passing|exam score/i);
  });
});
