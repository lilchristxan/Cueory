import { describe, expect, it } from 'vitest';
import { adaptiveDeckFor, migrateAdaptiveProgress } from '../../src/islands/adaptive-learning/progress';

const card = {
  lastAt: Date.parse('2028-02-29T12:00:00.000Z'),
  lastDay: '2028-02-29',
  lastCorrect: true,
  halfLifeDays: 4.8,
  spacedSuccesses: 1,
};
const concept = { right: 3, wrong: 1, lastCorrect: true, lastDay: card.lastDay };

describe('on-device adaptive progress', () => {
  it('starts pre-adaptive storage without inventing prior study and leaves future formats alone', () => {
    expect(migrateAdaptiveProgress(undefined)).toEqual({ version: 1, decks: {} });
    expect(migrateAdaptiveProgress({ version: 2, decks: { sample: {} } })).toBeUndefined();
  });

  it('loads only whitelisted evidence, drops malformed records, and invalidates a deck after revision', () => {
    const progress = migrateAdaptiveProgress({
      version: 1,
      decks: {
        demo: {
          revision: 'r1',
          cards: {
            a: { ...card, scratch: 'not part of progress' },
            invalid: { ...card, lastDay: '2027-02-29' },
            impossible: { ...card, lastCorrect: false },
            shallow: true,
          },
          concepts: { a: concept, bad: { ...concept, right: -1 } },
        },
      },
    })!;
    expect(adaptiveDeckFor(progress, 'demo', 'r1')).toEqual({
      revision: 'r1', cards: { a: card }, concepts: { a: concept },
    });
    expect(adaptiveDeckFor(progress, 'demo', 'r2')).toBeUndefined();
    expect(migrateAdaptiveProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
  });

  it('blocks prototype keys and bounds the per-deck payload', () => {
    const progress = migrateAdaptiveProgress({
      version: 1,
      decks: {
        demo: { revision: 'r1', cards: Object.fromEntries([
          ['__proto__', card], ['constructor', card],
          ...Array.from({ length: 650 }, (_, number) => [`card-${number}`, card] as const),
        ]) },
      },
    })!;
    const saved = adaptiveDeckFor(progress, 'demo', 'r1')!;
    expect(Object.hasOwn(saved.cards, '__proto__')).toBe(false);
    expect(Object.hasOwn(saved.cards, 'constructor')).toBe(false);
    expect(Object.keys(saved.cards)).toHaveLength(498);
  });

  it('keeps timestamps on either side of UTC midnight when they fit the recorded local day', () => {
    const saved = migrateAdaptiveProgress({
      version: 1,
      decks: {
        demo: {
          revision: 'r1',
          cards: {
            earliest: { ...card, lastAt: Date.parse('2028-02-28T10:00:00.000Z') },
            latest: { ...card, lastAt: Date.parse('2028-03-01T11:59:59.999Z') },
            early: { ...card, lastAt: Date.parse('2028-02-28T09:59:59.999Z') },
            late: { ...card, lastAt: Date.parse('2028-03-01T12:00:00.000Z') },
          },
        },
      },
    })!;
    expect(Object.keys(adaptiveDeckFor(saved, 'demo', 'r1')!.cards)).toEqual(['earliest', 'latest']);
  });

  it('bounds progress across many decks as well as within a single deck', () => {
    const deck = {
      revision: 'r1',
      cards: Object.fromEntries(Array.from({ length: 500 }, (_, n) => [`card-${n}`, card])),
      concepts: Object.fromEntries(Array.from({ length: 500 }, (_, n) => [`concept-${n}`, concept])),
    };
    const progress = migrateAdaptiveProgress({
      version: 1,
      decks: Object.fromEntries(Array.from({ length: 40 }, (_, n) => [`deck-${n}`, deck])),
    })!;
    const stored = Object.values(progress.decks);
    expect(stored).toHaveLength(5);
    expect(stored.flatMap(value => Object.keys(value.cards))).toHaveLength(2_500);
    expect(stored.flatMap(value => Object.keys(value.concepts))).toHaveLength(800);
  });
});
