import type { Cell } from './suture';
import type { SuturePathPuzzle } from './suturepath';
import { picclineBoardText as t } from '../config/piccline-print';

/** The answers in the order both pages list them: alphabetical, so the list never shows which one is the thread. */
export function listOrder(puzzle: SuturePathPuzzle): number[] {
  return puzzle.words.map((_, index) => index).sort((a, b) => puzzle.words[a]!.answer.localeCompare(puzzle.words[b]!.answer));
}

/** The letter board as printed circles; with `answers`, every answer's path is drawn through it and numbered where it starts. */
export function SheetGrid({ puzzle, answers = false }: { puzzle: SuturePathPuzzle; answers?: boolean }) {
  const rows = puzzle.grid.length;
  const columns = puzzle.grid[0]!.length;
  const middle = ([row, column]: Cell) => `${column + 0.5},${row + 0.5}`;
  // The number of the answer that starts in each cell (only on the answers board).
  const starts = new Map<string, number>();
  if (answers) listOrder(puzzle).forEach((word, position) => starts.set(`${puzzle.words[word]!.path[0]![0]},${puzzle.words[word]!.path[0]![1]}`, position + 1));
  return (
    <div className={answers ? 'sheet-grid sheet-grid-small' : 'sheet-grid'} role="img" aria-label={t.boardLabel} data-testid={answers ? 'sheet-answer-grid' : 'sheet-grid'}>
      {answers && (
          <svg className="sheet-paths" viewBox={`0 0 ${columns} ${rows}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {puzzle.words.map((word, index) => (
              <polyline key={index} className={word.special ? 'sheet-path sheet-path-thread' : 'sheet-path'} data-testid="sheet-path" points={word.path.map(middle).join(' ')} />
            ))}
          </svg>
      )}
      {puzzle.grid.flatMap((line, row) => [...line].map((letter, column) => (
        <span className="sheet-grid-cell" key={`${row},${column}`}>
          <span className="sheet-grid-letter">{letter}</span>
          {starts.has(`${row},${column}`) && <span className="sheet-grid-number" data-testid="sheet-start">{starts.get(`${row},${column}`)}</span>}
        </span>
      )))}
    </div>
  );
}

/** Page 1: the cue, the board, and the words to find with a tick box each. */
export function BoardPage({ puzzle }: { puzzle: SuturePathPuzzle }) {
  return (
    <>
      <p className="sheet-clue" data-testid="sheet-clue">{t.clueLabel}: {puzzle.clue}</p>
      <div className="sheet-spread">
        <SheetGrid puzzle={puzzle} />
        <div className="sheet-list">
          <p className="sheet-list-title">{t.listTitle(puzzle.words.length)}</p>
          <ul className="sheet-list-checks" data-testid="sheet-words">
            {listOrder(puzzle).map((index) => (
              <li key={index}><span className="sheet-box" aria-hidden="true" /><span className="sheet-list-word">{puzzle.words[index]!.answer.toUpperCase()}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
