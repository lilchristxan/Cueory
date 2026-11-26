import { useEffect, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { currentStatsStatus, GAME_STATS_CHANGED_EVENT, GAME_STATS_STATUS_EVENT, loadStats, localDay } from './gameresults';
import { currentStreak, dailyStats, longestStreak, wordPathSummary, type GameId, type GameStats } from './gamestats';
import { statsCta } from '../config/site';
import { useStatsVisible } from './gamestatsgate';
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
  // Hidden until a signed-in session is confirmed. Stats keep being recorded and tracked below either way.
  const visible = useStatsVisible();
  const [status, setStatus] = useState(currentStatsStatus);
  // Start from zeros so the first client render matches the server HTML; saved stats load in the effect below.
  const [stats, setStats] = useState<StatValues>(() => computeStats(game, [], localDay(new Date())));
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

    refresh();
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

  // Everyone who is not confirmed signed in (signed out, accounts closed, no JavaScript, or the check still running) sees
  // the same bar the page was built with, so a signed-out page never changes after load. It is also the static HTML.
  if (!visible) {
    return <div className="game-frame-account-bar" data-testid="game-frame-account-bar">
        <a href={statsCta.href} className="copper-button" aria-describedby="game-frame-account-note">{statsCta.label}</a>
        <p id="game-frame-account-note" className="game-frame-account-note">{statsCta.note}</p>
      </div>;
  }

  return <div className="game-frame-stats" data-testid="game-frame-stats" aria-label="your stats">
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
    </div>;
}
