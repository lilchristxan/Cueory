import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The game pages keep no saved result: they always start a fresh round (only the stats are saved).
// Christian, 2026-11-25: a game played today is not replayed from the hub. It offers "print" (its paper sheet) where it
// has one, and no button where it has none yet. The hub must never promise a result either.
describe('hub button after a finished game', () => {
  const hub = readFileSync('src/islands/PlayStatus.tsx', 'utf8');
  it('says print where the game has a sheet, never play again or result', () => {
    expect(hub).toContain("PRINT = 'print for a patient'");
    expect(hub).not.toMatch(/play again/i);
    expect(hub).not.toMatch(/'result'/);
  });
  it('game pages do not restore a finished round', () => {
    const sudoku = readFileSync('src/islands/SudokuGame.tsx', 'utf8');
    expect(sudoku).toContain('newSudokuBoard(puzzle.puzzle)');
    expect(sudoku).not.toMatch(/localStorage|loadRound|restoreRound/);
  });
});
