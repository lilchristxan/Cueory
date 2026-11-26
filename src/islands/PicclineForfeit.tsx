import { useEffect, useState } from 'react';
import { FORFEIT_EVENT, rememberedForfeits } from './forfeitmemory';
import PicclinePrintView from './PicclinePrintView';
import type { WordPathPuzzle } from './suturepath';

/**
 * Everything piccline's board needs only because the page can print its two-page sheet, in one part that loads after the
 * page: the print entry itself, and the hearing of a forfeit ("print anyway" on an unfinished board, usegameprint.ts), which
 * ends the board and says why. A forfeit confirmed before this was listening is read from the page's memory when it starts.
 */
export default function PicclineForfeit({ day, puzzles, onForfeit }: { day: string; puzzles: WordPathPuzzle[]; onForfeit: () => void }) {
  const [forfeited, setForfeited] = useState(false);
  useEffect(() => {
    const lose = () => { setForfeited(true); onForfeit(); };
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ game?: string; day?: string }>).detail;
      if (detail?.game === 'piccline' && detail.day === day) lose();
    };
    if (rememberedForfeits('piccline', day).length > 0) lose();
    window.addEventListener(FORFEIT_EVENT, onEvent);
    return () => window.removeEventListener(FORFEIT_EVENT, onEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);
  return (
    <>
      {forfeited && <p className="mt-2 text-center text-sm text-ink-soft" data-testid="suture-forfeit-note" data-print-hidden>you printed before finishing, so today counts as not solved.</p>}
      <PicclinePrintView puzzles={puzzles} />
    </>
  );
}
