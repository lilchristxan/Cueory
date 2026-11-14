import { describe, expect, it } from 'vitest';
import { awaitAbortable } from '../../src/islands/anatomyabort';

describe('abortable anatomy model work', () => {
  it('returns a finished model without disposing it', async () => {
    const controller = new AbortController();
    const released: object[] = [];
    const value = { model: 'ready' };
    await expect(awaitAbortable(Promise.resolve(value), controller.signal, (part) => released.push(part)))
      .resolves.toBe(value);
    controller.abort();
    expect(released).toEqual([]);
  });

  it('immediately rejects a stalled decode, then frees its late result', async () => {
    const controller = new AbortController();
    let finish!: (value: { model: string }) => void;
    const pending = new Promise<{ model: string }>((resolve) => { finish = resolve; });
    const released: object[] = [];
    const result = awaitAbortable(pending, controller.signal, (value) => released.push(value));
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    const stale = { model: 'old download' };
    finish(stale);
    await Promise.resolve();
    expect(released).toEqual([stale]);
  });

  it('observes a late failure after abort without changing the retry state', async () => {
    const controller = new AbortController();
    let fail!: (error: Error) => void;
    const pending = new Promise<object>((_, reject) => { fail = reject; });
    const released: object[] = [];
    const result = awaitAbortable(pending, controller.signal, (value) => released.push(value));
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    fail(new Error('obsolete decoder failure'));
    await Promise.resolve();
    expect(released).toEqual([]);
  });

  it('disposes work that resolves after an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    let finish!: (value: { model: string }) => void;
    const pending = new Promise<{ model: string }>((resolve) => { finish = resolve; });
    const released: object[] = [];
    const result = awaitAbortable(pending, controller.signal, (value) => released.push(value));
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    const stale = { model: 'never show' };
    finish(stale);
    await Promise.resolve();
    expect(released).toEqual([stale]);
  });

  it('preserves a normal load error before cancellation', async () => {
    const controller = new AbortController();
    const error = new Error('missing model');
    await expect(awaitAbortable(Promise.reject(error), controller.signal, () => {}))
      .rejects.toBe(error);
  });
});
