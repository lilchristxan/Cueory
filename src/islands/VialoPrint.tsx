import PrintWarning from './PrintWarning';
import { loadStats, localDay } from './gameresults';
import { useGamePrint } from './usegameprint';
import { browserStorage } from '../scripts/storage';
import { clearKeeper, fillKeeper, keeperFor, type SheetPuzzle } from '../scripts/printsheet';
import { GUESSES } from './pulse';

interface Props {
  puzzles: readonly SheetPuzzle[];
}

/**
 * vialo's print entry (Christian, 2026-11-25): the shared controller (usegameprint.ts) with vialo's own sheet. The word is
 * in the page only while printing; it is filled into the keeper's box here and taken out afterwards.
 */
export default function VialoPrint({ puzzles }: Props) {
  const print = useGamePrint({
    game: 'vialo',
    forfeitTries: GUESSES,
    prepare: (now) => {
      const keeper = keeperFor(puzzles, loadStats(browserStorage(), localDay(now)), now);
      if (keeper) fillKeeper(keeper);
    },
    release: clearKeeper,
  });
  return <PrintWarning open={print.warning} error={print.error} onFinish={print.closeWarning} onPrint={print.confirm} onCancel={print.closeWarning} />;
}
