import type { Cell } from './suture';
import type { SuturePathPuzzle } from './suturepath';
import { picclineSheet as t } from '../config/piccline-print';

/** The letter board as printed circles; with `answers`, every answer's path is drawn through it and numbered where it starts. */
export function SheetGrid({ puzzle, answers = false }: { puzzle: SuturePathPuzzle; answers?: boolean }) {
  const rows = puzzle.grid.length;
  const columns = puzzle.grid[0]!.length;
  const middle = ([row, column]: Cell) => `${column + 0.5},${row + 0.5}`;
  // The number of the answer that starts in each cell (only on the answers board).
  const starts = new Map<string, number>();
  if (answers) puzzle.words.forEach((word, index) => starts.set(`${word.path[0]![0]},${word.path[0]![1]}`, index + 1));
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

/** Page 1: the cue, the board, and one numbered write-in line per answer. */
export function BoardPage({ puzzle }: { puzzle: SuturePathPuzzle }) {
  return (
    <>
      <p className="sheet-clue" data-testid="sheet-clue">{t.clueLabel}: {puzzle.clue}</p>
      <div className="sheet-spread">
        <SheetGrid puzzle={puzzle} />
        <div className="sheet-list">
          <p className="sheet-list-title">{t.listTitle(puzzle.words.length)}</p>
          <ol className="sheet-list-blanks" data-testid="sheet-lines">
            {puzzle.words.map((_, index) => (
              <li key={index}><span className="sheet-list-number">{index + 1}</span><span className="sheet-list-blank" /></li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

/** Page 2, below the fold: the board with the answers drawn on it, and the answers in order. */
export function AnswersPage({ puzzle }: { puzzle: SuturePathPuzzle }) {
  return (
    <div className="sheet-spread" data-testid="sheet-answers">
      <SheetGrid puzzle={puzzle} answers />
      <div className="sheet-list">
        <p className="sheet-list-title">{t.answersLabel}</p>
        <ol className="sheet-list-answers" data-testid="sheet-answer-list">
          {puzzle.words.map((word, index) => (
            <li key={index} aria-label={t.pathLabel(index + 1, word.answer.toLowerCase())}>
              <span className="sheet-list-number">{index + 1}</span>
              <span>{word.answer.toLowerCase()}{word.special && <span className="sheet-list-tag"> · {t.threadTag}</span>}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
