import { describe, expect, it, vi } from 'vitest';
import { releaseAnimations } from '../../src/scripts/carousel';

describe('releaseAnimations (#634)', () => {
  it('cancels every animation of a round at rest, finished ones included, so WebKit stops listing them', () => {
    const round = Array.from({ length: 5 }, () => ({ cancel: vi.fn() }));
    releaseAnimations(round);
    for (const a of round) expect(a.cancel).toHaveBeenCalledOnce();
  });
});
