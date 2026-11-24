import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { currentStatsStatus, GAME_STATS_CHANGED_EVENT, GAME_STATS_STATUS_EVENT, loadStats, localDay } from './gameresults';
import { currentStreak, dailyStats, longestStreak, wordPathSummary, type GameId, type GameStats } from './gamestats';
import { GUESSES } from './pulse';

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
  const [status, setStatus] = useState(currentStatsStatus);
  const [stats, setStats] = useState<StatValues>(() => {
    const today = localDay(new Date());
    const saved = loadStats(browserStorage(), today);
    return computeStats(game, saved.stats, today);
  });
  useEffect(() => {
    const refresh = () => {
      const today = localDay(new Date());
      const saved = loadStats(browserStorage(), today);
      setStats(computeStats(game, saved.stats, today));
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    const onStatus = (event: WindowEventMap['cueory:game-stats-status']) => setStatus(event.detail.message);

    window.addEventListener(GAME_STATS_CHANGED_EVENT, refresh);
    window.addEventListener(GAME_STATS_STATUS_EVENT, onStatus);
    window.addEventListener('storage', refresh);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener(GAME_STATS_CHANGED_EVENT, refresh);
      window.removeEventListener(GAME_STATS_STATUS_EVENT, onStatus);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [game]);

  return <>
      {status && <p className="game-frame-stats-status" data-testid="game-frame-stats-status" role="status" aria-live="polite">{status}</p>}
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
    </>;
}
