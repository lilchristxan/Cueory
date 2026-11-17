import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_RESULT_EVENT, heldRounds, loadStats, localDay, STATS_STORAGE_KEY, type SavedStats } from './gameresults';
import { GAME_PROGRESS_EVENT, readHeard, STATUS_TEXT, statusFor, type GameId, type HeardToday } from './playstatus';

/** Sudoku reports its finish with its own event, whose detail has the day but no game id. */
const SUDOKU_SOLVED_EVENT = 'cueory:sudoku-solved';

interface Row {
  id: GameId;
  name: string;
  /** The game's one-line description. */
  line: string;
  /** The game's own page (each game on its own page, 2026-11-17). */
  href: string;
}

interface Props {
  /** The games in the order the page shows them. */
  games: readonly Row[];
}

const readStats = (): SavedStats => loadStats(browserStorage(), localDay(new Date()));

/**
 * The /play hub's game cards: each game's name, its one-line description and today's status (issue #735), from this
 * device only; the logic is in ./playstatus. Each card opens the game's own page. Rendered only in the browser
 * (client:only); without JavaScript the hub shows plain links instead, with no status, so none can be wrong.
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
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {games.map((game) => {
          const status = statusFor(game.id, today, saved.stats, heard);
          const text = STATUS_TEXT[status];
          return (
            <li key={game.id} data-testid={`play-status-${game.id}`} data-status={status}>
              <a
                href={game.href}
                className="flex h-full min-h-11 flex-col gap-2 rounded-lg border border-line bg-page p-4 text-ink no-underline hover:bg-surface"
              >
                <span className="text-lg font-medium">{game.name}</span>
                <span className="text-sm text-ink-soft">{game.line}</span>
                <span className="mt-auto inline-flex items-center gap-2 text-sm text-ink-soft">
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
