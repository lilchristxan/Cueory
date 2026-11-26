import { lazy, Suspense } from 'react';

// The print entry is not part of the page's first load: this small island only starts it (a press that comes earlier is
// remembered by the Frame, gameprintevent.ts, and answered once the real entry is listening).
const SudokuPrintView = lazy(() => import('./SudokuPrintView'));

export default function SudokuPrint() {
  return (
    <Suspense fallback={null}>
      <SudokuPrintView />
    </Suspense>
  );
}
