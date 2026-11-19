import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_RESULT_EVENT, heldRounds, loadStats, localDay, STATS_STORAGE_KEY, type SavedStats } from './gameresults';
import { GAME_PROGRESS_EVENT, heardKey, readHeard, statusDisplayFor, statusFor, type GameId, type HeardToday, type StatusDetails } from './playstatus';

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
  isComingSoonCrossword?: boolean;
}

const readStats = (): SavedStats => loadStats(browserStorage(), localDay(new Date()));

/**
 * The /play hub's game cards (redesign P8, matching Games.png / Games-390.png):
 * Stage layout with pillo blister pack card on the left, and crossword, sudoku, word path on the right.
 * Each card shows its name, one-line description, and today's status from this device only.
 */
export default function PlayStatus({ games, isComingSoonCrossword = false }: Props) {
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

  const [details, setDetails] = useState<Record<string, StatusDetails>>(() => {
    const map: Record<string, StatusDetails> = {};
    for (const round of heldRounds()) {
      if (round.game && round.day && round.card?.result) {
        const match = /^(\d+)\s*\/\s*(\d+)$/.exec(round.card.result);
        if (match) {
          map[heardKey(round.game, round.day)] = { wordsFound: Number(match[1]), totalWords: Number(match[2]) };
        }
      }
    }
    return map;
  });

  useEffect(() => {
    const add = (kind: keyof HeardToday, key: string | undefined) => {
      if (!key) return;
      setHeard((now) => (now[kind].has(key) ? now : { ...now, [kind]: new Set([...now[kind], key]) }));
    };
    const finished = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      add('finished', readHeard(detail, ids));
      if (detail && typeof detail === 'object') {
        const { game, day, card } = detail as Record<string, unknown>;
        if (typeof game === 'string' && typeof day === 'string' && card && typeof card === 'object') {
          const resultStr = (card as Record<string, unknown>).result;
          if (typeof resultStr === 'string') {
            const match = /^(\d+)\s*\/\s*(\d+)$/.exec(resultStr);
            if (match) {
              setDetails((prev) => ({
                ...prev,
                [heardKey(game as GameId, day)]: { wordsFound: Number(match[1]), totalWords: Number(match[2]) },
              }));
            }
          }
        }
      }
    };
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
  }, []);

  const pilloGame = games.find((g) => g.id === 'pulse') || {
    id: 'pulse',
    name: 'pillo',
    line: 'Guess the five-letter word in six tries.',
    href: '/play/pillo',
  };
  const crosswordGame = games.find((g) => g.id === 'cueword') || {
    id: 'cueword',
    name: 'crossword',
    line: "A mini crossword from this week's lessons.",
    href: '/play/crossword',
  };
  const sudokuGame = games.find((g) => g.id === 'triage') || {
    id: 'triage',
    name: 'sudoku',
    line: 'Fill every row, column and box with the numbers one through nine.',
    href: '/play/sudoku',
  };
  const wordPathGame = games.find((g) => g.id === 'suture') || {
    id: 'suture',
    name: 'word path',
    line: 'Trace hidden words through the letters.',
    href: '/play/word-path',
  };

  const pilloStatus = statusFor('pulse', today, saved.stats, heard);
  const pilloText = statusDisplayFor('pulse', pilloStatus);

  const crosswordStatus = statusFor('cueword', today, saved.stats, heard);
  const crosswordText = statusDisplayFor('cueword', crosswordStatus);

  const sudokuStatus = statusFor('triage', today, saved.stats, heard);
  const sudokuText = statusDisplayFor('triage', sudokuStatus);

  const wordPathStatus = statusFor('suture', today, saved.stats, heard);
  const wordPathText = statusDisplayFor('suture', wordPathStatus, details[heardKey('suture', today)]);

  return (
    <section className="mt-4" aria-labelledby="today-status-heading" data-testid="play-status">
      <h2 id="today-status-heading" className="sr-only">today</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Pillo (spans 2 columns on desktop) */}
        <div
          data-testid="play-status-pulse"
          data-status={pilloStatus}
          className="min-w-0 lg:col-span-2"
        >
          <a
            href={pilloGame.href}
            className="veil block p-6 sm:p-8 text-ink no-underline group hover:border-line transition-colors min-h-11"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              {/* Left Column: Title, Tagline, Blister Pack */}
              <div className="flex flex-col min-w-0">
                <span className="display block text-3xl sm:text-4xl text-ink font-medium break-words">
                  {pilloGame.name}
                </span>
                <p className="mt-2 text-sm text-ink-soft">{pilloGame.line}</p>

                {/* Blister pack illustration - sits directly under tagline */}
                <div
                  className="mt-6 w-full max-w-xs bg-surface p-3 sm:p-4 rounded-xl select-none"
                  aria-hidden="true"
                >
                  <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
                    {/* Row 1: A×, B•, C×, D✓, E× */}
                    <div className="aspect-square rounded-full bg-page flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-ink leading-none">A</span>
                      <span className="text-xs text-ink leading-none mt-0.5">×</span>
                    </div>
                    <div className="aspect-square rounded-full bg-soft flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-ink leading-none">B</span>
                      <span className="text-xs text-ink leading-none mt-0.5">•</span>
                    </div>
                    <div className="aspect-square rounded-full bg-page flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-ink leading-none">C</span>
                      <span className="text-xs text-ink leading-none mt-0.5">×</span>
                    </div>
                    <div className="aspect-square rounded-full bg-ink flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-on-button leading-none">D</span>
                      <span className="text-xs text-on-button leading-none mt-0.5">✓</span>
                    </div>
                    <div className="aspect-square rounded-full bg-page flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-ink leading-none">E</span>
                      <span className="text-xs text-ink leading-none mt-0.5">×</span>
                    </div>

                    {/* Row 2: F×, G•, H✓, I×, J✓ */}
                    <div className="aspect-square rounded-full bg-page flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-ink leading-none">F</span>
                      <span className="text-xs text-ink leading-none mt-0.5">×</span>
                    </div>
                    <div className="aspect-square rounded-full bg-soft flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-ink leading-none">G</span>
                      <span className="text-xs text-ink leading-none mt-0.5">•</span>
                    </div>
                    <div className="aspect-square rounded-full bg-ink flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-on-button leading-none">H</span>
                      <span className="text-xs text-on-button leading-none mt-0.5">✓</span>
                    </div>
                    <div className="aspect-square rounded-full bg-page flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-ink leading-none">I</span>
                      <span className="text-xs text-ink leading-none mt-0.5">×</span>
                    </div>
                    <div className="aspect-square rounded-full bg-ink flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-base font-bold text-on-button leading-none">J</span>
                      <span className="text-xs text-on-button leading-none mt-0.5">✓</span>
                    </div>

                    {/* Rows 3-6: 20 empty pockets */}
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded-full bg-page border border-dashed border-line"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Legend, Share Note, Status */}
              <div className="flex flex-col min-w-0 pt-1">
                <h3 className="text-sm font-bold text-ink">how to read the pack</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <span className="font-bold text-ink">✓ filled </span>
                    <span className="text-ink-soft">right letter, right spot</span>
                  </li>
                  <li>
                    <span className="font-bold text-ink">• half </span>
                    <span className="text-ink-soft">in the word, wrong spot</span>
                  </li>
                  <li>
                    <span className="font-bold text-ink">× empty </span>
                    <span className="text-ink-soft">not in the word</span>
                  </li>
                </ul>

                {/* Status */}
                <div className="mt-6 pt-4 border-t border-line">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                    <span aria-hidden="true">{pilloText.symbol}</span>
                    <span>{pilloText.label}</span>
                  </span>
                </div>
              </div>
            </div>
          </a>
        </div>

        {/* Right Column: crossword, sudoku, word path */}
        <div className="flex flex-col gap-4">
          {/* crossword */}
          <div
            data-testid="play-status-cueword"
            data-status={crosswordStatus}
            className="min-w-0"
          >
            {isComingSoonCrossword ? (
              <div className="veil flex flex-col justify-between p-6 min-h-36 text-ink">
                <div>
                  <span className="display block text-2xl text-ink font-medium break-words">
                    {crosswordGame.name}
                  </span>
                  <p className="mt-2 text-sm text-ink-soft">{crosswordGame.line}</p>
                </div>
                <div className="mt-4 pt-2">
                  <span className="text-sm font-semibold text-ink">
                    <span className="sr-only">
                      {crosswordText.symbol} {crosswordText.label}
                    </span>
                    <span>coming soon</span>
                  </span>
                </div>
              </div>
            ) : (
              <a
                href={crosswordGame.href}
                className="veil flex flex-col justify-between p-6 min-h-36 text-ink no-underline group hover:border-line transition-colors"
              >
                <div>
                  <span className="display block text-2xl text-ink font-medium break-words">
                    {crosswordGame.name}
                  </span>
                  <p className="mt-2 text-sm text-ink-soft">{crosswordGame.line}</p>
                </div>
                <div className="mt-4 pt-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                    <span aria-hidden="true">{crosswordText.symbol}</span>
                    <span>{crosswordText.label}</span>
                  </span>
                </div>
              </a>
            )}
          </div>

          {/* sudoku */}
          <div
            data-testid="play-status-triage"
            data-status={sudokuStatus}
            className="min-w-0"
          >
            <a
              href={sudokuGame.href}
              className="veil flex flex-col justify-between p-6 min-h-36 text-ink no-underline group hover:border-line transition-colors"
            >
              <div>
                <span className="display block text-2xl text-ink font-medium break-words">{sudokuGame.name}</span>
                <p className="mt-2 text-sm text-ink-soft">{sudokuGame.line}</p>
              </div>
              <div className="mt-4 pt-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <span aria-hidden="true">{sudokuText.symbol}</span>
                  <span>{sudokuText.label}</span>
                </span>
              </div>
            </a>
          </div>

          {/* word path */}
          <div
            data-testid="play-status-suture"
            data-status={wordPathStatus}
            className="min-w-0"
          >
            <a
              href={wordPathGame.href}
              className="veil flex flex-col justify-between p-6 min-h-36 text-ink no-underline group hover:border-line transition-colors"
            >
              <div>
                <span className="display block text-2xl text-ink font-medium break-words">{wordPathGame.name}</span>
                <p className="mt-2 text-sm text-ink-soft">{wordPathGame.line}</p>
              </div>
              <div className="mt-4 pt-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <span aria-hidden="true">{wordPathText.symbol}</span>
                  <span>{wordPathText.label}</span>
                </span>
              </div>
            </a>
          </div>
        </div>
      </div>

      {!saved.on && (
        <p className="mt-4 text-sm text-ink-soft" data-testid="play-status-note">
          checked on this device only. this browser won't keep stats, so finished games aren't marked after you leave.
        </p>
      )}
    </section>
  );
}
