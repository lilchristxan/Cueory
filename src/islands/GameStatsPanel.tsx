import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dailyGames } from '../config/games';
import { browserStorage } from '../scripts/storage';
import {
  forgetHeldRounds,
  GAME_RESULT_EVENT,
  heldRounds,
  loadStats,
  localDay,
  saveStats,
  STATS_STORAGE_KEY,
  SUDOKU_STATS_STORAGE_KEY,
  triesInWords,
  type SavedStats,
} from './gameresults';
import { currentStreak, dailyStats, forget, recordResult, serialize, summary, summaryInWords, wordPathSummary, wordPathSummaryInWords, type GameId, type GameStats } from './gamestats';
import { GUESSES } from './pulse';
import { loadSudokuStats, parseSudokuSolves } from './sudokustats';

const button = 'min-h-11 rounded-pill border border-control bg-page px-5 py-2.5 text-ink';

/** What this browser keeps right now. Another open tab may have turned stats on or off, or added a game. */
const latest = (): SavedStats => loadStats(browserStorage(), localDay(new Date()));
/** Sudoku keeps its per-level solves in a second record (./sudokustats); the panel's controls cover both. */
const sudokuKept = (): boolean => {
  try { return parseSudokuSolves(browserStorage()?.getItem(SUDOKU_STATS_STORAGE_KEY) ?? null).length > 0; } catch { return false; }
};
/** Deletes sudoku's per-level record. False when the browser won't let us. */
const forgetSudokuRecord = (): boolean => {
  try {
    const storage = browserStorage();
    if (!storage) return false;
    storage.removeItem(SUDOKU_STATS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};
const hasRecord = (): boolean => {
  try { return browserStorage()?.getItem(STATS_STORAGE_KEY) != null; } catch { return false; }
};

/**
 * Private stats for the daily games (D-76). Always kept in this browser (Christian's decision, 2026-11-17: no switch);
 * it keeps each finished round (the day, solved or not, and the tries; for word path also the hints used and whether the special answer came
 * first) and shows a short summary per game, with pillo's win % and streaks (Task 719), the crossword's streak (Task 721:
 * days solved without Check, Reveal or Autocheck) and word path's streak (worked out from the days kept). Nothing is ever
 * sent to us, and "forget" deletes them (sudoku's own per-level record, ./sudokustats, goes with
 * "forget all"). Results older than 400 days are deleted when the page
 * opens. Rendered only in the browser (client:only).
 *
 * Every change starts from what storage holds at that moment, not from what this tab last showed, so a "forget" in one
 * tab holds in every other open tab too. Rounds not kept yet wait in ./gameresults, which drops them whenever
 * another tab changes the stats.
 */
interface Props {
  /** The games in the order the page shows them. */
  games: readonly GameId[];
}

/** pillo's win % and streaks in words (Task 719). */
function pilloLine(stats: GameStats): string {
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const value = dailyStats(stats, 'pulse', localDay(new Date()), GUESSES);
  return `won ${value.winPercent}%. current streak ${days(value.currentStreak)}, longest ${days(value.longestStreak)}.`;
}

export default function GameStatsPanel({ games: order }: Props) {
  const [saved, setSaved] = useState(latest);
  const [said, setSaid] = useState('');
  const [blocked, setBlocked] = useState(false);
  /** What this tab shows, for the listeners, which are set up once. */
  const shown = useRef(saved);
  shown.current = saved;
  const toggleButton = useRef<HTMLHeadingElement>(null);
  const headings = useRef(new Map<GameId, HTMLHeadingElement>());
  /** Where focus goes after a "forget" button removes itself, so keyboard users keep their place. */
  const focusNext = useRef<GameId | 'switch' | undefined>(undefined);

  useLayoutEffect(() => {
    const target = focusNext.current;
    if (target === undefined) return;
    focusNext.current = undefined;
    (target === 'switch' ? toggleButton.current : headings.current.get(target))?.focus();
  });

  const keep = (stats: GameStats, message: string): boolean => {
    if (!saveStats(browserStorage(), stats)) {
      setBlocked(true);
      setSaid("this browser won't keep stats, so nothing was saved.");
      return false;
    }
    setBlocked(false);
    setSaved({ on: true, stats });
    setSaid(message);
    return true;
  };

  useEffect(() => {
    // Results from before the last 400 days are deleted now, so nothing older stays in this browser.
    const now = latest();
    // Only rewrite a record that exists, so a visitor who never finished a game has nothing saved.
    if (now.on && hasRecord()) saveStats(browserStorage(), now.stats);
    // Sudoku's per-level solve times follow the same 400 days: opening daily games or any game page deletes older
    // ones from storage, not only when the sudoku stats view opens (Codex on #831).
    loadSudokuStats(browserStorage(), localDay(new Date()));
    setSaved(now);

    // Keeps the rounds waiting in ./gameresults. Stats are always kept; only a browser that won't store them keeps none.
    const keepWaiting = () => {
      const waiting = heldRounds();
      if (waiting.length === 0) return;
      const now = latest();
      if (!now.on) {
        setSaid("this browser won't keep stats, so this game wasn't kept.");
        setSaved(now);
        return;
      }
      let stats = now.stats;
      let message = '';
      for (const result of waiting) {
        const name = dailyGames.find((game) => game.id === result.game)?.name ?? '';
        const next = recordResult(stats, result);
        // The first result of each game and day counts; a replay changes nothing.
        if (name) message = next === stats ? `${name}: today's first game is already in your stats.` : `${name} added to your stats.`;
        stats = next;
      }
      if (stats === now.stats) {
        forgetHeldRounds();
        setSaved(now);
        setSaid(message);
        return;
      }
      if (keep(stats, message)) forgetHeldRounds();
    };
    // Another tab changed the stats, or this page came back from the back/forward cache. ./gameresults has already
    // dropped any waiting rounds; this shows what storage holds now.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STATS_STORAGE_KEY) setSaved(latest());
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSaved(latest());
    };
    // Rounds finished before this panel loaded are kept now, then each one as it ends.
    keepWaiting();
    window.addEventListener(GAME_RESULT_EVENT, keepWaiting);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener(GAME_RESULT_EVENT, keepWaiting);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  /** What storage holds now, or undefined (and the switch shows off) when stats were turned off meanwhile. */
  const stillOn = (): GameStats | undefined => {
    const now = latest();
    if (now.on) return now.stats;
    focusNext.current = 'switch';
    setSaved(now);
    setSaid("this browser won't keep stats, so nothing is kept.");
    return undefined;
  };

  /**
   * Writes the shared record after a "forget": an empty one is deleted (removeItem), not written, so a full storage
   * can't keep the old history in place (Codex on #831). False when the browser refused.
   */
  const storeForgotten = (stats: GameStats): boolean => {
    try {
      const storage = browserStorage();
      if (!storage) return false;
      if (stats.length === 0) storage.removeItem(STATS_STORAGE_KEY);
      else storage.setItem(STATS_STORAGE_KEY, serialize(stats));
      return true;
    } catch {
      return false;
    }
  };
  const SITE_DATA = "clearing this site's data in your browser removes them.";

  // A forgotten game's rounds that are still waiting to be kept are forgotten too.
  const forgetGame = (game: GameId, name: string) => {
    const stats = stillOn();
    if (!stats) return;
    forgetHeldRounds(game);
    focusNext.current = game;
    // Forgetting sudoku clears both its shared results and its per-level solve times (Codex on #831).
    const timesGone = game !== 'triage' || forgetSudokuRecord();
    const next = forget(stats, game);
    const resultsGone = storeForgotten(next);
    // Show what storage holds now, whatever happened.
    setSaved(latest());
    if (resultsGone && timesGone) setSaid(`${name} stats forgotten.`);
    else if (resultsGone) setSaid(`${name} results forgotten, but this browser didn't let us delete its solve times. ${SITE_DATA}`);
    else if (timesGone && game === 'triage') setSaid(`${name} solve times forgotten, but this browser didn't let us delete its results. ${SITE_DATA}`);
    else setSaid(`this browser didn't let us delete your ${name} stats, so they are still kept. ${SITE_DATA}`);
  };

  const forgetAll = () => {
    if (!stillOn()) return;
    forgetHeldRounds();
    focusNext.current = 'switch';
    const timesGone = forgetSudokuRecord();
    const resultsGone = storeForgotten([]);
    setSaved(latest());
    if (resultsGone && timesGone) setSaid('all your stats are forgotten. new games are kept from now on.');
    else if (resultsGone) setSaid(`your results are forgotten, but this browser didn't let us delete sudoku's solve times. ${SITE_DATA}`);
    else if (timesGone) setSaid(`sudoku's solve times are forgotten, but this browser didn't let us delete your results. ${SITE_DATA}`);
    else setSaid(`this browser didn't let us delete your stats, so they are still kept. ${SITE_DATA}`);
  };

  const games = order.flatMap((id) => dailyGames.filter((game) => game.id === id && game.ready));

  return (
    <section className="mt-16" aria-labelledby="stats-heading" data-testid="game-stats">
      {/* Focus lands here after "forget all" (there is no switch any more), so keyboard users keep their place. */}
      <h2 ref={toggleButton} id="stats-heading" className="text-2xl font-medium" tabIndex={-1}>
        your stats
      </h2>
      <p className="mt-2 text-ink-soft" data-testid="stats-note">
        kept in this browser, on this device, and never sent to us. pillo, the crossword and word path also count your
        streaks, and sudoku shows its own times and streak for each level. forget them below at any time.
      </p>
      {blocked || !saved.on ? (
        <p id="stats-switch-note" className="mt-2 text-sm text-ink-soft">this browser won't keep them (private browsing or blocked site data).</p>
      ) : saved.stats.length === 0 && (
        <p id="stats-switch-note" className="mt-2 text-sm text-ink-soft">nothing kept yet. finish a game and it shows here.</p>
      )}

      {saved.on && (
        <>
          <ul className="mt-6 flex flex-col gap-5" aria-label="stats for each game">
            {games.map((game) => {
              const result = summary(saved.stats, game.id);
              const displayName = game.name;
              return (
                <li key={game.id}>
                  <h3
                    ref={(node) => {
                      if (node) headings.current.set(game.id, node);
                      else headings.current.delete(game.id);
                    }}
                    tabIndex={-1}
                    className="font-medium"
                  >
                    {displayName}
                  </h3>
                  <p className="mt-1">{result.played === 0 ? 'not played yet.' : summaryInWords(result)}</p>
                  {(result.played > 0 || (game.id === 'triage' && sudokuKept())) && (
                    <>
                      <p className="mt-1 text-sm text-ink-soft">{triesInWords(game.id, result.triesCounts)}</p>
                      {game.id === 'pulse' && <p className="mt-1 text-sm text-ink-soft">{pilloLine(saved.stats)}</p>}
                      {game.id === 'cueword' && (() => {
                        const run = currentStreak(saved.stats, game.id, localDay(new Date()));
                        return <p className="mt-1 text-sm" data-testid="crossword-streak">streak: {run} {run === 1 ? 'day' : 'days'} solved without help.</p>;
                      })()}
                      {game.id === 'suture' && (
                        <p className="mt-1 text-sm text-ink-soft" data-testid="word-path-stats">
                          {wordPathSummaryInWords(wordPathSummary(saved.stats, localDay(new Date())))}
                        </p>
                      )}
                      <button type="button" className={`${button} mt-2`} onClick={() => forgetGame(game.id, displayName)}>
                        forget {displayName}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {(saved.stats.length > 0 || sudokuKept()) && (
            <button type="button" className={`${button} mt-6`} onClick={forgetAll}>
              forget all my stats
            </button>
          )}
        </>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="stats-live">
        {said}
      </p>
    </section>
  );
}
