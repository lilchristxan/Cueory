import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The game pages keep no saved result: they always start a fresh round (only the stats are saved).
// So the hub button after a finished game must not promise a result. If a saved-result view is built, change both.
describe('hub button after a finished game', () => {
  const hub = readFileSync('src/islands/PlayStatus.tsx', 'utf8');
  it('says play again, not result', () => {
    expect(hub).toContain("PLAY_AGAIN = 'play again'");
    expect(hub).not.toMatch(/'result'/);
  });
  it('game pages do not restore a finished round', () => {
    const sudoku = readFileSync('src/islands/SudokuGame.tsx', 'utf8');
    expect(sudoku).toContain('newSudokuBoard(puzzle.puzzle)');
    expect(sudoku).not.toMatch(/localStorage|loadRound|restoreRound/);
  });
});
