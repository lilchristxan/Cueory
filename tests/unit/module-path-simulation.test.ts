import { describe, expect, it } from 'vitest';
import { markdownTable, seededRandom, simulate, type Count } from '../../scripts/simulate-module-path';

// A small fixed-seed run on synthetic students; every number is an unverified modelling assumption.
const options = { students: 40, seed: 11, stepCap: 150 };
const share = ({ n, of }: Count): number => (of === 0 ? 0 : n / of);

describe('module path simulation', () => {
  const old = simulate('old', options);
  const next = simulate('new', options);
  const fast = simulate('new', { ...options, fastTrack: true });

  it('the new rule marks fewer levels shown that the student has not mastered than the old equal-weight rule', () => {
    expect(old.placedTooHigh.of).toBeGreaterThan(0);
    expect(share(next.placedTooHigh)).toBeLessThan(share(old.placedTooHigh));
    expect(share(next.finalTooHigh)).toBeLessThan(share(old.finalTooHigh));
  });

  it('measures the diagnostic right after it ends, with denominators, and at the moment of readiness', () => {
    for (const report of [old, next, fast]) {
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
    expect(fast.falselyReady.of).toBeGreaterThan(0); // there are readiness decisions to measure
    expect(share(fast.falselyReady)).toBeLessThan(share(old.falselyReady));
    expect(share(next.falselyReady)).toBeLessThanOrEqual(share(old.falselyReady));
  });

  it('some prepared students are ready from the diagnostic alone, and almost none of the others are', () => {
    expect(fast.preparedSkipped.of).toBeGreaterThan(0);
    expect(fast.preparedSkipped.n).toBeGreaterThan(0);
    expect(old.preparedSkipped.n).toBe(0); // the old rule has no fast track
    expect(next.preparedSkipped.n).toBe(0); // and it is off by default
    expect(fast.falselyReadyAtDiagnostic.n).toBeLessThanOrEqual(1);
  });

  it('counts mastery at exit, and readiness among learners who acquire mastery during practice, with denominators', () => {
    for (const report of [old, next, fast]) {
      expect(report.masteredAtExit.of).toBe(options.students);
      expect(report.masteredAtExitDone.of).toBe(report.masteredAtExit.n);
      expect(report.acquiredDone.of).toBeLessThanOrEqual(report.masteredAtExit.n);
      expect(report.masteredAtExitDone.n).toBeLessThanOrEqual(report.masteredAtExit.n);
      expect(report.preparedDone.of).toBeLessThanOrEqual(report.masteredAtExit.n + report.preparedDone.of);
    }
  });

  it('learners who acquire mastery are those not mastered at the end of the diagnostic: none when no practice is allowed', () => {
    const none = simulate('new', { ...options, stepCap: 0 });
    // Mastery at exit equals mastery after the diagnostic when there is no practice, so nobody acquires it.
    expect(none.acquiredDone.of).toBe(0);
    expect(none.masteredAtExit.n).toBeGreaterThan(0);
  });

  it('is deterministic for a fixed seed, and the seed matters', () => {
    expect(simulate('new', options)).toEqual(next);
    expect(simulate('new', { ...options, fastTrack: true })).toEqual(fast);
    expect(simulate('old', options)).toEqual(old);
    expect(simulate('new', { ...options, seed: 12 })).not.toEqual(next);
    expect(seededRandom(5)()).toBe(seededRandom(5)());
  });

  it('prints a table with all rules and never a score or a prediction', () => {
    const table = markdownTable([old, next, fast]);
    expect(table).toContain('Old rule');
    expect(table).toContain('fast track off');
    expect(table).toContain('fast track on');
    expect(table).toContain('acquired during practice');
    expect(table).toContain('At the moment of "ready"');
    expect(table).not.toMatch(/predict|chance of passing|exam score/i);
  });
});
