import { describe, expect, it } from 'vitest';
import { cardContentProblems } from '../../src/content/card-validation';

describe('card content validation', () => {
  it('accepts distinct card identities', () => {
    expect(cardContentProblems([{ id: 'one' }, { id: 'two' }])).toEqual([]);
  });

  it('rejects repeated card identities', () => {
    expect(cardContentProblems([{ id: 'same' }, { id: 'same' }, { id: 'other' }, { id: 'same' }])).toEqual([
      'card id "same" is repeated',
      'card id "same" is repeated',
    ]);
  });
});
