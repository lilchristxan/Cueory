import { describe, expect, it } from 'vitest';
import {
  calibrate, emptyProgress, levelStatus, nextStep, recordModuleAnswer, shownThrough, stageOf, summarize, summarizeCourse,
  TECHNIQUES_FOR_LEVEL, THINKING_LEVELS, type ModuleItem, type ModuleProgress, type ModuleShape, type ThinkingLevel,
} from '../../src/islands/adaptive-learning/module-path';

// Labeled sample shape: concept ids only, no clinical content.
const shape: ModuleShape = { concepts: ['sample-a', 'sample-b'], practiceTechniques: ['flashcards', 'matching'] };

function answer(progress: ModuleProgress, concept: string, level: ThinkingLevel, results: boolean[]): ModuleProgress {
  return results.reduce((p, correct) => recordModuleAnswer(p, concept, level, correct), progress);
}

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
    const first = nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0)!;
    expect(first).toMatchObject({ concept: 'sample-b', level: 'remember', technique: 'flashcards', reason: 'not practised yet' });
    p = answer(p, 'sample-b', 'remember', [true, false]);
    p = answer(p, 'sample-a', 'remember', [false]);
    const second = nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0)!;
    expect(second.reason).toBe('you missed this recently');
    expect(second.level).toBe('remember');
  });

  it('only offers techniques that fit the level, and changes technique after two in a row', () => {
    const p = diagnosed(emptyProgress());
    const step = nextStep(shape, p, items, { usedIds: [], recentTechniques: ['flashcards', 'flashcards'] }, () => 0)!;
    expect(step.level).toBe('remember');
    expect(step.technique).not.toBe('flashcards');
    expect(TECHNIQUES_FOR_LEVEL.remember).toContain(step.technique);
  });

  it('never repeats the item just shown and prefers items not used this session', () => {
    const p = diagnosed(emptyProgress());
    const used = items.filter((item) => item.concept === 'sample-a' && item.level === 'remember').slice(0, 5).map((item) => item.id);
    const step = nextStep(shape, p, items, { usedIds: used, recentTechniques: [] }, () => 0)!;
    expect(used).not.toContain(step.id);
  });

  it('says "next level up" when a concept moves on, and stops when everything is shown', () => {
    let p = diagnosed(shownOn(emptyProgress(), ['remember']));
    expect(nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0)!.reason).toBe('next level up');
    p = shownOn(p, ['understand', 'apply']);
    expect(nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0)).toBeUndefined();
    // Going deeper has its own list of levels.
    expect(nextStep(shape, p, items, { usedIds: [], recentTechniques: [] }, () => 0, ['analyze', 'evaluate'])!.level).toBe('analyze');
  });

  it('skips a concept with no content at its level instead of stalling', () => {
    const p = diagnosed(emptyProgress());
    const onlyB = items.filter((item) => item.concept === 'sample-b');
    expect(nextStep(shape, p, onlyB, { usedIds: [], recentTechniques: [] }, () => 0.99)!.concept).toBe('sample-b');
    expect(nextStep(shape, p, [], { usedIds: [], recentTechniques: [] }, () => 0)).toBeUndefined();
  });
});

describe('module path: summaries count evidence and never score', () => {
  it('summarises a module per thinking level and lists what to strengthen', () => {
    const p = shownOn(emptyProgress(), ['remember', 'understand', 'apply'], ['sample-a']);
    const summary = summarize(shape, answer(p, 'sample-b', 'remember', [true]));
    expect(summary.levels.remember).toEqual({ 'not started': 0, learning: 1, shown: 1 });
    expect(summary.levels.evaluate).toEqual({ 'not started': 2, learning: 0, shown: 0 });
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
