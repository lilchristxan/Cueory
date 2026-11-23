import { gameName } from '../config/games';
import type { SutureState } from './suture';

/**
 * Approved share line for piccline: "piccline · [date] · [score] · cueory.app".
 * Neutral wording, brand style, plain text.
 */
export function picclineShareText(
  state: Pick<SutureState, 'found' | 'totalWords'>,
  day: string,
): string {
  const score = `${state.found.length}/${state.totalWords}`;
  return `${gameName('piccline')} · ${day} · ${score} · cueory.app`;
}
