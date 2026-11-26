import { useEffect, useRef, useState } from 'react';
import { loadStats, localDay } from './gameresults';
import { browserStorage } from '../scripts/storage';
import { FORFEIT_EVENT, PRINT_EVENT, isFinished, printAnyway, requestPrint, type PrintGame } from '../scripts/printgate';
import { sheetImagesReady } from '../scripts/printsheet';

/** How long printing stays switched off if the browser never says the print is over. */
export const PRINT_RELEASE_MS = 120_000;

export interface GamePrintOptions {
  /** Which game's `cueory:print` event this listens for, and which game's result it records on "print anyway". */
  game: PrintGame;
  /** Stored with a forfeited day (vialo: its six tries used; piccline: no wrong words counted). */
  forfeitTries: number;
  /** Puts today's answers into the sheet. Called only when printing is allowed, and finished before the print opens. */
  prepare: (now: Date) => void;
  /** Takes the answers out again once the print is over (or on any failure). */
  release: () => void;
}

/**
 * The print controller every game's sheet shares (Christian, 2026-11-25). A printer button sends `cueory:print`; so does
 * opening the game page with #print from the hub. A finished game prints at once. An unfinished one warns first: "print
 * anyway" records today as not solved, ends the game on screen as lost (FORFEIT_EVENT), and only then fills the answers
 * and prints. One print at a time: the guard covers preparing, the open warning and the print itself, and always lets go
 * (afterprint, any error, or a fallback if afterprint never comes). The day and the stored result are read fresh at
 * every step.
 */
export function useGamePrint(options: GamePrintOptions) {
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState('');
  const opener = useRef<Element | null>(null);
  const busy = useRef(false);
  const latest = useRef(options);
  latest.current = options;

  const print = async () => {
    busy.current = true;
    let fallback = 0;
    const done = () => {
      window.clearTimeout(fallback);
      window.removeEventListener('afterprint', done);
      latest.current.release();
      busy.current = false;
    };
    try {
      latest.current.prepare(new Date());
      await sheetImagesReady();
      window.addEventListener('afterprint', done, { once: true });
      // Some browsers never send afterprint: let go after two minutes so printing cannot stay switched off.
      fallback = window.setTimeout(done, PRINT_RELEASE_MS);
      window.print();
    } catch {
      done();
    }
  };

  const request = () => {
    if (busy.current) return;
    const { game } = latest.current;
    const day = localDay(new Date());
    const saved = loadStats(browserStorage(), day);
    requestPrint({ finished: isFinished(saved.stats, game, day), keepsResults: saved.on }, () => void print(), () => {
      busy.current = true;
      setError('');
      opener.current = document.activeElement;
      setWarning(true);
    });
  };

  useEffect(() => {
    const onPrint = (event: Event) => {
      if ((event as CustomEvent<{ game?: string }>).detail?.game === latest.current.game) request();
    };
    document.addEventListener(PRINT_EVENT, onPrint);
    // Tells the page (and the tests) that a print request will now be heard: the island loads after the page does.
    const sheetRoot = document.querySelector('[data-print-sheet]');
    sheetRoot?.setAttribute('data-print-ready', 'true');
    if (window.location.hash === '#print') {
      // From the hub: do it once, and take the mark out of the address.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      request();
    }
    return () => {
      document.removeEventListener(PRINT_EVENT, onPrint);
      sheetRoot?.removeAttribute('data-print-ready');
    };
  }, []);

  const closeWarning = () => {
    busy.current = false;
    setWarning(false);
  };

  const confirm = () => {
    const { game, forfeitTries } = latest.current;
    const day = localDay(new Date());
    const ok = printAnyway(browserStorage(), game, day, forfeitTries, () => {
      window.dispatchEvent(new CustomEvent(FORFEIT_EVENT, { detail: { game, day } }));
      setWarning(false);
      busy.current = false;
      void print();
    });
    // The day could not be saved: keep the dialog open and say so; nothing prints and nothing changes.
    if (!ok) setError("couldn't save that on this device. finish the game to print the keeper's copy.");
  };

  return { warning, error, confirm, closeWarning };
}
