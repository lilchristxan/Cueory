import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));

// Execute the island's real completion effect without a DOM or a mounted result host.
vi.mock('react', () => ({
  useMemo: (calculate: () => unknown) => calculate(),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => undefined],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  lazy: () => () => null,
  useCallback: (callback: unknown) => callback,
  Suspense: () => null,
}));

// The shared settings hook touches the document; the island only needs its reduce-motion flag here.
vi.mock('../../src/islands/GameSettings.tsx', () => ({
  useSharedGameSettings: () => ({ reduceMotion: true }),
  GameSettingsDialog: () => null,
}));

vi.mock('../../src/islands/sudoku', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/islands/sudoku')>();
  return {
    ...actual,
    // A completed fixture isolates result delivery from puzzle generation and user input.
    generateSudoku: () => ({ puzzle: Array(81).fill(1), solution: Array(81).fill(1) }),
  };
});

import SudokuGame from '../../src/islands/SudokuGame';
import { forgetHeldRounds, GAME_RESULT_CARD_EVENT, GAME_RESULT_EVENT, heldRounds, takePendingResultCards, type GameResultCard, type RoundResult } from '../../src/islands/gameresults';

afterEach(() => {
  hooks.effects.length = 0;
  takePendingResultCards();
  forgetHeldRounds();
  vi.unstubAllGlobals();
});

describe('Sudoku completion before result-host hydration', () => {
  it('no longer sends the old result card: the share dialog opened by the island replaces it', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    takePendingResultCards();
    const received: GameResultCard[] = [];
    target.addEventListener(GAME_RESULT_CARD_EVENT, (event) => received.push((event as CustomEvent<GameResultCard>).detail));
    const cleanups: (() => void)[] = [];
    try {
      SudokuGame();
      for (const effect of hooks.effects) {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      }
      expect(received).toEqual([]);
      expect(takePendingResultCards()).toEqual([]);
    } finally {
      for (const cleanup of cleanups.reverse()) cleanup();
    }
  });

  it('reports a solved daily sudoku to the shared stats record as game triage, with its errors as tries (#720)', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    forgetHeldRounds();
    const rounds: RoundResult[] = [];
    target.addEventListener(GAME_RESULT_EVENT, (event) => rounds.push((event as CustomEvent<RoundResult>).detail));
    const cleanups: (() => void)[] = [];
    try {
      SudokuGame();
      for (const effect of hooks.effects) {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      }
      expect(rounds).toHaveLength(1);
      expect(rounds[0]).toEqual({ game: 'triage', day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), solved: true, tries: 0 });
      expect(heldRounds()).toEqual(rounds);
    } finally {
      for (const cleanup of cleanups.reverse()) cleanup();
    }
  });
});
