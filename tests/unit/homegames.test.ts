import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyGames, forbiddenGameWords } from '../../src/config/games';
import { countWord, firstSentence, homeGameCards, homeGamesSummary, stageCounter } from '../../src/config/homegames';

describe('home daily-games cards (copy deck, home rows "games line" to "game 5")', () => {
  it('ships the deck order, names and lines while the crossword is closed', () => {
    const cards = homeGameCards(false);
    expect(cards).toEqual([
      { name: 'vialo', line: 'guess the five-letter word in six tries.', available: true },
      { name: 'crossword', line: 'coming soon.', available: false },
      { name: 'sudoku', line: 'fill every row, column and box with the numbers one through nine.', available: true },
      { name: 'piccline', line: 'trace hidden words through the letters.', available: true },
      { name: 'hello cards', line: 'flip a card, start a conversation.', available: false },
    ]);
    expect(homeGamesSummary(cards)).toBe('a new set of nursing games each day. play one, or all three.');
    expect(stageCounter(1, cards.length)).toBe('01 / 05');
  });

  it('derives the count from the real game list, so an open crossword changes it', () => {
    const cards = homeGameCards(true);
    const crossword = cards.find((card) => card.name === 'crossword')!;
    expect(crossword.available).toBe(true);
    expect(crossword.line).toBe(firstSentence(dailyGames.find((game) => game.id === 'cueword')!.line));
    expect(homeGamesSummary(cards)).toBe('a new set of nursing games each day. play one, or all four.');
    const live = dailyGames.filter((game) => game.ready).length;
    expect(homeGamesSummary(cards)).toContain(`all ${countWord(live)}.`);
  });

  it('never uses the retired "sort" name or a forbidden game word', () => {
    for (const open of [false, true]) {
      const text = homeGameCards(open).map((card) => `${card.name} ${card.line}`).join(' ').toLowerCase();
      expect(text).not.toMatch(/\bsort\b/);
      for (const word of forbiddenGameWords) expect(text).not.toContain(word);
    }
  });

  it('keeps counts out of the component source', () => {
    const source = readFileSync(new URL('../../src/components/DailyGamesSection.astro', import.meta.url), 'utf8');
    expect(source).not.toMatch(/all (three|four|five)/);
    expect(source).not.toContain('01 / 05');
  });

  it('formats small counts as words and pads the counter', () => {
    expect(countWord(3)).toBe('three');
    expect(countWord(12)).toBe('12');
    expect(stageCounter(2, 5)).toBe('02 / 05');
    expect(firstSentence('one. two.')).toBe('one.');
    expect(firstSentence('only one.')).toBe('only one.');
  });
});
