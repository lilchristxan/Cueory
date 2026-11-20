import { gameName } from '../config/games';
import { GUESSES, guessesLeft, type PulseState } from './pulse';

/**
 * Approved share line for vialo: "vialo · [date] · [score] · cueory.app".
 * Neutral wording, brand style, plain text.
 */
export function vialoShareText(state: PulseState, day: string): string {
  const used = GUESSES - guessesLeft(state);
  const score = state.status === 'solved' ? `${used}/${GUESSES}` : `x/${GUESSES}`;
  return `${gameName('vialo')} · ${day} · ${score} · cueory.app`;
}
