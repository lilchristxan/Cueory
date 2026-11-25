// Kept apart from stickynote.ts so the storage-key list (used by account deletion) does not pull the note's rules into that page.
/** Session storage key for this visit's memory. It stays in the visitor's browser and is never sent to us. */
export const VISIT_STORAGE_KEY = 'cueory-glove-note';
/**
 * Local storage key for what the last visit's welcome note said, so the next visit says something else. It stays in
 * the visitor's browser; `/privacy` must list it before the notes are switched on.
 */
export const LAST_WELCOME_STORAGE_KEY = 'cueory-glove-note-welcome';
