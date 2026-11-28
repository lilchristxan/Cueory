import { describe, expect, it } from 'vitest';
import {
  betaCdf, calibrate, credibleLowerBound, emptyProgress, evidenceWeight, EVIDENCE_WEIGHT, isShown, levelAssessment, levelStatus,
  nextStep, posterior, READY_LEVELS, GATE_LEVELS, PRACTICE_LEVELS, diagnosticFastTrack, cardOverdue, recordModuleAnswer, shownThrough, SOURCE_WEIGHT, stageOf, summarize, summarizeCourse,
  TECHNIQUES_FOR_LEVEL, THINKING_LEVELS,
  type AnswerDetail, type LevelStatus, type ModuleItem, type ModuleProgress, type ModuleShape, type Technique, type ThinkingLevel,
} from '../../src/islands/adaptive-learning/module-path';
import { calendarDay, dayNumber, type StudyClock } from '../../src/islands/adaptive-learning/calendar';

// Labeled sample shape: concept ids only, no clinical content.
const shape: ModuleShape = { concepts: ['sample-a', 'sample-b'], practiceTechniques: ['flashcards', 'matching'] };

// Every answer is a different item unless the test gives an id, because a repeated item is not independent evidence.
let counter = 0;
const fresh = (): string => `sample-item-${++counter}`;

/** Answers in order. Default: learning questions (weight 1), four options, each a new item. */
function answer(progress: ModuleProgress, concept: string, level: ThinkingLevel, results: boolean[], detail: AnswerDetail = {}): ModuleProgress {
  return results.reduce((p, correct) => recordModuleAnswer(p, concept, level, correct, { technique: 'learning questions', itemId: fresh(), ...detail }), progress);
}

const FIRST_DAY = dayNumber('2028-01-01');
const clockOn = (offset: number, hours = 12): StudyClock => ({ day: calendarDay(FIRST_DAY + offset), now: (FIRST_DAY + offset + hours / 24) * 86_400_000 });
const statusOf = (p: ModuleProgress, level: ThinkingLevel, today?: StudyClock, concept = 'sample-a'): LevelStatus => levelStatus(p.concepts.get(concept)?.[level], today);
const runOf = (n: number): boolean[] => Array(n).fill(true);
/** Enough right answers (learning questions, weight 1) to be sufficient on their own: 6 reach the brief's 0.70 bound. */
const SUFFICIENT_RUN = 6;

function shownOn(progress: ModuleProgress, levels: readonly ThinkingLevel[], concepts = shape.concepts, detail: AnswerDetail = {}): ModuleProgress {
  let next = progress;
  for (const concept of concepts) for (const level of levels) next = answer(next, concept, level, runOf(8), detail);
  return next;
}

const items: ModuleItem[] = shape.concepts.flatMap((concept) =>
  THINKING_LEVELS.flatMap((level) => TECHNIQUES_FOR_LEVEL[level].flatMap((technique) =>
    [1, 2].map((n) => ({ id: `${concept}:${level}:${technique}:${n}`, concept, level, technique })))));

describe('module path: the belief and the five status words (brief #1281)', () => {
  it('uses the five words of the brief, lowest first, and counts sufficient and strong as shown', () => {
    expect(isShown('sufficient') && isShown('strong')).toBe(true);
    expect(['not started', 'gap', 'developing'].some((status) => isShown(status as LevelStatus))).toBe(false);
  });

  it('computes the Beta(1,1) belief and its 10th percentile lower bound correctly', () => {
    // For Beta(a, 1) the cdf is x^a, so the 10th percentile is 0.1^(1/a).
    expect(betaCdf(0.5, 3, 1)).toBeCloseTo(0.125, 6);
    expect(credibleLowerBound(7, 1)).toBeCloseTo(0.1 ** (1 / 7), 4);
    expect(credibleLowerBound(1, 1)).toBeCloseTo(0.1, 4);
    const p = posterior(answer(emptyProgress(), 'sample-a', 'remember', [true, true, false]).concepts.get('sample-a')!.remember);
    expect(p).toMatchObject({ alpha: 3, beta: 2 });
  });

  it('needs the lower bound to reach 0.70: six ordinary right answers, not two', () => {
    const states = [1, 2, 5, 6].map((n) => statusOf(answer(emptyProgress(), 'sample-a', 'remember', runOf(n)), 'remember'));
    expect(states).toEqual(['developing', 'developing', 'developing', 'sufficient']);
  });

  it('one lucky answer is developing, and one miss is a gap', () => {
    expect(statusOf(answer(emptyProgress(), 'sample-a', 'remember', [true]), 'remember')).toBe('developing');
    expect(statusOf(answer(emptyProgress(), 'sample-a', 'remember', [false]), 'remember')).toBe('gap');
    expect(statusOf(emptyProgress(), 'remember')).toBe('not started');
  });

  it('a long run of misses needs many right answers to recover', () => {
    const p = answer(emptyProgress(), 'sample-a', 'understand', [false, false, false, false, true, true]);
    expect(statusOf(p, 'understand')).toBe('gap');
    expect(statusOf(answer(p, 'sample-a', 'understand', runOf(6)), 'understand')).toBe('developing');
    expect(isShown(statusOf(answer(p, 'sample-a', 'understand', runOf(20)), 'understand'))).toBe(true); // the misses have slid out of the window
  });

  it('a lot of clean evidence is strong, and only then', () => {
    expect(statusOf(answer(emptyProgress(), 'sample-a', 'remember', runOf(7)), 'remember')).toBe('sufficient');
    expect(statusOf(answer(emptyProgress(), 'sample-a', 'remember', runOf(12)), 'remember')).toBe('strong');
  });

  it('shownThrough stops at the first gap, so a higher level never hides a missing foundation', () => {
    let p = answer(emptyProgress(), 'sample-a', 'remember', runOf(8));
    p = answer(p, 'sample-a', 'apply', runOf(8));
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
  const noHistory = { usedIds: [], recentTechniques: [] };

  it('starts each concept at the lowest level the quiz did not show', () => {
    let p = shownOn(emptyProgress(), ['remember'], ['sample-a']);
    p = answer(p, 'sample-a', 'understand', [false]);
    const start = calibrate(shape, p, READY_LEVELS);
    expect(start.get('sample-a')).toBe('understand');
    expect(start.get('sample-b')).toBe('remember');
  });

  it('works on foundations first, puts a recent miss ahead, and says why', () => {
    let p = diagnosed(shownOn(emptyProgress(), ['remember'], ['sample-a']));
    const first = stepOf(nextStep(shape, p, items, noHistory, () => 0, READY_LEVELS));
    expect(first).toMatchObject({ concept: 'sample-b', level: 'remember', technique: 'flashcards', reason: 'not practised yet' });
    p = answer(p, 'sample-b', 'remember', [true, false]);
    p = answer(p, 'sample-a', 'remember', [false]);
    const second = stepOf(nextStep(shape, p, items, noHistory, () => 0, READY_LEVELS));
    expect(second.reason).toBe('you missed this recently');
    expect(second.level).toBe('remember');
  });

  it('only offers techniques that fit the level, and changes technique after two in a row', () => {
    const p = diagnosed(emptyProgress());
    const step = stepOf(nextStep(shape, p, items, { usedIds: [], recentTechniques: ['flashcards', 'flashcards'] }, () => 0, READY_LEVELS));
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

  it('keeps one concept from running more than two steps in a row while another needs work (brief section 3)', () => {
    const p = diagnosed(emptyProgress());
    const step = stepOf(nextStep(shape, p, items, { usedIds: [], recentTechniques: [], recentConcepts: ['sample-a', 'sample-a'] }, () => 0));
    expect(step.concept).toBe('sample-b');
    // With only one concept left to work on it carries on rather than stalling.
    const alone = stepOf(nextStep(shape, shownOn(p, ['remember', 'understand', 'apply'], ['sample-b']), items, { usedIds: [], recentTechniques: [], recentConcepts: ['sample-a', 'sample-a'] }, () => 0));
    expect(alone.concept).toBe('sample-a');
  });

  it('says "next level up" when a concept moves on, and stops when everything is shown', () => {
    let p = diagnosed(shownOn(emptyProgress(), ['remember']));
    expect(stepOf(nextStep(shape, p, items, noHistory, () => 0, READY_LEVELS)).reason).toBe('next level up');
    p = shownOn(p, ['understand', 'apply']);
    expect(nextStep(shape, p, items, noHistory, () => 0)).toEqual({ kind: 'done' });
    // Going deeper has its own list of levels.
    expect(stepOf(nextStep(shape, p, items, noHistory, () => 0, ['analyze', 'evaluate'])).level).toBe('analyze');
  });

  it('skips a concept with no content at its level instead of stalling', () => {
    const p = diagnosed(emptyProgress());
    const onlyB = items.filter((item) => item.concept === 'sample-b');
    expect(stepOf(nextStep(shape, p, onlyB, noHistory, () => 0.99)).concept).toBe('sample-b');
    expect(nextStep(shape, p, [], noHistory, () => 0)).toEqual({ kind: 'no content', concepts: ['sample-a', 'sample-b'] });
  });

  it('a module whose only item was just shown reports "no content", never "done"', () => {
    const one: ModuleShape = { concepts: ['sample-a'], practiceTechniques: [] };
    const only: ModuleItem[] = [{ id: 'only', concept: 'sample-a', level: 'remember', technique: 'flashcards' }];
    const p = answer(diagnosed(emptyProgress()), 'sample-a', 'remember', [true]);
    expect(stageOf(one, p)).toBe('adaptive');
    expect(nextStep(one, p, only, { usedIds: ['only'], recentTechniques: ['flashcards'] }, () => 0, READY_LEVELS)).toEqual({ kind: 'no content', concepts: ['sample-a'] });
    // The same item is offered again once something else has been shown in between.
    expect(stepOf(nextStep(one, p, only, { usedIds: ['only', 'other'], recentTechniques: [] }, () => 0, READY_LEVELS)).id).toBe('only');
  });

  it('a module with no concepts is "no content", never "done"', () => {
    const empty: ModuleShape = { concepts: [], practiceTechniques: [] };
    expect(nextStep(empty, diagnosed(emptyProgress()), [], noHistory, () => 0)).toEqual({ kind: 'no content', concepts: [] });
  });

  it('changes technique after two in a row even when unused items remain in the tired one', () => {
    const p = diagnosed(emptyProgress());
    const pool = items.filter((item) => item.concept === 'sample-a' && item.level === 'remember');
    const matching = pool.filter((item) => item.technique === 'matching').map((item) => item.id);
    const labelIt = pool.filter((item) => item.technique === 'label it').map((item) => item.id);
    const flash = pool.find((item) => item.technique === 'flashcards')!.id;
    // Every non-flashcard item was used earlier; one unused flashcard remains; flashcards just ran twice.
    const step = stepOf(nextStep(shape, p, pool, { usedIds: [...matching, ...labelIt, flash, 'x'], recentTechniques: ['flashcards', 'flashcards'] }, () => 0, READY_LEVELS));
    expect(step.technique).not.toBe('flashcards');
  });
});

describe('module path: summaries count evidence and never score', () => {
  it('summarises a module per thinking level and lists what to strengthen', () => {
    const p = shownOn(emptyProgress(), ['remember', 'understand', 'apply'], ['sample-a']);
    const summary = summarize(shape, answer(p, 'sample-b', 'remember', [true]));
    expect(summary.levels.remember).toEqual({ 'not started': 0, gap: 0, developing: 1, sufficient: 0, strong: 1 });
    expect(summary.levels.evaluate).toEqual({ 'not started': 2, gap: 0, developing: 0, sufficient: 0, strong: 0 });
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
    expect(JSON.stringify(course)).not.toMatch(/score|percent|pass|probab|chance/i);
  });
});

describe('module path: evidence weight by technique (brief defaults)', () => {
  it('uses the brief weights: flips and matching 0.5, label it and fill in 0.75, learning questions 1.0', () => {
    expect(EVIDENCE_WEIGHT).toMatchObject({ flashcards: 0.5, matching: 0.5, 'label it': 0.75, 'fill in the blank': 0.75, 'learning questions': 1 });
    expect(SOURCE_WEIGHT).toEqual({ diagnostic: 1, 'practice exam': 1.25 });
  });

  it('recognition shows less than production, and a worked case shows most', () => {
    expect(EVIDENCE_WEIGHT.matching).toBeLessThan(EVIDENCE_WEIGHT['fill in the blank']);
    expect(EVIDENCE_WEIGHT.flashcards).toBeLessThan(EVIDENCE_WEIGHT['label it']);
    expect(EVIDENCE_WEIGHT['case questions']).toBeGreaterThan(EVIDENCE_WEIGHT['learning questions']);
  });

  it('flashcard flips need many more answers than learning questions', () => {
    const needed = (technique: Technique) => {
      let p = emptyProgress();
      for (let i = 1; i <= 20; i++) {
        p = answer(p, 'sample-a', 'remember', [true], { technique });
        if (isShown(statusOf(p, 'remember'))) return i;
      }
      return Infinity;
    };
    expect(needed('learning questions')).toBe(6);
    expect(needed('flashcards')).toBeGreaterThan(needed('label it'));
    expect(needed('label it')).toBeGreaterThan(needed('learning questions'));
    expect(needed('case questions')).toBeLessThan(needed('learning questions'));
  });

  it('diagnostic and practice exam items show more than practice', () => {
    expect(evidenceWeight(true, { technique: 'flashcards', source: 'practice exam' })).toBe(1.25);
    expect(evidenceWeight(true, { technique: 'flashcards', source: 'diagnostic' })).toBe(1);
  });

  it('one lucky answer never makes a level shown, even a worked case', () => {
    for (const technique of ['flashcards', 'case questions', 'matching'] as const) {
      expect(isShown(statusOf(answer(emptyProgress(), 'sample-a', 'apply', [true], { technique }), 'apply'))).toBe(false);
    }
  });

  it('the last two answers must still be right, whatever the technique', () => {
    const p = answer(emptyProgress(), 'sample-a', 'apply', [...runOf(9), false], { technique: 'case questions' });
    expect(isShown(statusOf(p, 'apply'))).toBe(false);
  });

  it('answers without a technique count as one ordinary answer', () => {
    expect(evidenceWeight(true)).toBe(1);
    expect(evidenceWeight(false, { technique: 'matching' })).toBe(EVIDENCE_WEIGHT.matching);
  });

  it('weights that are fractions still add up: eighteen two-option matching answers are enough', () => {
    const p = answer(emptyProgress(), 'sample-a', 'remember', runOf(18), { technique: 'matching', options: 2 });
    expect(posterior(p.concepts.get('sample-a')!.remember).directWeight).toBeCloseTo(6, 9);
    expect(isShown(statusOf(p, 'remember'))).toBe(true);
  });
});

describe('module path: cues, timeouts and repeated items (what counts as independent evidence)', () => {
  it('a cue halves the credit of a right answer, and never softens a miss', () => {
    expect(evidenceWeight(true, { technique: 'learning questions', cued: true })).toBe(0.5);
    expect(evidenceWeight(false, { technique: 'learning questions', cued: true })).toBe(1);
  });

  it('a timeout is a miss, whatever was answered', () => {
    const p = answer(emptyProgress(), 'sample-a', 'remember', [true], { timedOut: true });
    const level = p.concepts.get('sample-a')!.remember!;
    expect(level.wrong).toBe(1);
    expect(level.recent[0]).toMatchObject({ correct: false, timedOut: true });
    expect(statusOf(p, 'remember')).toBe('gap');
  });

  it('answering the same flashcard correctly again adds nothing, however often (finding: two self-ratings of one card)', () => {
    let p = emptyProgress();
    for (let i = 0; i < 30; i++) p = recordModuleAnswer(p, 'sample-a', 'remember', true, { technique: 'flashcards', itemId: 'sample-card-1' });
    const level = p.concepts.get('sample-a')!.remember!;
    expect(level.recent).toHaveLength(1);
    expect(posterior(level).directWeight).toBe(0.5);
    expect(statusOf(p, 'remember')).toBe('developing');
  });

  it('two correct self-ratings of the same card never make a level shown', () => {
    const p = answer(emptyProgress(), 'sample-a', 'remember', [true, true], { technique: 'flashcards', itemId: 'sample-card-2' });
    expect(isShown(statusOf(p, 'remember'))).toBe(false);
  });

  it('needs a first-try success on an item not seen before: cued rights alone are not enough', () => {
    const cued = answer(emptyProgress(), 'sample-a', 'remember', runOf(20), { cued: true });
    expect(posterior(cued.concepts.get('sample-a')!.remember).hasFresh).toBe(false);
    expect(isShown(statusOf(cued, 'remember'))).toBe(false);
    // One fresh first-try right answer on top is what opens the gate; the lower bound is then already met.
    expect(isShown(statusOf(answer(cued, 'sample-a', 'remember', [true]), 'remember'))).toBe(true);
  });

  it('needs at least 3 weighted direct evidence, even when the lower bound is met', () => {
    // Four heavy answers give a lower bound under 0.70, so use the posterior to show the gate separately.
    const p = answer(emptyProgress(), 'sample-a', 'remember', runOf(2), { technique: 'case questions' });
    expect(posterior(p.concepts.get('sample-a')!.remember).directWeight).toBe(2.5);
    expect(isShown(statusOf(p, 'remember'))).toBe(false);
  });

  it('records item, fresh, format, cue and timeout provenance on every answer', () => {
    const p = answer(emptyProgress(), 'sample-a', 'remember', [true], { technique: 'matching', cued: true, itemId: 'sample-card-3' });
    expect(p.concepts.get('sample-a')!.remember!.recent[0]).toMatchObject({ technique: 'matching', cued: true, fresh: false, repeat: false, timedOut: false, direct: true });
    expect(p.concepts.get('sample-a')!.remember!.seen).toEqual(['sample-card-3']);
  });
});

describe('module path: transferred credit (brief section 2)', () => {
  it('a right answer at a higher level gives each lower level half its weight, kept apart from direct evidence', () => {
    const p = answer(emptyProgress(), 'sample-a', 'apply', [true]);
    const lower = p.concepts.get('sample-a')!.understand!;
    expect(lower.recent[0]).toMatchObject({ direct: false, weight: 0.5, correct: true });
    expect(p.concepts.get('sample-a')!.remember!.recent[0]).toMatchObject({ direct: false, weight: 0.5 });
    expect(p.concepts.get('sample-a')!.evaluate).toBeUndefined();
    expect(posterior(lower).directWeight).toBe(0);
    expect(lower.right + lower.wrong).toBe(0);
  });

  it('transferred credit alone can never make a lower level sufficient, so it can never unlock the practice exam', () => {
    let p = answer(emptyProgress(), 'sample-a', 'apply', runOf(30));
    expect(isShown(statusOf(p, 'apply'))).toBe(true);
    expect(isShown(statusOf(p, 'remember'))).toBe(false);
    expect(isShown(statusOf(p, 'understand'))).toBe(false);
    p = { ...shownOn(p, ['remember', 'understand', 'apply'], ['sample-b']), watched: true, read: true, diagnosed: true };
    expect(stageOf(shape, p)).toBe('adaptive');
  });

  it('a miss gives the lower levels nothing', () => {
    const p = answer(emptyProgress(), 'sample-a', 'apply', [false]);
    expect(p.concepts.get('sample-a')!.understand).toBeUndefined();
    expect(p.concepts.get('sample-a')!.remember).toBeUndefined();
  });

  it('transferred credit helps once direct evidence exists, but the direct gates still decide', () => {
    const direct = answer(emptyProgress(), 'sample-a', 'remember', runOf(5));
    const withTransfer = answer(direct, 'sample-a', 'apply', runOf(4));
    expect(statusOf(direct, 'remember')).toBe('developing');
    expect(isShown(statusOf(withTransfer, 'remember'))).toBe(true);
  });

  it('a repeated item gives no transfer', () => {
    let p = recordModuleAnswer(emptyProgress(), 'sample-a', 'apply', true, { itemId: 'sample-card-4' });
    p = recordModuleAnswer(p, 'sample-a', 'apply', true, { itemId: 'sample-card-4' });
    expect(p.concepts.get('sample-a')!.remember!.recent).toHaveLength(1);
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
      for (let i = 1; i <= 20; i++) {
        p = answer(p, 'sample-a', 'understand', [true], { technique, options });
        if (isShown(statusOf(p, 'understand'))) return i;
      }
      return Infinity;
    };
    expect(n(2)).toBeGreaterThan(n(4));
  });
});

describe('module path: slips', () => {
  it('one miss after a strong run drops the level below sufficient', () => {
    const p = answer(emptyProgress(), 'sample-a', 'remember', [...runOf(8), false]);
    expect(isShown(statusOf(p, 'remember'))).toBe(false);
  });

  it('a slip counts as half a miss, a miss early on counts in full', () => {
    const slip = posterior(answer(emptyProgress(), 'sample-a', 'remember', [...runOf(4), false]).concepts.get('sample-a')!.remember);
    const early = posterior(answer(emptyProgress(), 'sample-a', 'remember', [true, false, true, true, true]).concepts.get('sample-a')!.remember);
    expect(slip.beta).toBe(1.5);
    expect(early.beta).toBe(2);
  });

  it('recovery after a slip needs fewer answers than after a real run of misses', () => {
    const recoveryAnswers = (history: boolean[]) => {
      let p = answer(emptyProgress(), 'sample-a', 'remember', history);
      for (let i = 1; i <= 30; i++) {
        p = answer(p, 'sample-a', 'remember', [true]);
        if (isShown(statusOf(p, 'remember'))) return i;
      }
      return Infinity;
    };
    const afterSlip = recoveryAnswers([...runOf(8), false]);
    const afterMisses = recoveryAnswers([true, true, false, false, false, false]);
    expect(afterSlip).toBeLessThan(afterMisses);
    expect(afterSlip).toBeLessThanOrEqual(3);
  });

  it('two misses in a row are not slips, and a timeout can be a slip', () => {
    const p = answer(emptyProgress(), 'sample-a', 'remember', [...runOf(4), false, false]);
    expect(p.concepts.get('sample-a')!.remember!.recent.map((a) => a.slip)).toEqual([false, false, false, false, true, false]);
    const t = recordModuleAnswer(answer(emptyProgress(), 'sample-a', 'remember', runOf(4)), 'sample-a', 'remember', true, { timedOut: true, itemId: fresh() });
    expect(t.concepts.get('sample-a')!.remember!.recent.at(-1)!.slip).toBe(true);
  });
});

describe('module path: retention uses the card memory (memory.ts) at the supplied clock', () => {
  const day0 = (n: number): AnswerDetail => ({ clock: clockOn(0, 12 + n * 0.01), technique: 'learning questions' });
  /** Six right answers on six items on day 0: sufficient on evidence. */
  const sufficientOnDay0 = () => {
    let p = emptyProgress();
    for (let i = 0; i < SUFFICIENT_RUN; i++) p = recordModuleAnswer(p, 'sample-a', 'remember', true, { ...day0(i), itemId: `sample-card-${i}` });
    return p;
  };

  it('is sufficient on the day, then drops one status once predicted recall falls under 80%', () => {
    const p = sufficientOnDay0();
    const level = p.concepts.get('sample-a')!.remember;
    expect(levelAssessment(level, clockOn(0, 20))).toMatchObject({ earned: 'sufficient', status: 'sufficient', due: false });
    // A card answered once has a 3-day half-life: after two days recall is about 63%, under the 80% line.
    expect(levelAssessment(level, clockOn(2))).toMatchObject({ earned: 'sufficient', status: 'developing', due: true });
    expect(statusOf(p, 'remember')).toBe('sufficient'); // no clock, no decay
  });

  it('material that is reviewed on a spacing lasts longer than material that is not', () => {
    // Two spaced right answers per card double the half-life, so three days on recall is still above 80%.
    let reviewed = emptyProgress();
    let single = emptyProgress();
    for (let i = 0; i < SUFFICIENT_RUN; i++) {
      single = recordModuleAnswer(single, 'sample-a', 'remember', true, { clock: clockOn(1), itemId: `sample-card-${i}` });
      reviewed = recordModuleAnswer(reviewed, 'sample-a', 'remember', true, { clock: clockOn(0), itemId: `sample-card-${i}` });
    }
    for (let i = 0; i < SUFFICIENT_RUN; i++) {
      reviewed = recordModuleAnswer(reviewed, 'sample-a', 'remember', true, { clock: clockOn(1), itemId: `sample-card-${i}` });
      reviewed = recordModuleAnswer(reviewed, 'sample-a', 'remember', true, { clock: clockOn(3), itemId: `sample-card-${i}` });
    }
    const soon = clockOn(4);
    expect(levelAssessment(single.concepts.get('sample-a')!.remember, soon).due).toBe(true);
    expect(levelAssessment(reviewed.concepts.get('sample-a')!.remember, soon).due).toBe(false);
  });

  it('every status drops by exactly one step and a gap stays a gap', () => {
    const p = sufficientOnDay0();
    const strong = answer(p, 'sample-a', 'remember', runOf(10), { clock: clockOn(0, 13) });
    const sample = strong.concepts.get('sample-a')!.remember;
    expect(levelAssessment(sample, clockOn(0, 14)).status).toBe('strong');
    expect(levelAssessment(sample, clockOn(5)).status).toBe('sufficient');
    const missed = recordModuleAnswer(emptyProgress(), 'sample-a', 'remember', false, { clock: clockOn(0), itemId: 'sample-card-9' });
    expect(levelAssessment(missed.concepts.get('sample-a')!.remember, clockOn(9)).status).toBe('gap');
  });

  it('a right answer when reviewing refreshes the card, a miss lowers the level', () => {
    const p = sufficientOnDay0();
    const later = clockOn(6);
    let refreshed = p;
    for (let i = 0; i < SUFFICIENT_RUN; i++) refreshed = recordModuleAnswer(refreshed, 'sample-a', 'remember', true, { clock: later, itemId: `sample-card-${i}`, technique: 'learning questions' });
    expect(levelAssessment(refreshed.concepts.get('sample-a')!.remember, later)).toMatchObject({ status: 'sufficient', due: false });
    const missed = recordModuleAnswer(p, 'sample-a', 'remember', false, { clock: later, itemId: 'sample-card-0', technique: 'learning questions' });
    expect(levelAssessment(missed.concepts.get('sample-a')!.remember, later).due).toBe(true);
  });

  it('answers without an item id are history only: they count for nothing and have no cards to fade', () => {
    let p = emptyProgress();
    for (let i = 0; i < 20; i++) p = recordModuleAnswer(p, 'sample-a', 'remember', true, { clock: clockOn(0), technique: 'learning questions' });
    const level = p.concepts.get('sample-a')!.remember!;
    expect(level.right).toBe(20);
    expect(Object.keys(level.cards)).toHaveLength(0);
    expect(posterior(level)).toMatchObject({ alpha: 1, beta: 1, directWeight: 0, hasFresh: false });
    expect(levelAssessment(level, clockOn(400))).toMatchObject({ status: 'developing', due: false, overdue: 0 });
    expect(p.concepts.get('sample-a')!.understand).toBeUndefined(); // and they give no transfer
  });

  it('a level that has faded takes the student out of ready and into adaptive practice', () => {
    let p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    for (const concept of shape.concepts) {
      for (const level of THINKING_LEVELS.slice(0, 3)) {
        for (let i = 0; i < 8; i++) p = recordModuleAnswer(p, concept, level, true, { clock: clockOn(0, 12 + i * 0.01), itemId: `${concept}-${level}-${i}`, technique: 'learning questions' });
      }
    }
    expect(stageOf(shape, p, clockOn(0, 20))).toBe('ready');
    expect(stageOf(shape, p, clockOn(10))).toBe('adaptive');
    expect(summarize(shape, p, clockOn(10)).toStrengthen).toEqual(['sample-a', 'sample-b']);
    expect(summarize(shape, p, clockOn(10)).levels.apply.developing).toBe(2);
  });

  it('review that is due comes ahead of new material, uses an item already answered, and says so', () => {
    let p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    const seen = items.filter((item) => item.concept === 'sample-b' && item.level === 'remember');
    for (const item of seen.slice(0, 2)) for (let r = 0; r < 4; r++) p = recordModuleAnswer(p, 'sample-b', 'remember', true, { clock: clockOn(0, 12 + r * 0.01), itemId: `${item.id}-${r}` });
    for (const item of seen.slice(0, 2)) p = recordModuleAnswer(p, 'sample-b', 'remember', true, { clock: clockOn(0, 13), itemId: item.id, technique: item.technique });
    const history = { usedIds: [], recentTechniques: [] };
    const early = nextStep(shape, p, items, history, () => 0, READY_LEVELS, clockOn(0, 14));
    expect(early).toMatchObject({ kind: 'step', concept: 'sample-a', reason: 'not practised yet' });
    const later = nextStep(shape, p, items, history, () => 0, READY_LEVELS, clockOn(9));
    expect(later).toMatchObject({ kind: 'step', concept: 'sample-b', level: 'remember', reason: 'due for review' });
    if (later.kind === 'step') expect(seen.slice(0, 2).map((item) => item.id)).toContain(later.id);
  });

  it('is never "done" while something has faded, and is done again once reviewed', () => {
    let p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    const ask = (clock: StudyClock, tag: string) => {
      for (const concept of shape.concepts) for (const level of THINKING_LEVELS.slice(0, 3)) {
        for (let i = 0; i < 8; i++) p = recordModuleAnswer(p, concept, level, true, { clock, itemId: `${concept}-${level}-${i}`, technique: 'learning questions' });
      }
      return tag;
    };
    ask(clockOn(0), 'first');
    const history = { usedIds: [], recentTechniques: [] };
    expect(nextStep(shape, p, items, history, () => 0, undefined, clockOn(0, 20))).toEqual({ kind: 'done' });
    expect(nextStep(shape, p, items, history, () => 0, undefined, clockOn(40)).kind).toBe('step');
    ask(clockOn(40), 'review');
    expect(nextStep(shape, p, items, history, () => 0, undefined, clockOn(40))).toEqual({ kind: 'done' });
  });

  it('records the day without changing the old progress', () => {
    const before = emptyProgress();
    const after = recordModuleAnswer(before, 'sample-a', 'remember', true, { clock: clockOn(3) });
    expect(after.concepts.get('sample-a')!.remember!.recent[0]!.day).toBe(FIRST_DAY + 3);
    expect(before.concepts.size).toBe(0);
  });
});

describe('module path: D-36, status words and counts only', () => {
  it('summaries expose no score, percentage, probability or prediction', () => {
    const p = shownOn(emptyProgress(), ['remember', 'understand'], ['sample-a']);
    const text = JSON.stringify(summarize(shape, p, clockOn(1)));
    expect(text).not.toMatch(/score|percent|probab|predict|chance|bound|alpha|beta/i);
  });
});

describe('module path: review findings (A to E)', () => {
  const answerWith = (p: ModuleProgress, concept: string, level: ThinkingLevel, ok: boolean, itemId: string, offset: number, extra: AnswerDetail = {}) =>
    recordModuleAnswer(p, concept, level, ok, { technique: 'learning questions', itemId, clock: clockOn(offset), ...extra });
  const distinct = (p: ModuleProgress, concept: string, level: ThinkingLevel, n: number, offset: number, prefix: string, extra: AnswerDetail = {}) => {
    let next = p;
    for (let i = 0; i < n; i++) next = answerWith(next, concept, level, true, `${prefix}-${i}`, offset, extra);
    return next;
  };

  it('A: a failed or timed-out review cannot restore a faded level, only a later success can', () => {
    const p = distinct(emptyProgress(), 'sample-a', 'apply', 6, 0, 'sample-diag', { source: 'diagnostic' });
    expect(levelAssessment(p.concepts.get('sample-a')!.apply, clockOn(1)).status).toBe('sufficient'); // grace: not overdue yet
    expect(levelAssessment(p.concepts.get('sample-a')!.apply, clockOn(3))).toMatchObject({ status: 'developing', due: true });
    const evidenceBefore = p.concepts.get('sample-a')!.apply!;
    for (const failed of [{ timedOut: true }, {}] as AnswerDetail[]) {
      let q = p;
      for (let i = 0; i < 6; i++) q = answerWith(q, 'sample-a', 'apply', failed.timedOut ? true : false, `sample-diag-${i}`, 3, failed);
      const level = q.concepts.get('sample-a')!.apply!;
      // The evidence did not change (repeats are not independent) and no card was refreshed.
      expect(posterior(level)).toEqual(posterior(evidenceBefore));
      for (const card of Object.values(level.cards)) expect(card).toMatchObject({ lastCorrect: false, lastDay: calendarDay(FIRST_DAY) });
      expect(levelAssessment(level, clockOn(3))).toMatchObject({ status: 'developing', due: true });
    }
    // One failed review among successes: the rest succeed, but every card must have succeeded for the level to clear.
    let mixed = answerWith(p, 'sample-a', 'apply', false, 'sample-diag-0', 3);
    for (let i = 1; i < 6; i++) mixed = answerWith(mixed, 'sample-a', 'apply', true, `sample-diag-${i}`, 3);
    expect(levelAssessment(mixed.concepts.get('sample-a')!.apply, clockOn(3)).due).toBe(false); // five refreshed, one failed: not all overdue
    let restored = p;
    for (let i = 0; i < 6; i++) restored = answerWith(restored, 'sample-a', 'apply', true, `sample-diag-${i}`, 3);
    expect(levelAssessment(restored.concepts.get('sample-a')!.apply, clockOn(3))).toMatchObject({ status: 'sufficient', due: false });
  });

  it('B: the same correct event many times without an item id is never first-try evidence', () => {
    let p = emptyProgress();
    for (let i = 0; i < 6; i++) p = recordModuleAnswer(p, 'sample-a', 'remember', true, { technique: 'learning questions' });
    const level = p.concepts.get('sample-a')!.remember!;
    expect(posterior(level)).toMatchObject({ hasFresh: false, alpha: 1 });
    expect(isShown(levelStatus(level))).toBe(false);
    // Beside it, the identified repeat adds nothing at all.
    let q = emptyProgress();
    for (let i = 0; i < 6; i++) q = recordModuleAnswer(q, 'sample-a', 'remember', true, { technique: 'learning questions', itemId: 'sample-card-same' });
    expect(posterior(q.concepts.get('sample-a')!.remember)).toMatchObject({ hasFresh: true, alpha: 2 });
    expect(isShown(levelStatus(q.concepts.get('sample-a')!.remember))).toBe(false);
    // Unidentified history cannot be topped up into the gate by one identified answer (finding 4).
    expect(isShown(levelStatus(answer(p, 'sample-a', 'remember', [true]).concepts.get('sample-a')!.remember))).toBe(false);
  });

  it('C: the exam gate is understand and apply; remember stays available for practice', () => {
    const one: ModuleShape = { concepts: ['sample-a'], practiceTechniques: [] };
    let p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    p = answer(p, 'sample-a', 'understand', runOf(15));
    p = answer(p, 'sample-a', 'apply', runOf(15));
    expect(statusOf(p, 'apply')).toBe('strong');
    expect(isShown(statusOf(p, 'remember'))).toBe(false); // transferred credit only
    expect(GATE_LEVELS).toEqual(['understand', 'apply']);
    expect(stageOf(one, p)).toBe('ready');
    expect(nextStep(one, p, items, { usedIds: [], recentTechniques: [] }, () => 0)).toEqual({ kind: 'done' });
    // Remember is still practised when asked for, and still not needed for the gate.
    const practice = nextStep(one, p, items, { usedIds: [], recentTechniques: [] }, () => 0, PRACTICE_LEVELS);
    expect(practice).toMatchObject({ kind: 'step', level: 'remember' });
    expect(summarize(one, p).toStrengthen).toEqual([]);
    // Understand alone is not enough.
    expect(stageOf(one, { ...emptyProgress(), watched: true, read: true, diagnosed: true, concepts: new Map([['sample-a', { understand: p.concepts.get('sample-a')!.understand! }]]) })).toBe('adaptive');
  });

  it('D: a level that fades from strong to sufficient is still offered for review, while staying ready', () => {
    const one: ModuleShape = { concepts: ['sample-a'], practiceTechniques: [] };
    const applyItems: ModuleItem[] = Array.from({ length: 12 }, (_, n) => ({ id: `sample-apply-${n}`, concept: 'sample-a', level: 'apply' as const, technique: 'learning questions' as const }));
    let p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    p = distinct(p, 'sample-a', 'understand', 10, 0, 'sample-understand');
    p = distinct(p, 'sample-a', 'apply', 10, 0, 'sample-apply');
    expect(levelStatus(p.concepts.get('sample-a')!.apply)).toBe('strong');
    const day = clockOn(4);
    expect(levelAssessment(p.concepts.get('sample-a')!.apply, day)).toMatchObject({ earned: 'strong', status: 'sufficient', due: true });
    // Practice-test eligibility is untouched by the fade...
    expect(isShown(levelStatus(p.concepts.get('sample-a')!.apply, day))).toBe(true);
    // ...while the review has its own priority, even with an empty session.
    const step = nextStep(one, p, applyItems, { usedIds: [], recentTechniques: [] }, () => 0, ['apply'], day);
    expect(step).toMatchObject({ kind: 'step', level: 'apply', reason: 'due for review' });
    expect(nextStep(one, p, applyItems, { usedIds: [], recentTechniques: [] }, () => 0, ['apply'], clockOn(1))).toEqual({ kind: 'done' });
  });

  it('E: a clock that moves backward is ignored for retention and never aborts the call', () => {
    const nov28 = { day: '2026-11-28', now: Date.parse('2026-11-28T12:00:00Z') };
    const nov27 = { day: '2026-11-27', now: Date.parse('2026-11-27T12:00:00Z') };
    let p = recordModuleAnswer(emptyProgress(), 'sample-a', 'remember', true, { itemId: 'sample-card-clock', clock: nov28, technique: 'flashcards' });
    const before = p.concepts.get('sample-a')!.remember!.cards['sample-card-clock']!;
    expect(() => { p = recordModuleAnswer(p, 'sample-a', 'remember', true, { itemId: 'sample-card-clock', clock: nov27, technique: 'flashcards' }); }).not.toThrow();
    const level = p.concepts.get('sample-a')!.remember!;
    expect(level.cards['sample-card-clock']).toEqual(before); // the later event stands
    expect(level.right).toBe(2); // the answer itself is still counted
    // A different item answered with the stale clock still gets a record, and its day is clamped to the newest seen.
    p = recordModuleAnswer(p, 'sample-a', 'remember', true, { itemId: 'sample-card-other', clock: nov27, technique: 'flashcards' });
    const recent = p.concepts.get('sample-a')!.remember!.recent;
    expect(recent.at(-1)!.day).toBe(dayNumber('2026-11-28'));
    expect(recent).toHaveLength(2);
  });

  it('retention is judged on the scheduler: a level studied yesterday is not revoked today', () => {
    const p = distinct(emptyProgress(), 'sample-a', 'apply', 6, 0, 'sample-card');
    const memory = p.concepts.get('sample-a')!.apply!.cards['sample-card-0']!;
    expect(cardOverdue(memory, clockOn(1))).toBe(false); // recall about 79%, but not yet overdue
    expect(cardOverdue(memory, clockOn(2))).toBe(true);
  });
});

describe('module path: the diagnostic fast track (documented departure, opt-in, default off)', () => {
  const fast: ModuleShape = { ...shape, diagnosticFastTrack: true };
  const diagnostic = (p: ModuleProgress, concept: string, level: ThinkingLevel, ok: boolean) =>
    recordModuleAnswer(p, concept, level, ok, { technique: 'learning questions', itemId: fresh(), source: 'diagnostic', clock: clockOn(0) });
  const perfect = () => {
    let p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, practised: ['flashcards', 'matching'], diagnosed: true };
    for (const concept of shape.concepts) for (const level of GATE_LEVELS) p = diagnostic(p, concept, level, true);
    return p;
  };
  const history = { usedIds: [], recentTechniques: [] };

  it('is off by default: a perfect diagnostic does not change the ordinary recommendation (finding 1)', () => {
    const one: ModuleShape = { concepts: ['sample-a'], practiceTechniques: [] };
    let p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    p = diagnostic(p, 'sample-a', 'understand', true);
    p = diagnostic(p, 'sample-a', 'apply', true);
    expect(statusOf(p, 'understand')).toBe('developing');
    expect(statusOf(p, 'apply')).toBe('developing');
    expect(stageOf(one, p, clockOn(0))).toBe('adaptive');
    expect(nextStep(one, p, items, history, () => 0, undefined, clockOn(0)).kind).toBe('step');
    expect(diagnosticFastTrack(one, p, clockOn(0))).toBe(false);
  });

  it('with the option on, a perfect diagnostic skips adaptive practice while every status word stays honest', () => {
    const p = perfect();
    expect(diagnosticFastTrack(fast, p, clockOn(0))).toBe(true);
    expect(stageOf(fast, p, clockOn(0))).toBe('ready');
    expect(nextStep(fast, p, items, history, () => 0, undefined, clockOn(0))).toEqual({ kind: 'done' });
    expect(statusOf(p, 'apply', clockOn(0))).toBe('developing');
    expect(stageOf(shape, p, clockOn(0))).toBe('adaptive'); // the same progress without the option
  });

  it('equal level lists give the same result: policy never depends on array identity (finding 5)', () => {
    const p = perfect();
    const same = nextStep(fast, p, items, history, () => 0, ['understand', 'apply'], clockOn(0));
    expect(same).toEqual(nextStep(fast, p, items, history, () => 0, GATE_LEVELS, clockOn(0)));
    expect(same).toEqual({ kind: 'done' });
    expect(nextStep(fast, p, items, history, () => 0, ['apply', 'understand'], clockOn(0))).toEqual({ kind: 'done' });
    const off = nextStep(shape, p, items, history, () => 0, ['understand', 'apply'], clockOn(0));
    expect(off).toEqual(nextStep(shape, p, items, history, () => 0, GATE_LEVELS, clockOn(0)));
    expect(off.kind).toBe('step');
  });

  it('one miss, a missing tier, a lapse of two days or a missing diagnosis puts the student back on adaptive practice', () => {
    const missed = diagnostic(perfect(), 'sample-a', 'apply', false);
    expect(diagnosticFastTrack(fast, missed, clockOn(0))).toBe(false);
    expect(stageOf(fast, missed, clockOn(0))).toBe('adaptive');
    let partial: ModuleProgress = { ...emptyProgress(), diagnosed: true };
    for (const concept of shape.concepts) partial = diagnostic(partial, concept, 'understand', true);
    expect(diagnosticFastTrack(fast, partial, clockOn(0))).toBe(false);
    expect(diagnosticFastTrack(fast, perfect(), clockOn(5))).toBe(false); // everything is overdue
    expect(diagnosticFastTrack(fast, { ...perfect(), diagnosed: false }, clockOn(0))).toBe(false);
    expect(diagnosticFastTrack({ concepts: [], practiceTechniques: [], diagnosticFastTrack: true }, perfect(), clockOn(0))).toBe(false);
  });
});

describe('module path: second review round', () => {
  const at = (p: ModuleProgress, ok: boolean, id: string, offset: number, concept = 'sample-a', level: ThinkingLevel = 'apply') =>
    recordModuleAnswer(p, concept, level, ok, { technique: 'learning questions', itemId: id, clock: clockOn(offset) });
  const six = () => { let p = emptyProgress(); for (let i = 0; i < 6; i++) p = at(p, true, `sample-card-${i}`, 0); return p; };
  const one: ModuleShape = { concepts: ['sample-a'], practiceTechniques: [] };
  const applyItems: ModuleItem[] = Array.from({ length: 12 }, (_, n) => ({ id: `sample-card-${n}`, concept: 'sample-a', level: 'apply' as const, technique: 'learning questions' as const }));

  it('2: one successful review cannot hide five failed ones: they are still offered for review', () => {
    let p = six();
    for (let i = 0; i < 5; i++) p = at(p, false, `sample-card-${i}`, 3);
    p = at(p, true, 'sample-card-5', 3);
    const level = p.concepts.get('sample-a')!.apply!;
    expect(levelAssessment(level, clockOn(3))).toMatchObject({ status: 'sufficient', due: false, overdue: 5 }); // tier policy unchanged
    expect(overdueCardsOf(level)).toHaveLength(5);
    p = shownOn(p, ['understand'], ['sample-a']); // understand is shown, so only the apply cards are left to review
    const withOther = { ...p, diagnosed: true };
    const wide: ModuleShape = { concepts: ['sample-a', 'sample-b'], practiceTechniques: [] };
    const step = nextStep(wide, withOther, applyItems, { usedIds: [], recentTechniques: [] }, () => 0, undefined, clockOn(3)); // sample-b still needs work but has no item to offer
    expect(step).toMatchObject({ kind: 'step', concept: 'sample-a', level: 'apply', reason: 'due for review' });
    if (step.kind === 'step') expect(['sample-card-0', 'sample-card-1', 'sample-card-2', 'sample-card-3', 'sample-card-4']).toContain(step.id);
    // New material still comes first when there is some; with nothing else to do they come back on "done" as optional review.
    const both = nextStep(wide, withOther, [...applyItems, { id: 'sample-b-1', concept: 'sample-b', level: 'understand', technique: 'matching' }], { usedIds: [], recentTechniques: [] }, () => 0, undefined, clockOn(3));
    expect(both).toMatchObject({ kind: 'step', concept: 'sample-b', level: 'understand' });
    const finished = nextStep(one, { ...p, concepts: new Map([['sample-a', { understand: shownOn(emptyProgress(), ['understand'], ['sample-a']).concepts.get('sample-a')!.understand!, apply: level }]]) }, [], { usedIds: [], recentTechniques: [] }, () => 0, undefined, clockOn(3));
    expect(finished.kind).toBe('done');
    if (finished.kind === 'done') expect(finished.reviewDue?.[0]).toMatchObject({ concept: 'sample-a', level: 'apply' });
  });

  it('3 and 7: a late-arriving older success cannot undo a newer failure', () => {
    let p = six();
    p = at(p, false, 'sample-card-0', 3); // a failure on day 3
    expect(levelAssessment(p.concepts.get('sample-a')!.apply, clockOn(3)).due).toBe(true);
    p = at(p, true, 'sample-card-0', 2); // the delayed success stamped day 2
    expect(p.concepts.get('sample-a')!.apply!.cards['sample-card-0']).toMatchObject({ lastCorrect: false });
    expect(levelAssessment(p.concepts.get('sample-a')!.apply, clockOn(3))).toMatchObject({ status: 'developing', due: true });
    // The same with every card failed on day 5 and one success stamped day 4.
    let q = six();
    for (let i = 0; i < 6; i++) q = at(q, false, `sample-card-${i}`, 5);
    q = at(q, true, 'sample-card-0', 4);
    expect(levelAssessment(q.concepts.get('sample-a')!.apply, clockOn(5))).toMatchObject({ status: 'developing', due: true });
    // A genuinely newer success still restores the card.
    q = at(q, true, 'sample-card-0', 6);
    expect(q.concepts.get('sample-a')!.apply!.cards['sample-card-0']).toMatchObject({ lastCorrect: true });
  });

  it('4: unidentified replays cannot top up the gate, and identified evidence still counts', () => {
    let p = emptyProgress();
    for (let i = 0; i < 6; i++) p = recordModuleAnswer(p, 'sample-a', 'apply', true, { source: 'diagnostic', technique: 'learning questions', clock: clockOn(0) });
    p = at(p, true, 'sample-card-0', 0);
    const level = p.concepts.get('sample-a')!.apply!;
    expect(posterior(level)).toMatchObject({ alpha: 2, beta: 1 }); // only the identified answer counts
    expect(isShown(levelStatus(level))).toBe(false);
    expect(level.right).toBe(7); // the history is kept
    expect(isShown(levelStatus(distinctRun(6).concepts.get('sample-a')!.apply))).toBe(true);
  });

  it('8: exhausted evidence does not loop: no unseen item means "no content", naming the level', () => {
    const two: ModuleItem[] = [1, 2].map((n) => ({ id: `sample-lq-${n}`, concept: 'sample-a', level: 'apply', technique: 'learning questions' }));
    let p: ModuleProgress = { ...emptyProgress(), diagnosed: true };
    for (let i = 0; i < 30; i++) p = at(p, true, `sample-lq-${(i % 2) + 1}`, 0);
    expect(posterior(p.concepts.get('sample-a')!.apply).directWeight).toBe(2);
    const result = nextStep(one, p, two, { usedIds: [], recentTechniques: [] }, () => 0, ['apply']);
    expect(result).toEqual({ kind: 'no content', concepts: ['sample-a'], exhausted: [{ concept: 'sample-a', level: 'apply' }] });
    // An unseen item makes it a step again.
    expect(nextStep(one, p, [...two, { id: 'sample-lq-3', concept: 'sample-a', level: 'apply', technique: 'learning questions' }], { usedIds: [], recentTechniques: [] }, () => 0, ['apply'])).toMatchObject({ kind: 'step', id: 'sample-lq-3' });
    // An overdue review is still offered from the answered items.
    expect(nextStep(one, p, two, { usedIds: [], recentTechniques: [] }, () => 0, ['apply'], clockOn(6))).toMatchObject({ kind: 'step', reason: 'due for review' });
  });

  function distinctRun(n: number): ModuleProgress {
    let p = emptyProgress();
    for (let i = 0; i < n; i++) p = at(p, true, `sample-card-${i}`, 0);
    return p;
  }
  function overdueCardsOf(level: NonNullable<ReturnType<ModuleProgress['concepts']['get']>>['apply']): string[] {
    return Object.entries(level!.cards).filter(([, memory]) => cardOverdue(memory, clockOn(3))).map(([id]) => id);
  }
});

describe('module path: multi-day completion', () => {
  it('a deterministic student who answers right on several study days reaches done', () => {
    const one: ModuleShape = { concepts: ['sample-a', 'sample-b'], practiceTechniques: [] };
    const many: ModuleItem[] = one.concepts.flatMap((concept) => (['understand', 'apply'] as const).flatMap((level) =>
      TECHNIQUES_FOR_LEVEL[level].flatMap((technique) => Array.from({ length: 12 }, (_, n) => ({ id: `${concept}:${level}:${technique}:${n}`, concept, level, technique })))));
    let p: ModuleProgress = { ...emptyProgress(), watched: true, read: true, diagnosed: true };
    const history = { usedIds: [] as string[], recentTechniques: [] as Technique[], recentConcepts: [] as string[] };
    let doneOnDay: number | undefined;
    for (let day = 0; day < 12 && doneOnDay === undefined; day++) {
      for (let step = 0; step < 20; step++) {
        const today = clockOn(day, 9 + step * 0.1);
        const result = nextStep(one, p, many, history, () => 0, undefined, today);
        if (result.kind === 'done') { doneOnDay = day; break; }
        if (result.kind === 'no content') throw new Error('ran out of items');
        p = recordModuleAnswer(p, result.concept, result.level, true, { technique: result.technique, itemId: result.id, clock: today });
        history.usedIds.push(result.id); history.recentTechniques.push(result.technique); history.recentConcepts.push(result.concept);
      }
    }
    expect(doneOnDay).toBeDefined();
    expect(doneOnDay!).toBeGreaterThan(0); // it took more than one study day
    expect(stageOf(one, p, clockOn(doneOnDay!, 20))).toBe('ready');
  });
});
