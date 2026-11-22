import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// The .tsx extension is explicit: on a case-insensitive disk a bare 'PlayStatus' would resolve to playstatus.ts first.
import PlayStatus from '../../src/islands/PlayStatus.tsx';
import { MARK_SYMBOL } from '../../src/islands/pulse';
import { dailyGames } from '../../src/config/games';
import { gamePages } from '../../src/config/game-pages';

const games = (['pulse', 'triage', 'cueword', 'suture'] as const).map((id) => {
  const game = id === 'pulse' ? { ...dailyGames[0]!, id: 'pulse' as const, name: 'pillo' } : dailyGames.find((entry) => entry.id === id)!;
  return { id, name: game.name, line: game.line, href: gamePages[id] };
});

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
    // The key's marks are decoration for screen readers; the words carry the meaning.
    for (const mark of Object.values(MARK_SYMBOL)) expect(html).toContain(`<span aria-hidden="true">${mark} </span>`);
  });

  it('makes only each game\'s name the link, so the key and status are not read as part of it', () => {
    const html = render(false);
    for (const game of games) {
      expect(html).toMatch(new RegExp(`<h3[^>]*><a href="${game.href}"[^>]*>${game.name}</a></h3>`));
      expect(html).toContain(game.line.replace(/'/g, '&#x27;'));
    }
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*how to read the pack/);
  });
});
