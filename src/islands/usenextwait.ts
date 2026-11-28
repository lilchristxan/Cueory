import { useEffect, useState } from 'react';
import { untilNextPuzzle, waitInWords } from './pulse';

/** The wait for the next daily puzzle in plain words ("5 h 12 min"), refreshed each minute while `active`; empty until the first tick. */
export function useNextWait(active: boolean): string {
  const [wait, setWait] = useState('');
  useEffect(() => {
    if (!active) return;
    const tick = () => setWait(waitInWords(untilNextPuzzle(new Date())));
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [active]);
  return wait;
}
