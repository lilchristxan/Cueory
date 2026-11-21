import { describe, expect, it } from 'vitest';
import {
  answerRecallChoice, answerRecallTyped, nextRecall, recallChoices, recallSettled, revealRecall, startRecall,
  type RecallCatalog,
} from '../../src/islands/anatomyrecall';

// Sample labels only: nothing here is anatomy.
function catalog(entries: Array<[id: string, name: string, group?: string]>): RecallCatalog {
  return {
    ids: entries.map(([id]) => id),
    names: new Map(entries.map(([id, name]) => [id, name])),
    groups: new Map(entries.map(([id, , group]) => [id, group])),
  };
}
const SAMPLE = catalog([
  ['S1', '[sample label] one', 'a'],
  ['S2', '[sample label] two', 'a'],
  ['S3', '[sample label] three', 'b'],
  ['S4', '[sample label] four', 'b'],
]);
const first = () => 0;

describe('name it: question flow edges', () => {
  it('ignores answers after "show me" until next', () => {
    const state = revealRecall(startRecall(['S1', 'S2'], SAMPLE, first));
    expect(recallSettled(state)).toBe(true);
    const other = state.choices.find((id) => id !== state.target)!;
    expect(answerRecallChoice(state, other, SAMPLE)).toBe(state);
    expect(answerRecallTyped(state, 'anything', SAMPLE)).toBe(state);
  });

  it('allows several wrong tries and then a right one, and a wrong try is not settled', () => {
    let state = startRecall(['S1'], SAMPLE, first);
    state = answerRecallTyped(state, 'nope', SAMPLE);
    expect(state.feedback).toEqual({ kind: 'wrong', how: 'typed', answer: 'nope' });
    expect(recallSettled(state)).toBe(false);
    const wrongPick = state.choices.find((id) => id !== state.target)!;
    state = answerRecallChoice(state, wrongPick, SAMPLE);
    expect(state.feedback).toMatchObject({ kind: 'wrong', how: 'picked' });
    state = answerRecallTyped(state, '[Sample Label] ONE', SAMPLE);
    expect(state.feedback).toEqual({ kind: 'right', how: 'typed' });
    expect(recallSettled(state)).toBe(true);
  });

  it('can still reveal the answer after a wrong try', () => {
    let state = startRecall(['S1'], SAMPLE, first);
    state = answerRecallTyped(state, 'nope', SAMPLE);
    expect(revealRecall(state).feedback).toEqual({ kind: 'shown' });
  });

  it('trims the echoed wrong answer before keeping it', () => {
    const state = answerRecallTyped(startRecall(['S1'], SAMPLE, first), '   spaced out   ', SAMPLE);
    expect(state.feedback).toEqual({ kind: 'wrong', how: 'typed', answer: 'spaced out' });
  });

  it('treats an answer made only of punctuation as empty and changes nothing', () => {
    const state = startRecall(['S1'], SAMPLE, first);
    expect(answerRecallTyped(state, ' -- ', SAMPLE)).toBe(state);
  });

  it('does nothing after the round has ended: no answer, no reveal, no new target', () => {
    let state = startRecall(['S1'], SAMPLE, first);
    state = nextRecall(state, SAMPLE, first);
    expect(state).toMatchObject({ target: null, choices: [], feedback: null, asked: ['S1'] });
    expect(revealRecall(state)).toBe(state);
    expect(answerRecallTyped(state, 'x', SAMPLE)).toBe(state);
    expect(answerRecallChoice(state, 'S1', SAMPLE)).toBe(state);
    expect(nextRecall(state, SAMPLE, first)).toMatchObject({ target: null, asked: ['S1'] });
  });

  it('starts an empty round with no target or choices', () => {
    expect(startRecall([], SAMPLE, first)).toEqual({ pool: [], target: null, asked: [], choices: [], feedback: null });
  });

  it('clears feedback and offers new choices on next', () => {
    let state = startRecall(['S1', 'S2'], SAMPLE, first);
    state = answerRecallTyped(state, 'nope', SAMPLE);
    state = nextRecall(state, SAMPLE, first);
    expect(state.feedback).toBeNull();
    expect(state.asked).toHaveLength(2);
    expect(state.choices).toContain(state.target);
  });

  it('counts a pick as right when another choice has the same name as the target', () => {
    const twins = catalog([['T1', 'Same Name'], ['T2', 'same  name'], ['T3', 'other']]);
    const state = { pool: ['T1'], target: 'T1', asked: ['T1'], choices: ['T1', 'T2', 'T3'], feedback: null };
    expect(answerRecallChoice(state, 'T2', twins).feedback).toEqual({ kind: 'right', how: 'picked' });
  });

  it('names a wrong pick by its official name, falling back to the id when it has none', () => {
    const named = catalog([['N1', 'first name'], ['N2', 'second name']]);
    const state = { pool: ['N1'], target: 'N1', asked: ['N1'], choices: ['N1', 'N2', 'N9'], feedback: null };
    expect(answerRecallChoice(state, 'N2', named).feedback).toEqual({ kind: 'wrong', how: 'picked', answer: 'second name' });
    expect(answerRecallChoice(state, 'N9', named).feedback).toEqual({ kind: 'wrong', how: 'picked', answer: 'N9' });
  });
});

describe('name it: choices edges', () => {
  it('uses a structure without a name by its id when comparing for duplicates', () => {
    const bare = catalog([['x1', 'x1'], ['x2', 'x2']]);
    bare.names = new Map();
    const choices = recallChoices('x1', bare, first);
    expect([...choices].sort()).toEqual(['x1', 'x2']);
  });

  it('offers nothing when the target is the only structure', () => {
    expect(recallChoices('S1', catalog([['S1', 'only one']]), first)).toEqual([]);
  });

  it('offers just two names when only two distinct names exist', () => {
    const choices = recallChoices('A', catalog([['A', 'alpha'], ['B', 'Alpha'], ['C', 'beta']]), first);
    expect([...choices].sort()).toEqual(['A', 'C']);
  });

  it('works for a target that is not in the catalog list', () => {
    const choices = recallChoices('missing', SAMPLE, first);
    expect(choices).toContain('missing');
    expect(choices).toHaveLength(4);
  });
});
