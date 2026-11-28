import { describe, expect, it } from 'vitest';
import { barLeft, clampSeconds, clock, defaultSettings, inWords, parseSettings, secondsLeft, serializeSettings, stepSeconds } from '../../src/islands/tachyyymode';

describe('tachyyy mode: the countdown a student sets for each question', () => {
  it('is off until turned on, at 10 seconds', () => {
    expect(defaultSettings).toEqual({ on: false, seconds: 10 });
    expect(parseSettings(null)).toEqual({ on: false, seconds: 10 });
    expect(parseSettings('not json')).toEqual({ on: false, seconds: 10 });
    expect(parseSettings('"text"')).toEqual({ on: false, seconds: 10 });
  });

  it('keeps the time between 5 and 120 seconds on a 5-second grid', () => {
    expect(clampSeconds(1)).toBe(5);
    expect(clampSeconds(999)).toBe(120);
    expect(clampSeconds(12)).toBe(10);
    expect(clampSeconds('20')).toBe(10);
    expect(stepSeconds(10, 1)).toBe(15);
    expect(stepSeconds(5, -1)).toBe(5);
    expect(stepSeconds(120, 1)).toBe(120);
  });

  it('saves and reads back a choice, repairing a bad saved time', () => {
    expect(parseSettings(serializeSettings({ on: true, seconds: 45 }))).toEqual({ on: true, seconds: 45 });
    expect(parseSettings('{"on":true,"seconds":7000}')).toEqual({ on: true, seconds: 120 });
    expect(parseSettings('{"on":"yes","seconds":30}')).toEqual({ on: false, seconds: 30 });
  });

  it('counts down to exactly zero and empties the bar', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
    expect(barLeft(10_000, 0, 10)).toBe(1);
    expect(barLeft(10_000, 5_000, 10)).toBe(0.5);
    expect(barLeft(10_000, 99_000, 10)).toBe(0);
  });

  it('writes the time as a clock and in words', () => {
    expect(clock(6)).toBe('0:06');
    expect(clock(90)).toBe('1:30');
    expect(inWords(10)).toBe('10 seconds');
    expect(inWords(60)).toBe('1 minute');
    expect(inWords(90)).toBe('1 minute 30 seconds');
    expect(inWords(120)).toBe('2 minutes');
  });
});
