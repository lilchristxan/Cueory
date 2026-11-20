import { gameName } from '../config/games';
import { canSetHardMode, GUESSES, guessesLeft, setHardMode, startPulse, type PulseState } from './pulse';

/**
 * Approved share line for vialo: "vialo · [date] · [score] · cueory.app".
 * Neutral wording, brand style, plain text.
 */
export function vialoShareText(state: PulseState, day: string): string {
  const used = GUESSES - guessesLeft(state);
  const score = state.status === 'solved' ? `${used}/${GUESSES}` : `x/${GUESSES}`;
  return `${gameName('vialo')} · ${day} · ${score} · cueory.app`;
}

export interface VialoState extends PulseState {
  /** An accepted guess was made for this day's puzzle before this page loaded. */
  hasPlayed?: boolean;
}

export function startVialo(answer: string, hard?: boolean, hasPlayed = false): VialoState {
  return {
    ...startPulse(answer),
    ...(hard === undefined ? {} : { hard }),
    ...(hasPlayed ? { hasPlayed: true } : {}),
  };
}

/** Whether hard mode can be switched: locked if a guess was made today or previously in this visit. */
export function canSetVialoHardMode(state: PulseState): boolean {
  if ((state as VialoState).hasPlayed) return false;
  return canSetHardMode(state);
}

/** Sets hard mode unless locked by today's accepted guess. */
export function setVialoHardMode(state: PulseState, hard: boolean): PulseState {
  if ((state as VialoState).hasPlayed) return state;
  return setHardMode(state, hard);
}

