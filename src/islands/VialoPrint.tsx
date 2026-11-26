import { useEffect, useRef, useState } from 'react';
import { loadStats, localDay } from './gameresults';
import PrintWarning from './PrintWarning';
import { browserStorage } from '../scripts/storage';
import { FORFEIT_EVENT, PRINT_EVENT, isFinished, printAnyway, requestPrint } from '../scripts/printgate';
import { clearKeeper, fillKeeper, keeperFor, sheetImagesReady, type SheetPuzzle } from '../scripts/printsheet';

interface Props {
  puzzles: readonly SheetPuzzle[];
}

/**
 * vialo's print entry (Christian, 2026-11-25). A printer button (the game frame's) sends `cueory:print`; so does opening
 * /play/vialo#print from the hub. A finished game prints at once. An unfinished one warns first: "print anyway" records
 * today as not solved, ends the game on screen as lost, and only then fills the word into the sheet and prints. The word
 * is in the page only while printing. The day and the stored result are read fresh at each step.
 */
export default function VialoPrint({ puzzles }: Props) {
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState('');
  const opener = useRef<Element | null>(null);

  const print = async () => {
    const now = new Date();
    const keeper = keeperFor(puzzles, loadStats(browserStorage(), localDay(now)), now);
    if (keeper) fillKeeper(keeper);
    await sheetImagesReady();
    window.addEventListener('afterprint', () => clearKeeper(), { once: true });
    window.print();
  };

  const request = () => {
    const day = localDay(new Date());
    const saved = loadStats(browserStorage(), day);
    requestPrint({ finished: isFinished(saved.stats, 'vialo', day), keepsResults: saved.on }, () => void print(), () => {
      setError('');
      opener.current = document.activeElement;
      setWarning(true);
    });
  };

  useEffect(() => {
    const onPrint = (event: Event) => {
      if ((event as CustomEvent<{ game?: string }>).detail?.game === 'vialo') request();
    };
    document.addEventListener(PRINT_EVENT, onPrint);
    if (window.location.hash === '#print') {
      // From the hub: do it once, and take the mark out of the address.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      request();
    }
    return () => document.removeEventListener(PRINT_EVENT, onPrint);
  }, []);

  const confirm = () => {
    const day = localDay(new Date());
    const ok = printAnyway(browserStorage(), 'vialo', day, 6, () => {
      window.dispatchEvent(new CustomEvent(FORFEIT_EVENT, { detail: { day } }));
      setWarning(false);
      void print();
    });
    // The day could not be saved: keep the dialog open and say so; nothing prints and nothing changes.
    if (!ok) setError("couldn't save that on this device. finish the game to print the keeper's copy.");
  };

  return (
    <PrintWarning
      open={warning}
      error={error}
      onFinish={() => setWarning(false)}
      onPrint={confirm}
      onCancel={() => setWarning(false)}
    />
  );
}
