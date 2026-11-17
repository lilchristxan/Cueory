import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyGames, statGame } from '../../src/config/games';

// The verify script builds dist/ before unit tests, so these assertions check the actual visitor-facing HTML.
const html = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');

// The crossword is left out of today's games while it is closed on this build (site.ts crosswordOpen).
const crosswordClosed = readFileSync(new URL('../../dist/play/crossword.html', import.meta.url), 'utf8').includes('data-testid="crossword-soon"');
const shownGames = dailyGames.filter((game) => game.id !== 'cueword' || !crosswordClosed);

function gamesSection(): string {
  const section = html.match(/<section\b(?=[^>]*\bid="daily-games")[^>]*>[\s\S]*?<\/section>/)?.[0];
  if (!section) throw new Error('the built home page is missing #daily-games');
  return section;
}

function summaryText(): string {
  const markup = gamesSection().match(/<p\b(?=[^>]*\bdata-testid="daily-games-summary")[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if (markup === undefined) throw new Error('the built home page is missing the daily games summary');
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('home daily games summary', () => {
  it('names all ready games from the shared config and the separate stat preview', () => {
    const summary = summaryText();
    const readyNames = shownGames.filter((game) => game.ready).map((game) => game.name);
    const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(readyNames);

    expect(summary).toContain(list);
    for (const name of readyNames) expect(summary).toContain(name);
    for (const game of dailyGames.filter((game) => !game.ready || !shownGames.includes(game))) expect(summary).not.toContain(game.name);
    expect(summary).toContain(`${statGame.name} is in preview`);
    expect(summary).not.toMatch(/\bsort\b/i);
    expect(summary).toBe(summary.toLowerCase());
  });

  it('has a no-JavaScript midnight message without a build-time date', () => {
    const section = gamesSection();
    expect(section).toContain('data-testid="daily-games-day"');
    expect(section).toContain('data-daily-games-date');
    const dayTag = section.match(/<p\b(?=[^>]*\bdata-testid="daily-games-day")[^>]*>/)?.[0];
    expect(dayTag).toContain('aria-live="polite"');
    expect(dayTag).toContain('aria-atomic="true"');
    expect(section).toContain('the date changes at midnight on your device. some sample puzzles repeat.');
  });

  it('keeps the single call to action on /play, without a direct stat link', () => {
    const section = gamesSection();
    const links = [...section.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)].map((match) => match[1]);
    expect(links).toEqual(['/play']);
    expect(section).toContain('data-testid="games-link"');
  });
});
