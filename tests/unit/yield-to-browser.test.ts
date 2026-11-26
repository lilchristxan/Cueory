import { describe, expect, it } from 'vitest';
import { yieldToBrowser } from '../../src/islands/sharedialogmodel';

describe('yieldToBrowser', () => {
  it('lets already queued work run first, without a timer', async () => {
    const order: string[] = [];
    queueMicrotask(() => order.push('microtask'));
    const queued = new Promise<void>((resolve) => setTimeout(() => { order.push('timer'); resolve(); }, 0));
    await yieldToBrowser();
    order.push('after yield');
    await queued;
    expect(order[0]).toBe('microtask');
    expect(order).toContain('after yield');
  });
});
