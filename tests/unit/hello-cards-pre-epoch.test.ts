import { describe, expect, it } from 'vitest';
import { promptOfTheDay, type HelloStarter } from '../../src/islands/hello-cards';

const placeholders: readonly HelloStarter[] = [
  { id: 'placeholder-patients', category: 'patients', depth: 'small', text: 'placeholder patients?' },
  { id: 'placeholder-coworkers', category: 'coworkers', depth: 'small', text: 'placeholder coworkers?' },
  { id: 'placeholder-classmates', category: 'classmates', depth: 'small', text: 'placeholder classmates?' },
  { id: 'placeholder-yourself', category: 'yourself', depth: 'small', text: 'placeholder yourself?' },
];

describe('promptOfTheDay before its fixed epoch', () => {
  it('wraps a negative day to the preceding category and changes at local midnight', () => {
    const beforeMidnight = promptOfTheDay(placeholders, new Date(2026, 9, 31, 23, 59, 59));
    const atEpoch = promptOfTheDay(placeholders, new Date(2026, 10, 1, 0, 0, 0));

    expect(beforeMidnight?.id).toBe('placeholder-yourself');
    expect(atEpoch?.id).toBe('placeholder-patients');
    expect(beforeMidnight).not.toEqual(atEpoch);
  });
});
