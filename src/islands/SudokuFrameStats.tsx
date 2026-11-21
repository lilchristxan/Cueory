import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_STATS_CHANGED_EVENT, localDay } from './gameresults';
import { LEVEL_LABELS, type SudokuLevel } from './sudoku';
import { loadSudokuStats, sudokuLevelStats, sudokuTime } from './sudokustats';

interface SudokuValues {
  on: boolean;
  solved: number;
  best: string;
  average: string;
  streak: number;
}

const LEVELS: readonly SudokuLevel[] = ['easy', 'medium', 'hard'];

/** Loaded only for framed Sudoku, keeping its level picker out of every other Frame route's initial bundle. */
export default function SudokuFrameStats() {
  const [level, setLevel] = useState<SudokuLevel>('easy');
  const [stats, setStats] = useState<SudokuValues>();

  useEffect(() => {
    const refresh = () => {
      const today = localDay(new Date());
      const saved = loadSudokuStats(browserStorage(), today);
      const values = sudokuLevelStats(saved.solves, level, today);
      setStats({
        on: saved.on,
        solved: values.solved,
        best: values.bestSeconds === null ? '–' : sudokuTime(values.bestSeconds),
        average: values.averageSeconds === null ? '–' : sudokuTime(values.averageSeconds),
        streak: values.streak,
      });
    };
    refresh();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    window.addEventListener(GAME_STATS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('pageshow', onPageShow);
    const onLevel = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (typeof next === 'string' && LEVELS.includes(next as SudokuLevel)) setLevel(next as SudokuLevel);
    };
    window.addEventListener('cueory:game-frame-sudoku-level-change', onLevel);
    return () => {
      window.removeEventListener(GAME_STATS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('cueory:game-frame-sudoku-level-change', onLevel);
    };
  }, [level]);

  const chooseLevel = (next: SudokuLevel) => {
    setLevel(next);
    window.dispatchEvent(new CustomEvent('cueory:game-frame-sudoku-level', { detail: next }));
  };

  return <section className="game-frame-sudoku-stats" aria-label="sudoku level stats" data-testid="game-frame-sudoku-stats">
    <label htmlFor="game-frame-sudoku-level">difficulty</label>
    <select id="game-frame-sudoku-level" value={level} onChange={(event) => chooseLevel(event.target.value as SudokuLevel)}>
      {LEVELS.map((choice) => <option key={choice} value={choice}>{LEVEL_LABELS[choice]}</option>)}
    </select>
    <div aria-live="polite" aria-atomic="true" data-testid="game-frame-sudoku-numbers">
      {!stats ? <span>loading sudoku stats.</span> : !stats.on ? <span>this browser won't keep sudoku stats.</span> : <>
        <span className="game-frame-stat-value">{stats.solved}</span>
        <span className="game-frame-stat-label">{LEVEL_LABELS[level]} solved · best {stats.best} · average {stats.average} · {stats.streak} day streak</span>
      </>}
    </div>
  </section>;
}
