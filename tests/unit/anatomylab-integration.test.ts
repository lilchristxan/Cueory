import { describe, expect, it } from 'vitest';
import {
  answerQuiz,
  breadcrumbRows,
  compareSyncDue,
  missToRecord,
  nextQuiz,
  queuedForSystem,
  revealQuiz,
  reviewQuizPool,
  savedCamera,
  savedVisibility,
  showSiblings,
  startQuiz,
} from '../../src/islands/anatomylab';
import { breadcrumb } from '../../src/islands/anatomyhierarchy';

// Task 178, integration: the pure helpers the island uses to wire the breadcrumb, the review queue and saved views.
// Names are synthetic ("part a"), never anatomy.

describe('breadcrumb rows', () => {
  const structures = [
    { id: 'S1', text: 'region a', group: 'sample body' },
    { id: 'S2', text: 'part a', group: 'region a' },
    { id: 'S3', text: 'piece a', group: 'part a' },
  ];

  it('turns the trail into rows: ancestors that are structures get their id, the root stays plain text', () => {
    expect(breadcrumbRows(breadcrumb(structures, 'S3'), structures, 'S3')).toEqual([
      { name: 'sample body', id: null, current: false },
      { name: 'region a', id: 'S1', current: false },
      { name: 'part a', id: 'S2', current: false },
      { name: 'piece a', id: 'S3', current: true },
    ]);
  });

  it('marks a one-row trail as current and gives an unknown id nothing', () => {
    expect(breadcrumbRows(['lone'], [{ id: 'L', text: 'lone' }], 'L')).toEqual([{ name: 'lone', id: 'L', current: true }]);
    expect(breadcrumbRows([], structures, 'nope')).toEqual([]);
  });

  it('lists siblings only between 2 and 30', () => {
    expect(showSiblings(0)).toBe(false);
    expect(showSiblings(1)).toBe(false);
    expect(showSiblings(2)).toBe(true);
    expect(showSiblings(30)).toBe(true);
    expect(showSiblings(31)).toBe(false);
  });
});

describe('which quiz answers are recorded as misses', () => {
  const random = () => 0;
  const round = startQuiz(['A', 'B', 'C'], random);

  it('records the first wrong pick and "show me" before any pick, each once', () => {
    const wrong = answerQuiz(round, 'B');
    expect(missToRecord(round, wrong)).toBe(round.target);
    // A second wrong pick on the same question records nothing more.
    expect(missToRecord(wrong, answerQuiz(wrong, 'C'))).toBeNull();
    // Right after wrong: nothing more either.
    expect(missToRecord(wrong, answerQuiz(wrong, round.target!))).toBeNull();
    expect(missToRecord(round, revealQuiz(round))).toBe(round.target);
    expect(missToRecord(wrong, revealQuiz(wrong))).toBeNull();
  });

  it('records nothing for a right first pick, a skipped question or a finished round', () => {
    expect(missToRecord(round, answerQuiz(round, round.target!))).toBeNull();
    expect(missToRecord(round, nextQuiz(round, random))).toBeNull();
    const done = { ...round, target: null };
    expect(missToRecord(done, revealQuiz(done))).toBeNull();
  });
});

describe('the review queue in the lab', () => {
  const rows = [
    { system_key: 'heart', structure_id: 'FMA1', cleared_at: null, last_missed_at: '2026-11-05T10:00:00Z' },
    { system_key: 'heart', structure_id: 'FMA2', cleared_at: '2026-11-05T11:00:00Z', last_missed_at: '2026-11-05T10:30:00Z' },
    { system_key: 'heart', structure_id: 'FMA3', cleared_at: null, last_missed_at: '2026-11-05T12:00:00Z' },
    { system_key: 'lungs', structure_id: 'FMA4', cleared_at: null, last_missed_at: '2026-11-05T13:00:00Z' },
  ];

  it('lists the uncleared misses of one system, most recent first', () => {
    expect(queuedForSystem(rows, 'heart')).toEqual(['FMA3', 'FMA1']);
    expect(queuedForSystem(rows, 'lungs')).toEqual(['FMA4']);
    expect(queuedForSystem(rows, 'skin')).toEqual([]);
  });

  it('quizzes only the queued structures the loaded model has', () => {
    expect(reviewQuizPool(['FMA3', 'FMA1', 'FMA9'], new Set(['FMA1', 'FMA3']))).toEqual(['FMA3', 'FMA1']);
    expect(reviewQuizPool(['FMA9'], new Set(['FMA1']))).toEqual([]);
  });
});

describe('saved views in the lab', () => {
  it('reads a saved camera, defaulting up to +Y, and refuses a broken one', () => {
    expect(savedCamera({ position: [1, 2, 3], target: [0, 0, 0] })).toEqual({ position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] });
    expect(savedCamera({ position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1] })!.up).toEqual([0, 0, 1]);
    expect(savedCamera({ position: [1, 2], target: [0, 0, 0] })).toBeNull();
    expect(savedCamera({ position: [1, 2, Number.NaN], target: [0, 0, 0] })).toBeNull();
  });

  it('puts back only ids the model has, hidden winning over faded', () => {
    const found = new Set(['A', 'B', 'C']);
    const v = savedVisibility({ hidden: ['A', 'Z'], faded: ['A', 'B', 'Y'] }, found);
    expect([...v.hidden]).toEqual(['A']);
    expect([...v.faded]).toEqual(['B']);
  });

  it('throttles the compare view camera copy', () => {
    expect(compareSyncDue(1000, null)).toBe(true);
    expect(compareSyncDue(1040, 1000)).toBe(false);
    expect(compareSyncDue(1050, 1000)).toBe(true);
  });
});

describe('the compare view follows the main camera to where it settles', () => {
  it('copies at most every 50 ms and always sends one trailing copy of the final camera', async () => {
    const { createCompareSync } = await import('../../src/islands/anatomylab');
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      let camera = 0;
      const copied: number[] = [];
      let clock = 0;
      const sync = createCompareSync(() => copied.push(camera), 50, {
        now: () => clock,
        setTimeout: (run, ms) => setTimeout(run, ms),
        clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      });
      camera = 1; clock = 0; sync.request();
      camera = 2; clock = 10; sync.request();
      camera = 3; clock = 20; sync.request();
      expect(copied).toEqual([1]);
      // The main view settles at 3 and draws no more frames; the comparison still gets it.
      clock = 50; vi.advanceTimersByTime(40);
      expect(copied).toEqual([1, 3]);
      vi.advanceTimersByTime(1000);
      expect(copied).toEqual([1, 3]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the trailing copy on cancel (close or unmount) and copies at once after reset', async () => {
    const { createCompareSync } = await import('../../src/islands/anatomylab');
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      const copied: number[] = [];
      let clock = 0;
      const sync = createCompareSync(() => copied.push(clock), 50, {
        now: () => clock, setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      });
      sync.request(); clock = 5; sync.request();
      sync.cancel();
      vi.advanceTimersByTime(500);
      expect(copied).toEqual([0]);
      sync.reset(); clock = 6; sync.request();
      expect(copied).toEqual([0, 6]);
    } finally {
      vi.useRealTimers();
    }
  });
});
