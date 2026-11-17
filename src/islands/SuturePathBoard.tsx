import '../styles/wordpath.css';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dayLabel } from './daily';
import { localDay, reportRound } from './gameresults';
import { printGame } from './gameprint';
import { GameHelpButton, GameHelpCard, useGameHelp } from './GameHelp';
import { site } from '../config/site';
import { shake } from './SutureGame';
import type { Cell } from './suture';
import {
  announceProgress, backspace, cellView, firstWordFound, clearPicked, extend, hintsLeft, MIN_WORD, parsePathPuzzle, pathCellLabel, pathDone, pathShareLine,
  pickedWord, specialFoundFirst, startPath, submit, submitInWords, takeHint, WORDS_PER_HINT, wordsToNextHint,
  type CellLook, type PathState, type SuturePathPuzzle,
} from './suturepath';

interface Props { puzzle: SuturePathPuzzle; name: string }
const printFoot = new URL(site.url).host;
const button = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';

/**
 * Each look has its own brand state, and found answers also carry a symbol, so color is never the only signal. Each
 * letter's button fills its whole column, so it stays at least 44 px wide on a 320 px screen; the small gap between
 * the round letters is the button's own padding, which its fill (bg-clip-content) leaves out.
 */
const looks: Record<CellLook, string> = {
  special: 'bg-button text-on-button',
  theme: 'bg-soft text-ink',
  picked: 'bg-page text-ink ring-2 ring-inset ring-ink',
  hinted: 'border-2 border-dashed border-ink-soft',
  plain: 'bg-transparent',
};

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

export function PathBoard({ puzzle, name }: Props) {
  const [state, setState] = useState<PathState>(startPath);
  const current = useRef(state);
  const [focused, setFocused] = useState(0);
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const [today] = useState(() => new Date());
  const result = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const drag = useRef<{ start: Cell; moved: boolean; id: number } | null>(null);
  const quietClickUntil = useRef(0);
  const help = useId();
  const howToPlay = useGameHelp('suture');
  const title = useId();
  const done = pathDone(state, puzzle);
  const total = puzzle.words.length;
  const shared = pathShareLine(state, puzzle, dayLabel(today), name);
  const word = pickedWord(state, puzzle).toLowerCase();

  const apply = (next: PathState) => { current.current = next; setState(next); };

  useEffect(() => { if (done) result.current?.focus(); }, [done]);

  // A finished board is reported once, for the stats panel, which keeps it only if the student turned stats on (D-76).
  const reported = useRef(false);
  useEffect(() => {
    if (!done || reported.current) return;
    reported.current = true;
    reportRound({
      game: 'suture',
      day: localDay(today),
      solved: true,
      tries: state.misses,
      hints: state.hintsUsed,
      specialFirst: specialFoundFirst(state, puzzle),
      card: {
        game: 'suture',
        name,
        date: dayLabel(today),
        result: `${state.found.length} / ${total}`,
        shareResult: `${state.found.length} of ${total} answers, ${state.hintsUsed} ${state.hintsUsed === 1 ? 'hint' : 'hints'}`,
        summary: 'you found every answer on today\'s board.',
        stats: [
          { label: 'answers found', value: `${state.found.length}` },
          { label: 'hints used', value: `${state.hintsUsed}` },
          { label: 'the thread found first', value: specialFoundFirst(state, puzzle) ? 'yes' : 'no' },
        ],
        path: '/play/word-path',
      },
    });
  }, [done]);

  const send = () => {
    const before = current.current;
    const next = submit(before, puzzle);
    apply(next.state);
    if (firstWordFound(before, next.state)) announceProgress(localDay(today));
    setSaid(submitInWords(next.state, puzzle, next.outcome));
    if (next.outcome.kind === 'unknown') shake(board.current);
  };

  const add = (cell: Cell) => {
    const next = extend(current.current, puzzle, cell);
    if (next.outcome === 'ignored') return false;
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
  };

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
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
    if (!active.moved) return; // A tap: the click that follows picks the letter.
    quietClickUntil.current = performance.now() + 400;
    send();
  };

  const clear = () => {
    if (!current.current.picked.length) return;
    apply(clearPicked(current.current));
    setSaid('pick cleared.');
  };

  const hint = () => {
    const before = current.current;
    const next = takeHint(before, puzzle);
    if (next === before) {
      setSaid(`no hint yet. find ${wordsToNextHint(before)} more ${wordsToNextHint(before) === 1 ? 'word' : 'words'} that are not theme words.`);
      return;
    }
    apply(next);
    setSaid(next.hint?.order
      ? 'hint: the marked letters are now numbered in order.'
      : `hint: the letters of one answer are marked. ${puzzle.words[next.hint!.answer]!.answer.length} letters.`);
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

  const left = hintsLeft(state);
  const towardHint = state.extras.length % WORDS_PER_HINT;

  return (
    <section aria-labelledby={title} data-testid="suture" data-format="path" data-print-area="suture" className="wordpath">
      <div className="wordpath-corner" data-print-hidden>
        <GameHelpButton help={howToPlay} name={name} className="wordpath-round" />
        <button type="button" className="wordpath-round" aria-label="print" data-testid="suture-print" onClick={() => printGame('suture')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M6 9V3h12v6" />
            <rect x="3" y="9" width="18" height="9" rx="2" />
            <path d="M7 14h10v7H7z" />
          </svg>
        </button>
      </div>
      <p className="text-center text-sm text-ink-soft">today's theme</p>
      <h3 id={title} className="display text-center text-2xl text-ink sm:text-3xl" data-testid="suture-theme">{puzzle.clue}</h3>
      <p className="mt-2 text-center text-ink-soft" data-print-hidden>
        find all {total} answers. one of them, the thread, names the theme and runs from one side of the board to the
        other. every letter is used once.
      </p>
      <p id={help} className="mt-2 text-center text-sm text-ink-soft" data-print-hidden>
        drag across touching letters in any direction, or tap them one by one and press submit (tapping the last letter
        again also submits). on a keyboard, arrows move, enter or space adds a letter, enter on the last letter submits,
        backspace takes one back and escape clears.
      </p>
      <GameHelpCard help={howToPlay} name={name} />
      <div
        ref={board}
        role="grid"
        aria-label={`${name} letters`}
        aria-describedby={help}
        aria-rowcount={puzzle.grid.length}
        aria-colcount={puzzle.grid[0]!.length}
        className="wordpath-board -mx-6 mt-6 flex flex-col border-(length:--border-board) border-ink bg-page text-ink sm:mx-0 sm:p-3"
      >
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
                    disabled={done}
                    aria-label={pathCellLabel(state, puzzle, cell)}
                    data-cell={`${r},${c}`}
                    data-look={view.look}
                    data-path
                    className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-full bg-clip-content p-0.5 text-base font-bold sm:text-xl ${looks[view.look]}`}
                    onFocus={() => setFocused(index)}
                    onPointerDown={(event) => down(event, cell)}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={() => { drag.current = null; }}
                    onClick={() => tap(cell)}
                    onKeyDown={(event) => key(event, cell)}
                  >
                    <span aria-hidden="true">{letter}</span>
                    {view.look === 'theme' && <ThemeMark className="wordpath-mark" />}
                    {view.look === 'special' && <ThreadMark className="wordpath-mark" />}
                    {(view.order ?? view.step) !== undefined && (
                      <span aria-hidden="true" className="wordpath-step text-xs font-normal">{view.order ?? view.step}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-4 min-h-11 text-center text-xl font-bold text-ink" aria-hidden="true" data-testid="suture-picked" data-print-hidden>{word}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2" data-print-hidden>
        <button type="button" className={button} disabled={done || state.picked.length === 0} onClick={send} data-testid="suture-submit">submit</button>
        <button type="button" className={button} disabled={done || state.picked.length === 0} onClick={clear} data-testid="suture-clear">clear</button>
        <button type="button" className={button} disabled={done} onClick={hint} data-testid="suture-hint" aria-describedby={`${title}-hint`}>
          hint{left > 0 ? ` (${left})` : ''}
        </button>
      </div>
      <p id={`${title}-hint`} className="mt-2 text-center text-sm text-ink-soft" data-testid="suture-hint-progress" data-print-hidden>
        {left > 0
          ? `${left} ${left === 1 ? 'hint' : 'hints'} ready.`
          : `${towardHint} of ${WORDS_PER_HINT} words toward a hint. other words of ${MIN_WORD} letters or more count.`}
      </p>
      <ul className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm font-bold sm:text-lg" aria-label="answers found" data-testid="suture-found" data-print-hidden>
        {state.found.map((i) => {
          const answer = puzzle.words[i]!;
          return (
            <li key={i} className="inline-flex items-center gap-1">
              {answer.special ? <ThreadMark className="wordpath-list-mark" /> : <ThemeMark className="wordpath-list-mark" />}
              <span>{answer.answer.toLowerCase()}</span>
              <span className="sr-only">{answer.special ? ' (the thread)' : ' (theme word)'}</span>
            </li>
          );
        })}
      </ul>
      <p className="wordpath-print-foot text-sm" data-print-only data-testid="suture-print-foot">{printFoot}</p>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-ink-soft" data-print-hidden>
        <p data-testid="suture-count">{state.found.length} of {total} found</p>
        {puzzle.sample && <p>sample puzzle</p>}
      </div>
      {done && (
        <div ref={result} tabIndex={-1} className="mt-6 rounded-md border border-control p-4" data-testid="suture-result" data-print-hidden>
          <p className="text-lg font-medium">board complete.</p>
          <p className="mt-2">{shared}</p>
          <button type="button" className={`${button} mt-3`} onClick={share}>copy my result</button>
          {copied && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{copied}</p>}
        </div>
      )}
      <p className="mt-3 text-sm text-ink-soft" aria-live="polite" aria-atomic="true" data-testid="suture-live" data-print-hidden>{said}</p>
    </section>
  );
}

/** A board puzzle from the page, checked again here so a broken one shows a plain message instead of a broken game. */
export default function SuturePathBoard({ puzzle, name }: Props) {
  try {
    const parsed = parsePathPuzzle(puzzle);
    return <PathBoard key={JSON.stringify(parsed)} puzzle={parsed} name={name} />;
  } catch { return <p role="alert">this puzzle could not be loaded. please try again later.</p>; }
}
