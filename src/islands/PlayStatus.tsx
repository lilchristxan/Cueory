import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_RESULT_EVENT, GAME_STATS_CHANGED_EVENT, heldRounds, loadStats, localDay, STATS_STORAGE_KEY, type SavedStats } from './gameresults';
import { sameGame } from './gamestats';
import { playedLabel, statusWords } from './playhub';
import { GAME_PROGRESS_EVENT, readHeard, statusFor, type GameId, type HeardToday } from './playstatus';

/** Sudoku reports its finish with its own event, whose detail has the day but no game id. */
const SUDOKU_SOLVED_EVENT = 'cueory:sudoku-solved';

/** The games whose own artwork stands in for a serif name (the same files the game pages use). */
type Art = 'vialo' | 'tachyyy' | 'piccline';

interface Row {
  /** Inside the code only. 'hello-cards' has no daily status. */
  id: GameId | 'hello-cards';
  /** Keeps the data-testid the hub has always had (vialo is "pulse", piccline is "suture"). */
  testId: string;
  name: string;
  /** The game's one-line description, from src/config/games.ts. */
  line: string;
  /** The game's own page. */
  href: string;
  /** False while the game is closed in this build: "coming soon", no button, not a link. */
  open: boolean;
  art?: Art;
  /** Keeps a data-testid the hub's link has always had (tachyyy-link, hello-cards-link). */
  linkTestId?: string;
  /** hello cards: how many cards it has, shown instead of a daily status. */
  cards?: number;
}

interface Props {
  /** The games in the order the page shows them. */
  games: readonly Row[];
}

/**
 * Wordmark artwork per game: the files the game pages use by day (src/components/GameFrame.astro), and the Evening
 * versions in brand/games for the dark palette. They are Christian's artwork: never redrawn or recoloured.
 */
const WORDMARK: Readonly<Record<Art, { day: string; evening: string; width: number; height: number }>> = {
  vialo: { day: '/design/games-v2/assets/vialo-wordmark-oxblood-v3.svg', evening: '/brand/games/vialo-wordmark-dark.svg', width: 4326, height: 1620 },
  tachyyy: { day: '/brand/games/tachyyy-wordmark-light.svg', evening: '/brand/games/tachyyy-wordmark-dark.svg', width: 5729, height: 2100 },
  piccline: { day: '/brand/games/piccline-wordmark-light.svg', evening: '/brand/games/piccline-wordmark-dark.svg', width: 248, height: 60 },
};
/** The icon artwork the game pages use; tachyyy's changes with the palette. */
const ICON: Readonly<Record<Art, { day: string; evening: string }>> = {
  vialo: { day: '/design/games-v2/assets/vialo-icon-silver-oxblood.svg', evening: '/design/games-v2/assets/vialo-icon-silver-oxblood.svg' },
  tachyyy: { day: '/brand/games/tachyyy-light.svg', evening: '/brand/games/tachyyy-dark.svg' },
  piccline: { day: '/brand/games/piccline-dark.svg', evening: '/brand/games/piccline-dark.svg' },
};

const BUTTON = 'inline-flex min-h-11 min-w-24 items-center justify-center rounded-pill border-2 px-6 font-bold no-underline after:absolute after:inset-0';
const PLAY = `${BUTTON} border-button bg-button text-on-button hover:border-button-hover hover:bg-button-hover`;
/** The game page starts a fresh round (it keeps no saved result), so after a finished game the button says so. D-pending until a saved-result view exists. */
export const PLAY_AGAIN = 'play again';
const RESULT = `${BUTTON} border-ink bg-transparent text-ink hover:bg-surface`;

function Tile({ row }: { row: Row }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-(--play-hub-tile) shrink-0 items-center justify-center rounded-lg border border-line bg-surface font-display text-2xl leading-none text-ink"
    >
      {row.art ? (
        <span className="logo size-(--play-hub-tile-icon)">
          <img className="logo-day" src={ICON[row.art].day} alt="" aria-hidden="true" loading="lazy" width="100" height="100" decoding="async" />
          <img className="logo-evening" src={ICON[row.art].evening} alt="" aria-hidden="true" loading="lazy" width="100" height="100" decoding="async" />
        </span>
      ) : (
        row.name.slice(0, 1)
      )}
    </span>
  );
}

function Name({ row }: { row: Row }) {
  if (!row.art) {
    return <span className="display text-(length:--play-hub-name-size-phone) leading-none text-ink wrap-anywhere @4xl:text-(length:--play-hub-name-size)">{row.name}</span>;
  }
  const art = WORDMARK[row.art];
  return (
    <span className="logo block h-(--play-hub-wordmark-height-phone) @4xl:h-(--play-hub-wordmark-height)">
      <span className="sr-only">{row.name}</span>
      <img className="logo-day h-full w-auto max-w-full object-contain object-left" src={art.day} alt="" aria-hidden="true" loading="lazy" width={art.width} height={art.height} decoding="async" />
      <img className="logo-evening h-full w-auto max-w-full object-contain object-left" src={art.evening} alt="" aria-hidden="true" loading="lazy" width={art.width} height={art.height} decoding="async" />
    </span>
  );
}

/**
 * The /play hub's game rows (option B, Christian 2026-11-23). Server-rendered with a dash for each status, so the page
 * never jumps; once it loads in the browser each row shows today's status from this device only (nothing is sent):
 * "new today" + play, "in progress" + play, or "played · solved in 4" + result. A game closed in this build says
 * "coming soon", has no button and is not a link. A browser that cannot save shows every open game as "new today".
 */
export default function PlayStatus({ games }: Props) {
  const ids = games.flatMap((game) => (game.id === 'hello-cards' ? [] : [game.id]));
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState('');
  const [saved, setSaved] = useState<SavedStats>({ on: false, stats: [] });
  const [heard, setHeard] = useState<HeardToday>({ started: new Set(), finished: new Set() });

  useEffect(() => {
    const read = () => setSaved(loadStats(browserStorage(), localDay(new Date())));
    const add = (kind: keyof HeardToday, key: string | undefined) => {
      if (!key) return;
      setHeard((now) => (now[kind].has(key) ? now : { ...now, [kind]: new Set([...now[kind], key]) }));
    };
    // Rounds that ended before this island loaded are still waiting in memory.
    for (const round of heldRounds()) add('finished', readHeard(round, ids));
    setToday(localDay(new Date()));
    read();
    setLoaded(true);

    const finished = (event: Event) => add('finished', readHeard((event as CustomEvent).detail, ids));
    const sudoku = (event: Event) => add('finished', readHeard((event as CustomEvent).detail, ids, 'triage'));
    const started = (event: Event) => add('started', readHeard((event as CustomEvent).detail, ids));
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === STATS_STORAGE_KEY) read();
    };
    // Coming back to the tab may be a new day, or the stats may have changed elsewhere.
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      setToday(localDay(new Date()));
      read();
    };
    window.addEventListener(GAME_RESULT_EVENT, finished);
    window.addEventListener(SUDOKU_SOLVED_EVENT, sudoku);
    window.addEventListener(GAME_PROGRESS_EVENT, started);
    window.addEventListener(GAME_STATS_CHANGED_EVENT, read);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(GAME_RESULT_EVENT, finished);
      window.removeEventListener(SUDOKU_SOLVED_EVENT, sudoku);
      window.removeEventListener(GAME_PROGRESS_EVENT, started);
      window.removeEventListener(GAME_STATS_CHANGED_EVENT, read);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  return (
    <section aria-labelledby="today-status-heading" data-testid="play-status">
      <h2 id="today-status-heading" className="sr-only">today</h2>
      <ul className="flex flex-col gap-3 @4xl:gap-0 @4xl:border-b @4xl:border-line">
        {games.map((row) => {
          const daily = row.id !== 'hello-cards';
          const status = loaded && daily && row.open ? statusFor(row.id as GameId, today, saved.stats, heard) : undefined;
          const result = status === 'done' ? saved.stats.find((entry) => entry.day === today && sameGame(entry.game, row.id)) : undefined;
          // What the status column says: coming soon, the card count, today's status, or a dash until the page has loaded.
          let words: string | undefined;
          if (!row.open) words = 'coming soon';
          else if (!daily) words = row.cards === undefined ? undefined : `${row.cards} cards`;
          else if (status) words = statusWords(status, playedLabel(row.id, result));
          const action = row.open ? (status === 'done' ? PLAY_AGAIN : 'play') : undefined;
          return (
            <li
              key={row.id}
              data-testid={`play-status-${row.testId}`}
              data-status={status}
              data-closed={row.open ? undefined : 'true'}
              className="relative grid grid-cols-(--play-hub-cols-stacked) bg-page items-center gap-x-4 gap-y-3 rounded-xl border border-line p-4 @4xl:grid-cols-(--play-hub-cols) @4xl:gap-x-6 @4xl:rounded-none @4xl:border-0 @4xl:border-t @4xl:px-0 @4xl:py-5"
            >
              <Tile row={row} />
              <span className="min-w-0 @4xl:col-span-1">
                <Name row={row} />
              </span>
              <p className="col-span-2 text-base text-ink @4xl:col-span-1">{row.line}</p>
              {/* Status on the left and the button on the right; they wrap under each other when text is enlarged. */}
              <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 @4xl:contents">
                <p className="text-sm font-medium text-ink-soft" data-testid="play-status-words">
                  {words ?? <span aria-hidden="true">–</span>}
                </p>
                {action && (
                  <a
                    href={row.href}
                    className={`${action === PLAY_AGAIN ? RESULT : PLAY} @4xl:justify-self-end`}
                    aria-label={`${action} ${row.name}`}
                    data-testid={row.linkTestId}
                  >
                    {action}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {loaded && !saved.on && (
        <p className="mt-4 text-sm text-ink-soft" data-testid="play-status-note">
          checked on this device only. this browser won't keep stats, so finished games aren't marked after you leave.
        </p>
      )}
    </section>
  );
}
