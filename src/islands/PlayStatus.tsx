import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_RESULT_EVENT, heldRounds, loadStats, localDay, STATS_STORAGE_KEY, type SavedStats } from './gameresults';
import { MARK_SYMBOL, type Mark } from './pulse';
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

/**
 * The sample pack on the pillo card: the game's own marks (MARK_SYMBOL) and tile colours, so the hub and the game read
 * the same way. Brand colours only, and every tile carries its mark, so colour is never the only signal. "In place" is
 * Espresso by day as in the game, and the ink colour in the evening, because the game's Walnut only reads over its
 * lighter foil; "not in the word" keeps the plain pocket colour for the same reason.
 */
const PILL_CLASS: Readonly<Record<Mark, string>> = {
  here: 'bg-ink text-on-button',
  elsewhere: 'bg-pillo-elsewhere text-on-pillo-elsewhere',
  absent: 'bg-page text-ink-soft',
};

const SAMPLE_PACK: ReadonlyArray<readonly [string, Mark]> = [
  ['A', 'absent'], ['B', 'elsewhere'], ['C', 'absent'], ['D', 'here'], ['E', 'absent'],
  ['F', 'absent'], ['G', 'elsewhere'], ['H', 'here'], ['I', 'absent'], ['J', 'here'],
];

/** "how to read the pack", in the copy deck's words, with the game's marks. */
const LEGEND: ReadonlyArray<readonly [Mark, string, string]> = [
  ['here', 'filled', 'right letter, right spot'],
  ['elsewhere', 'half', 'in the word, wrong spot'],
  ['absent', 'empty', 'not in the word'],
];

/** A card's name link: at least 44 px tall, and its ::after covers the whole card, so the card is one tap target. */
const CARD_LINK = 'inline-flex min-h-11 items-center text-ink no-underline after:absolute after:inset-0';

/** A card's status: the symbol is decoration, the words carry the meaning (never colour alone). */
function StatusLine({ text }: { text: { symbol: string; label: string } }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
      <span aria-hidden="true">{text.symbol}</span>
      <span>{text.label}</span>
    </span>
  );
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

  const game = (id: GameId) => games.find((row) => row.id === id);
  const pilloGame = game('pulse');
  const pilloStatus = statusFor('pulse', today, saved.stats, heard);
  const pilloText = statusDisplayFor('pulse', pilloStatus);
  const side = (['cueword', 'triage', 'suture'] as const).flatMap((id) => {
    const row = game(id);
    if (!row) return [];
    const status = statusFor(id, today, saved.stats, heard);
    return [{ row, status, text: statusDisplayFor(id, status, id === 'suture' ? details[heardKey('suture', today)] : undefined) }];
  });

  return (
    <section className="mt-4" aria-labelledby="today-status-heading" data-testid="play-status">
      <h2 id="today-status-heading" className="sr-only">today</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: the pillo card (two columns wide on desktop). Only the name is the link; it covers the card. */}
        {pilloGame && (
          <div data-testid="play-status-pulse" data-status={pilloStatus} className="min-w-0 lg:col-span-2">
            <div className="veil relative p-6 sm:p-8 text-ink hover:border-line transition-colors">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                {/* Title, line, blister pack */}
                <div className="flex flex-col min-w-0">
                  <h3 className="display text-3xl sm:text-4xl text-ink font-medium break-words">
                    <a href={pilloGame.href} className={CARD_LINK}>
                      {pilloGame.name}
                    </a>
                  </h3>
                  <p className="mt-2 text-sm text-ink-soft">{pilloGame.line}</p>

                  {/* Blister pack illustration - sits directly under the line */}
                  <div className="mt-6 w-full max-w-xs bg-surface p-3 sm:p-4 rounded-xl select-none" aria-hidden="true">
                    <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
                      {/* Two sample guesses in the pillo game's own tile colours and marks, then 20 empty pockets. */}
                      {SAMPLE_PACK.map(([letter, mark]) => (
                        <div
                          key={letter}
                          className={`aspect-square rounded-full flex flex-col items-center justify-center ${PILL_CLASS[mark]}`}
                        >
                          <span className="text-xs sm:text-base font-bold leading-none">{letter}</span>
                          <span className="text-xs leading-none mt-0.5">{MARK_SYMBOL[mark]}</span>
                        </div>
                      ))}
                      {Array.from({ length: 20 }).map((_, i) => (
                        <div key={i} className="aspect-square rounded-full bg-page border border-dashed border-line" />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Key, share note, status */}
                <div className="flex flex-col min-w-0 pt-1">
                  <h4 className="text-sm font-bold text-ink">how to read the pack</h4>
                  <ul className="mt-3 space-y-2 text-sm">
                    {LEGEND.map(([mark, word, meaning]) => (
                      <li key={mark}>
                        <span className="font-bold text-ink">
                          <span aria-hidden="true">{MARK_SYMBOL[mark]} </span>
                          {word}{' '}
                        </span>
                        <span className="text-ink-soft">{meaning}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-ink-soft" data-testid="pillo-share-note">
                    the share line is plain words. no colored squares.
                  </p>

                  <div className="mt-6 pt-4 border-t border-line">
                    <StatusLine text={pilloText} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right: crossword, sudoku, word path */}
        <div className="flex flex-col gap-4">
          {side.map(({ row, status, text }) => {
            // A closed crossword is a plain card: no link, no focus stop, and only the visible "coming soon".
            const closed = row.id === 'cueword' && isComingSoonCrossword;
            return (
              <div key={row.id} data-testid={`play-status-${row.id}`} data-status={status} className="min-w-0">
                <div
                  className={`veil relative flex flex-col justify-between p-6 min-h-36 text-ink${closed ? '' : ' hover:border-line transition-colors'}`}
                >
                  <div>
                    <h3 className="display text-2xl text-ink font-medium break-words">
                      {closed ? row.name : (
                        <a href={row.href} className={CARD_LINK}>
                          {row.name}
                        </a>
                      )}
                    </h3>
                    <p className="mt-2 text-sm text-ink-soft">{row.line}</p>
                  </div>
                  <div className="mt-4 pt-2">
                    {closed ? <span className="text-sm font-semibold text-ink">coming soon</span> : <StatusLine text={text} />}
                  </div>
                </div>
              </div>
            );
          })}
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
