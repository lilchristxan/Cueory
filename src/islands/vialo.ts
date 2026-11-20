import { gameName } from '../config/games';
import { canSetHardMode, GUESSES, guessesLeft, setHardMode, startPulse, type PulseState } from './pulse';
import type { KeyValueStorage } from '../scripts/storage';

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

export const VIALO_HARD_MODE_STORAGE_KEY = 'cueory-vialo-hard-mode';
export const PILLO_HARD_MODE_STORAGE_KEY = 'cueory-pillo-hard-mode';

/** Reads this local day's locked mode. Missing, old-day and malformed records do not lock a new round. */
export function loadVialoHardMode(storage: KeyValueStorage | undefined, day: string): boolean | undefined {
  try {
    const raw = storage?.getItem(VIALO_HARD_MODE_STORAGE_KEY) ?? storage?.getItem(PILLO_HARD_MODE_STORAGE_KEY);
    if (!raw) return undefined;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return undefined;
    if (data.day !== day) return undefined;
    return typeof data.hard === 'boolean' ? data.hard : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the player's Hard Mode choice after their first accepted guess of the day. */
export function rememberVialoHardMode(storage: KeyValueStorage | undefined, day: string, hard: boolean): void {
  try {
    storage?.setItem(VIALO_HARD_MODE_STORAGE_KEY, JSON.stringify({ day, hard }));
  } catch {
    // Storage blocked.
  }
}
