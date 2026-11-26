import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// The .tsx extension is explicit: on a case-insensitive disk a bare 'PlayStatus' would resolve to playstatus.ts first.
import PlayStatus from '../../src/islands/PlayStatus.tsx';
import PlayTotals from '../../src/islands/PlayTotals';
import { statsCta } from '../../src/config/statscta';
import { helloCardsGame } from '../../src/config/games';
import { gamePages } from '../../src/config/game-pages';
import { hubLines } from '../../src/config/homegames';
import { hubHeadline, hubTotals, playedLabel, statusWords } from '../../src/islands/playhub';

const line = (id: 'vialo' | 'cueword') => ({ vialo: hubLines.vialo, cueword: hubLines.crossword })[id];
const games = (crosswordOpen: boolean) => [
  { id: 'vialo' as const, testId: 'pulse', name: 'wordpill', line: line('vialo'), href: gamePages.vialo, open: true, art: 'vialo' as const },
  { id: 'cueword' as const, testId: 'cueword', name: 'crossword', line: line('cueword'), href: gamePages.cueword, open: crosswordOpen },
  { id: 'hello-cards' as const, testId: 'hello-cards', name: helloCardsGame.name, line: helloCardsGame.line, href: helloCardsGame.href, open: false },
];
const render = (crosswordOpen: boolean) => renderToStaticMarkup(createElement(PlayStatus, { games: games(crosswordOpen) }));

describe('the /play hub rows (option B)', () => {
  it('draws a closed game as "coming soon" with no link, no button and no focus stop', () => {
    const html = render(false);
    const card = html.slice(html.indexOf('data-testid="play-status-cueword"'), html.indexOf('data-testid="play-status-hello-cards"'));
    expect(card).toContain('coming soon');
    expect(card).not.toMatch(/<a\b|href=|tabindex/);
    expect(html).not.toContain('href="/play/crossword"');
    expect(html).not.toContain('href="/play/hello-cards"');
  });

  it('links an open game once, from its play button, and shows a dash until the browser has been read', () => {
    const html = render(true);
    expect(html).toContain('href="/play/crossword"');
    expect(html.match(/href="\/play\/wordpill"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="play wordpill"');
    expect(html).toContain('<span aria-hidden="true">–</span>');
    expect(html).not.toContain('new today');
  });

  it('shows the short lines the home page game cards use', () => {
    const html = render(true);
    expect(html).toContain(line('vialo'));
    expect(html).toContain(line('cueword').replace(/'/g, '&#x27;'));
  });

  it('uses the shared logo artwork (src/config/gamelogos.ts) for vialo and a serif name for the others', () => {
    const html = render(true);
    expect(html).toContain('src="/design/games-v2/assets/wordpill-wordmark-light.svg"');
    expect(html).toContain('src="/design/games-v2/assets/wordpill-wordmark-dark.svg"');
    expect(html).toContain('src="/design/games-v2/assets/wordpill-icon-l1.svg"');
    expect(html).toContain('alt="wordpill"');
    expect(html).toMatch(/display[^>]*>crossword</);
  });

  it('draws nothing but an empty holder for the totals on the server, until the session check has resolved', () => {
    const html = renderToStaticMarkup(createElement(PlayTotals, { cta: statsCta }));
    expect(html).toBe('<div class="play-hub-account-slot"></div>');
  });
});

describe('the hub totals and words', () => {
  const stats = [
    { game: 'vialo' as const, day: '2026-11-22', solved: true, tries: 4 },
    { game: 'triage' as const, day: '2026-11-22', solved: false, tries: 1 },
    { game: 'vialo' as const, day: '2026-11-21', solved: true, tries: 3 },
    { game: 'suture' as const, day: '2026-11-10', solved: true, tries: 0 },
  ];
  it('counts played, solved percent and day streaks, ending yesterday while today has no game', () => {
    expect(hubTotals(stats, '2026-11-23')).toEqual({ played: 4, solvedPercent: 75, dayStreak: 2, bestStreak: 2 });
    expect(hubTotals(stats, '2026-11-25').dayStreak).toBe(0);
    expect(hubTotals([], '2026-11-23')).toEqual({ played: 0, solvedPercent: undefined, dayStreak: 0, bestStreak: 0 });
  });
  it('words each status in lowercase', () => {
    expect(statusWords('not-started', '')).toBe('new today');
    expect(statusWords('in-progress', '')).toBe('in progress');
    expect(playedLabel('vialo', stats[0])).toBe('solved in 4');
    expect(playedLabel('triage', stats[1])).toBe('not solved');
    expect(playedLabel('suture', stats[3])).toBe('solved');
  });
  it('claims only the number of games listed', () => {
    expect(hubHeadline(6)).toBe('six games, new every day.');
    expect(hubHeadline(4)).toBe('four games, new every day.');
  });
});
