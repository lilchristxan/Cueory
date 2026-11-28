import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ResultBrandMark from '../../src/islands/ResultBrandMark';

const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

describe('quiet result brand mark', () => {
  it.each(['/play', '/progress'] as const)('uses a real Cueory route %s and original emblem images', (path) => {
    const html = renderToStaticMarkup(createElement(ResultBrandMark, { path }));
    expect(html).toContain('data-testid="result-brand-mark"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('print:hidden');
    // Watermarks must stay readable and the emblem must keep its exact approved color.
    expect(html).not.toContain('opacity-50');
    expect(html).toContain('cueory.app' + path);
    expect(html).toContain('/brand/v1/emblem-light-96.png');
    expect(html).toContain('/brand/v1/emblem-dark-96.png');
    expect(html).toContain('logo-day');
    expect(html).toContain('logo-evening');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('dangerouslySetInnerHTML');
  });

  it('the Astro version renders Wordmark artwork, not a copied wordmark or image', () => {
    const astro = source('src/components/BrandMark.astro');
    expect(astro).toContain("import Wordmark from './Wordmark.astro'");
    expect(astro).toContain('<Wordmark variant="emblem"');
    expect(astro).toContain('aria-hidden="true"');
    expect(astro).toContain('print:hidden');
    expect(astro).not.toContain('opacity-50');
    expect(astro).not.toContain('<img');
  });

  // Christian, 2026-11-27: the end-of-game block is minimal and lives in the game frame's side panel, so the repeated
  // "cueory.app/play" credit no longer shows in any game's finished block (the brand is already in the panel).
  it.each([
    'src/islands/PulseGame.tsx',
    'src/islands/VialoGame.tsx',
    'src/islands/TriageGame.tsx',
    'src/islands/CuewordGame.tsx',
    'src/islands/StatGame.tsx',
  ])('%s no longer repeats the brand line in its finished block', (path) => {
    expect(source(path)).not.toContain('<ResultBrandMark');
  });
});
