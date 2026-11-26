import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_STATS_CHANGED_EVENT, loadStats, localDay, STATS_STORAGE_KEY, type SavedStats } from './gameresults';
import { accountHref } from '../config/site';
import { useStatsGate } from './gamestatsgate';
import { hubTotals } from './playhub';

/**
 * The left panel's foot on the /play hub (Christian, 2026-11-25). A signed-in visitor sees the four totals: played,
 * solved, day streak, best streak, across every game. They are worked out in the browser from the results this browser
 * keeps and are never sent anywhere (recording is unchanged for everyone; only the display is gated). Anyone else
 * (signed out, accounts off, or a failed session check) sees the same copper "create an account" bar the game frame
 * shows, with "to save your daily game stats" under it. Nothing is drawn until the session check has resolved, inside a
 * holder that keeps the room either answer takes, so nothing flashes and nothing below moves. Signed in, the totals
 * stay dashes until the page has read the browser (and a browser that cannot save shows none), so no zero jumps to a
 * real number.
 */
export default function PlayTotals() {
  const gate = useStatsGate();
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

  // Still checking the session: draw nothing, but keep the room.
  if (gate === undefined) return <div className="play-hub-account-slot" />;
  // Not signed in: the same bar and words as the game frame's sidebar (GameFrameStats), in place of the totals.
  if (!gate) {
    return (
      <div className="play-hub-account-slot" data-testid="play-account-bar">
        <a href={accountHref} className="copper-button" aria-describedby="play-account-note">create an account</a>
        <p id="play-account-note" className="play-hub-account-note">to save your daily game stats</p>
      </div>
    );
  }
  // A browser that cannot save shows the page without totals.
  if (state && !state.saved.on) return <div className="play-hub-account-slot" />;
  const totals = state?.saved.on ? hubTotals(state.saved.stats, state.today) : undefined;
  const items: ReadonlyArray<readonly [string, string | undefined]> = [
    ['played', totals && String(totals.played)],
    ['solved', totals && (totals.solvedPercent === undefined ? '–' : `${totals.solvedPercent}%`)],
    ['day streak', totals && String(totals.dayStreak)],
    ['best streak', totals && String(totals.bestStreak)],
  ];

  return (
    <div className="play-hub-account-slot">
      <dl className="flex flex-wrap gap-x-3 gap-y-4 border-t border-line pt-6" data-testid="play-totals" aria-label="your totals, kept in this browser">
        {items.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-1 basis-(--play-hub-total-min) flex-col gap-0.5">
            <dt className="text-sm text-ink-soft">{label}</dt>
            <dd className="order-first text-(length:--play-hub-total-size) leading-normal font-black text-ink" data-testid={`play-total-${label.replace(' ', '-')}`}>
              {value ?? <span aria-hidden="true">–</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
