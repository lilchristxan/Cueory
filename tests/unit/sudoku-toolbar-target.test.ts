import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

it('keeps every sudoku toolbar button a full tap target with no scaling at rest', () => {
  const rule = css.match(/\.sudoku-toolbar > \.sudoku-icon-button \{([^}]*)\}/)?.[1] ?? '';
  for (const part of ['block-size: var(--tap-min)', 'inline-size: var(--tap-min)', 'min-block-size: var(--tap-min)', 'min-inline-size: var(--tap-min)', 'box-sizing: border-box', 'scale: none', 'transform: none']) {
    expect(rule).toContain(part);
  }
});
