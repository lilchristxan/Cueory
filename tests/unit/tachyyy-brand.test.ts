import { describe, expect, it } from 'vitest';
import { tachyyyGame } from '../../src/config/tachyyy';
import { STAT_SECONDS } from '../../src/islands/stat';

describe('tachyyy public duration', () => {
  it('matches the shared stat engine per-question clock', () => {
    const duration = `${STAT_SECONDS} seconds each`;
    expect(tachyyyGame.subtitle).toBe(duration);
    expect(tachyyyGame.line).toContain(duration);
  });
});
