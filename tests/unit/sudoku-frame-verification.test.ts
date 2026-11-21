import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

describe('framed Sudoku verification seams', () => {
  const root = resolve(__dirname, '../..');

  it('notifies the framed stats island after a same-tab per-level solve', () => {
    const source = readFileSync(resolve(root, 'src/islands/SudokuGame.tsx'), 'utf8');
    expect(source).toContain('keepSudokuSolve(browserStorage(), day, { level, day, seconds })');
    expect(source).toContain('reportStatsChanged();');
  });

  it('mounts cleanup and a paused, native-disabled Frame picker', () => {
    const source = readFileSync(resolve(root, 'src/islands/SudokuFrameStats.tsx'), 'utf8');
    expect(source).toContain('loadSudokuStats(browserStorage(), today)');
    expect(source).toContain("addEventListener('cueory:sudoku-paused', onPaused)");
    expect(source).toContain('disabled={paused}');
    expect(source).toContain("removeEventListener('cueory:sudoku-paused', onPaused)");
  });
});
