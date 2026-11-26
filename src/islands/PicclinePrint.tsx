import { useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import PrintWarning from './PrintWarning';
import { AnswersPage, BoardPage } from './PicclineSheetParts';
import { dayNumber, puzzleForDay } from './pulse';
import { boardPuzzles, type SuturePathPuzzle, type WordPathPuzzle } from './suturepath';
import { useGamePrint } from './usegameprint';

interface Props {
  puzzles: WordPathPuzzle[];
}

const today = (puzzles: WordPathPuzzle[], now: Date): SuturePathPuzzle | undefined => puzzleForDay(boardPuzzles(puzzles), dayNumber(now));

/**
 * piccline's print entry (Christian, 2026-11-25): the shared controller (usegameprint.ts) with piccline's own sheet. Today's
 * board and its numbered lines are drawn into page 1 (the board is not a secret). The answers are drawn into page 2 only
 * while printing, and taken out afterwards. The day is read fresh when printing, so a tab left open past midnight prints
 * the new day's board.
 */
export default function PicclinePrint({ puzzles }: Props) {
  const [puzzle, setPuzzle] = useState(() => today(puzzles, new Date()));
  const [answers, setAnswers] = useState(false);
  const [slots, setSlots] = useState<{ board: Element | null; answers: Element | null }>({ board: null, answers: null });

  useEffect(() => {
    setSlots({ board: document.querySelector('[data-sheet-slot="board"]'), answers: document.querySelector('[data-sheet-slot="answers"]') });
  }, []);
  useEffect(() => {
    document.querySelector('[data-print-sheet] [data-keeper]')?.setAttribute('data-keeper', answers ? 'ready' : 'locked');
  }, [answers]);

  const print = useGamePrint({
    game: 'piccline',
    forfeitTries: 0,
    prepare: (now) => {
      flushSync(() => {
        setPuzzle(today(puzzles, now));
        setAnswers(true);
      });
    },
    release: () => setAnswers(false),
  });

  return (
    <>
      {puzzle && slots.board && createPortal(<BoardPage puzzle={puzzle} />, slots.board)}
      {puzzle && answers && slots.answers && createPortal(<AnswersPage puzzle={puzzle} />, slots.answers)}
      <PrintWarning open={print.warning} error={print.error} onFinish={print.closeWarning} onPrint={print.confirm} onCancel={print.closeWarning} />
    </>
  );
}
