import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildResultShareLine, sudokuResultCard } from '../../src/islands/gameresults';
import { platformShareUrl } from '../../src/islands/share';
import { getResult as sudokuResult } from '../../src/islands/sudoku';

const card = { name: 'pillo', date: 'nov 11, 2026', result: '4 / 6' };

describe('finished-game share line', () => {
  it('uses the exact plain one-line format', () => {
    expect(buildResultShareLine(card)).toBe('pillo · nov 11, 2026 · 4 / 6 · cueory.app');
    expect(buildResultShareLine({ name: '  word   path ', date: ' nov 11 ', result: ' 12 / 15 ' }))
      .toBe('word path · nov 11 · 12 / 15 · cueory.app');
  });

  it('keeps the short heading separate from detailed, whitespace-cleaned sharing', () => {
    expect(buildResultShareLine({ name: 'crossword', date: 'wed 11 nov', result: 'solved', shareResult: ' easy · solved in 3:05 ' }))
      .toBe('crossword · wed 11 nov · easy · solved in 3:05 · cueory.app');
  });

  it('shares Sudoku level, elapsed time and error count from the canonical result', () => {
    const result = sudokuResultCard(sudokuResult({ day: '2026-11-11', level: 'medium', solved: true, seconds: 252, errors: 0 }));
    expect(result.result).toBe('solved');
    expect(buildResultShareLine(result)).toBe('sudoku · wed 11 nov · mid · 04:12 · 0 errors · cueory.app');
  });
});

describe('Sudoku result adapter', () => {
  it('never describes an unfinished Sudoku as a solved shared result', () => {
    const card = sudokuResultCard(sudokuResult({ day: '2026-11-11', level: 'hard', solved: false, seconds: 65, errors: 2 }));
    expect(buildResultShareLine(card)).toBe('sudoku · wed 11 nov · hard · not solved · 01:05 · 2 errors · cueory.app');
  });

  it('maps Worker 1 completion details to the shared result card', () => {
    expect(sudokuResultCard(sudokuResult({
      day: '2026-11-11',
      level: 'medium',
      solved: true,
      seconds: 154,
      errors: 1,
    }))).toEqual({
      game: 'sudoku',
      name: 'sudoku',
      date: 'wed 11 nov',
      level: 'mid',
      result: 'solved',
      shareResult: 'mid · 02:34 · 1 error',
      summary: 'mid completed in 02:34 with 1 error.',
      stats: [
        { label: 'time', value: '02:34' },
        { label: 'errors', value: '1' },
      ],
      path: '/play/sudoku',
    });
  });


});

describe('plain platform share pages', () => {
  const line = buildResultShareLine(card);
  const target = 'https://cueory.app/play#pulse-heading';

  it('encodes Threads text and the link independently, including reserved characters', () => {
    const text = 'word path · 12 of 12 words & done #today';
    const target = 'https://cueory.app/play/word-path?level=easy&day=2026-11-11#result';
    const url = new URL(platformShareUrl('threads', text, target));
    expect(url.origin + url.pathname).toBe('https://www.threads.com/intent/post');
    expect(url.searchParams.get('text')).toBe(text);
    expect(url.searchParams.get('url')).toBe(target);
    expect([...url.searchParams.keys()]).toEqual(['text', 'url']);
  });

  it.each([
    ['facebook', 'https://www.facebook.com/sharer/sharer.php', 'u'],
    ['x', 'https://x.com/intent/post', 'url'],
    ['threads', 'https://www.threads.com/intent/post', 'url'],
    ['reddit', 'https://www.reddit.com/submit', 'url'],
    ['whatsapp', 'https://wa.me/', 'text'],
  ] as const)('%s uses only a plain share-page link', (platform, route, parameter) => {
    const url = new URL(platformShareUrl(platform, line, target));
    expect(url.origin + url.pathname).toBe(route);
    expect(url.searchParams.get(parameter)).toContain(parameter === 'text' ? line : target);
    expect(url.searchParams.has('utm_source')).toBe(false);
  });
});


describe('shared result dialog placement and touch targets', () => {
  it('mounts result hosts outside filtered veil articles', () => {
    // The daily games' own pages share GamePage.astro, which each page wraps in Layout (2026-11-17).
    const game = readFileSync(new URL('../../src/components/GamePage.astro', import.meta.url), 'utf8');
    const hello = readFileSync(new URL('../../src/pages/play/hello-cards.astro', import.meta.url), 'utf8');
    expect(game.lastIndexOf('<GameResultsHost')).toBeGreaterThan(game.lastIndexOf('</article>'));
    for (const page of ['pillo', 'sudoku', 'crossword', 'word-path']) {
      const source = readFileSync(new URL(`../../src/pages/play/${page}.astro`, import.meta.url), 'utf8');
      expect(source.indexOf('<GamePage'), page).toBeGreaterThan(source.indexOf('<Layout'));
      expect(source.lastIndexOf('</GamePage>'), page).toBeLessThan(source.lastIndexOf('</Layout>'));
    }
    expect(hello.lastIndexOf('<GameResultsHost')).toBeGreaterThan(hello.lastIndexOf('</article>'));
    expect(hello.lastIndexOf('<GameResultsHost')).toBeLessThan(hello.lastIndexOf('</Layout>'));
    expect(hello).toContain('{shown && <GameResultsHost client:only="react" />}');
  });

  it('keeps held socials out and gives share/copy the approved tap target', () => {
    const source = readFileSync(new URL('../../src/islands/GameResultsHost.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('share result on a website');
    const actions = source.slice(source.indexOf('className="mt-5 flex'), source.indexOf('data-testid="game-result-next-message"'));
    expect(actions.match(/min-h-\(--tap-min\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(actions).toContain('rounded-pill');
  });
});

describe('shared result dialog design tokens', () => {
  it('uses the repository overlay and radius tokens', () => {
    const source = readFileSync(new URL('../../src/islands/GameResultsHost.tsx', import.meta.url), 'utf8');
    expect(source).toContain('result-dialog-overlay');
    expect(source).toContain('rounded-[var(--cueory-result-card-radius)]');
    expect(source).toContain('max-w-[var(--cueory-result-card-max-width)]');
    expect(source).not.toContain('backdrop-blur-sm');
    expect(source).not.toContain('bg-ink/40');
    expect(source).not.toContain('rounded-2xl');
  });

  it('keeps the copper share button fully opaque while an image is prepared, with a busy cursor', () => {
    const source = readFileSync(new URL('../../src/islands/GameResultsHost.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/opacity-\d/);
    expect(source).toContain('aria-busy:cursor-progress');
    expect(source).toContain('aria-disabled={preparing || undefined}');
    expect(source).toContain('aria-busy={preparing || undefined}');
    expect(source).toContain('if (preparing) return;');
  });

  it('shows the label in capitals by style only, without changing the source text', () => {
    const host = readFileSync(new URL('../../src/islands/GameResultsHost.tsx', import.meta.url), 'utf8');
    // The share landing pages that also used result-meta became the games' own pages (2026-11-17) and were removed.
    const styles = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    expect(host).toContain('result-meta');
    expect(host).toContain('uppercase');
    expect(host).not.toMatch(/PILLO|SUDOKU|WORD PATH|CROSSWORD/);
    // The uppercase class is the one caps treatment: a small-caps rule on top of it would be dead weight.
    expect(styles).not.toMatch(/\.result-meta\s*\{/);
  });
});

describe('story image implementation', () => {
  it('takes every canvas dimension and font from design tokens', () => {
    const source = readFileSync(new URL('../../src/islands/share.ts', import.meta.url), 'utf8');
    const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    for (const name of [
      '--share-story-width', '--share-story-height', '--share-story-logo-width', '--share-story-logo-top',
      '--share-story-label-y', '--share-story-result-y', '--share-story-challenge-y', '--share-story-site-y',
      '--share-story-label-size', '--share-story-result-size', '--share-story-challenge-size', '--share-story-site-size',
      '--share-story-dark-logo',
    ]) {
      expect(source).toContain(`number('${name}')`);
      expect(tokens).toContain(`${name}:`);
    }
    expect(source).toContain("'/brand/v1/logo-full-light-960.png'");
    expect(source).toContain("'/brand/v1/logo-full-dark-960.png'");
    expect(source).toContain("number('--share-story-dark-logo') === 1");
    expect(source).not.toContain('#1c1917');
    expect(source).not.toMatch(/font = ['"][^'"]*\d+px/);
  });

  it('sets the story canvas to the required 1080 by 1920 through tokens', () => {
    expect(tokensValue('--share-story-width')).toBe('1080');
    expect(tokensValue('--share-story-height')).toBe('1920');
  });
});

function tokensValue(name: string): string {
  const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
  return new RegExp(`${name}:\\s*([^;]+)`).exec(tokens)?.[1]?.trim() ?? '';
}
