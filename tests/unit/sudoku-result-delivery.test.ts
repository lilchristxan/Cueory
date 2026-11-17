import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));

// Execute the island's real completion effect without a DOM or a mounted result host.
vi.mock('react', () => ({
  useMemo: (calculate: () => unknown) => calculate(),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => undefined],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
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
import { discardPendingResultCard, forgetHeldRounds, GAME_RESULT_CARD_EVENT, GAME_RESULT_EVENT, heldRounds, takePendingResultCards, type GameResultCard, type RoundResult } from '../../src/islands/gameresults';

afterEach(() => {
  hooks.effects.length = 0;
  takePendingResultCards();
  forgetHeldRounds();
  vi.unstubAllGlobals();
});

describe('Sudoku completion before result-host hydration', () => {
  it('retains one display-only result for a host that subscribes later', () => {
    vi.stubGlobal('window', new EventTarget());
    takePendingResultCards();
    const cleanups: (() => void)[] = [];
    try {
      SudokuGame();
      for (const effect of hooks.effects) {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      }
      const pending = takePendingResultCards();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        game: 'sudoku', name: 'sudoku', level: 'easy', result: 'solved', path: '/play/sudoku',
        stats: [{ label: 'time', value: '00:00' }, { label: 'errors', value: '0' }],
      });
      expect(pending[0]).not.toHaveProperty('entries');
      expect(pending[0]).not.toHaveProperty('solution');
      expect(takePendingResultCards()).toEqual([]);
    } finally {
      for (const cleanup of cleanups.reverse()) cleanup();
    }
  });

  it('delivers once to an already mounted host without retaining a duplicate card', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    takePendingResultCards();
    const received: GameResultCard[] = [];
    target.addEventListener(GAME_RESULT_CARD_EVENT, (event) => {
      const card = (event as CustomEvent<GameResultCard>).detail;
      received.push(card);
      discardPendingResultCard(card);
    });
    const cleanups: (() => void)[] = [];
    try {
      SudokuGame();
      for (const effect of hooks.effects) {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      }
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ game: 'sudoku', level: 'easy', result: 'solved' });
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
