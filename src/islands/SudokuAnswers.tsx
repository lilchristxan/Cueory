import { SheetSudoku } from './SudokuSheetParts';
import type { SudokuPuzzle } from './sudoku';

/** Page 2, below the fold: the solved grid. */
export function AnswersPage({ puzzle }: { puzzle: SudokuPuzzle }) {
  return <SheetSudoku puzzle={puzzle} solved />;
}
