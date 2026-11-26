import { lazy, Suspense } from 'react';
import type { WordPathPuzzle } from './suturepath';

// The print entry is not part of the page's first load: this small island only starts it (a press that comes earlier is
// remembered by the Frame (gameprintevent.ts) and answered once the real entry is listening).
const PicclinePrintView = lazy(() => import('./PicclinePrintView'));

export default function PicclinePrint({ puzzles }: { puzzles: WordPathPuzzle[] }) {
  return (
    <Suspense fallback={null}>
      <PicclinePrintView puzzles={puzzles} />
    </Suspense>
  );
}
