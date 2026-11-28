import { describe, expect, it, vi } from 'vitest';
import { createStudyEventQueue, STUDY_EVENT_RATE_LIMIT_MS, type StudyEventSender } from '../../src/scripts/studyeventqueue';

const ITEM = '00000000-0000-4000-8000-0000000000e1';
const VERSION = '00000000-0000-4000-8000-0000000000f1';
const START = Date.parse('2026-11-02T12:00:00.000Z');
const MINUTE = 60_000;

function fixture(send: StudyEventSender = async (events) => events.length) {
  let wall = START;
  let ticks = 0;
  const queue = createStudyEventQueue({ send, now: () => wall, elapsedNow: () => ticks });
  return {
    queue,
    setWall(value: number) { wall = value; },
    setTicks(value: number) { ticks = value; },
    advance(ms: number) { wall += ms; ticks += ms; },
    begin() { expect(queue.beginItem(ITEM, VERSION)).toBe(true); },
  };
}

describe('study event queue edges', () => {
  it('does not record before an item begins or after it ends', () => {
    const f = fixture();
    expect(f.queue.record('answered')).toBeNull();
    f.begin();
    expect(f.queue.record('answered')).not.toBeNull();
    f.queue.endItem();
    expect(f.queue.record('skipped')).toBeNull();
    expect(f.queue.state().pending).toBe(1);
  });

  it('refuses an event when the wall clock has gone back more than five minutes behind the last event', () => {
    const f = fixture();
    f.begin();
    expect(f.queue.record('answered')).not.toBeNull();
    f.setWall(START - 6 * MINUTE);
    expect(f.queue.record('skipped')).toBeNull();
    expect(f.queue.state().pending).toBe(1);
  });

  it('still orders an event after a small clock step back, one millisecond after the last one', () => {
    const f = fixture();
    f.begin();
    const first = f.queue.record('answered')!;
    f.setWall(START - MINUTE);
    const second = f.queue.record('skipped')!;
    expect(Date.parse(second.at)).toBe(Date.parse(first.at) + 1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])('refuses to record with an unusable wall clock %s', (wall) => {
    const f = fixture();
    f.begin();
    f.setWall(wall);
    expect(f.queue.record('answered')).toBeNull();
  });

  it('refuses to begin an item, and records nothing, when the monotonic clock is not finite', () => {
    const f = fixture();
    f.setTicks(Number.NaN);
    expect(f.queue.beginItem(ITEM, VERSION)).toBe(false);
    expect(f.queue.record('answered')).toBeNull();
  });

  it('ignores a visibility change whose clock reading is not finite', () => {
    const f = fixture();
    f.begin();
    f.advance(1000);
    f.setTicks(Number.NaN);
    f.queue.setVisible(false);
    f.setTicks(5000);
    // still treated as visible, so time since the item began counts
    expect(f.queue.record('answered')!.ms_on_item).toBe(5000);
  });

  it('treats an RPC result larger than the batch as a failure and keeps the events', async () => {
    const f = fixture(async (events) => events.length + 1);
    f.begin();
    f.queue.record('answered');
    const result = await f.queue.flush();
    expect(result).toMatchObject({ status: 'retry', delivered: 0, pending: 1, nextRetryAt: START + 1_000 });
  });

  it('does not call the sender again until the retry time, then succeeds and clears the retry state', async () => {
    const send = vi.fn<StudyEventSender>().mockRejectedValueOnce(new Error('network down')).mockImplementation(async (events) => events.length);
    const f = fixture(send);
    f.begin();
    f.queue.record('answered');
    await f.queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
    f.advance(999);
    expect(await f.queue.flush()).toMatchObject({ status: 'retry', nextRetryAt: START + 1_000 });
    expect(send).toHaveBeenCalledTimes(1);
    f.advance(1);
    expect(await f.queue.flush()).toEqual({ status: 'complete', delivered: 1, dropped: 0, pending: 0, nextRetryAt: null });
    expect(f.queue.state().nextRetryAt).toBeNull();
  });

  it('reports idle for an empty queue without calling the sender', async () => {
    const send = vi.fn<StudyEventSender>(async (events) => events.length);
    const f = fixture(send);
    expect(await f.queue.flush()).toEqual({ status: 'idle', delivered: 0, dropped: 0, pending: 0, nextRetryAt: null });
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the rate-limit wait even when another flush is asked for sooner', async () => {
    const send = vi.fn<StudyEventSender>().mockRejectedValue(new Error('too many study events recorded recently; try again later'));
    const f = fixture(send);
    f.begin();
    f.queue.record('answered');
    await f.queue.flush();
    f.advance(STUDY_EVENT_RATE_LIMIT_MS - 1);
    expect((await f.queue.flush()).status).toBe('retry');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('treats a thrown string like an error message, and an unreadable thrown value as a plain retry', async () => {
    const f = fixture(async () => { throw 'a study event has the wrong shape'; });
    f.begin();
    f.queue.record('answered');
    expect(await f.queue.flush()).toMatchObject({ status: 'dropped', dropped: 1, pending: 0 });
    const g = fixture(async () => { throw null; });
    g.begin();
    g.queue.record('answered');
    expect(await g.queue.flush()).toMatchObject({ status: 'retry', pending: 1 });
  });

  it('disables everything after sign-out, including beginning an item and flushing', async () => {
    const f = fixture();
    f.begin();
    f.queue.record('answered');
    f.queue.signOut();
    expect(f.queue.beginItem(ITEM, VERSION)).toBe(false);
    expect(f.queue.record('answered')).toBeNull();
    expect(await f.queue.flush()).toMatchObject({ status: 'signed-out', pending: 0 });
    f.queue.setVisible(false);
    expect(f.queue.state()).toEqual({ pending: 0, nextRetryAt: null, signedOut: true });
  });
});
