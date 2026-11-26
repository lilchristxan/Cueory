import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { ComponentType } from 'react';
import { dayNumber, puzzleForDay } from './pulse';
import { boardPuzzles, type SuturePathPuzzle, type WordPathPuzzle } from './suturepath';
import { useGamePrint } from './usegameprint';

// The warning is needed only when a board is printed unfinished, so it loads then, not with the page.
const PrintWarning = lazy(() => import('./PrintWarning'));

interface Props {
  puzzles: WordPathPuzzle[];
}

const today = (puzzles: WordPathPuzzle[], now: Date): SuturePathPuzzle | undefined => puzzleForDay(boardPuzzles(puzzles), dayNumber(now));

/**
 * piccline's print entry (the file PicclinePrint.tsx loads it after the page; Christian, 2026-11-25): the shared controller (usegameprint.ts) with piccline's own sheet. Today's
 * board and its numbered lines are drawn into page 1 (the board is not a secret). The answers are drawn into page 2 only
 * while printing, and taken out afterwards. The day is read fresh when printing, so a tab left open past midnight prints
 * the new day's board.
 */
export default function PicclinePrint({ puzzles }: Props) {
  const [puzzle, setPuzzle] = useState(() => today(puzzles, new Date()));
  const [answers, setAnswers] = useState(false);
  // The board's drawing loads just after the page does (it is not part of the page's first load).
  const [Board, setBoardView] = useState<ComponentType<{ puzzle: SuturePathPuzzle }> | null>(null);
  // The answers' drawing loads only when a print is allowed, so the page's first load carries none of it.
  const [Answers, setAnswersView] = useState<ComponentType<{ puzzle: SuturePathPuzzle }> | null>(null);
  const [slots, setSlots] = useState<{ board: Element | null; answers: Element | null }>({ board: null, answers: null });

  useEffect(() => {
    void import('./PicclineSheetParts').then(({ BoardPage }) => setBoardView(() => BoardPage));
    setSlots({ board: document.querySelector('[data-sheet-slot="board"]'), answers: document.querySelector('[data-sheet-slot="answers"]') });
  }, []);
  useEffect(() => {
    document.querySelector('[data-print-sheet] [data-keeper]')?.setAttribute('data-keeper', answers ? 'ready' : 'locked');
  }, [answers]);

  const [warned, setWarned] = useState(false);
  const print = useGamePrint({
    game: 'piccline',
    forfeitTries: 0,
    prepare: async (now) => {
      const [{ AnswersPage }, { BoardPage }] = await Promise.all([import('./PicclineAnswers'), import('./PicclineSheetParts')]);
      flushSync(() => {
        setBoardView(() => BoardPage);
        setAnswersView(() => AnswersPage);
        setPuzzle(today(puzzles, now));
        setAnswers(true);
      });
    },
    release: () => setAnswers(false),
  });

  useEffect(() => {
    if (print.warning) setWarned(true);
  }, [print.warning]);

  return (
    <>
      {puzzle && Board && slots.board && createPortal(<Board puzzle={puzzle} />, slots.board)}
      {puzzle && answers && Answers && slots.answers && createPortal(<Answers puzzle={puzzle} />, slots.answers)}
      {(warned || print.warning) && (
        <Suspense fallback={null}>
          <PrintWarning open={print.warning} error={print.error} onFinish={print.closeWarning} onPrint={print.confirm} onCancel={print.closeWarning} />
        </Suspense>
      )}
    </>
  );
}
