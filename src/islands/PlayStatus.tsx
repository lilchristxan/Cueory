import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_RESULT_EVENT, heldRounds, loadStats, localDay, STATS_STORAGE_KEY, type SavedStats } from './gameresults';
import { GAME_PROGRESS_EVENT, readHeard, STATUS_TEXT, statusFor, type GameId, type HeardToday } from './playstatus';

/** Sudoku reports its finish with its own event, whose detail has the day but no game id. */
const SUDOKU_SOLVED_EVENT = 'cueory:sudoku-solved';

interface Row {
  id: GameId;
  name: string;
  /** The id of the game's heading on this page, so each row jumps to its game. */
  anchor: string;
}

interface Props {
  /** The games in the order the page shows them. */
  games: readonly Row[];
}

const readStats = (): SavedStats => loadStats(browserStorage(), localDay(new Date()));

/**
 * Today's status for each daily game (issue #735), from this device only; the logic is in ./playstatus. Rendered only
 * in the browser (client:only), so without JavaScript nothing shows, and nothing can be wrong.
 */
export default function PlayStatus({ games }: Props) {
  const ids = games.map((game) => game.id);
  const [today, setToday] = useState(() => localDay(new Date()));
  const [saved, setSaved] = useState(readStats);
  const [heard, setHeard] = useState<HeardToday>(() => {
    const finished = new Set<string>();
    // Rounds that ended before this list loaded are still waiting in memory.
    for (const round of heldRounds()) {
      const key = readHeard(round, ids);
      if (key) finished.add(key);
    }
    return { started: new Set(), finished };
  });

  useEffect(() => {
    const add = (kind: keyof HeardToday, key: string | undefined) => {
      if (!key) return;
      setHeard((now) => (now[kind].has(key) ? now : { ...now, [kind]: new Set([...now[kind], key]) }));
    };
    const finished = (event: Event) => add('finished', readHeard((event as CustomEvent).detail, ids));
    const sudoku = (event: Event) => add('finished', readHeard((event as CustomEvent).detail, ids, 'triage'));
    const started = (event: Event) => add('started', readHeard((event as CustomEvent).detail, ids));
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === STATS_STORAGE_KEY) setSaved(readStats());
    };
    // Coming back to the tab may be a new day, or the stats may have changed elsewhere.
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      setToday(localDay(new Date()));
      setSaved(readStats());
    };
    window.addEventListener(GAME_RESULT_EVENT, finished);
    window.addEventListener(SUDOKU_SOLVED_EVENT, sudoku);
    window.addEventListener(GAME_PROGRESS_EVENT, started);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(GAME_RESULT_EVENT, finished);
      window.removeEventListener(SUDOKU_SOLVED_EVENT, sudoku);
      window.removeEventListener(GAME_PROGRESS_EVENT, started);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
    };
    // The games never change on this page.
  }, []);

  return (
    <section className="mt-8" aria-labelledby="today-status-heading" data-testid="play-status">
      <h2 id="today-status-heading" className="text-lg font-medium">today</h2>
      <ul className="mt-2 flex flex-col">
        {games.map((game) => {
          const status = statusFor(game.id, today, saved.stats, heard);
          const text = STATUS_TEXT[status];
          return (
            <li key={game.id} data-testid={`play-status-${game.id}`} data-status={status}>
              <a
                href={`#${game.anchor}`}
                className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 border-b border-line py-2 text-ink no-underline"
              >
                <span className="font-medium">{game.name}</span>
                <span className="inline-flex items-center gap-2 text-ink-soft">
                  <span aria-hidden="true">{text.symbol}</span>
                  <span>{text.label}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {!saved.on && (
        <p className="mt-2 text-sm text-ink-soft" data-testid="play-status-note">
          checked on this device only. turn on stats below to keep finished games marked after you leave.
        </p>
      )}
    </section>
  );
}
