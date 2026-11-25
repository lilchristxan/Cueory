import { browserStorage, type KeyValueStorage } from '../scripts/storage';
import { cleanGuess, GUESSES, playGuess, WORD_LENGTH, type PulseState } from './pulse';
import { VIALO_SAVE_KEY } from './gamesavekeys';
import { isObject, readSavedBoard, writeSavedBoard } from './gamesave';

/** Today's vialo guesses, kept on this device so a reload brings the board back and a finished game stays finished. */
const MAX_LENGTH = 2048;
const ID = 'today';

/** Replays the saved guesses on a fresh `start` state. A damaged record, or one that does not replay cleanly, gives null. */
export function loadVialoSave(start: PulseState, day: string, storage: KeyValueStorage | undefined = browserStorage()): PulseState | null {
  const saved = readSavedBoard(storage, VIALO_SAVE_KEY, MAX_LENGTH, day, ID);
  if (!isObject(saved) || !Array.isArray(saved.guesses) || saved.guesses.length === 0 || saved.guesses.length > GUESSES) return null;
  let state = start;
  for (const word of saved.guesses) {
    if (typeof word !== 'string' || word !== cleanGuess(word) || word.length !== WORD_LENGTH || state.status !== 'playing') return null;
    const next = playGuess(state, word);
    if (next === state) return null;
    state = next;
  }
  return state;
}

/** Saves the guesses played so far (the words only: the marks are worked out again on load). */
export function saveVialoGuesses(state: PulseState, day: string, storage: KeyValueStorage | undefined = browserStorage()): void {
  writeSavedBoard(storage, VIALO_SAVE_KEY, MAX_LENGTH, day, ID, state.guesses.length ? { guesses: state.guesses.map((guess) => guess.word) } : null);
}
