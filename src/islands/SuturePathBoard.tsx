import '../styles/wordpath.css';
import PrintLogo from './PrintLogo';
import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dayLabel } from './daily';
import { localDay, reportRound } from './gameresults';
import { FORFEIT_EVENT, rememberedForfeits } from '../scripts/printgate';
import { printGame } from './gameprint';
import { usePrintRequest } from './useprintrequest';
import { useGameHelp } from './GameHelp';
import GameHeader from './GameHeader';
import { playGameCue } from './gamesound';
import { useSharedGameSettings } from './GameSettings';
import { formatSolveTime } from './vialotimer';
import { newTimer, pauseTimer, resumeTimer, startTimer, stopTimer, timerElapsed, type SolveTimer } from './vialotimer';
import PicclineCue from './PicclineCue';
import { site } from '../config/site';
import { shake } from './SutureGame';
import { loadPicclineMs, loadPicclineSave, savePicclineBoard, savePicclineMs } from './picclinesave';
import type { Cell } from './suture';
import {
  announceProgress, backspace, printBoard, cellView, cuesUsed, firstWordFound, clearPicked, extend, hintsLeft, MIN_WORD, parsePathPuzzle, pathCellLabel, pathDone, pathShareLine,
  pickedWord, specialFoundFirst, startPath, submit, submitInWords, takeHint, WORDS_PER_HINT, wordsToNextHint,
  type CellLook, type PathState, type SuturePathPuzzle,
} from './suturepath';

const PicclineShare = lazy(() => import('./PicclineShare'));

interface Props {
  puzzle: SuturePathPuzzle;
  name: string;
  framed?: boolean;
  /** True where the page has piccline's own print sheet (/play/piccline); its print entry answers the Frame's printer. The older word path route keeps the older print. */
  printable?: boolean;
}

const printFoot = new URL(site.url).host;
const button = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';

/**
 * Each look has its own brand state, and found answers also carry a symbol, so color is never the only signal. Each
 * letter's button fills its whole column, so it stays at least 44 px wide on a 320 px screen. The round letter you see
 * is a smaller circle inside it (.wordpath-dot), which leaves room between neighbours for the lines that join a word.
 */
const looks: Record<CellLook, { dot: string; text: string }> = {
  // Found paths use the same tan fill as their joining line. The dot and diamond marks still distinguish theme words
  // from the thread without relying on colour.
  special: { dot: 'wordpath-found', text: 'wordpath-found-ink' },
  theme: { dot: 'wordpath-found', text: 'wordpath-found-ink' },
  // Teal is the active trace colour in the Piccline reference. The draft word below the grid mirrors the selected letters.
  picked: { dot: 'wordpath-pick', text: 'wordpath-pick-text' },
  hinted: { dot: 'wordpath-plain border-2 border-dashed border-ink-soft', text: '' },
  plain: { dot: 'wordpath-plain', text: '' },
};

/** Where each letter's circle sits inside the board (its padding box), measured from the page. */
interface Circle { x: number; y: number; r: number }
interface Layout { width: number; height: number; circles: Map<number, Circle> }
type Kind = 'picked' | 'theme' | 'special';
interface Line { key: string; kind: Kind; x1: number; y1: number; x2: number; y2: number }

/** A straight line from the edge of one circle to the edge of the next, or none when they touch. */
function joining(a: Circle, b: { x: number; y: number; r?: number }): Omit<Line, 'key' | 'kind'> | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const end = b.r ?? 0;
  if (distance <= a.r + end + 0.5) return null;
  const ux = dx / distance;
  const uy = dy / distance;
  return { x1: a.x + ux * a.r, y1: a.y + uy * a.r, x2: b.x - ux * end, y2: b.y - uy * end };
}

/** The theme-word symbol: a small round dot. */
function ThemeMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} aria-hidden="true" focusable="false" data-mark="theme">
      <circle cx="5" cy="5" r="3" fill="currentColor" />
    </svg>
  );
}

/** The thread symbol: a small diamond, unlike the theme-word dot in shape as well as state. */
function ThreadMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} aria-hidden="true" focusable="false" data-mark="thread">
      <path d="M5 1 9 5 5 9 1 5Z" fill="currentColor" />
    </svg>
  );
}

const cellOf = (element: Element | null): Cell | null => {
  const value = element?.closest('button[data-cell]')?.getAttribute('data-cell');
  if (!value) return null;
  const [row, col] = value.split(',').map(Number);
  return Number.isInteger(row) && Number.isInteger(col) ? [row!, col!] : null;
};

/**
 * The letter under a dragging finger or mouse, only near the letter's middle, so a drag across a corner to a diagonal
 * neighbour does not pick up the letters beside it.
 */
function cellAt(board: HTMLElement | null, x: number, y: number): Cell | null {
  if (!board || typeof document.elementFromPoint !== 'function') return null;
  const element = document.elementFromPoint(x, y);
  const target = element?.closest('button[data-cell]');
  if (!target || !board.contains(target)) return null;
  const box = target.getBoundingClientRect();
  const dx = (x - (box.left + box.width / 2)) / (box.width / 2);
  const dy = (y - (box.top + box.height / 2)) / (box.height / 2);
  return dx * dx + dy * dy <= 0.6 ? cellOf(target) : null;
}

/** Answers the Frame's printer on the older word path route only; the hook lives here so it registers only where it is needed. */
function LegacyPrint({ handler }: { handler: () => void }) {
  usePrintRequest('suture', handler);
  return null;
}

export function PathBoard({ puzzle, name, framed = false, printable = false }: Props) {
  const [today] = useState(() => new Date());
  // A board played earlier today on this device comes back as it was (a finished one stays finished); a new day starts fresh.
  const [restored] = useState(() => loadPicclineSave(puzzle, localDay(today)));
  const [state, setState] = useState<PathState>(() => restored ?? startPath());
  /** The board was already complete when the page opened: no card is thrown at the player again ("share" still offers it). */
  const restoredDone = Boolean(restored && pathDone(restored, puzzle));
  const current = useRef(state);
  const [focused, setFocused] = useState(0);
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const result = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const drag = useRef<{ start: Cell; moved: boolean; id: number } | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  /** While a finger or mouse drags, where it is inside the board, so the line can follow it. */
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const quietClickUntil = useRef(0);
  const { soundAllowed, settings: prefs, update: updateShared } = useSharedGameSettings();
  const sound = useRef(true);
  sound.current = soundAllowed();
  const help = useId();
  const howToPlay = useGameHelp('suture');
  const title = useId();
  const done = pathDone(state, puzzle);
  // Set below: once a print forfeits the day, the board on screen can no longer be played.
  const [forfeited, setForfeited] = useState(false);
  const [printNote, setPrintNote] = useState('');
  const locked = done || forfeited;
  const total = puzzle.words.length;
  // The solve timer (Christian, 25 Nov 2026): starts at the first letter, stops at the last answer, pauses in a hidden
  // tab. It is saved with the board, so a reload carries on from where it was.
  const savedMs = useState(() => loadPicclineMs(puzzle, localDay(today)))[0];
  const timer = useRef<SolveTimer>(
    restoredDone
      ? { elapsed: savedMs ?? 0, since: undefined, started: savedMs !== undefined, stopped: true }
      : restored && savedMs !== undefined
        ? { elapsed: savedMs, since: document.hidden ? undefined : Date.now(), started: true, stopped: false }
        : newTimer(),
  );
  const [timerRunning, setTimerRunning] = useState(() => timer.current.started && !timer.current.stopped);
  const [solveMs, setSolveMs] = useState<number | undefined>(restoredDone ? savedMs : undefined);
  const [, setTick] = useState(0);
  const [shareReady, setShareReady] = useState(restoredDone);
  const [shareOpen, setShareOpen] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);
  const shared = pathShareLine(state, puzzle, dayLabel(today), name);
  const word = pickedWord(state, puzzle).toLowerCase();

  const apply = (next: PathState) => {
    current.current = next;
    setState(next);
    const now = Date.now();
    if (!timer.current.started && (next.picked.length > 0 || next.found.length > 0)) {
      timer.current = startTimer(timer.current, now, !document.hidden);
      setTimerRunning(true);
    }
    if (pathDone(next, puzzle) && timer.current.started && !timer.current.stopped) {
      timer.current = stopTimer(timer.current, now);
      setTimerRunning(false);
      setSolveMs(timerElapsed(timer.current, now));
    }
    savePicclineBoard(puzzle, localDay(today), next, undefined, timer.current.started ? timerElapsed(timer.current, now) : undefined);
  };

  useEffect(() => {
    // Thinking time since the last move is saved when the tab is hidden or the page is left, so a reload or a trip to
    // another page never understates the solve time.
    const saveNow = () => {
      if (!timer.current.started) return;
      // Time only: this tab's board may be older than what another tab saved, and must not overwrite it.
      savePicclineMs(puzzle, localDay(today), timerElapsed(timer.current, Date.now()));
    };
    const onVisibility = () => {
      const now = Date.now();
      timer.current = document.hidden ? pauseTimer(timer.current, now) : resumeTimer(timer.current, now);
      if (document.hidden) saveNow();
      setTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', saveNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', saveNow);
    };
  }, []);

  useEffect(() => {
    if (!timerRunning || !prefs.showTimer) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, prefs.showTimer]);

  // The share card opens by itself as soon as the board is finished: state, not a timer (the short wait is a CSS
  // entrance delay on the card, removed by reduced motion). A board that reopens finished does not throw it again.
  useEffect(() => {
    if (shareReady && !restoredDone) setShareOpen(true);
  }, [shareReady]);

  useEffect(() => { if (done && !restoredDone) result.current?.focus(); }, [done]);

  // Measure every letter's circle, again whenever the board changes size (rotation, text size, a narrower window).
  useLayoutEffect(() => {
    const element = board.current;
    if (!element) return;
    const measure = () => {
      const frame = element.getBoundingClientRect();
      const left = frame.left + element.clientLeft;
      const top = frame.top + element.clientTop;
      const circles = new Map<number, Circle>();
      for (const [index, letter] of buttons.current) {
        const dot = letter.querySelector('.wordpath-dot')?.getBoundingClientRect();
        if (!dot) continue;
        circles.set(index, { x: dot.left + dot.width / 2 - left, y: dot.top + dot.height / 2 - top, r: dot.width / 2 });
      }
      setLayout({ width: element.clientWidth, height: element.clientHeight, circles });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  /** Where a pointer is inside the board's padding box. */
  const inBoard = (x: number, y: number) => {
    const element = board.current;
    if (!element) return null;
    const frame = element.getBoundingClientRect();
    return { x: x - frame.left - element.clientLeft, y: y - frame.top - element.clientTop };
  };

  // A finished board is reported once, for the stats panel, which keeps it only if the student turned stats on (D-76).
  // A board that reopens already finished was reported the day it was finished, so it is not reported again.
  const reported = useRef(restored ? pathDone(restored, puzzle) : false);
  useEffect(() => {
    if (!done || reported.current) return;
    reported.current = true;
    reportRound({
      game: 'suture',
      day: localDay(today),
      solved: true,
      tries: state.misses,
      hints: cuesUsed(state),
      specialFirst: specialFoundFirst(state, puzzle),
    });
    setShareReady(true);
  }, [done]);

  const send = () => {
    const before = current.current;
    const next = submit(before, puzzle);
    apply(next.state);
    if (firstWordFound(before, next.state)) announceProgress(localDay(today));
    setSaid(submitInWords(next.state, puzzle, next.outcome));
    if (next.outcome.kind === 'unknown') shake(board.current);
    // Only what the game already says in words and marks: a word found (or the finish), an extra word, or a word it refuses.
    const kind = next.outcome.kind;
    if (kind === 'found') playGameCue(pathDone(next.state, puzzle) ? 'solved' : 'good', sound.current);
    else if (kind === 'extra') playGameCue('good', sound.current);
    else if (kind !== 'empty') playGameCue('invalid', sound.current);
  };

  const add = (cell: Cell) => {
    const next = extend(current.current, puzzle, cell);
    if (next.outcome === 'ignored') return false;
    playGameCue('place', sound.current);
    apply(next.state);
    return true;
  };

  /** A tap, Enter or Space on a letter: tapping the last picked letter again submits the word. */
  const tap = (cell: Cell) => {
    if (performance.now() < quietClickUntil.current) return;
    const last = current.current.picked.at(-1);
    if (last && last[0] === cell[0] && last[1] === cell[1]) { send(); return; }
    if (!add(cell) && !done) setSaid('that letter is already used. pick another letter.');
    else setSaid(`picked: ${pickedWord(current.current, puzzle).toLowerCase()}`);
  };

  const down = (event: PointerEvent<HTMLButtonElement>, cell: Cell) => {
    if (done || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag.current = { start: cell, moved: false, id: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setFinger(inBoard(event.clientX, event.clientY));
  };

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    setFinger(inBoard(event.clientX, event.clientY));
    const target = cellAt(board.current, event.clientX, event.clientY);
    if (!target) return;
    if (!active.moved) {
      if (target[0] === active.start[0] && target[1] === active.start[1]) return;
      // The drag starts a new word at the letter it began on.
      const started = extend(clearPicked(current.current), puzzle, active.start);
      if (started.outcome === 'ignored') { drag.current = null; return; }
      apply(started.state);
      active.moved = true;
    }
    add(target);
  };

  const up = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    drag.current = null;
    setFinger(null);
    if (!active.moved) return; // A tap: the click that follows picks the letter.
    quietClickUntil.current = performance.now() + 400;
    send();
  };

  const clear = () => {
    if (!current.current.picked.length) return;
    playGameCue('remove', sound.current);
    apply(clearPicked(current.current));
    setSaid('pick cleared.');
  };

  const hint = () => {
    const before = current.current;
    const next = takeHint(before, puzzle);
    if (next === before) {
      setSaid(`no cue yet. find ${wordsToNextHint(before)} more ${wordsToNextHint(before) === 1 ? 'word' : 'words'} that are not theme words.`);
      return;
    }
    apply(next);
    setSaid(next.hint?.order
      ? 'cue: the marked letters are now numbered in order.'
      : `cue: the letters of one answer are marked. ${puzzle.words[next.hint!.answer]!.answer.length} letters.`);
  };

  const key = (event: KeyboardEvent<HTMLButtonElement>, cell: Cell) => {
    if (done || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
      if (current.current.picked.length) event.preventDefault();
      clear();
      return;
    }
    if (event.key === 'Backspace') {
      if (!current.current.picked.length) return;
      event.preventDefault();
      playGameCue('remove', sound.current);
      apply(backspace(current.current));
      setSaid(current.current.picked.length ? `picked: ${pickedWord(current.current, puzzle).toLowerCase()}` : 'pick cleared.');
      return;
    }
    let [row, col] = cell;
    if (event.key === 'ArrowLeft') col--;
    else if (event.key === 'ArrowRight') col++;
    else if (event.key === 'ArrowUp') row--;
    else if (event.key === 'ArrowDown') row++;
    else return; // Enter and Space reach the letter's button as a click.
    event.preventDefault();
    const width = puzzle.grid[0]!.length;
    if (row < 0 || col < 0 || row >= puzzle.grid.length || col >= width) return;
    const next = row * width + col;
    setFocused(next);
    buttons.current.get(next)?.focus();
  };

  const share = async () => {
    try { await navigator.clipboard.writeText(shared); setCopied(`copied: ${shared}`); }
    catch { setCopied(shared); }
  };

  /** The older word path route (no print sheet): printing an unfinished board counts as using a cue (once), and the player is told so in one line. */
  const printPuzzle = () => {
    const next = printBoard(current.current, puzzle);
    if (next !== current.current) {
      apply(next);
      const note = 'printing before you finish counts as a cue, so today won\'t count as solved without cues.';
      setPrintNote(note);
      setSaid(note);
    }
    printGame('suture');
  };

  // "print anyway" on an unfinished board (usegameprint.ts): today is already stored as not solved, so the board on screen
  // ends too (not saved: a reload starts a fresh board, and the stored first result of the day stands).
  useEffect(() => {
    const onForfeit = (event: Event) => {
      const detail = (event as CustomEvent<{ game?: string; day?: string }>).detail;
      if (detail?.game === 'piccline' && detail.day === localDay(today)) setForfeited(true);
    };
    // A forfeit confirmed before this board was listening is remembered on the page (printgate.ts).
    if (rememberedForfeits('piccline', localDay(today)).length > 0) setForfeited(true);
    window.addEventListener(FORFEIT_EVENT, onForfeit);
    return () => window.removeEventListener(FORFEIT_EVENT, onForfeit);
  }, [today]);

  // The lines that join each found answer and the word being picked, from circle edge to circle edge.
  const lines: Line[] = [];
  if (layout) {
    const width = puzzle.grid[0]!.length;
    const at = (cell: Cell) => layout.circles.get(cell[0] * width + cell[1]);
    const join = (path: readonly Cell[], kind: Kind, key: string) => {
      for (let i = 1; i < path.length; i++) {
        const a = at(path[i - 1]!);
        const b = at(path[i]!);
        const line = a && b ? joining(a, b) : null;
        if (line) lines.push({ key: `${key}-${i}`, kind, ...line });
      }
    };
    for (const index of state.found) {
      const answer = puzzle.words[index]!;
      join(answer.path, answer.special ? 'special' : 'theme', `found-${index}`);
    }
    join(state.picked, 'picked', 'picked');
    // While dragging, a line runs on from the last letter to the finger.
    const lastCell = state.picked.at(-1) ?? drag.current?.start;
    const last = lastCell ? at(lastCell) : undefined;
    const toFinger = finger && last ? joining(last, finger) : null;
    if (toFinger) lines.push({ key: 'finger', kind: 'picked', ...toFinger });
  }

  const left = hintsLeft(state);
  const towardHint = state.extras.length % WORDS_PER_HINT;
  /** A ready cue shows all three pips filled; otherwise one per other word found toward the next. */
  const filledPips = left > 0 ? WORDS_PER_HINT : towardHint;

  return (
    <section aria-labelledby={title} data-testid="suture" data-format="path" data-print-area="suture" className="wordpath">
      <PrintLogo />
      <PicclineCue id={title} text={puzzle.clue} />
      {/* The corner row (Christian's brief): the gear at the top left (word path has no settings of its own, so it holds
          the shared ones); print and the "?" at the top right. */}
      <GameHeader
        framed={framed}
        name={name}
        help={howToPlay}
        settings={
          <fieldset>
            <legend>{name}</legend>
            <label className="game-settings-option">
              <span>show the timer</span>
              <input type="checkbox" checked={prefs.showTimer} onChange={() => updateShared({ showTimer: !prefs.showTimer })} data-testid="suture-show-timer" />
            </label>
          </fieldset>
        }
      />
      {printNote && <p className="mt-2 text-center text-sm text-ink-soft" data-testid="suture-print-note" data-print-hidden>{printNote}</p>}
      {!printable && <LegacyPrint handler={printPuzzle} />}
      {forfeited && <p className="mt-2 text-center text-sm text-ink-soft" data-testid="suture-forfeit-note" data-print-hidden>you printed before finishing, so today counts as not solved.</p>}
      <p className="wordpath-time" data-testid="suture-time">
        {prefs.showTimer && <span>time: {formatSolveTime(timerElapsed(timer.current, Date.now()))}</span>}
      </p>
      <div className="wordpath-panel -mx-(--wordpath-bleed) mt-6 sm:mx-0 sm:mt-0 sm:px-(--spacing-stack)">
      <div
        ref={board}
        role="grid"
        aria-label={`${name} letters`}
        aria-describedby={help}
        aria-rowcount={puzzle.grid.length}
        aria-colcount={puzzle.grid[0]!.length}
        className="wordpath-board relative mt-4 sm:mt-0 flex flex-col sm:mx-auto border-(length:--border-board) border-transparent text-ink sm:p-3"
      >
        {layout && (
          <svg className="wordpath-lines" aria-hidden="true" focusable="false" data-testid="suture-lines"
            width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
            {lines.map((line) => (
              <line key={line.key} className={`wordpath-line wordpath-line-${line.kind}`} data-kind={line.kind}
                x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            ))}
          </svg>
        )}
        {puzzle.grid.map((row, r) => (
          <div key={r} role="row" aria-rowindex={r + 1} className="grid grid-cols-6">
            {[...row].map((letter, c) => {
              const cell: Cell = [r, c];
              const index = r * row.length + c;
              const view = cellView(state, puzzle, cell);
              return (
                <div key={c} role="gridcell" aria-colindex={c + 1} aria-selected={view.look === 'picked'}>
                  <button
                    ref={(element) => { if (element) buttons.current.set(index, element); else buttons.current.delete(index); }}
                    type="button"
                    tabIndex={index === focused ? 0 : -1}
                    disabled={locked}
                    aria-label={pathCellLabel(state, puzzle, cell)}
                    data-cell={`${r},${c}`}
                    data-look={view.look}
                    data-path
                    className={`wordpath-letter relative flex aspect-square w-full items-center justify-center rounded-full text-base font-bold sm:text-xl ${looks[view.look].text}`}
                    onFocus={() => setFocused(index)}
                    onPointerDown={(event) => down(event, cell)}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={() => { drag.current = null; setFinger(null); }}
                    onClick={() => tap(cell)}
                    onKeyDown={(event) => key(event, cell)}
                  >
                    <span aria-hidden="true" className={`wordpath-dot rounded-full ${looks[view.look].dot}`} />
                    <span aria-hidden="true" className="relative">{letter}</span>
                    {view.look === 'theme' && <ThemeMark className="wordpath-mark" />}
                    {view.look === 'special' && <ThreadMark className="wordpath-mark" />}
                    {/* A second cue's order remains visible when one of its letters is also picked. */}
                    {view.order !== undefined && (
                      <span aria-hidden="true" className="wordpath-step text-xs font-normal">{view.order}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="wordpath-answer-pills mt-4 flex flex-wrap items-center justify-center gap-2" data-print-hidden>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="answers found" data-testid="suture-found">
          {state.found.map((i) => {
            const answer = puzzle.words[i]!;
            return (
              <li key={i} className="wordpath-found-pill">
                <span aria-hidden="true">✓ </span>{answer.answer.toLowerCase()}
                <span className="sr-only">{answer.special ? ' (the thread)' : ' (theme word)'}</span>
              </li>
            );
          })}
        </ul>
        <span aria-hidden="true" className={word ? 'wordpath-active-pill' : 'hidden'}>
          <span data-testid="suture-picked">{word}</span>…
        </span>
        {Array.from({ length: total - state.found.length - (word ? 1 : 0) }, (_, i) => (
          <span key={i} className="wordpath-missing-pill" aria-hidden="true">?</span>
        ))}
      </div>
      <p className="wordpath-status mt-3 text-center text-ink-soft" data-testid="suture-count" data-print-hidden>
        {state.found.length} of {total} {total === 1 ? 'word' : 'words'} found · teal line: the word you are tracing
      </p>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2" data-print-hidden>
        <button type="button" className={button} disabled={locked || state.picked.length === 0} onClick={send} data-testid="suture-submit">submit</button>
        <button type="button" className={button} disabled={locked || state.picked.length === 0} onClick={clear} data-testid="suture-clear">clear</button>
        <span className="inline-flex items-center">
          <button type="button" className={button} disabled={locked} onClick={hint} data-testid="suture-hint" aria-describedby={`${title}-hint`}>
            cue{left > 0 ? ` (${left})` : ''}
          </button>
          {/* Three pips fill as other words are found: a filled disc is a word found, an outline is one still to find, and the
              line of words below is the label, so no meaning rests on color. */}
          <span role="img" aria-labelledby={`${title}-hint`} className="wordpath-meter" data-testid="suture-hint-meter" data-filled={filledPips}>
            {Array.from({ length: WORDS_PER_HINT }, (_, i) => (
              <span key={i} aria-hidden="true" data-pip={i < filledPips ? 'filled' : 'empty'} className={`wordpath-pip${i < filledPips ? ' wordpath-pip-filled' : ''}`} />
            ))}
          </span>
        </span>
      </div>
      <p id={`${title}-hint`} className="mt-2 text-center text-sm text-ink-soft" data-testid="suture-hint-progress" data-print-hidden>
        {left > 0
          ? `${left} ${left === 1 ? 'cue' : 'cues'} ready.`
          : `${towardHint} of ${WORDS_PER_HINT} words toward a cue. other words of ${MIN_WORD} letters or more count.`}
      </p>
      <p className="mt-2 text-center text-ink-soft" data-print-hidden>
        find all {total} answers. one of them, the thread, names the theme and runs from one side of the board to the
        other. every letter is used once.
      </p>
      <p id={help} className="mt-2 text-center text-sm text-ink-soft" data-print-hidden>
        drag across touching letters in any direction, or tap them one by one and press submit (tapping the last letter
        again also submits). on a keyboard, arrows move, enter or space adds a letter, enter on the last letter submits,
        backspace takes one back and escape clears.
      </p>
      <p className="wordpath-print-foot text-sm" data-print-only data-testid="suture-print-foot">{printFoot}</p>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-ink-soft" data-print-hidden>
        {puzzle.sample && <p>sample puzzle</p>}
      </div>
      {done && (
        <div ref={result} tabIndex={-1} className="mt-6 rounded-md border border-control p-4" data-testid="suture-result" data-print-hidden>
          <p className="text-lg font-medium">board complete.</p>
          <p className="mt-2">{shared}</p>
          {solveMs !== undefined && <p className="mt-1 text-ink-soft" data-testid="suture-solve-time">solve time {formatSolveTime(solveMs)}.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={button} onClick={share}>copy my result</button>
            {shareReady && (
              <button ref={shareButton} type="button" className={button} onClick={() => setShareOpen(true)} data-testid="suture-share-open">share</button>
            )}
          </div>
          {shareReady && (
            <Suspense fallback={null}>
              <PicclineShare
                open={shareOpen}
                onClose={() => {
                  setShareOpen(false);
                  requestAnimationFrame(() => shareButton.current?.focus());
                }}
                found={state.found.map((index) => puzzle.words[index]!.special)}
                solveMs={solveMs}
                date={today}
                resultLine={shared}
                siteUrl={site.url}
              />
            </Suspense>
          )}
          {copied && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{copied}</p>}
        </div>
      )}
      <p className="mt-3 text-sm text-ink-soft" aria-live="polite" aria-atomic="true" data-testid="suture-live" data-print-hidden>{said}</p>
    </section>
  );
}

/** A board puzzle from the page, checked again here so a broken one shows a plain message instead of a broken game. */
export default function SuturePathBoard({ puzzle, name, framed = false, printable = false }: Props) {
  try {
    const parsed = parsePathPuzzle(puzzle);
    return <PathBoard key={JSON.stringify(parsed)} puzzle={parsed} name={name} framed={framed} printable={printable} />;
  } catch { return <p role="alert">this puzzle could not be loaded. please try again later.</p>; }
}
