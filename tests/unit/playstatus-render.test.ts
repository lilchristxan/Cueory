import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlayStatus from '../../src/islands/PlayStatus';
import { MARK_SYMBOL } from '../../src/islands/pulse';

const games = [
  { id: 'pulse', name: 'pillo', line: 'Guess the five-letter word in six tries.', href: '/play/pillo' },
  { id: 'triage', name: 'sudoku', line: 'Fill every row, column and box with the numbers one through nine.', href: '/play/sudoku' },
  { id: 'cueword', name: 'crossword', line: "A mini crossword from this week's lessons.", href: '/play/crossword' },
  { id: 'suture', name: 'word path', line: 'Trace hidden words through the letters.', href: '/play/word-path' },
] as const;

const render = (isComingSoonCrossword: boolean) =>
  renderToStaticMarkup(createElement(PlayStatus, { games, isComingSoonCrossword }));

describe('the /play hub cards (redesign P8)', () => {
  it('draws a closed crossword as a card with no link and no focus stop', () => {
    const html = render(true);
    const card = html.slice(html.indexOf('data-testid="play-status-cueword"'), html.indexOf('data-testid="play-status-triage"'));
    expect(card).toContain('coming soon');
    expect(card).not.toMatch(/<a\b|href=|tabindex/);
    expect(html).not.toContain('href="/play/crossword"');
  });

  it('links the crossword only when it is open', () => {
    expect(render(false)).toContain('href="/play/crossword"');
  });

  it('uses the pillo game\'s own marks in the sample pack and its key, never green or yellow classes', () => {
    const html = render(false);
    for (const mark of Object.values(MARK_SYMBOL)) expect(html).toContain(mark);
    expect(html).not.toMatch(/green|yellow|amber/);
    expect(html).toContain('bg-pillo-elsewhere');
  });
});
