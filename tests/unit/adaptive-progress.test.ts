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
});
