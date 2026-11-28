import { describe, expect, it } from 'vitest';
import {
  calibrate, emptyProgress, evidenceWeight, EVIDENCE_WEIGHT, levelStatus, nextStep, recordModuleAnswer, shownThrough, stageOf,
  STALE_AFTER_DAYS, summarize, summarizeCourse, TECHNIQUES_FOR_LEVEL, THINKING_LEVELS,
  type AnswerDetail, type ModuleItem, type ModuleProgress, type ModuleShape, type Technique, type ThinkingLevel,
} from '../../src/islands/adaptive-learning/module-path';
import { calendarDay, dayNumber, type StudyClock } from '../../src/islands/adaptive-learning/calendar';

// Labeled sample shape: concept ids only, no clinical content.
const shape: ModuleShape = { concepts: ['sample-a', 'sample-b'], practiceTechniques: ['flashcards', 'matching'] };

function answer(progress: ModuleProgress, concept: string, level: ThinkingLevel, results: boolean[], detail: AnswerDetail = {}): ModuleProgress {
  return results.reduce((p, correct) => recordModuleAnswer(p, concept, level, correct, detail), progress);
}

const FIRST_DAY = dayNumber('2028-01-01');
const clockOn = (offset: number): StudyClock => ({ day: calendarDay(FIRST_DAY + offset), now: (FIRST_DAY + offset + 0.5) * 86_400_000 });
const statusOf = (p: ModuleProgress, level: ThinkingLevel, today?: StudyClock) => levelStatus(p.concepts.get('sample-a')![level], today);

function shownOn(progress: ModuleProgress, levels: readonly ThinkingLevel[], concepts = shape.concepts): ModuleProgress {
  let next = progress;
  for (const concept of concepts) for (const level of levels) next = answer(next, concept, level, [true, true]);
  return next;
}

const items: ModuleItem[] = shape.concepts.flatMap((concept) =>
  THINKING_LEVELS.flatMap((level) => TECHNIQUES_FOR_LEVEL[level].flatMap((technique) =>
    [1, 2].map((n) => ({ id: `${concept}:${level}:${technique}:${n}`, concept, level, technique })))));

describe('module path: what counts as shown', () => {
  it('needs two answers with the last two right; one lucky answer is still learning', () => {
    let p = answer(emptyProgress(), 'sample-a', 'remember', [true]);
    expect(levelStatus(p.concepts.get('sample-a')!.remember)).toBe('learning');
    p = answer(p, 'sample-a', 'remember', [true]);
    expect(levelStatus(p.concepts.get('sample-a')!.remember)).toBe('shown');
    p = answer(p, 'sample-a', 'remember', [false]);
    expect(levelStatus(p.concepts.get('sample-a')!.remember)).toBe('learning');
  });

  it('a long run of misses needs more than two right answers to recover', () => {
    const p = answer(emptyProgress(), 'sample-a', 'understand', [false, false, false, false, true, true]);
    expect(levelStatus(p.concepts.get('sample-a')!.understand)).toBe('learning');
    const more = answer(p, 'sample-a', 'understand', [true, true, true, true, true, true]);
    expect(levelStatus(more.concepts.get('sample-a')!.understand)).toBe('shown');
  });

  it('shownThrough stops at the first gap, so a higher level never hides a missing foundation', () => {
    let p = answer(emptyProgress(), 'sample-a', 'remember', [true, true]);
    p = answer(p, 'sample-a', 'apply', [true, true]);
    expect(shownThrough(p.concepts.get('sample-a'))).toBe('remember');
    expect(shownThrough(undefined)).toBeUndefined();
  });

  it('never mutates the progress it is given', () => {
    const before = emptyProgress();
    recordModuleAnswer(before, 'sample-a', 'remember', true);
    expect(before.concepts.size).toBe(0);
  });
});

describe('module path: stages', () => {
  it('walks input → practice → diagnostic → adaptive → ready → complete', () => {
    let p = emptyProgress();
    expect(stageOf(shape, p)).toBe('input');
    p = { ...p, watched: true };
    expect(stageOf(shape, p)).toBe('input'); // the reading is part of the input too
    p = { ...p, read: true };
    expect(stageOf(shape, p)).toBe('practice');
    p = { ...p, practised: ['flashcards', 'matching'] };
    expect(stageOf(shape, p)).toBe('diagnostic');
    p = { ...p, diagnosed: true };
    expect(stageOf(shape, p)).toBe('adaptive');
    p = shownOn(p, ['remember', 'understand', 'apply']);
    expect(stageOf(shape, p)).toBe('ready');
    expect(stageOf(shape, { ...p, examDone: true })).toBe('complete');
  });

  it('going deeper is a choice: it adds analysis and evaluation before the exam', () => {
    let p: ModuleProgress = { ...shownOn(emptyProgress(), ['remember', 'understand', 'apply']), watched: true, read: true, diagnosed: true, wantsDeeper: true };
    expect(stageOf(shape, p)).toBe('deeper');
    p = shownOn(p, ['analyze', 'evaluate']);
    expect(stageOf(shape, p)).toBe('exam');
  });

  it('a strong diagnostic quiz skips adaptive practice altogether', () => {
    const p: ModuleProgress = { ...shownOn(emptyProgress(), ['remember', 'understand', 'apply']), watched: true, read: true, practised: ['flashcards', 'matching'], diagnosed: true };
    expect(stageOf(shape, p)).toBe('ready');
  });

  it('a module with no concepts is never called ready', () => {
    const p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    expect(stageOf({ concepts: [], practiceTechniques: [] }, p)).toBe('adaptive');
  });
});

describe('module path: calibration and the next step', () => {
  const stepOf = (result: ReturnType<typeof nextStep>) => {
    if (result.kind !== 'step') throw new Error(`expected a step, got ${result.kind}`);
    return result;
  };
  const diagnosed = (p: ModuleProgress): ModuleProgress => ({ ...p, watched: true, read: true, diagnosed: true });

  it('starts each concept at the lowest level the quiz did not show', () => {
    let p = shownOn(emptyProgress(), ['remember'], ['sample-a']);
    p = answer(p, 'sample-a', 'understand', [false]);
    const start = calibrate(shape, p);
    expect(start.get('sample-a')).toBe('understand');
    expect(start.get('sample-b')).toBe('remember');
  });

  it('works on foundations first, puts a recent miss ahead, and says why', () => {
    let p = diagnosed(shownOn(emptyProgress(), ['remember'], ['sample-a']));
    const first = stepOf(nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0));
    expect(first).toMatchObject({ concept: 'sample-b', level: 'remember', technique: 'flashcards', reason: 'not practised yet' });
    p = answer(p, 'sample-b', 'remember', [true, false]);
    p = answer(p, 'sample-a', 'remember', [false]);
    const second = stepOf(nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0));
    expect(second.reason).toBe('you missed this recently');
    expect(second.level).toBe('remember');
  });

  it('only offers techniques that fit the level, and changes technique after two in a row', () => {
    const p = diagnosed(emptyProgress());
    const step = stepOf(nextStep(shape, p, items, { usedIds: [], recentTechniques: ['flashcards', 'flashcards'] }, () => 0));
    expect(step.level).toBe('remember');
    expect(step.technique).not.toBe('flashcards');
    expect(TECHNIQUES_FOR_LEVEL.remember).toContain(step.technique);
  });

  it('never repeats the item just shown and prefers items not used this session', () => {
    const p = diagnosed(emptyProgress());
    const used = items.filter((item) => item.concept === 'sample-a' && item.level === 'remember').slice(0, 5).map((item) => item.id);
    const step = stepOf(nextStep(shape, p, items, { usedIds: used, recentTechniques: [] }, () => 0));
    expect(used).not.toContain(step.id);
  });

  it('says "next level up" when a concept moves on, and stops when everything is shown', () => {
    let p = diagnosed(shownOn(emptyProgress(), ['remember']));
    expect(stepOf(nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0)).reason).toBe('next level up');
    p = shownOn(p, ['understand', 'apply']);
    expect(nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0)).toEqual({ kind: 'done' });
    // Going deeper has its own list of levels.
    expect(stepOf(nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0, ['analyze', 'evaluate'])).level).toBe('analyze');
  });

  it('skips a concept with no content at its level instead of stalling', () => {
    const p = diagnosed(emptyProgress());
    const onlyB = items.filter((item) => item.concept === 'sample-b');
    expect(stepOf(nextStep(shape, p, onlyB, { usedIds: [], recentTechniques: [] }, () => 0.99)).concept).toBe('sample-b');
    expect(nextStep(shape, p, [], { usedIds: [], recentTechniques: [] }, () => 0)).toEqual({ kind: 'no content', concepts: ['sample-a', 'sample-b'] });
  });

  it('a module whose only item was just shown reports "no content", never "done"', () => {
    const one: ModuleShape = { concepts: ['sample-a'], practiceTechniques: [] };
    const only: ModuleItem[] = [{ id: 'only', concept: 'sample-a', level: 'remember', technique: 'flashcards' }];
    const p = answer(diagnosed(emptyProgress()), 'sample-a', 'remember', [true]);
    expect(stageOf(one, p)).toBe('adaptive');
    expect(nextStep(one, p, only, { usedIds: ['only'], recentTechniques: ['flashcards'] }, () => 0)).toEqual({ kind: 'no content', concepts: ['sample-a'] });
    // The same item is offered again once something else has been shown in between.
    expect(stepOf(nextStep(one, p, only, { usedIds: ['only', 'other'], recentTechniques: [] }, () => 0)).id).toBe('only');
  });

  it('a module with no concepts is "no content", never "done"', () => {
    const empty: ModuleShape = { concepts: [], practiceTechniques: [] };
    expect(nextStep(empty, diagnosed(emptyProgress()), [], { usedIds: [], recentTechniques: [] }, () => 0)).toEqual({ kind: 'no content', concepts: [] });
  });

  it('changes technique after two in a row even when unused items remain in the tired one', () => {
    const p = diagnosed(emptyProgress());
    const pool = items.filter((item) => item.concept === 'sample-a' && item.level === 'remember');
    const matching = pool.filter((item) => item.technique === 'matching').map((item) => item.id);
    const labelIt = pool.filter((item) => item.technique === 'label it').map((item) => item.id);
    const flash = pool.find((item) => item.technique === 'flashcards')!.id;
    // Every non-flashcard item was used earlier; one unused flashcard remains; flashcards just ran twice.
    const step = stepOf(nextStep(shape, p, pool, { usedIds: [...matching, ...labelIt, flash, 'x'], recentTechniques: ['flashcards', 'flashcards'] }, () => 0));
    expect(step.technique).not.toBe('flashcards');
  });
});

describe('module path: summaries count evidence and never score', () => {
  it('summarises a module per thinking level and lists what to strengthen', () => {
    const p = shownOn(emptyProgress(), ['remember', 'understand', 'apply'], ['sample-a']);
    const summary = summarize(shape, answer(p, 'sample-b', 'remember', [true]));
    expect(summary.levels.remember).toEqual({ 'not started': 0, learning: 1, shown: 1, 'review due': 0 });
    expect(summary.levels.evaluate).toEqual({ 'not started': 2, learning: 0, shown: 0, 'review due': 0 });
    expect(summary.toStrengthen).toEqual(['sample-b']);
  });

  it('rolls modules up into the course and points at the first unfinished one', () => {
    const done: ModuleProgress = { ...shownOn(emptyProgress(), THINKING_LEVELS), watched: true, read: true, diagnosed: true, examDone: true };
    const course = summarizeCourse([
      { id: 'sample-module-1', shape, progress: done },
      { id: 'sample-module-2', shape, progress: emptyProgress() },
    ]);
    expect(course.stages.complete).toBe(1);
    expect(course.stages.input).toBe(1);
    expect(course.levels.apply).toEqual({ shown: 2, of: 4 });
    expect(course.next).toBe('sample-module-2');
    expect(JSON.stringify(course)).not.toMatch(/score|percent|pass/i);
  });
});

describe('module path: evidence weight by technique', () => {
  it('recognition shows less than production, and a worked case shows most', () => {
    expect(EVIDENCE_WEIGHT.matching).toBeLessThan(EVIDENCE_WEIGHT.flashcards);
    expect(EVIDENCE_WEIGHT['learning questions']).toBeLessThan(EVIDENCE_WEIGHT['fill in the blank']);
    for (const technique of ['flashcards', 'label it', 'fill in the blank', 'matching', 'learning questions'] as const) {
      expect(EVIDENCE_WEIGHT['case questions']).toBeGreaterThan(EVIDENCE_WEIGHT[technique]);
    }
  });

  it('needs more right answers in a recognition technique than in a production one', () => {
    const matching = (n: number) => answer(emptyProgress(), 'sample-a', 'remember', Array(n).fill(true), { technique: 'matching' });
    const flash = answer(emptyProgress(), 'sample-a', 'remember', [true, true], { technique: 'flashcards' });
    expect(statusOf(flash, 'remember')).toBe('shown');
    expect(statusOf(matching(2), 'remember')).toBe('learning');
    expect(statusOf(matching(3), 'remember')).toBe('learning');
    expect(statusOf(matching(4), 'remember')).toBe('shown');
  });

  it('one lucky answer never makes a level shown, even a worked case', () => {
    for (const technique of ['flashcards', 'case questions', 'matching'] as const) {
      expect(statusOf(answer(emptyProgress(), 'sample-a', 'apply', [true], { technique }), 'apply')).toBe('learning');
    }
    // Two worked cases are plenty.
    expect(statusOf(answer(emptyProgress(), 'sample-a', 'apply', [true, true], { technique: 'case questions' }), 'apply')).toBe('shown');
  });

  it('the last two answers must still be right, whatever the technique', () => {
    const p = answer(emptyProgress(), 'sample-a', 'apply', [true, true, true, false], { technique: 'case questions' });
    expect(statusOf(p, 'apply')).toBe('learning');
  });

  it('answers without a technique count as one ordinary answer', () => {
    expect(evidenceWeight(true)).toBe(1);
    expect(evidenceWeight(false, { technique: 'matching' })).toBe(EVIDENCE_WEIGHT.matching);
  });
});

describe('module path: guessing', () => {
  const technique: Technique = 'learning questions';

  it('a right answer is weaker evidence the fewer options there were', () => {
    expect(evidenceWeight(true, { technique, options: 2 })).toBeLessThan(evidenceWeight(true, { technique, options: 3 }));
    expect(evidenceWeight(true, { technique, options: 3 })).toBeLessThan(evidenceWeight(true, { technique, options: 4 }));
    expect(evidenceWeight(true, { technique, options: 8 })).toBe(evidenceWeight(true, { technique }));
    expect(evidenceWeight(true, { technique, options: 1 })).toBe(evidenceWeight(true, { technique, options: 2 }));
  });

  it('options only matter on recognition items, and never soften a miss', () => {
    expect(evidenceWeight(true, { technique: 'flashcards', options: 2 })).toBe(EVIDENCE_WEIGHT.flashcards);
    expect(evidenceWeight(false, { technique, options: 2 })).toBe(EVIDENCE_WEIGHT[technique]);
  });

  it('true or false style items need more right answers to show a level than four-option items', () => {
    const n = (options: number) => {
      let p = emptyProgress();
      for (let i = 1; i <= 12; i++) {
        p = answer(p, 'sample-a', 'understand', [true], { technique, options });
        if (statusOf(p, 'understand') === 'shown') return i;
      }
      return Infinity;
    };
    expect(n(2)).toBeGreaterThan(n(4));
  });
});

describe('module path: slips', () => {
  const detail: AnswerDetail = { technique: 'flashcards' };

  it('one miss after a strong run drops the level to learning', () => {
    const p = answer(emptyProgress(), 'sample-a', 'remember', [true, true, true, true, false], detail);
    expect(statusOf(p, 'remember')).toBe('learning');
  });

  it('recovers with two right answers after a slip, but not after the same miss early on', () => {
    const slip = answer(emptyProgress(), 'sample-a', 'remember', [true, true, true, true, false, true], detail);
    expect(statusOf(slip, 'remember')).toBe('learning'); // the last two must be right
    expect(statusOf(answer(slip, 'sample-a', 'remember', [true], detail), 'remember')).toBe('shown');

    const early = answer(emptyProgress(), 'sample-a', 'remember', [true, false, true, true], detail);
    expect(statusOf(early, 'remember')).toBe('learning');
  });

  it('recovery after a slip needs fewer answers than after a real run of misses', () => {
    const recoveryAnswers = (history: boolean[]) => {
      let p = answer(emptyProgress(), 'sample-a', 'remember', history, detail);
      for (let i = 1; i <= 20; i++) {
        p = answer(p, 'sample-a', 'remember', [true], detail);
        if (statusOf(p, 'remember') === 'shown') return i;
      }
      return Infinity;
    };
    const afterSlip = recoveryAnswers([true, true, true, true, false]);
    const afterMisses = recoveryAnswers([true, true, false, false, false, false]);
    expect(afterSlip).toBe(2);
    expect(afterSlip).toBeLessThan(afterMisses);
  });

  it('two misses in a row are not slips', () => {
    const p = answer(emptyProgress(), 'sample-a', 'remember', [true, true, true, true, false, false], detail);
    expect(p.concepts.get('sample-a')!.remember!.recent.map((a) => a.slip)).toEqual([false, false, false, false, true, false]);
  });
});

describe('module path: staleness and review due', () => {
  const detail = (day: number): AnswerDetail => ({ technique: 'flashcards', clock: clockOn(day) });
  const shownOnDay = (day: number) => answer(answer(emptyProgress(), 'sample-a', 'remember', [true], detail(day)), 'sample-a', 'remember', [true], detail(day));

  it('stays shown until the newest answer is older than the limit, then is review due', () => {
    const p = shownOnDay(0);
    expect(statusOf(p, 'remember', clockOn(STALE_AFTER_DAYS))).toBe('shown');
    expect(statusOf(p, 'remember', clockOn(STALE_AFTER_DAYS + 1))).toBe('review due');
    expect(statusOf(p, 'remember')).toBe('shown'); // no clock, no staleness
  });

  it('only shown levels go stale: learning stays learning, answers without a day never expire', () => {
    const learning = answer(emptyProgress(), 'sample-a', 'remember', [true], detail(0));
    expect(statusOf(learning, 'remember', clockOn(60))).toBe('learning');
    const undated = answer(emptyProgress(), 'sample-a', 'remember', [true, true]);
    expect(statusOf(undated, 'remember', clockOn(60))).toBe('shown');
  });

  it('a right answer on the review re-shows the level, a miss makes it learning', () => {
    const p = shownOnDay(0);
    const later = clockOn(30);
    expect(statusOf(answer(p, 'sample-a', 'remember', [true], detail(30)), 'remember', later)).toBe('shown');
    expect(statusOf(answer(p, 'sample-a', 'remember', [false], detail(30)), 'remember', later)).toBe('learning');
  });

  it('a stale level takes the student out of ready and into adaptive practice', () => {
    const base: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    let p = base;
    for (const concept of shape.concepts) for (const level of THINKING_LEVELS.slice(0, 3)) p = answer(p, concept, level, [true, true], detail(0));
    expect(stageOf(shape, p, clockOn(5))).toBe('ready');
    expect(stageOf(shape, p, clockOn(40))).toBe('adaptive');
    expect(summarize(shape, p, clockOn(40)).levels.remember['review due']).toBe(2);
    expect(summarize(shape, p, clockOn(40)).toStrengthen).toEqual(['sample-a', 'sample-b']);
  });

  it('review that is due comes ahead of new material and says so', () => {
    const base: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    // sample-b: remember shown long ago. sample-a: nothing yet, and first in module order.
    const p = answer(base, 'sample-b', 'remember', [true, true], detail(0));
    const history = { usedIds: [], recentTechniques: [] };
    const fresh = nextStep(shape, p, items, history, () => 0, undefined, clockOn(2));
    expect(fresh).toMatchObject({ kind: 'step', concept: 'sample-a', level: 'remember', reason: 'not practised yet' });
    const step = nextStep(shape, p, items, history, () => 0, undefined, clockOn(40));
    expect(step).toMatchObject({ kind: 'step', concept: 'sample-b', level: 'remember', reason: 'due for review' });
  });

  it('is never "done" while something is review due, and is done again once reviewed', () => {
    const base: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    let p = base;
    for (const concept of shape.concepts) for (const level of THINKING_LEVELS.slice(0, 3)) p = answer(p, concept, level, [true, true], detail(0));
    const history = { usedIds: [], recentTechniques: [] };
    expect(nextStep(shape, p, items, history, () => 0, undefined, clockOn(3))).toEqual({ kind: 'done' });
    expect(nextStep(shape, p, items, history, () => 0, undefined, clockOn(40)).kind).toBe('step');
    for (const concept of shape.concepts) for (const level of THINKING_LEVELS.slice(0, 3)) p = answer(p, concept, level, [true], detail(40));
    expect(nextStep(shape, p, items, history, () => 0, undefined, clockOn(40))).toEqual({ kind: 'done' });
  });

  it('records the day without changing the old progress', () => {
    const before = emptyProgress();
    const after = recordModuleAnswer(before, 'sample-a', 'remember', true, detail(3));
    expect(after.concepts.get('sample-a')!.remember!.recent[0]!.day).toBe(FIRST_DAY + 3);
    expect(before.concepts.size).toBe(0);
  });
});
