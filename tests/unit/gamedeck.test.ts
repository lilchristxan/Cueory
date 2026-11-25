import { describe, expect, it } from 'vitest';
import { DECK_LOOP, deckOrder } from '../../src/config/gamedeck';

const all = () => true;
const live = (id: string) => id === 'pulse' || id === 'triage' || id === 'suture';

describe('card deck order', () => {
  it('runs the loop vialo, hello cards, sudoku, crossword, piccline, tachyyy', () => {
    expect([...DECK_LOOP]).toEqual(['pulse', 'hello-cards', 'triage', 'cueword', 'suture', 'stat']);
  });
  it('puts the next game in front and wraps round', () => {
    expect(deckOrder('pulse', all)).toEqual(['hello-cards', 'triage', 'cueword', 'suture', 'stat']);
    expect(deckOrder('triage', all)).toEqual(['cueword', 'suture', 'stat', 'pulse', 'hello-cards']);
    expect(deckOrder('stat', all)).toEqual(['pulse', 'hello-cards', 'triage', 'cueword', 'suture']);
  });
  it('never shows the current game', () => {
    for (const id of DECK_LOOP) expect(deckOrder(id, all)).not.toContain(id);
  });
  it('skips closed games: at launch vialo, sudoku, piccline, vialo', () => {
    expect(deckOrder('pulse', live)).toEqual(['triage', 'suture']);
    expect(deckOrder('triage', live)).toEqual(['suture', 'pulse']);
    expect(deckOrder('suture', live)).toEqual(['pulse', 'triage']);
  });
  it('shows nothing when no other game is open and copes with an unknown game', () => {
    expect(deckOrder('pulse', () => false)).toEqual([]);
    expect(deckOrder('nope', live)).toEqual(['pulse', 'triage', 'suture']);
  });
});
