import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The verify script builds dist/ before unit tests, so these assertions check the actual visitor-facing HTML.
const html = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');

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

describe('home daily games stage', () => {
  it('uses the approved Home copy and keeps closed cards visible but gated', () => {
    const summary = summaryText();
    const section = gamesSection();

    expect(summary).toBe('a new set of nursing games each day. play one, or all three.');
    expect([...section.matchAll(/data-game-card=/g)]).toHaveLength(5);
    expect(section).toMatch(/data-game-card="crossword"[\s\S]*?crossword[\s\S]*?coming soon/);
    expect(section).toMatch(/data-game-card="hello cards"[\s\S]*?hello cards[\s\S]*?coming soon/);
    expect(section).toContain('sudoku');
    expect(section).toContain('fill every row, column and box with the numbers one through nine.');
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

  it('keeps the single call to action on /play, without direct game-card links', () => {
    const section = gamesSection();
    const links = [...section.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)].map((match) => match[1]);
    expect(links).toEqual(['/play']);
    expect(section).toContain('data-testid="games-link"');
  });
});
