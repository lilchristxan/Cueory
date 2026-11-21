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
  it('uses the approved Home v2 copy and cards', () => {
    const summary = summaryText();
    const section = gamesSection();

    expect(summary).toBe('inspired by your favorite daily games for you and your patients');
    expect([...section.matchAll(/data-game-card=/g)]).toHaveLength(6);
    expect(section).toContain('data-game-card="vialo"');
    expect(section).toContain('data-game-card="tachyyy"');
    expect(section).toContain('data-game-card="piccline"');
    expect(section).toContain('data-game-card="crossword"');
    expect(section).toContain('data-game-card="sudoku"');
    expect(section).toContain('data-game-card="hello cards"');
    expect(section).toContain('guess the five-letter word in six tries.');
    expect(section).toContain('quick questions against the clock.');
    expect(section).toContain('trace hidden words through the letters.');
    expect(section).toContain("a mini crossword from this week's lessons.");
    expect(section).toContain('a calm numbers break.');
    expect(section).toMatch(/flip a card,[\s\S]*?start a conversation\./);
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

  it('links each card to its game route', () => {
    const section = gamesSection();
    const links = [...section.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)].map((match) => match[1]);
    expect(links).toEqual([
      '/play/vialo',
      '/play/tachyyy',
      '/play/piccline',
      '/play/crossword',
      '/play/sudoku',
      '/play/hello-cards',
    ]);
  });

  it('shows coming soon instead of play-status badges for unreleased games on production builds', () => {
    const section = gamesSection();
    // Released games show play-status badges
    expect(section).toContain('data-game-status="vialo"');
    expect(section).toContain('data-game-status="piccline"');
    expect(section).toContain('data-game-status="sudoku"');

    // Unreleased games in production build show "coming soon" instead of play-status badges
    expect(section).not.toContain('data-game-status="tachyyy"');
    expect(section).not.toContain('data-game-status="crossword"');
    expect(section).not.toContain('data-game-status="hello-cards"');
    expect([...section.matchAll(/class="gstatus"[^>]*>\s*coming soon\s*<\/span>/g)]).toHaveLength(3);
  });
});
