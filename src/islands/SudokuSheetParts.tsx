import type { SudokuPuzzle } from './sudoku';
import { sudokuBoardText as t } from '../config/sudoku-print';

/** The 9 by 9 grid as printed: bold box lines, big digits. Page 1 shows the given numbers; `solved` fills the rest, in a lighter weight. */
export function SheetSudoku({ puzzle, solved = false }: { puzzle: SudokuPuzzle; solved?: boolean }) {
  return (
    <div className={solved ? 'sheet-sudoku sheet-sudoku-small' : 'sheet-sudoku'} role="img" aria-label={t.boardLabel} data-testid={solved ? 'sheet-solved-grid' : 'sheet-sudoku'}>
      {puzzle.puzzle.map((given, index) => {
        const row = Math.floor(index / 9);
        const column = index % 9;
        const shown = given || (solved ? puzzle.solution[index]! : 0);
        const edges = `${column % 3 === 2 && column < 8 ? ' sheet-box-right' : ''}${row % 3 === 2 && row < 8 ? ' sheet-box-bottom' : ''}`;
        return (
          <span key={index} className={`sheet-sudoku-cell${given ? ' sheet-given' : ''}${edges}`}>{shown || ''}</span>
        );
      })}
    </div>
  );
}

/** The level line, on both pages. */
export function LevelLine({ puzzle }: { puzzle: SudokuPuzzle }) {
  return <p className="sheet-clue" data-testid="sheet-level-line">{t.levelLine(puzzle.level, puzzle.givens)}</p>;
}

/** Page 1: the grid with its given numbers. */
export function BoardPage({ puzzle }: { puzzle: SudokuPuzzle }) {
  return <SheetSudoku puzzle={puzzle} />;
}
