import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist } from './perf-scan';

/** The built CSS files a page links. */
function linkedCss(html: string): string {
  return [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\/(_astro\/[^"]+\.css)"/g)]
    .map(([, href]) => readFileSync(`${dist}${href}`, 'utf8'))
    .join('\n');
}

describe('game pages keep room for the game until it renders (performance, 2026-11-19)', () => {
  it.each(['play/pillo.html', 'play/sudoku.html', 'play/word-path.html'])('%s: links the reserve rule, only for scripting', (page) => {
    const html = readFileSync(`${dist}${page}`, 'utf8');
    expect(html).toMatch(/<article\b[^>]*data-game-page="[^"]+"/);
    const css = linkedCss(html).replace(/\s+/g, '');
    expect(css).toMatch(/@media\(scripting:enabled\)\{\[data-game-page\]\.game-frame-board>:has\(astro-island:empty\)\{min-block-size:100svh\}/);
  });

  it('GamePage adds no wrapper around the game, so the print rules still see the article\'s direct children', () => {
    const source = readFileSync(new URL('../../src/components/GamePage.astro', import.meta.url), 'utf8');
    expect(source).toContain("import '../styles/gamepage.css';");
    expect(source).toMatch(/<h2 class="sr-only">today's puzzle<\/h2>\s*<slot \/>/);
  });

  it('the built CSS has the rule once, so it is not copied onto pages without a game', () => {
    const files = readdirSync(`${dist}_astro`).filter((name) => name.endsWith('.css'));
    const holders = files.filter((name) => readFileSync(`${dist}_astro/${name}`, 'utf8').includes('astro-island:empty'));
    expect(holders).toHaveLength(1);
  });
});
