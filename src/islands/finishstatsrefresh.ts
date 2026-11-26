import { useEffect, useRef } from 'react';
import { GAME_STATS_CHANGED_EVENT, STATS_STORAGE_KEY } from './gameresults';

/**
 * A finished game's share card shows numbers read from the stats record (percent solved, streak). When that record
 * changes afterwards - "forget all my stats" on this page (the stats-changed event), or any change made in another tab
 * (a storage event, where a null key means the whole store was cleared) - the numbers are read again, so the card and
 * its picture never keep what has been forgotten (Codex on #1233). Plain function so it can be unit tested.
 */
export function watchStatsChange(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, refresh: () => void, extraKeys: readonly string[] = []): () => void {
  const onStorage = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key === null || key === STATS_STORAGE_KEY || extraKeys.includes(key)) refresh();
  };
  const onChanged = () => refresh();
  target.addEventListener(GAME_STATS_CHANGED_EVENT, onChanged);
  target.addEventListener('storage', onStorage);
  return () => {
    target.removeEventListener(GAME_STATS_CHANGED_EVENT, onChanged);
    target.removeEventListener('storage', onStorage);
  };
}

export function useRefreshOnStatsChange(active: boolean, refresh: () => void, extraKeys: readonly string[] = []): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  const keys = extraKeys.join('|');
  useEffect(() => {
    if (!active) return;
    return watchStatsChange(window, () => latest.current(), keys ? keys.split('|') : []);
  }, [active, keys]);
}
