import { describe, expect, it } from 'vitest';
import { newTimer, pauseTimer, resumeTimer, startTimer, stopTimer, timerElapsed } from '../../src/islands/vialotimer';

describe('the solve timer', () => {
  it('does not count before the first letter', () => {
    expect(timerElapsed(newTimer(), 5_000)).toBe(0);
  });

  it('counts from the first letter and starts only once', () => {
    const a = startTimer(newTimer(), 1_000, true);
    expect(startTimer(a, 9_000, true)).toBe(a);
    expect(timerElapsed(a, 43_000)).toBe(42_000);
  });

  it('does not count while the tab is hidden', () => {
    let t = startTimer(newTimer(), 0, true);
    t = pauseTimer(t, 10_000);
    expect(timerElapsed(t, 100_000)).toBe(10_000);
    t = resumeTimer(t, 100_000);
    expect(timerElapsed(t, 115_000)).toBe(25_000);
  });

  it('can start in a hidden tab and waits for the tab to show', () => {
    let t = startTimer(newTimer(), 0, false);
    expect(timerElapsed(t, 50_000)).toBe(0);
    t = resumeTimer(t, 60_000);
    expect(timerElapsed(t, 65_000)).toBe(5_000);
  });

  it('stops for good at the final guess', () => {
    let t = startTimer(newTimer(), 0, true);
    t = stopTimer(t, 30_000);
    expect(timerElapsed(t, 90_000)).toBe(30_000);
    expect(resumeTimer(t, 95_000)).toBe(t);
    expect(startTimer(t, 96_000, true)).toBe(t);
  });

  it('ignores a resume or pause that does not apply', () => {
    const idle = newTimer();
    expect(resumeTimer(idle, 5)).toBe(idle);
    expect(pauseTimer(idle, 5)).toBe(idle);
  });
});
