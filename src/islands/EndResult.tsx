import { createPortal } from 'react-dom';
import { useSyncExternalStore, type ReactNode, type Ref } from 'react';
import { findEndSlot } from './endresult';

function subscribe(onChange: () => void): () => void {
  if (typeof window.addEventListener !== 'function') return () => {};
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

// One element or null, so the snapshot is stable between renders.
function snapshot(): HTMLElement | null {
  if (typeof document.getElementById !== 'function' || typeof getComputedStyle !== 'function') return null;
  return findEndSlot(document, (node) => getComputedStyle(node));
}

interface Props {
  /** The game's own wrapper test id (it keeps the one it always had). */
  testId: string;
  /** The first line: "solved." */
  result: string;
  resultTestId?: string;
  /** The one key figure: "5/6 · 0:31". */
  figure?: string;
  figureTestId?: string;
  /** The share (or copy) button, with the game's own handler. */
  children?: ReactNode;
  /** "next word in 2 h 14 min." */
  next?: string;
  nextTestId?: string;
  /** Anything else a game must say (the sudoku and word-path notes). Kept to one short line. */
  note?: ReactNode;
  resultRef?: Ref<HTMLDivElement>;
  /** The crossword and sudoku announce the result as a status; the others have their own live region. */
  status?: boolean;
}

/**
 * The shared, minimal end-of-game block. It renders into the game frame's side panel on a desktop window and under the
 * board everywhere else; the markup, focus target and test ids are the same in both places.
 */
export default function EndResult({ testId, result, resultTestId, figure, figureTestId, children, next, nextTestId, note, resultRef, status }: Props) {
  const slot = useSyncExternalStore(subscribe, typeof document === 'undefined' ? () => null : snapshot, () => null);
  const block = (
    <div
      ref={resultRef}
      tabIndex={-1}
      className="game-end"
      data-placement={slot ? 'sidebar' : 'board'}
      data-testid={testId}
      role={status ? 'status' : undefined}
      data-print-hidden
    >
      <p className="game-end-result" data-testid={resultTestId}>{result}</p>
      {figure && <p className="game-end-figure" data-testid={figureTestId}>{figure}</p>}
      {children && <div className="game-end-actions">{children}</div>}
      <div className="game-end-note" aria-live="polite">{note}</div>
      {next && <p className="game-end-next" data-testid={nextTestId}>{next}</p>}
    </div>
  );
  return slot ? createPortal(block, slot) : block;
}
