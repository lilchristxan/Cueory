import { SheetGrid, listOrder } from './PicclineSheetParts';
import type { SuturePathPuzzle } from './suturepath';
import { picclineSheet as t } from '../config/piccline-print';

/** Page 2, below the fold: the board with the answers drawn on it, and the answers in order. */
export function AnswersPage({ puzzle }: { puzzle: SuturePathPuzzle }) {
  return (
    <div className="sheet-spread" data-testid="sheet-answers">
      <SheetGrid puzzle={puzzle} answers />
      <div className="sheet-list">
        <p className="sheet-list-title">{t.answersLabel}</p>
        <ol className="sheet-list-answers" data-testid="sheet-answer-list">
          {listOrder(puzzle).map((index, position) => {
            const word = puzzle.words[index]!;
            return (
              <li key={index} aria-label={t.pathLabel(position + 1, word.answer.toLowerCase())}>
                <span className="sheet-list-number">{position + 1}</span>
                <span>{word.answer.toLowerCase()}{word.special && <span className="sheet-list-tag"> · {t.threadTag}</span>}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
