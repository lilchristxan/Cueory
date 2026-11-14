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
  async function setup() {
    const { createCompareSync } = await import('../../src/islands/anatomylab');
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    let main = 'start';
    const compare: string[] = [];
    const sync = createCompareSync(() => compare.push(main), {
      now: () => performance.now(),
      setTimeout: (run, ms) => setTimeout(run, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
    return { vi, sync, compare, move: (camera: string) => { main = camera; sync.request(); } };
  }

  it('copies the final camera after a fast event inside the 50 ms window, once', async () => {
    const { vi, compare, move } = await setup();
    try {
      move('first');
      vi.advanceTimersByTime(10);
      move('settled'); // the last frame the main view draws; it is inside the window, so no copy yet
      expect(compare).toEqual(['first']);
      vi.advanceTimersByTime(39);
      expect(compare).toEqual(['first']);
      vi.advanceTimersByTime(1);
      expect(compare).toEqual(['first', 'settled']);
      vi.advanceTimersByTime(1000);
      expect(compare).toEqual(['first', 'settled']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the pending copy on teardown', async () => {
    const { vi, sync, compare, move } = await setup();
    try {
      move('first');
      vi.advanceTimersByTime(5);
      move('settled');
      sync.cancel();
      vi.advanceTimersByTime(1000);
      expect(compare).toEqual(['first']);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the save button is busy only in systems with a save in flight', () => {
  it('A pending, B saves and settles first: A stays disabled until A settles', async () => {
    const { savingViewBusy, savingViewSettled, savingViewStarted } = await import('../../src/islands/anatomylab');
    let saving: ReadonlySet<string> = new Set();
    saving = savingViewStarted(saving, 'heart');
    expect(savingViewBusy(saving, 'heart')).toBe(true);
    expect(savingViewBusy(saving, 'lungs')).toBe(false); // switched systems while A's save is pending
    saving = savingViewStarted(saving, 'lungs');
    saving = savingViewSettled(saving, 'lungs'); // B settles first
    expect(savingViewBusy(saving, 'lungs')).toBe(false);
    expect(savingViewBusy(saving, 'heart')).toBe(true); // back on A: still disabled
    saving = savingViewSettled(saving, 'heart');
    expect(savingViewBusy(saving, 'heart')).toBe(false);
    expect(saving.size).toBe(0);
  });

  it('settling a system that was not saving changes nothing, and each step is a new set', async () => {
    const { savingViewSettled, savingViewStarted } = await import('../../src/islands/anatomylab');
    const start: ReadonlySet<string> = new Set(['heart']);
    const same = savingViewSettled(start, 'lungs');
    expect([...same]).toEqual(['heart']);
    expect(same).not.toBe(start);
    expect(savingViewStarted(start, 'heart')).not.toBe(start);
  });
});

describe('the whole body keeps each structure\'s own hierarchy relation', () => {
  const system = (key: string, tree: 'partof' | 'isa', id: string) => ({
    key, title: key, status: 'draft' as const, hierarchyTree: tree,
    model: { file: `/models/anatomy/${key}.glb`, release: 'sample release' },
    structures: [{ id, text: `part ${id}`, group: `group ${key}`, parents: ['sample root', `group ${key}`] }],
  });
  it('shows a trail for the PART-OF structure and none for the IS-A one', async () => {
    const { structureTree } = await import('../../src/islands/anatomylab');
    const { wholeBody } = await import('../../src/islands/anatomylayers');
    const { breadcrumb } = await import('../../src/islands/anatomyhierarchy');
    const body = wholeBody([system('heart', 'partof', 'FMA1'), system('muscle', 'isa', 'FMA2')])!;
    expect(body.hierarchyTree).toBeUndefined();
    const trail = (id: string) => {
      const structure = body.structures.find((s) => s.id === id);
      return breadcrumb(body.structures, id, structureTree(body, structure));
    };
    expect(trail('FMA1')).toEqual(['sample root', 'group heart', 'part FMA1']);
    expect(trail('FMA2')).toEqual([]);
    expect(structureTree(body, body.structures[1])).toBe('isa');
  });
});
