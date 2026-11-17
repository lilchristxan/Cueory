import '../styles/pillo.css';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  canSetHardMode,
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
  setHardMode,
  shareText,
  startPulse,
  untilNextPuzzle,
  waitInWords,
  wordProblem,
  WORD_LENGTH,
  type Mark,
  type PulseState,
} from './pulse';
import { dayLabel } from './daily';
import { heldRounds, loadStats, localDay, reportProgress, reportRound } from './gameresults';
import { dailyStats, recordResult, type DailyStats, type GameStats } from './gamestats';
import { loadWordList } from './pillowords';
import ResultBrandMark from './ResultBrandMark';
import { GameHelpButton, GameHelpCard, useGameHelp } from './GameHelp';
import { gameName } from '../config/games';
import { useSharedGameSettings } from './GameSettings';
import { browserStorage } from '../scripts/storage';

interface Puzzle {
  word: string;
  cue: string;
}

interface Props {
  /** Sample puzzles: the page picks one for the visitor's own date. */
  puzzles: Puzzle[];
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const primaryButton = 'rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const columns = Array.from({ length: WORD_LENGTH }, (_, i) => i);

/** What the finish screen shows from the private stats: nothing kept (stats off), or the numbers and today's row. */
type FinishStats = { on: false } | { on: true; stats: DailyStats; todayRow: number | undefined };

/** The private stats as they stand now, with this page's finished rounds that the stats panel hasn't kept yet. */
function finishStats(day: string): FinishStats {
  const saved = loadStats(browserStorage(), day);
  if (!saved.on) return { on: false };
  const all = heldRounds().reduce<GameStats>((kept, round) => recordResult(kept, round), saved.stats);
  const today = all.find((result) => result.game === 'pulse' && result.day === day);
  return { on: true, stats: dailyStats(all, 'pulse', day, GUESSES), todayRow: today?.solved ? today.tries : undefined };
}

/** One setting: a real button with switch semantics, its state in words as well as by its look. */
function Setting({ label, on, onChange, disabled, note }: {
  label: string;
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
  note?: string;
}) {
  const id = `pillo-setting-${label.replace(/\W+/g, '-')}`;
  return (
    <li className="pillo-setting">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={disabled || undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        className="pillo-switch"
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

/** One pocket of the blister pack, with its pill: a guessed letter and its mark, a typed letter, or nothing yet. */
function Pocket({ letter, mark, typed, next }: { letter?: string; mark?: Mark; typed?: boolean; next?: boolean }) {
  const kind = mark ? ` pillo-${mark}` : typed ? ' pillo-typed' : next ? ' pillo-next' : '';
  return (
    <span className="pillo-pocket">
      <span className={`pillo-pill${kind}`}>
        {letter && <span className="pillo-letter">{letter.toUpperCase()}</span>}
        {mark && <span className="pillo-mark">{MARK_SYMBOL[mark]}</span>}
      </span>
    </span>
  );
}

/**
 * pillo (Task 114): guess the five-letter word of the day in six tries, on a foil blister pack. After each guess every
 * letter is a pill marked in place (●), elsewhere in the word (○) or not in it (·): by a symbol on the pill and in words
 * for screen readers, never by color alone. Type in the field that lies over the row being typed, or tap the letter
 * keys. Rendered only in the browser (client:only); without JavaScript the page shows its <noscript> note instead.
 */
export default function PulseGame({ puzzles }: Props) {
  const today = useMemo(() => new Date(), []);
  const puzzle = useMemo(() => puzzleForDay(playablePuzzles(puzzles), dayNumber(today)), [puzzles, today]);
  const [state, setState] = useState<PulseState>(() => startPulse(puzzle?.word ?? ''));
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const howToPlay = useGameHelp('pulse');
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  // High contrast is the shared game setting (#734): one switch for every game, remembered with the others.
  const { settings: shared, update: updateShared } = useSharedGameSettings();
  const contrast = shared.highContrast;
  const [keysOnly, setKeysOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finish, setFinish] = useState<FinishStats>({ on: false });
  const [wait, setWait] = useState('');
  const result = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  const words = useRef<ReadonlySet<string> | undefined>(undefined);
  const busy = useRef(false);

  // The word list loads in the background; a guess sent before it arrives waits for it.
  useEffect(() => {
    void loadWordList().then((list) => {
      words.current = list;
    });
  }, []);

  // The finish screen counts down to the next word (local midnight), once a minute.
  useEffect(() => {
    if (state.status === 'playing') return;
    const tick = () => setWait(waitInWords(untilNextPuzzle(new Date())));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [state.status]);

  // When the game ends, focus moves to the result so it is read out, and the share button is next. The round is also
  // reported once, for the stats panel, which keeps it only if the student has turned stats on (D-76).
  useEffect(() => {
    if (state.status === 'playing') return;
    result.current?.focus();
    if (reported.current) return;
    reported.current = true;
    const tries = GUESSES - guessesLeft(state);
    const solved = state.status === 'solved';
    const day = localDay(today);
    // A round finished after midnight still counts as played, but never extends a streak.
    const offDay = localDay(new Date()) !== day;
    reportRound({
      game: 'pulse',
      day,
      solved,
      tries,
      ...(offDay ? { offDay: true as const } : {}),
      card: {
        game: 'pulse',
        name: 'pillo',
        date: dayLabel(today),
        result: solved ? `${tries} / ${GUESSES}` : 'not solved',
        ...(state.hard ? { shareResult: `${solved ? `${tries} / ${GUESSES}` : 'not solved'} · hard mode` } : {}),
        summary: solved ? 'you found today\'s word.' : 'today\'s word is ready for another try tomorrow.',
        stats: [{ label: 'guesses', value: `${tries}` }],
        nextMessage: `next word in ${waitInWords(untilNextPuzzle(new Date()))}.`,
        path: '/play/pillo',
      },
    });
    // The stats panel keeps the round while the event above is handled, so storage already holds it when stats are on.
    setFinish(finishStats(localDay(new Date())));
  }, [state.status]);

  if (!puzzle) return <p>no puzzle today.</p>;
  const marks = letterMarks(state.guesses);
  const playing = state.status === 'playing';
  const left = guessesLeft(state);
  const leftWords = `${left} of ${GUESSES} ${left === 1 ? 'guess' : 'guesses'} left`;
  // Rows below the guesses: the one being typed (while playing), then bare pockets.
  const emptyRows = GUESSES - state.guesses.length - (playing ? 1 : 0);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!playing || busy.current) return;
    busy.current = true;
    const word = cleanGuess(text);
    const list = words.current ?? (await loadWordList());
    busy.current = false;
    // A word that isn't in the list, or that breaks Hard Mode, is explained and never uses up a guess.
    const why = wordProblem(state, word, list);
    if (why) {
      setProblem(why);
      setSaid(why);
      return;
    }
    const next = playGuess(state, word, list);
    setState(next);
    // The first guess of the day tells the /play daily status that today's round has started.
    if (state.guesses.length === 0) reportProgress({ game: 'pulse', day: localDay(today) });
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
    const line = shareText(state, dayLabel(today));
    try {
      await navigator.clipboard.writeText(line);
      setCopied(`copied: ${line}`);
    } catch {
      setCopied(line);
    }
  };

  const keyLabel = (letter: string, mark: Mark | undefined) => (mark ? `${letter}, ${MARK_WORDS[mark]}` : letter);
  const rowClass = (row: number) => `pillo-row${row === GUESSES - 1 ? ' pillo-row-last' : ''}`;

  const hardLocked = !canSetHardMode(state);
  const typedWords = text ? `typed so far: ${Array.from(text).join(' ')}.` : 'nothing typed yet.';

  return (
    <div className={`pillo${contrast ? ' pillo-contrast' : ''}`} data-testid="pulse">
      <div className="pillo-top">
        <p className="pillo-status">
          guess the {WORD_LENGTH}-letter word · <strong>{leftWords}</strong>
        </p>
        {/* The same count as the words beside it, drawn as a blister strip: a used guess leaves an empty pocket. */}
        <span className="pillo-strip" aria-hidden="true" data-testid="pulse-strip">
          {Array.from({ length: GUESSES }, (_, i) => (
            <span key={i} className={`pillo-strip-pocket${i >= GUESSES - left ? ' pillo-strip-pill' : ''}`} />
          ))}
        </span>
        <GameHelpButton help={howToPlay} name={gameName('pulse')} className="corner-button corner-button-quiet" />
      </div>
      <GameHelpCard help={howToPlay} name={gameName('pulse')} />

      <div className="pillo-pack mt-4">
        <ol className="pillo-board" aria-label="your guesses">
          {state.guesses.map((guess, row) => (
            <li key={row} className={rowClass(row)} aria-label={`guess ${row + 1}: ${guess.word}. ${guessInWords(guess)}`}>
              {Array.from(guess.word, (letter, i) => (
                <Pocket key={i} letter={letter} mark={guess.marks[i]} />
              ))}
            </li>
          ))}
        </ol>

        {playing && keysOnly && (
          // On-screen keyboard only: there is no field, so the device keyboard never opens and typed keys are ignored.
          <div className={rowClass(state.guesses.length)} data-testid="pulse-typed-row">
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
            <label htmlFor="pillo-guess" className="sr-only">
              your guess
            </label>
            <input
              id="pillo-guess"
              className="pillo-field"
              value={text}
              onChange={(event) => type(event.target.value)}
              maxLength={WORD_LENGTH}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-describedby={problem ? 'pillo-problem pillo-hint' : 'pillo-hint'}
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

      <p id="pillo-hint" className="sr-only">
        {keysOnly
          ? `tap the letters below to spell a ${WORD_LENGTH}-letter word, then tap enter.`
          : `type a ${WORD_LENGTH}-letter word and press enter, or tap the letters below.`}
      </p>
      {problem && (
        <p id="pillo-problem" className="mt-3 text-sm text-ink" data-testid="pulse-problem">
          {problem}
        </p>
      )}

      {playing ? (
        <div className="pillo-keys mt-6" role="group" aria-label="letters">
          {KEY_ROWS.map((row, r) => (
            <div key={row} className="pillo-key-row">
              {r === KEY_ROWS.length - 1 && (
                <button
                  type="button"
                  className="pillo-key pillo-key-wide"
                  aria-label="delete"
                  onClick={() => type(text.slice(0, -1))}
                >
                  ⌫
                </button>
              )}
              {Array.from(row, (letter) => {
                const mark = marks.get(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    className={`pillo-key${mark ? ` pillo-${mark}` : ''}`}
                    aria-label={keyLabel(letter, mark)}
                    onClick={() => type(text + letter)}
                  >
                    <span aria-hidden="true">{letter.toUpperCase()}</span>
                    {mark && (
                      <span className="pillo-key-mark" aria-hidden="true">
                        {MARK_SYMBOL[mark]}
                      </span>
                    )}
                  </button>
                );
              })}
              {r === KEY_ROWS.length - 1 && (
                <button type="button" className="pillo-key pillo-key-wide" onClick={() => void submit()}>
                  enter
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div ref={result} tabIndex={-1} className="pillo-result mt-6" data-testid="pulse-result">
          <p className="text-lg font-medium">
            {state.status === 'solved' ? 'solved.' : `the word was ${state.answer}.`}
          </p>
          <p className="mt-1 text-ink-soft">{shareText(state, dayLabel(today))}</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={share}>
            copy my result
          </button>
          {copied && <p className="mt-2 text-sm text-ink-soft">{copied}</p>}

          <section className="pillo-stats mt-6" aria-labelledby="pillo-stats-heading" data-testid="pulse-stats">
            <h3 id="pillo-stats-heading" className="font-semibold">
              your pillo stats
            </h3>
            {finish.on ? (
              <>
                <dl className="pillo-stat-list mt-3">
                  {[
                    ['played', `${finish.stats.played}`],
                    ['win %', `${finish.stats.winPercent}`],
                    ['current streak', `${finish.stats.currentStreak}`],
                    ['longest streak', `${finish.stats.longestStreak}`],
                  ].map(([label, value]) => (
                    <div key={label} className="pillo-stat">
                      <dt className="text-sm text-ink-soft">{label}</dt>
                      <dd className="text-lg font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <h4 id="pillo-distribution" className="mt-4 text-sm font-semibold">
                  guesses it took
                </h4>
                <ol className="pillo-distribution mt-2" aria-labelledby="pillo-distribution">
                  {finish.stats.distribution.map((count, i) => {
                    const most = Math.max(1, ...finish.stats.distribution);
                    const mine = finish.todayRow === i + 1;
                    return (
                      <li
                        key={i}
                        className={`pillo-dist-row${mine ? ' pillo-dist-today' : ''}`}
                        data-testid={mine ? 'pulse-today-row' : undefined}
                      >
                        <span className="pillo-dist-label">{i + 1}</span>
                        <span
                          className="pillo-dist-bar"
                          style={{ '--pillo-share': count / most } as CSSProperties}
                          aria-hidden="true"
                        />
                        <span className="pillo-dist-count">
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
                stats are off. turn on “keep my stats” below to see games played, win %, streaks and the guesses each
                game took. they stay in this browser.
              </p>
            )}
          </section>

          <p className="mt-4 text-sm text-ink-soft">a new word comes tomorrow.</p>
          <p className="mt-1 text-sm text-ink-soft" data-testid="pulse-next">
            next word in {wait}.
          </p>
          <ResultBrandMark path="/play" />
        </div>
      )}

      {/*
        The switches render only while the disclosure is open. Chromium hides a closed <details> body with
        content-visibility, which keeps its buttons laid out and "visible" but out of the Tab order.
      */}
      <details
        className="pillo-settings mt-8"
        data-testid="pulse-settings"
        onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
      >
        <summary className="pillo-settings-summary">pillo settings</summary>
        {settingsOpen && (
          <>
            <ul className="mt-3 flex flex-col gap-3">
              <Setting
                label="hard mode"
                on={Boolean(state.hard)}
                disabled={hardLocked}
                onChange={() => setState((now) => setHardMode(now, !now.hard))}
                note={
                  hardLocked
                    ? 'hard mode can change only before your first guess of the day.'
                    : 'letters shown in place or in the word must be used in every later guess.'
                }
              />
              <Setting label="high contrast" on={contrast} onChange={() => updateShared({ highContrast: !contrast })} note="bolder edges and larger marks, in every game." />
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
            <p className="mt-3 text-sm text-ink-soft">hard mode and on-screen keyboard only last for this visit. high contrast is the same switch as in game settings, so it stays on for every game. light or evening is in the footer.</p>
          </>
        )}
      </details>

      <section className="pillo-legend mt-8" aria-labelledby="pillo-how">
        <h3 id="pillo-how" className="text-lg font-semibold">
          how to play
        </h3>
        <ul className="mt-3 flex flex-col gap-3 text-sm">
          {(['here', 'elsewhere', 'absent'] as const).map((mark) => (
            <li key={mark} className="pillo-legend-row">
              <span className={`pillo-pill pillo-${mark}`} aria-hidden="true">
                <span className="pillo-mark">{MARK_SYMBOL[mark]}</span>
              </span>
              <span>
                {MARK_SYMBOL[mark]} {mark === 'here' ? 'in its place' : mark === 'elsewhere' ? 'in the word, somewhere else' : 'not in the word'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">
          every word has {WORD_LENGTH} letters, and you have {GUESSES} guesses.
        </p>
      </section>

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="pulse-live">
        {said}
      </p>
    </div>
  );
}
