import { describe, expect, it } from 'vitest';
import {
  calibrate, cardOverdue, emptyProgress, GATE_LEVELS, levelAssessment, nextStep, recordModuleAnswer, stageOf,
  type ModuleItem, type ModuleProgress, type ModuleShape, type ThinkingLevel,
} from '../../src/islands/adaptive-learning/module-path';
import { calendarDay, dayNumber, type StudyClock } from '../../src/islands/adaptive-learning/calendar';

// Labeled sample ids only. The test walks every combination of level state, due or not, and pool, and checks what
// nextStep must always promise, so an ordering bug in one corner cannot hide behind the cases someone thought of.
const FIRST_DAY = dayNumber('2028-01-01');
const clockOn = (offset: number): StudyClock => ({ day: calendarDay(FIRST_DAY + offset), now: (FIRST_DAY + offset + 0.5) * 86_400_000 });
const LEVEL_STATES = ['not started', 'developing', 'sufficient', 'strong'] as const;
const POOLS = ['empty', 'only seen', 'only unseen', 'both'] as const;
type LevelState = (typeof LEVEL_STATES)[number];
type PoolState = (typeof POOLS)[number];
const RESULTS: Record<LevelState, boolean[]> = {
  'not started': [],
  developing: [true, false, true],
  sufficient: Array(6).fill(true) as boolean[],
  strong: Array(14).fill(true) as boolean[],
};

function build(concepts: readonly string[], states: Record<string, Record<string, LevelState>>): { progress: ModuleProgress; seen: ModuleItem[] } {
  let progress: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
  const seen: ModuleItem[] = [];
  for (const concept of concepts) for (const level of GATE_LEVELS) {
    RESULTS[states[concept]![level]!].forEach((correct, n) => {
      const id = `sample-${concept}-${level}-seen-${n}`;
      progress = recordModuleAnswer(progress, concept, level, correct, { technique: 'learning questions', itemId: id, clock: clockOn(0) });
      seen.push({ id, concept, level, technique: 'learning questions' });
    });
  }
  return { progress, seen };
}

function pool(concepts: readonly string[], seen: ModuleItem[], kind: PoolState): ModuleItem[] {
  const unseen = concepts.flatMap((concept) => GATE_LEVELS.map((level): ModuleItem => ({ id: `sample-${concept}-${level}-new`, concept, level, technique: 'learning questions' })));
  return kind === 'empty' ? [] : kind === 'only seen' ? seen : kind === 'only unseen' ? unseen : [...seen, ...unseen];
}

const assignments = (concepts: readonly string[]): Record<string, Record<string, LevelState>>[] => {
  const slots = concepts.flatMap((concept) => GATE_LEVELS.map((level) => [concept, level] as const));
  const out: Record<string, Record<string, LevelState>>[] = [];
  const walk = (index: number, current: Record<string, Record<string, LevelState>>): void => {
    if (index === slots.length) { out.push(JSON.parse(JSON.stringify(current))); return; }
    const [concept, level] = slots[index]!;
    for (const state of LEVEL_STATES) { current[concept] = { ...current[concept], [level]: state }; walk(index + 1, current); }
  };
  walk(0, {});
  return out;
};

describe('module path: nextStep invariants over every combination of state, due and pool', () => {
  for (const concepts of [['sample-a'], ['sample-a', 'sample-b']]) {
    const shape: ModuleShape = { concepts, practiceTechniques: [] };
    it(`${concepts.length} concept(s): the promises hold in every combination`, () => {
      let checked = 0;
      for (const states of assignments(concepts)) for (const due of [false, true]) for (const kind of POOLS) {
        const { progress, seen } = build(concepts, states);
        const items = pool(concepts, seen, kind);
        const today = clockOn(due ? 3 : 0);
        const label = JSON.stringify({ states, due, kind });
        const before = JSON.stringify([...progress.concepts]);
        const result = nextStep(shape, progress, items, { usedIds: [], recentTechniques: [] }, () => 0, undefined, today);
        checked++;
        // Pure: no mutation, and the same answer twice.
        expect(JSON.stringify([...progress.concepts]), label).toBe(before);
        expect(nextStep(shape, progress, items, { usedIds: [], recentTechniques: [] }, () => 0, undefined, today), label).toEqual(result);
        const ready = stageOf(shape, progress, today) === 'ready';
        const unfinished = concepts.some((concept) => calibrate(shape, progress, GATE_LEVELS, today).get(concept) !== undefined);
        // (a) A ready module with nothing to offer is done, never "no content".
        if (ready && result.kind !== 'step') expect(result.kind, label).toBe('done');
        // (b) "done" only when the stage is ready and calibration has no unfinished gate level.
        if (result.kind === 'done') { expect(ready, label).toBe(true); expect(unfinished, label).toBe(false); }
        // (c) "no content" only when the work is unfinished and nothing in the pool could be offered.
        if (result.kind === 'no content') {
          expect(ready, label).toBe(false);
          expect(items.filter((item) => GATE_LEVELS.includes(item.level) && !seen.some((s) => s.id === item.id)), label).toEqual([]);
        }
        // (d) A step is always an item of the pool, at a gate level, of the named concept and level.
        if (result.kind === 'step') {
          const item = items.find((candidate) => candidate.id === result.id);
          expect(item, label).toBeDefined();
          expect([item!.concept, item!.level], label).toEqual([result.concept, result.level]);
          // (e) A repeat is only ever a due review of a card that really is overdue; anything else is unseen.
          const card = progress.concepts.get(result.concept)?.[result.level]?.cards[result.id];
          if (result.reason === 'due for review') expect(card !== undefined && cardOverdue(card, today), label).toBe(true);
          else expect(seen.some((s) => s.id === result.id), label).toBe(false);
        }
        // (f) reviewDue lists only genuinely overdue cards, and is absent when there are none.
        if (result.kind === 'done' && result.reviewDue) {
          expect(result.reviewDue.length, label).toBeGreaterThan(0);
          for (const entry of result.reviewDue) for (const id of entry.cards) {
            expect(cardOverdue(progress.concepts.get(entry.concept)![entry.level]!.cards[id]!, today), label).toBe(true);
          }
        }
      }
      expect(checked).toBeGreaterThan(concepts.length === 1 ? 100 : 2000);
    });
  }

  it('repro: both gate levels strong on day 0, due (sufficient) on day 3, empty pool is done with reviewDue and a ready stage', () => {
    const shape: ModuleShape = { concepts: ['sample-a'], practiceTechniques: [] };
    const states = { 'sample-a': { understand: 'strong', apply: 'strong' } } as Record<string, Record<string, LevelState>>;
    const { progress } = build(['sample-a'], states);
    const today = clockOn(3);
    expect(stageOf(shape, progress, today)).toBe('ready');
    const result = nextStep(shape, progress, [], { usedIds: [], recentTechniques: [] }, () => 0, undefined, today);
    expect(result.kind).toBe('done');
    expect(result.kind === 'done' && result.reviewDue?.length).toBeGreaterThan(0);
  });
});

describe('module path: due cards at every faded tier come before new material', () => {
  it('two due tiers on one concept, only the higher tier in the pool: its due card beats a new item of another concept', () => {
    const shape: ModuleShape = { concepts: ['sample-a', 'sample-b'], practiceTechniques: [] };
    const { progress } = build(['sample-a', 'sample-b'], {
      'sample-a': { understand: 'sufficient', apply: 'sufficient' },
      'sample-b': { understand: 'not started', apply: 'not started' },
    });
    const pool: ModuleItem[] = [
      { id: 'sample-sample-a-apply-seen-0', concept: 'sample-a', level: 'apply', technique: 'learning questions' },
      { id: 'sample-b-new', concept: 'sample-b', level: 'understand', technique: 'learning questions' },
    ];
    expect(nextStep(shape, progress, pool, { usedIds: [], recentTechniques: [] }, () => 0, undefined, clockOn(3)))
      .toMatchObject({ kind: 'step', concept: 'sample-a', level: 'apply', reason: 'due for review', id: 'sample-sample-a-apply-seen-0' });
  });
});

describe('module path: the concept-run limit holds across due and new material', () => {
  const shape: ModuleShape = { concepts: ['sample-a', 'sample-b'], practiceTechniques: [] };
  it('repeated due reviews of A do not starve B, which has an unseen item', () => {
    const { progress } = build(['sample-a', 'sample-b'], {
      'sample-a': { understand: 'sufficient', apply: 'sufficient' },
      'sample-b': { understand: 'not started', apply: 'not started' },
    });
    const pool: ModuleItem[] = [
      { id: 'sample-sample-a-apply-seen-0', concept: 'sample-a', level: 'apply', technique: 'learning questions' },
      { id: 'sample-b-new', concept: 'sample-b', level: 'understand', technique: 'learning questions' },
    ];
    const history = { usedIds: [], recentTechniques: [], recentConcepts: ['sample-a', 'sample-a'] };
    expect(nextStep(shape, progress, pool, history, () => 0, undefined, clockOn(3))).toMatchObject({ kind: 'step', concept: 'sample-b', id: 'sample-b-new' });
    // Without the streak, the due card still wins.
    expect(nextStep(shape, progress, pool, { usedIds: [], recentTechniques: [] }, () => 0, undefined, clockOn(3))).toMatchObject({ concept: 'sample-a', reason: 'due for review' });
    // With nothing else usable, the streak concept is still served.
    expect(nextStep(shape, progress, [pool[0]!], history, () => 0, undefined, clockOn(3))).toMatchObject({ kind: 'step', concept: 'sample-a' });
  });

  it('property: over every state, a streak concept is chosen only when no other concept has new material or a due-level review', () => {
    for (const states of assignments(shape.concepts)) for (const due of [false, true]) for (const kind of POOLS) {
      const { progress, seen } = build(shape.concepts, states);
      const items = pool(shape.concepts, seen, kind);
      const today = clockOn(due ? 3 : 0);
      const plain = { usedIds: [], recentTechniques: [] };
      for (const streak of shape.concepts) {
        const result = nextStep(shape, progress, items, { ...plain, recentConcepts: [streak, streak] }, () => 0, undefined, today);
        if (result.kind !== 'step' || result.concept !== streak) continue;
        const other = shape.concepts.find((c) => c !== streak)!;
        const withoutStreak = items.filter((item) => item.concept === other);
        const alt = nextStep(shape, progress, withoutStreak, { ...plain, recentConcepts: [streak, streak] }, () => 0, undefined, today);
        // An optional review on a level that is not the concept's unfinished one deliberately ranks below the streak
        // concept's own unfinished work, so only new material (or a due-level review of the other concept) is a violation.
        const dueLevel = GATE_LEVELS.some((level) => levelAssessment(progress.concepts.get(other)?.[level], today).due);
        const violation = alt.kind === 'step' && alt.concept === other && (alt.reason !== 'due for review' || dueLevel);
        expect(violation, JSON.stringify({ states, due, kind, streak })).toBe(false);
      }
    }
  });
});
