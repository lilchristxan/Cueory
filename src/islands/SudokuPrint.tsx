import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { localDay } from './gameresults';
import { loadSudokuStats } from './sudokustats';
import { useGamePrint } from './usegameprint';
import { browserStorage } from '../scripts/storage';
import type { SudokuLevel, SudokuPuzzle } from './sudoku';

// The warning is needed only when a level is printed unfinished, so it loads then, not with the page.
const PrintWarning = lazy(() => import('./PrintWarning'));

const SLOTS = { level: 'level', levelTwo: 'level-two', board: 'board', answers: 'answers' } as const;
type Slots = Record<keyof typeof SLOTS, Element | null>;
type Parts = typeof import('./SudokuSheetParts');
type Rules = typeof import('./sudoku');

/** The level chosen on the page (the difficulty picker in the game frame, which the game keeps in step), easy until chosen. */
function levelNow(): SudokuLevel {
  const value = document.querySelector<HTMLSelectElement>('#game-frame-sudoku-difficulty')?.value;
  return value === 'medium' || value === 'hard' ? value : 'easy';
}

/** True when this browser holds a solve of today's puzzle at that level. */
function levelFinished(day: string, level: SudokuLevel): boolean {
  return loadSudokuStats(browserStorage(), day).solves.some((solve) => solve.day === day && solve.level === level);
}

/**
 * sudoku's print entry (Christian, 2026-11-25): the shared controller (usegameprint.ts) with sudoku's own sheet. The sheet
 * is for the level chosen on the page, and "finished" means that level's puzzle for today. The grid with its given numbers
 * and the level are drawn into the sheet just after the page loads (they are not secret); the solved grid only while
 * printing, and it is taken out afterwards. The day and the level are read fresh when printing.
 */
export default function SudokuPrint() {
  const [level, setLevel] = useState<SudokuLevel>('easy');
  const [day, setDay] = useState(() => localDay(new Date()));
  const [rules, setRules] = useState<Rules | null>(null);
  const [parts, setParts] = useState<Parts | null>(null);
  const [answers, setAnswers] = useState(false);
  const [Answers, setAnswersView] = useState<ComponentType<{ puzzle: SudokuPuzzle }> | null>(null);
  const [warned, setWarned] = useState(false);
  const [slots, setSlots] = useState<Slots>({ level: null, levelTwo: null, board: null, answers: null });

  useEffect(() => {
    void Promise.all([import('./sudoku'), import('./SudokuSheetParts')]).then(([loadedRules, loadedParts]) => {
      setRules(loadedRules);
      setParts(loadedParts);
    });
    setSlots(Object.fromEntries(Object.entries(SLOTS).map(([key, name]) => [key, document.querySelector(`[data-sheet-slot="${name}"]`)])) as Slots);
    const follow = () => setLevel(levelNow());
    follow();
    window.addEventListener('cueory:game-frame-sudoku-level-change', follow);
    document.querySelector('#game-frame-sudoku-difficulty')?.addEventListener('change', follow);
    return () => {
      window.removeEventListener('cueory:game-frame-sudoku-level-change', follow);
      document.querySelector('#game-frame-sudoku-difficulty')?.removeEventListener('change', follow);
    };
  }, []);
  useEffect(() => {
    document.querySelector('[data-print-sheet] [data-keeper]')?.setAttribute('data-keeper', answers ? 'ready' : 'locked');
  }, [answers]);

  const puzzle = useMemo(() => (rules ? rules.generateSudoku(rules.dailySudokuSeed(day, level), level) : undefined), [rules, day, level]);

  const print = useGamePrint({
    game: 'triage',
    forfeitTries: 0,
    finished: (today) => levelFinished(today, levelNow()),
    forfeitDetail: () => ({ level: levelNow() }),
    prepare: async (now) => {
      const [loadedRules, loadedParts, { AnswersPage }] = await Promise.all([import('./sudoku'), import('./SudokuSheetParts'), import('./SudokuAnswers')]);
      flushSync(() => {
        setRules(loadedRules);
        setParts(loadedParts);
        setAnswersView(() => AnswersPage);
        setDay(localDay(now));
        setLevel(levelNow());
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
      {puzzle && parts && slots.level && createPortal(<parts.LevelLine puzzle={puzzle} />, slots.level)}
      {puzzle && parts && slots.levelTwo && createPortal(<parts.LevelLine puzzle={puzzle} />, slots.levelTwo)}
      {puzzle && parts && slots.board && createPortal(<parts.BoardPage puzzle={puzzle} />, slots.board)}
      {puzzle && answers && Answers && slots.answers && createPortal(<Answers puzzle={puzzle} />, slots.answers)}
      {(warned || print.warning) && (
        <Suspense fallback={null}>
          <PrintWarning open={print.warning} error={print.error} onFinish={print.closeWarning} onPrint={print.confirm} onCancel={print.closeWarning} />
        </Suspense>
      )}
    </>
  );
}
