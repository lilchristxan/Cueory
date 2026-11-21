import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_STATS_CHANGED_EVENT, loadStats, localDay } from './gameresults';
import { currentStreak, dailyStats, longestStreak, wordPathSummary, type GameId, type GameStats } from './gamestats';
import { GUESSES } from './pulse';
import { LEVEL_LABELS, type SudokuLevel } from './sudoku';

interface Props {
  game: string;
}

interface StatValues {
  winPercent: number;
  currentStreak: number;
  bestStreak: number;
  played: number;
  firstLabel: string;
}

interface SudokuValues {
  on: boolean;
  solved: number;
  best: string;
  average: string;
  streak: number;
}

const SUDOKU_LEVELS: readonly SudokuLevel[] = ['easy', 'medium', 'hard'];

function resolveGameId(game: string): GameId | string {
  if (game === 'pillo' || game === 'vialo' || game === 'pulse') return 'pulse';
  if (game === 'crossword' || game === 'cueword') return 'cueword';
  if (game === 'sudoku' || game === 'triage') return 'triage';
  if (game === 'word-path' || game === 'piccline' || game === 'suture') return 'suture';
  if (game === 'stat' || game === 'tachyyy') return 'stat';
  if (game === 'hello-cards' || game === 'hello cards') return 'hello-cards';
  return game;
}

function computeStats(game: string, stats: GameStats, today: string): StatValues {
  const id = resolveGameId(game);
  if (id === 'hello-cards') {
    return {
      winPercent: 0,
      currentStreak: 0,
      bestStreak: 0,
      played: 0,
      firstLabel: 'questions asked',
    };
  }

  if (id === 'suture') {
    const wp = wordPathSummary(stats, today);
    return {
      winPercent: wp.solvePercent,
      currentStreak: wp.currentStreak,
      bestStreak: wp.longestStreak,
      played: wp.played,
      firstLabel: '% solved',
    };
  }

  const ds = dailyStats(stats, id, today, GUESSES);
  const streak = id === 'cueword' ? currentStreak(stats, id, today) : ds.currentStreak;
  const bestStreak = id === 'cueword' ? longestStreak(stats, id) : ds.longestStreak;
  return {
    winPercent: ds.winPercent,
    currentStreak: streak,
    bestStreak,
    played: ds.played,
    firstLabel: '% solved',
  };
}

export default function GameFrameStats({ game }: Props) {
  const [stats, setStats] = useState<StatValues>(() => {
    const today = localDay(new Date());
    const saved = loadStats(browserStorage(), today);
    return computeStats(game, saved.stats, today);
  });
  const [sudokuLevel, setSudokuLevel] = useState<SudokuLevel>('easy');
  const [sudoku, setSudoku] = useState<SudokuValues | undefined>();
  const isSudoku = resolveGameId(game) === 'triage';

  useEffect(() => {
    const refresh = () => {
      const today = localDay(new Date());
      const saved = loadStats(browserStorage(), today);
      setStats(computeStats(game, saved.stats, today));
    };

    window.addEventListener(GAME_STATS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(GAME_STATS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [game]);

  useEffect(() => {
    if (!isSudoku) { setSudoku(undefined); return; }
    let live = true;
    const refresh = () => {
      const today = localDay(new Date());
      // This dedicated import preserves the existing cleanup lifecycle without adding Sudoku code to other Frame routes.
      void import('./sudokustats').then(({ loadSudokuStats, sudokuLevelStats, sudokuTime }) => {
        if (!live) return;
        const saved = loadSudokuStats(browserStorage(), today);
        const values = sudokuLevelStats(saved.solves, sudokuLevel, today);
        setSudoku({
          on: saved.on,
          solved: values.solved,
          best: values.bestSeconds === null ? '–' : sudokuTime(values.bestSeconds),
          average: values.averageSeconds === null ? '–' : sudokuTime(values.averageSeconds),
          streak: values.streak,
        });
      });
    };
    refresh();
    window.addEventListener(GAME_STATS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    const onLevel = (event: Event) => {
      const level = (event as CustomEvent<unknown>).detail;
      if (typeof level === 'string' && SUDOKU_LEVELS.includes(level as SudokuLevel)) setSudokuLevel(level as SudokuLevel);
    };
    window.addEventListener('cueory:game-frame-sudoku-level-change', onLevel);
    return () => {
      live = false;
      window.removeEventListener(GAME_STATS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('cueory:game-frame-sudoku-level-change', onLevel);
    };
  }, [isSudoku, sudokuLevel]);

  const chooseSudokuLevel = (level: SudokuLevel) => {
    setSudokuLevel(level);
    window.dispatchEvent(new CustomEvent('cueory:game-frame-sudoku-level', { detail: level }));
  };

  return (
    <div className="game-frame-stats" data-testid="game-frame-stats" aria-label="your stats">
      <div className="game-frame-stat">
        <span className="game-frame-stat-value">{stats.winPercent}</span>
        <span className="game-frame-stat-label">{stats.firstLabel}</span>
      </div>
      <div className="game-frame-stat">
        <span className="game-frame-stat-value">{stats.currentStreak}</span>
        <span className="game-frame-stat-label">current streak</span>
      </div>
      <div className="game-frame-stat">
        <span className="game-frame-stat-value">{stats.bestStreak}</span>
        <span className="game-frame-stat-label">best streak</span>
      </div>
      <div className="game-frame-stat">
        <span className="game-frame-stat-value">{stats.played}</span>
        <span className="game-frame-stat-label">played</span>
      </div>
      {isSudoku && <section className="game-frame-sudoku-stats" aria-label="sudoku level stats" data-testid="game-frame-sudoku-stats">
        <label htmlFor="game-frame-sudoku-level">difficulty</label>
        <select id="game-frame-sudoku-level" value={sudokuLevel} onChange={(event) => chooseSudokuLevel(event.target.value as SudokuLevel)}>
          {SUDOKU_LEVELS.map((level) => <option key={level} value={level}>{LEVEL_LABELS[level]}</option>)}
        </select>
        <div aria-live="polite" aria-atomic="true" data-testid="game-frame-sudoku-numbers">
          {!sudoku ? <span>loading sudoku stats.</span> : !sudoku.on ? <span>this browser won't keep sudoku stats.</span> : <>
            <span className="game-frame-stat-value">{sudoku.solved}</span>
            <span className="game-frame-stat-label">{LEVEL_LABELS[sudokuLevel]} solved · best {sudoku.best} · average {sudoku.average} · {sudoku.streak} day streak</span>
          </>}
        </div>
      </section>}
    </div>
  );
}
