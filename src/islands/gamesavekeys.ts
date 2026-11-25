/**
 * The browser storage keys of the games' device-local autosave, in a tiny module so account deletion and the /privacy
 * checks can name them without pulling the games' logic into every page's JavaScript.
 */
export const VIALO_SAVE_KEY = 'cueory-vialo-save';
export const SUDOKU_SAVE_KEY = 'cueory-sudoku-save';
export const CROSSWORD_SAVE_KEY = 'cueory-crossword-save';

/** The save key each game's stats id uses (vialo's older id was pulse); forgetting that game's stats forgets its saved board too. */
export const SAVE_KEY_BY_GAME: Readonly<Record<string, string>> = { vialo: VIALO_SAVE_KEY, pulse: VIALO_SAVE_KEY, triage: SUDOKU_SAVE_KEY, cueword: CROSSWORD_SAVE_KEY };

/** Deletes the saved boards of one game, or of all three games. Best effort: blocked storage keeps nothing new anyway. */
export function forgetSavedBoards(storage: { removeItem(key: string): void } | undefined, game?: string): void {
  try {
    if (!storage) return;
    const keys = game === undefined ? [VIALO_SAVE_KEY, SUDOKU_SAVE_KEY, CROSSWORD_SAVE_KEY] : SAVE_KEY_BY_GAME[game] ? [SAVE_KEY_BY_GAME[game]!] : [];
    for (const key of keys) storage.removeItem(key);
  } catch { /* blocked storage */ }
}
