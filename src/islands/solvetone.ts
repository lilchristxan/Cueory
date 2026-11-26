import { playGameCue } from './gamesound';

/** The finish tone for the crossword. Kept as a thin wrapper; the callers check `soundAllowed(...)` first. */
export function playSolvedTone(): void {
  playGameCue('solved');
}
