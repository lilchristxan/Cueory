import '../styles/vialo.css';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  cleanGuess,
  dayNumber,
  GUESSES,
  guessesLeft,
  guessInWords,
  letterMarks,
  MARK_SYMBOL,
  MARK_WORDS,
  playablePuzzles,
  playGuess,
  puzzleForDay,
  untilNextPuzzle,
  waitInWords,
  wordProblem,
  WORD_LENGTH,
  type Mark,
  type PulseState,
} from './pulse';
import { gameName } from '../config/games';
import {
  canSetVialoHardMode,
  loadVialoHardMode,
  rememberVialoHardMode,
  setVialoHardMode,
  startVialo,
  vialoShareText,
} from './vialo';
import { dayLabel } from './daily';
import { heldRounds, loadStats, localDay, reportProgress, reportRound } from './gameresults';
import { dailyStats, recordResult, type DailyStats, type GameStats } from './gamestats';
import { loadWordList } from './pillowords';
import ResultBrandMark from './ResultBrandMark';
import { GameHelpCard, useGameHelp } from './GameHelp';
import GameHeader from './GameHeader';
import { useSharedGameSettings } from './GameSettings.tsx';
import { browserStorage } from '../scripts/storage';
import { VIALO_KEY_ROWS } from './vialokeys';

interface Puzzle {
  word: string;
  cue: string;
}

interface Props {
  /** Sample puzzles: the page picks one for the visitor's own date. */
  puzzles: Puzzle[];
}

const primaryButton = 'rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const columns = Array.from({ length: WORD_LENGTH }, (_, i) => i);

type FinishStats = { on: false } | { on: true; stats: DailyStats; todayRow: number | undefined };

function finishStats(day: string): FinishStats {
  const saved = loadStats(browserStorage(), day);
  if (!saved.on) return { on: false };
  const all = heldRounds().reduce<GameStats>((kept, round) => recordResult(kept, round), saved.stats);
  const today = all.find((result) => (result.game === 'vialo' || result.game === 'pulse') && result.day === day);
  return { on: true, stats: dailyStats(all, 'vialo', day, GUESSES), todayRow: today?.solved ? today.tries : undefined };
}

function VialoLegend() {
  return (
    <ul className="vialo-legend flex flex-col gap-3 text-sm" aria-label="what the marks mean" data-testid="vialo-legend">
      {(['here', 'elsewhere', 'absent'] as const).map((mark) => (
        <li key={mark} className="vialo-legend-row">
          <span className={`vialo-pill vialo-${mark}`} aria-hidden="true">
            <span className="vialo-mark">{MARK_SYMBOL[mark]}</span>
          </span>
          <span>
            {MARK_SYMBOL[mark]} {mark === 'here' ? 'in its place' : mark === 'elsewhere' ? 'in the word, somewhere else' : 'not in the word'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Setting({ label, on, onChange, disabled, note }: {
  label: string;
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
  note?: string;
}) {
  const id = `vialo-setting-${label.replace(/\W+/g, '-')}`;
  return (
    <li className="vialo-setting">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={disabled || undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        className="vialo-switch"
        onClick={() => {
          if (!disabled) onChange();
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="font-bold">
          {on ? 'on' : 'off'}
        </span>
      </button>
      {note && (
        <p id={`${id}-note`} className="mt-1 text-sm text-ink-soft">
          {note}
        </p>
      )}
    </li>
  );
}

function Pocket({ letter, mark, typed, next }: { letter?: string; mark?: Mark; typed?: boolean; next?: boolean }) {
  const kind = mark ? ` vialo-${mark}` : typed ? ' vialo-typed' : next ? ' vialo-next' : '';
  return (
    <span className="vialo-pocket">
      <span className={`vialo-pill${kind}`}>
        {letter && <span className="vialo-letter">{letter.toUpperCase()}</span>}
        {mark && <span className="vialo-mark">{MARK_SYMBOL[mark]}</span>}
      </span>
    </span>
  );
}

export default function VialoGame({ puzzles }: Props) {
  const today = useMemo(() => new Date(), []);
  const day = localDay(today);
  const puzzle = useMemo(() => puzzleForDay(playablePuzzles(puzzles), dayNumber(today)), [puzzles, today]);
  const [state, setState] = useState<PulseState>(() => {
    const savedHardMode = loadVialoHardMode(browserStorage(), day);
    return startVialo(puzzle?.word ?? '', savedHardMode, savedHardMode !== undefined);
  });
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const howToPlay = useGameHelp('vialo');
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const { settings: shared } = useSharedGameSettings();
  const contrast = shared.highContrast;
  const [keysOnly, setKeysOnly] = useState(false);
  const [finish, setFinish] = useState<FinishStats>({ on: false });
  const [wait, setWait] = useState('');
  const result = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  const words = useRef<ReadonlySet<string> | undefined>(undefined);
  const busy = useRef(false);

  useEffect(() => {
    void loadWordList().then((list) => {
      words.current = list;
    });
  }, []);

  useEffect(() => {
    if (state.status === 'playing') return;
    const tick = () => setWait(waitInWords(untilNextPuzzle(new Date())));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [state.status]);

  useEffect(() => {
    if (state.status === 'playing') return;
    result.current?.focus();
    if (reported.current) return;
    reported.current = true;
    const tries = GUESSES - guessesLeft(state);
    const solved = state.status === 'solved';
    const day = localDay(today);
    const offDay = localDay(new Date()) !== day;
    reportRound({
      game: 'vialo',
      day,
      solved,
      tries,
      ...(offDay ? { offDay: true as const } : {}),
      card: {
        game: 'vialo',
        name: gameName('vialo'),
        date: dayLabel(today),
        result: solved ? `${tries} / ${GUESSES}` : 'not solved',
        shareResult: solved ? `${tries}/${GUESSES}` : `x/${GUESSES}`,
        summary: solved ? "you found today's word." : "today's word is ready for another try tomorrow.",
        stats: [{ label: 'guesses', value: `${tries}` }],
        nextMessage: `next word in ${waitInWords(untilNextPuzzle(new Date()))}.`,
        path: '/play/vialo',
      },
    });
    setFinish(finishStats(localDay(new Date())));
  }, [state.status]);

  if (!puzzle) return <p>no puzzle today.</p>;
  const marks = letterMarks(state.guesses);
  const playing = state.status === 'playing';
  const left = guessesLeft(state);
  const leftWords = `${left} of ${GUESSES} ${left === 1 ? 'guess' : 'guesses'} left`;
  const emptyRows = GUESSES - state.guesses.length - (playing ? 1 : 0);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!playing || busy.current) return;
    busy.current = true;
    const word = cleanGuess(text);
    const list = words.current ?? (await loadWordList());
    busy.current = false;
    const why = wordProblem(state, word, list);
    if (why) {
      setProblem(why);
      setSaid(why);
      return;
    }
    const next = playGuess(state, word, list);
    setState(next);
    if (state.guesses.length === 0) {
      rememberVialoHardMode(browserStorage(), day, Boolean(next.hard));
      reportProgress({ game: 'vialo', day });
    }
    setText('');
    setProblem('');
    const last = next.guesses.at(-1)!;
    const n = guessesLeft(next);
    const end =
      next.status === 'solved'
        ? ' solved.'
        : next.status === 'out'
          ? ` out of guesses. the word was ${next.answer}.`
          : ` ${n} ${n === 1 ? 'guess' : 'guesses'} left.`;
    setSaid(`${guessInWords(last)}${end}`);
  };

  const type = (value: string) => {
    setText(cleanGuess(value).slice(0, WORD_LENGTH));
    setProblem('');
  };

  const share = async () => {
    const line = vialoShareText(state, dayLabel(today));
    try {
      await navigator.clipboard.writeText(line);
      setCopied(`copied: ${line}`);
    } catch {
      setCopied(line);
    }
  };

  const keyLabel = (letter: string, mark: Mark | undefined) => (mark ? `${letter}, ${MARK_WORDS[mark]}` : letter);
  const rowClass = (row: number) => `vialo-row${row === GUESSES - 1 ? ' vialo-row-last' : ''}`;

  const hardLocked = !canSetVialoHardMode(state);
  const typedWords = text ? `typed so far: ${Array.from(text).join(' ')}.` : 'nothing typed yet.';

  return (
    <div className={`vialo${contrast ? ' vialo-contrast' : ''}`} data-testid="vialo">
      <GameHeader
        name={gameName('vialo')}
        help={howToPlay}
        helpExtra={<VialoLegend />}
        settings={
          <fieldset>
            <legend>{gameName('vialo')}</legend>
            <ul className="flex flex-col gap-3">
              <Setting
                label="hard mode"
                on={Boolean(state.hard)}
                disabled={hardLocked}
                onChange={() => setState((now) => setVialoHardMode(now, !now.hard))}
                note={
                  hardLocked
                    ? 'hard mode can change only before your first guess of the day.'
                    : 'letters shown in place or in the word must be used in every later guess.'
                }
              />
              <Setting
                label="on-screen keyboard only"
                on={keysOnly}
                onChange={() => {
                  setKeysOnly((on) => !on);
                  setProblem('');
                }}
                note="only the letter keys below type, so your device keyboard stays closed."
              />
            </ul>
            <p className="mt-3 text-sm text-ink-soft">after your first accepted guess, hard mode stays set for that day. on-screen keyboard only lasts for this visit.</p>
          </fieldset>
        }
      />
      <p className="sr-only" data-testid="vialo-status">guess the {WORD_LENGTH}-letter word · {leftWords}</p>
      <GameHelpCard help={howToPlay} name={gameName('vialo')} extra={<VialoLegend />} />

      <div className="vialo-pack mt-4">
        <ol className="vialo-board" aria-label="your guesses">
          {state.guesses.map((guess, row) => (
            <li key={row} className={rowClass(row)} aria-label={`guess ${row + 1}: ${guess.word}. ${guessInWords(guess)}`}>
              {Array.from(guess.word, (letter, i) => (
                <Pocket key={i} letter={letter} mark={guess.marks[i]} />
              ))}
            </li>
          ))}
        </ol>

        {playing && keysOnly && (
          <div className={rowClass(state.guesses.length)} data-testid="vialo-typed-row">
            {columns.map((i) => (
              <Pocket key={i} letter={text[i]} typed={i < text.length} next={i === text.length} />
            ))}
            <p className="sr-only">{typedWords}</p>
          </div>
        )}

        {playing && !keysOnly && (
          <form className={rowClass(state.guesses.length)} onSubmit={(event) => void submit(event)} noValidate>
            {columns.map((i) => (
              <Pocket key={i} letter={text[i]} typed={i < text.length} next={i === text.length} />
            ))}
            <label htmlFor="vialo-guess" className="sr-only">
              your guess
            </label>
            <input
              id="vialo-guess"
              className="vialo-field"
              value={text}
              onChange={(event) => type(event.target.value)}
              maxLength={WORD_LENGTH}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-describedby={problem ? 'vialo-problem vialo-hint' : 'vialo-hint'}
              aria-invalid={problem ? true : undefined}
            />
          </form>
        )}

        {Array.from({ length: emptyRows }, (_, i) => {
          const row = GUESSES - emptyRows + i;
          return (
            <div key={row} className={rowClass(row)} aria-hidden="true">
              {columns.map((c) => (
                <Pocket key={c} />
              ))}
            </div>
          );
        })}
      </div>

      <p id="vialo-hint" className="sr-only">
        {keysOnly
          ? `tap the letters below to spell a ${WORD_LENGTH}-letter word, then tap enter.`
          : `type a ${WORD_LENGTH}-letter word and press enter, or tap the letters below.`}
      </p>
      {problem && (
        <p id="vialo-problem" className="mt-3 text-sm text-ink" data-testid="vialo-problem">
          {problem}
        </p>
      )}

      {playing ? (
        <div className="vialo-keys mt-6" role="group" aria-label="letters">
          {VIALO_KEY_ROWS.map((row, index) => {
            const last = index === VIALO_KEY_ROWS.length - 1;
            return (
              <div key={row} className="vialo-key-row">
                {last && (
                  <button type="button" className="vialo-key vialo-key-wide" onClick={() => void submit()}>
                    enter
                  </button>
                )}
                {Array.from(row, (letter) => {
                  const mark = marks.get(letter);
                  return (
                    <button
                      key={letter}
                      type="button"
                      className={`vialo-key${mark ? ` vialo-${mark}` : ''}`}
                      aria-label={keyLabel(letter, mark)}
                      onClick={() => type(text + letter)}
                    >
                      <span aria-hidden="true">{letter}</span>
                      {mark && (
                        <span className="vialo-key-mark" aria-hidden="true">
                          {MARK_SYMBOL[mark]}
                        </span>
                      )}
                    </button>
                  );
                })}
                {last && (
                  <button type="button" className="vialo-key vialo-key-wide" aria-label="delete" onClick={() => type(text.slice(0, -1))}>
                    <svg className="vialo-key-icon" viewBox="0 0 28 20" aria-hidden="true" focusable="false">
                      <path d="M9.5 1.5h15a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-15a2 2 0 0 1-1.5-.7L1.6 10 8 2.2a2 2 0 0 1 1.5-.7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="M13.5 6.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div ref={result} tabIndex={-1} className="vialo-result mt-6" data-testid="vialo-result">
          <p className="text-lg font-medium">
            {state.status === 'solved' ? 'solved.' : `the word was ${state.answer}.`}
          </p>
          <p className="mt-1 text-ink-soft">{vialoShareText(state, dayLabel(today))}</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={share}>
            copy my result
          </button>
          {copied && <p className="mt-2 text-sm text-ink-soft">{copied}</p>}

          <section className="vialo-stats mt-6" aria-labelledby="vialo-stats-heading" data-testid="vialo-stats">
            <h3 id="vialo-stats-heading" className="font-semibold">
              your {gameName('vialo')} stats
            </h3>
            {finish.on ? (
              <>
                <dl className="vialo-stat-list mt-3">
                  {[
                    ['played', `${finish.stats.played}`],
                    ['win %', `${finish.stats.winPercent}`],
                    ['current streak', `${finish.stats.currentStreak}`],
                    ['longest streak', `${finish.stats.longestStreak}`],
                  ].map(([label, value]) => (
                    <div key={label} className="vialo-stat">
                      <dt className="text-sm text-ink-soft">{label}</dt>
                      <dd className="text-lg font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <h4 id="vialo-distribution" className="mt-4 text-sm font-semibold">
                  guesses it took
                </h4>
                <ol className="vialo-distribution mt-2" aria-labelledby="vialo-distribution">
                  {finish.stats.distribution.map((count, i) => {
                    const most = Math.max(1, ...finish.stats.distribution);
                    const mine = finish.todayRow === i + 1;
                    return (
                      <li
                        key={i}
                        className={`vialo-dist-row${mine ? ' vialo-dist-today' : ''}`}
                        data-testid={mine ? 'vialo-today-row' : undefined}
                      >
                        <span className="vialo-dist-label">{i + 1}</span>
                        <span
                          className="vialo-dist-bar"
                          style={{ '--vialo-share': count / most } as CSSProperties}
                          aria-hidden="true"
                        />
                        <span className="vialo-dist-count">
                          {count} {count === 1 ? 'day' : 'days'}
                          {mine && <strong> · today</strong>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">
                this browser won't keep stats (private browsing or blocked site data), so games played, win %, streaks
                and the guesses each game took can't be shown.
              </p>
            )}
          </section>

          <p className="mt-4 text-sm text-ink-soft">a new word comes tomorrow.</p>
          <p className="mt-1 text-sm text-ink-soft" data-testid="vialo-next">
            next word in {wait}.
          </p>
          <ResultBrandMark path="/play" />
        </div>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="vialo-live">
        {said}
      </p>
    </div>
  );
}
