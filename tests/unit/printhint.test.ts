import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHintTimer, HINT_VISIBLE_MS, roomNeeded } from '../../src/islands/printhint';
import { printEventGame, PRINT_EVENT, requestPrint } from '../../src/islands/gameprintevent';

describe('print hint countdown', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('hides at ten seconds, not before', () => {
    const end = vi.fn();
    const timer = createHintTimer(end);
    timer.start();
    vi.advanceTimersByTime(HINT_VISIBLE_MS - 1);
    expect(end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(timer.remaining()).toBe(0);
  });

  it('pauses without losing the time left and resumes with it', () => {
    const end = vi.fn();
    const timer = createHintTimer(end);
    timer.start();
    vi.advanceTimersByTime(4000);
    timer.pause();
    expect(timer.remaining()).toBe(6000);
    vi.advanceTimersByTime(60_000);
    expect(end).not.toHaveBeenCalled();
    timer.resume();
    vi.advanceTimersByTime(5999);
    expect(end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('pause and resume twice in a row do not double count', () => {
    const end = vi.fn();
    const timer = createHintTimer(end);
    timer.start();
    vi.advanceTimersByTime(2000);
    timer.pause(); timer.pause();
    timer.resume(); timer.resume();
    vi.advanceTimersByTime(7999);
    expect(end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('close ends it at once, once, and later calls do nothing', () => {
    const end = vi.fn();
    const timer = createHintTimer(end);
    timer.start();
    timer.close();
    timer.close();
    timer.resume();
    vi.advanceTimersByTime(HINT_VISIBLE_MS * 2);
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe('room under the corner buttons', () => {
  const bubble = { left: 200, right: 380, top: 66, bottom: 136 };
  it('is 0 when nothing is under the bubble', () => {
    expect(roomNeeded(bubble, [{ left: 0, right: 150, top: 60, bottom: 200 }, { left: 250, right: 300, top: 300, bottom: 400 }], 8)).toBe(0);
  });
  it('is how far the board must move down to clear the bubble', () => {
    expect(roomNeeded(bubble, [{ left: 20, right: 370, top: 80, bottom: 500 }], 8)).toBe(136 + 8 - 80);
  });
});

describe('the print event', () => {
  it('carries the game id and ignores malformed events', () => {
    const seen: Event[] = [];
    requestPrint('vialo', { dispatchEvent: (event) => { seen.push(event); return true; } });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.type).toBe(PRINT_EVENT);
    expect(printEventGame(seen[0]!)).toBe('vialo');
    expect(printEventGame(new CustomEvent(PRINT_EVENT, { detail: 5 }))).toBeUndefined();
    expect(printEventGame(new Event(PRINT_EVENT))).toBeUndefined();
  });
});
