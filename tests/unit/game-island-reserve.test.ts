import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist } from './perf-scan';

/** The built CSS files a page links. */
function linkedCss(html: string): string {
  return [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\/(_astro\/[^"]+\.css)"/g)]
    .map(([, href]) => readFileSync(`${dist}${href}`, 'utf8'))
    .join('\n');
}

describe('game pages: the frame, not the board holder, keeps a full screen (Games v2, 2026-11-23)', () => {
  it.each(['play/pillo.html', 'play/sudoku.html', 'play/word-path.html'])('%s: no extra room is reserved for the game holder', (page) => {
    const html = readFileSync(`${dist}${page}`, 'utf8');
    expect(html).toMatch(/<article\b[^>]*data-game-page="[^"]+"/);
    const css = linkedCss(html).replace(/\s+/g, '');
    expect(css).not.toContain('astro-island[ssr]');
    expect(css).toMatch(/\.game-frame\{[^}]*min-height:100vh/);
  });

  it('GamePage adds no wrapper around the game, so the print rules still see the article\'s direct children', () => {
    const source = readFileSync(new URL('../../src/components/GamePage.astro', import.meta.url), 'utf8');
    expect(source).toContain("import '../styles/gamepage.css';");
    expect(source).toMatch(/<h2 class="sr-only">today's puzzle<\/h2>\s*<slot \/>/);
  });
});
