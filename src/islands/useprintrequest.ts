import { useEffect, useRef } from 'react';
import { printEventGame, PRINT_EVENT } from './gameprintevent';

/** Runs `handler` whenever the Frame's printer button announces a print for this game. */
export function usePrintRequest(game: string, handler: () => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    // No document outside a browser (the unit tests call a game like a function): nothing can announce a print there.
    if (typeof document === 'undefined') return;
    const onPrint = (event: Event) => { if (printEventGame(event) === game) latest.current(); };
    document.addEventListener(PRINT_EVENT, onPrint);
    return () => document.removeEventListener(PRINT_EVENT, onPrint);
  }, [game]);
}
