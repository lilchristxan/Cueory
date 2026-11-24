import { describe, expect, it } from 'vitest';
import { MAX_DAYS_AHEAD, SETUP_DATE_MESSAGES, setupDateProblem } from '../../src/islands/setupdate';

const today = '2026-11-17';
const check = (value: string, extra: Partial<Parameters<typeof setupDateProblem>[0]> = {}) =>
  setupDateProblem({ value, unfinished: false, typed: true, today, ...extra });

describe('setupDateProblem (lane 2)', () => {
  it('accepts a blank date: the question is optional', () => {
    expect(check('')).toBeNull();
  });

  it('accepts today, tomorrow and exactly two years ahead', () => {
    expect(check(today)).toBeNull();
    expect(check('2026-11-18')).toBeNull();
    expect(check('2028-11-16')).toBeNull(); // 730 days: 2028 is a leap year
  });

  it('refuses a date that has passed, even yesterday', () => {
    expect(check('2026-11-16')).toBe(SETUP_DATE_MESSAGES.past);
    expect(check('2020-01-01')).toBe(SETUP_DATE_MESSAGES.past);
  });

  it('refuses a date more than two years ahead', () => {
    expect(check('2028-11-17')).toBe(SETUP_DATE_MESSAGES.tooFar);
    expect(check('2099-01-01')).toBe(SETUP_DATE_MESSAGES.tooFar);
    expect(MAX_DAYS_AHEAD).toBe(730);
  });

  it('refuses an unfinished date the field shows as blank', () => {
    expect(check('', { unfinished: true })).toBe(SETUP_DATE_MESSAGES.incomplete);
    expect(check('2027-01-10', { unfinished: true })).toBe(SETUP_DATE_MESSAGES.incomplete);
  });

  it('refuses something that is not a real date', () => {
    expect(check('2027-02-30')).toBe(SETUP_DATE_MESSAGES.invalid);
    expect(check('next week')).toBe(SETUP_DATE_MESSAGES.invalid);
  });

  it('leaves a saved date the student did not touch alone, even if it has passed', () => {
    expect(check('2026-11-16', { typed: false })).toBeNull();
    expect(check('2030-01-01', { typed: false })).toBeNull();
    expect(check('2027-02-30', { typed: false })).toBe(SETUP_DATE_MESSAGES.invalid);
  });

  it("doesn't block the student when the device's date can't be read", () => {
    expect(check('2027-01-10', { today: 'not a day' })).toBeNull();
  });

  it('every message is one plain lowercase sentence that says what to do', () => {
    for (const message of Object.values(SETUP_DATE_MESSAGES)) {
      expect(message).toMatch(/^[a-z][^A-Z]*\.$/);
      expect(message).toMatch(/pick|use|finish/);
    }
  });
});
