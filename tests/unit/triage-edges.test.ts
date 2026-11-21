import { describe, expect, it } from 'vitest';
import {
  answerFor,
  answerInWords,
  dealTerms,
  NONE_NAME,
  placedIn,
  placeName,
  places,
  placeSize,
  placeTerm,
  SLIPS,
  slipsLeftInWords,
  startTriage,
  termsLeft,
  triageShareText,
  type TriagePuzzle,
  type TriageState,
} from '../../src/islands/triage';

const puzzle: TriagePuzzle = {
  groups: [
    { name: 'group a', terms: ['a1', 'a2', 'a3'] },
    { name: 'group b', terms: ['b1', 'b2', 'b3'] },
    { name: 'group c', terms: ['c1', 'c2', 'c3'] },
  ],
  oddOne: 'odd',
};

function solve(state: TriageState): TriageState {
  let next = state;
  for (const term of state.terms) next = placeTerm(next, puzzle, term, answerFor(puzzle, term)!);
  return next;
}

describe('triage edge cases', () => {
  it('returns undefined for a term that is not in the puzzle', () => {
    expect(answerFor(puzzle, 'nothing')).toBeUndefined();
    expect(answerFor(puzzle, '')).toBeUndefined();
  });

  it('deals without changing the puzzle and gives a valid order for day 0 and negative days', () => {
    const before = structuredClone(puzzle);
    for (const day of [0, -1, 20000]) {
      const dealt = dealTerms(puzzle, day);
      expect(dealt).toHaveLength(10);
      expect([...dealt].sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3', 'odd']);
    }
    expect(puzzle).toEqual(before);
  });

  it('ignores a term that is not part of the round and does not count it as a slip', () => {
    const state = startTriage(puzzle, 3);
    expect(placeTerm(state, puzzle, 'nothing', 0)).toBe(state);
  });

  it('ignores a move on a term that is already placed, even to a wrong place', () => {
    let state = startTriage(puzzle, 3);
    state = placeTerm(state, puzzle, 'a1', 0);
    expect(placeTerm(state, puzzle, 'a1', 1)).toBe(state);
    expect(placeTerm(state, puzzle, 'a1', 'none')).toBe(state);
    expect(state.slips).toBe(0);
  });

  it('does not mutate the earlier state when a term is placed or slips', () => {
    const start = startTriage(puzzle, 5);
    const snapshot = structuredClone(start);
    placeTerm(start, puzzle, 'a1', 0);
    placeTerm(start, puzzle, 'a1', 2);
    expect(start).toEqual(snapshot);
  });

  it('freezes the round once it is out, even for a right place', () => {
    let state = startTriage(puzzle, 1);
    for (let i = 0; i < SLIPS; i++) state = placeTerm(state, puzzle, 'a1', 'none');
    expect(state.status).toBe('out');
    expect(placeTerm(state, puzzle, 'a1', 0)).toBe(state);
    expect(state.slips).toBe(SLIPS);
  });

  it('freezes the round once it is sorted, so a late slip changes nothing', () => {
    const state = solve(startTriage(puzzle, 1));
    expect(state.status).toBe('sorted');
    expect(placeTerm(state, puzzle, 'a1', 1)).toBe(state);
  });

  it('can be sorted with two slips, and still shares as sorted', () => {
    let state = startTriage(puzzle, 9);
    state = placeTerm(state, puzzle, 'odd', 0);
    state = placeTerm(state, puzzle, 'odd', 1);
    expect(state.status).toBe('playing');
    state = solve(state);
    expect(state.status).toBe('sorted');
    expect(state.slips).toBe(2);
    expect(triageShareText(state, 'mon 2 nov')).toMatch(/sorted with 2 slips\.$/);
  });

  it('lists terms left and drops placed ones while keeping the dealt order', () => {
    let state = startTriage(puzzle, 4);
    const first = state.terms[0]!;
    const third = state.terms[2]!;
    state = placeTerm(state, puzzle, first, answerFor(puzzle, first)!);
    state = placeTerm(state, puzzle, third, answerFor(puzzle, third)!);
    expect(termsLeft(state)).toEqual(state.terms.filter((term) => term !== first && term !== third));
    expect(termsLeft(solve(startTriage(puzzle, 4)))).toEqual([]);
  });

  it('shares unfinished and out rounds as not sorted', () => {
    const playing = startTriage(puzzle, 2);
    expect(triageShareText(playing, 'tue 3 nov')).toMatch(/not sorted this time\.$/);
    expect(triageShareText({ ...playing, status: 'out', slips: SLIPS }, 'tue 3 nov')).toContain('tue 3 nov: not sorted');
  });

  it('shares a clean round as no slips', () => {
    expect(triageShareText(solve(startTriage(puzzle, 2)), 'wed 4 nov')).toMatch(/sorted with no slips\.$/);
  });

  it('never says fewer than no slips left, even if slips run past the limit', () => {
    const base = startTriage(puzzle, 1);
    expect(slipsLeftInWords({ ...base, slips: SLIPS })).toBe('no slips left');
    expect(slipsLeftInWords({ ...base, slips: SLIPS + 4 })).toBe('no slips left');
    expect(slipsLeftInWords({ ...base, slips: SLIPS - 1 })).toBe('1 slip left');
    expect(slipsLeftInWords(base)).toBe(`${SLIPS} slips left`);
  });

  it('gives an empty name and zero size for a place that does not exist', () => {
    expect(placeName(puzzle, 7)).toBe('');
    expect(placeSize(puzzle, 7)).toBe(0);
    expect(placeName(puzzle, 'none')).toBe(NONE_NAME);
    expect(placeSize(puzzle, 'none')).toBe(1);
  });

  it('sizes each place from its own terms', () => {
    const uneven: TriagePuzzle = { ...puzzle, groups: [{ name: 'x', terms: ['x1'] }, ...puzzle.groups.slice(1)] };
    expect(placeSize(uneven, 0)).toBe(1);
    expect(placeSize(uneven, 1)).toBe(3);
  });

  it('lists the places as the three groups then none, in that order', () => {
    expect(places(puzzle)).toEqual([0, 1, 2, 'none']);
  });

  it('lists what is placed in each place, including the odd one in none', () => {
    const state = solve(startTriage(puzzle, 6));
    expect([...placedIn(state, 0)].sort()).toEqual(['a1', 'a2', 'a3']);
    expect(placedIn(state, 'none')).toEqual(['odd']);
    expect(placedIn(startTriage(puzzle, 6), 'none')).toEqual([]);
  });

  it('writes the answer in words with one line per place and a final none line', () => {
    expect(answerInWords(puzzle)).toEqual([
      'group a: a1, a2, a3.',
      'group b: b1, b2, b3.',
      'group c: c1, c2, c3.',
      `${NONE_NAME}: odd.`,
    ]);
  });
});
