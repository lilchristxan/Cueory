import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_STATS_CHANGED_EVENT, loadStats, localDay, STATS_STORAGE_KEY, type SavedStats } from './gameresults';
import { hubTotals } from './playhub';

/**
 * The four totals in the /play hub's left panel: played, solved, day streak, best streak, across every game. They are
 * worked out in the browser from the results this browser keeps and are never sent anywhere. The server renders a dash
 * for each, and they stay dashes until the page has read the browser (and when the browser cannot save), so no zero
 * jumps to a real number.
 */
export default function PlayTotals() {
  const [state, setState] = useState<{ saved: SavedStats; today: string } | undefined>();

  useEffect(() => {
    const read = () => {
      const today = localDay(new Date());
      setState({ saved: loadStats(browserStorage(), today), today });
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === STATS_STORAGE_KEY) read();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') read();
    };
    read();
    window.addEventListener(GAME_STATS_CHANGED_EVENT, read);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(GAME_STATS_CHANGED_EVENT, read);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  // A browser that cannot save shows the page without totals.
  if (state && !state.saved.on) return null;
  const totals = state?.saved.on ? hubTotals(state.saved.stats, state.today) : undefined;
  const items: ReadonlyArray<readonly [string, string | undefined]> = [
    ['played', totals && String(totals.played)],
    ['solved', totals && (totals.solvedPercent === undefined ? '–' : `${totals.solvedPercent}%`)],
    ['day streak', totals && String(totals.dayStreak)],
    ['best streak', totals && String(totals.bestStreak)],
  ];

  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-4 border-t border-line pt-6" data-testid="play-totals" aria-label="your totals, kept in this browser">
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-1 basis-(--play-hub-total-min) flex-col gap-0.5">
          <dt className="text-sm text-ink-soft">{label}</dt>
          <dd className="order-first text-(length:--play-hub-total-size) leading-tight font-black text-ink" data-testid={`play-total-${label.replace(' ', '-')}`}>
            {value ?? <span aria-hidden="true">–</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
