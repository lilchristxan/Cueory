import { describe, expect, it } from 'vitest';
import { dailyLine, dailyLineFromClock, msUntilLocalMidnight, MIDNIGHT_MESSAGE } from '../../src/islands/dailyline';

describe('home daily games device-local date (W01-2)', () => {
  it('changes its displayed day exactly at local midnight', () => {
    const before = new Date(2026, 10, 11, 23, 59, 59, 999);
    const after = new Date(2026, 10, 12, 0, 0, 0);
    expect(dailyLine(before)).toContain('wed 11 nov');
    expect(dailyLine(after)).toContain('thu 12 nov');
    expect(msUntilLocalMidnight(before)).toBe(1);
    expect(msUntilLocalMidnight(after)).toBe(24 * 60 * 60 * 1000);
    expect(dailyLine(after)).toContain(MIDNIGHT_MESSAGE);
    expect(MIDNIGHT_MESSAGE).toBe('the date changes at midnight on your device. some sample puzzles repeat.');
    expect(MIDNIGHT_MESSAGE).not.toContain('new puzzles arrive');
  });

  it('uses local midnight on daylight-saving transitions, rather than adding 24 hours', () => {
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(msUntilLocalMidnight(new Date(2026, 2, 8, 0, 0))).toBe(23 * 60 * 60 * 1000);
      expect(msUntilLocalMidnight(new Date(2026, 10, 1, 0, 0))).toBe(25 * 60 * 60 * 1000);
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    }
  });

  it('does not schedule an overflowing timer for a clock in years 1–99', () => {
    for (const year of [1, 25, 99]) {
      const historical = new Date(0);
      historical.setFullYear(year, 4, 6);
      historical.setHours(12, 0, 0, 0);
      const before = historical.getTime();
      expect(historical.getFullYear()).toBe(year);
      expect(msUntilLocalMidnight(historical)).toBe(12 * 60 * 60 * 1000);
      expect(historical.getTime()).toBe(before);
    }
  });

  it('leaves a truthful fallback on invalid or blocked clocks', () => {
    expect(dailyLine(null)).toBe("your device's date is unavailable. " + MIDNIGHT_MESSAGE);
    expect(dailyLine(new Date(Number.NaN))).toBe("your device's date is unavailable. " + MIDNIGHT_MESSAGE);
    expect(dailyLineFromClock(() => { throw new Error('clock blocked'); })).toBe("your device's date is unavailable. " + MIDNIGHT_MESSAGE);
    expect(msUntilLocalMidnight(new Date(Number.NaN))).toBeNull();
    expect(msUntilLocalMidnight(null)).toBeNull();
    // A Date may have an unreadable method (for example a blocked/proxied clock).
    // Both helpers must return their truthful fallback instead of escaping the error.
    const blocked = new Date(2026, 10, 11);
    Object.defineProperty(blocked, 'getTime', { value: () => { throw new Error('date read blocked'); } });
    expect(dailyLine(blocked)).toBe("your device's date is unavailable. " + MIDNIGHT_MESSAGE);
    expect(msUntilLocalMidnight(blocked)).toBeNull();
  });
});
