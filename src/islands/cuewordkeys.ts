/**
 * The crossword's browser storage key, in its own tiny module so pages that only need the name (account deletion,
 * /privacy checks) don't pull the whole crossword logic into their JavaScript.
 */
export const CROSSWORD_SETTINGS_KEY = 'cueory-crossword-settings';
