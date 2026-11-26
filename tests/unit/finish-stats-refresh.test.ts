import { describe, expect, it } from 'vitest';
import { GAME_STATS_CHANGED_EVENT, STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import { watchStatsChange } from '../../src/islands/finishstatsrefresh';

function storageEvent(key: string | null): Event {
  return Object.assign(new Event('storage'), { key });
}

describe('a finished game re-reads its stats when the record changes', () => {
  it('re-reads after "forget all" on this page (the stats-changed event)', () => {
    const target = new EventTarget();
    let reads = 0;
    watchStatsChange(target, () => { reads += 1; });
    target.dispatchEvent(new Event(GAME_STATS_CHANGED_EVENT));
    expect(reads).toBe(1);
  });

  it('re-reads when another tab changes or clears the record, and ignores unrelated keys', () => {
    const target = new EventTarget();
    let reads = 0;
    watchStatsChange(target, () => { reads += 1; }, ['cueory-sudoku-stats']);
    target.dispatchEvent(storageEvent(STATS_STORAGE_KEY));
    target.dispatchEvent(storageEvent('cueory-sudoku-stats'));
    target.dispatchEvent(storageEvent(null));
    expect(reads).toBe(3);
    target.dispatchEvent(storageEvent('cueory-theme'));
    expect(reads).toBe(3);
  });

  it('stops listening when the card goes away', () => {
    const target = new EventTarget();
    let reads = 0;
    const stop = watchStatsChange(target, () => { reads += 1; });
    stop();
    target.dispatchEvent(new Event(GAME_STATS_CHANGED_EVENT));
    target.dispatchEvent(storageEvent(null));
    expect(reads).toBe(0);
  });
});
