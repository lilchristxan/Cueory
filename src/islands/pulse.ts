/**
 * pillo (task-114): five-letter word game on /play. Pure logic, kept apart from the island (PulseGame.tsx) so it can
 * be unit tested (tests/unit/pulse.test.ts).
 *
 * Rules: the word of the day is always five letters; you have six guesses; no cue. After each guess every letter is
 * marked in words and by a symbol, never by color alone: in its place, in the word somewhere else, or not in it.
 */
import { gameName } from '../config/games';

/** Guesses a day. */
export const GUESSES = 6;

/** Every word of the day has exactly this many letters. */
export const WORD_LENGTH = 5;

/** Only puzzles whose word fits the rules (five lowercase letters) can be played; any other is skipped. */
export function playablePuzzles<T extends { word: string }>(puzzles: readonly T[]): T[] {
  return puzzles.filter((puzzle) => new RegExp(`^[a-z]{${WORD_LENGTH}}$`).test(puzzle.word));
}

/** How a letter of a guess compares with the word. */
export type Mark = 'here' | 'elsewhere' | 'absent';

/** The symbol shown under each letter, so the marks never depend on color. */
export const MARK_SYMBOL: Record<Mark, string> = { here: '●', elsewhere: '○', absent: '·' };

/** The words a screen reader hears for each mark. */
export const MARK_WORDS: Record<Mark, string> = {
  here: 'in place',
  elsewhere: 'elsewhere in the word',
  absent: 'not in the word',
};

export interface Guess {
  word: string;
  marks: Mark[];
}

export interface PulseState {
  answer: string;
  guesses: Guess[];
  status: 'playing' | 'solved' | 'out';
  /** Hard Mode (Task 719): every letter already shown in place or in the word must be used again. */
  hard?: boolean;
}

export function startPulse(answer: string): PulseState {
  return { answer: answer.toLowerCase(), guesses: [], status: 'playing' };
}

/** Guesses still available. */
export function guessesLeft(state: PulseState): number {
  return GUESSES - state.guesses.length;
}

/** Lowercases a typed guess and drops anything that isn't a letter. */
export function cleanGuess(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, '');
}

/** Why a guess can't be played yet, in plain words, or undefined when it can. */
export function guessProblem(guess: string, length: number): string | undefined {
  if (!/^[a-z]*$/.test(guess)) return 'use letters only.';
  if (guess.length !== length) return `the word has ${length} letters.`;
  return undefined;
}

/**
 * Marks each letter of a guess. A letter is "here" when it matches the word in that place. Otherwise it is
 * "elsewhere" only while the word still has an unmatched copy of that letter, counted from the left, so a doubled
 * letter in a guess never gets more marks than the word has copies.
 */
export function markGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array.from(guess, () => 'absent');
  const left = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'here';
    else left.set(answer[i]!, (left.get(answer[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'here') continue;
    const count = left.get(guess[i]!) ?? 0;
    if (count > 0) {
      marks[i] = 'elsewhere';
      left.set(guess[i]!, count - 1);
    }
  }
  return marks;
}

/** Hard Mode can be switched only before the first guess of the day. */
export function canSetHardMode(state: PulseState): boolean {
  return state.status === 'playing' && state.guesses.length === 0;
}

/** Turns Hard Mode on or off, or changes nothing once a guess has been played. */
export function setHardMode(state: PulseState, on: boolean): PulseState {
  if (!canSetHardMode(state) || Boolean(state.hard) === on) return state;
  return { ...state, hard: on };
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
const TIMES = ['', '', ' twice', ' three times', ' four times', ' five times'];

/**
 * Why a guess breaks Hard Mode, or undefined when it follows it: a letter shown in place must stay in that place, and a
 * letter shown in the word must be used again, as many times as one earlier guess showed it.
 */
export function hardModeProblem(guesses: readonly Guess[], word: string): string | undefined {
  for (const guess of guesses) {
    for (let i = 0; i < guess.word.length; i++) {
      if (guess.marks[i] === 'here' && word[i] !== guess.word[i]) {
        return `hard mode: the ${ORDINAL[i]} letter must be ${guess.word[i]}.`;
      }
    }
  }
  const needed = new Map<string, number>();
  for (const guess of guesses) {
    const shown = new Map<string, number>();
    Array.from(guess.word).forEach((letter, i) => {
      if (guess.marks[i] !== 'absent') shown.set(letter, (shown.get(letter) ?? 0) + 1);
    });
    for (const [letter, count] of shown) needed.set(letter, Math.max(needed.get(letter) ?? 0, count));
  }
  for (const [letter, count] of needed) {
    const used = Array.from(word).filter((each) => each === letter).length;
    if (used < count) return `hard mode: the guess must use ${letter}${TIMES[count] ?? ` ${count} times`}.`;
  }
  return undefined;
}

/**
 * Why a guess can't be played, in plain words, or undefined when it can. A word that isn't in the list (when one is
 * given) or that breaks Hard Mode never uses up a guess. The word of the day is always accepted.
 */
export function wordProblem(state: PulseState, guess: string, words?: ReadonlySet<string>): string | undefined {
  const shape = guessProblem(guess, state.answer.length);
  if (shape) return shape;
  if (words && guess !== state.answer && !words.has(guess)) {
    return `${guess} isn't in the word list. it didn't use a guess.`;
  }
  return state.hard ? hardModeProblem(state.guesses, guess) : undefined;
}

/** Plays a guess. A guess that can't be played, or one made after the game is over, changes nothing. */
export function playGuess(state: PulseState, text: string, words?: ReadonlySet<string>): PulseState {
  const word = cleanGuess(text);
  if (state.status !== 'playing' || wordProblem(state, word, words)) return state;
  const guesses = [...state.guesses, { word, marks: markGuess(word, state.answer) }];
  const next = { ...state, guesses };
  if (word === state.answer) return { ...next, status: 'solved' };
  return guessesLeft(next) <= 0 ? { ...next, status: 'out' } : next;
}

/** One guess in words for screen readers: "s, in place. l, not in the word. …". */
export function guessInWords(guess: Guess): string {
  return Array.from(guess.word, (letter, i) => `${letter}, ${MARK_WORDS[guess.marks[i]!]}`).join('. ') + '.';
}

/**
 * The best mark each letter has had so far, for the on-screen keyboard: in place beats elsewhere, which beats not in
 * the word.
 */
export function letterMarks(guesses: readonly Guess[]): Map<string, Mark> {
  const rank: Record<Mark, number> = { absent: 0, elsewhere: 1, here: 2 };
  const best = new Map<string, Mark>();
  for (const guess of guesses) {
    Array.from(guess.word).forEach((letter, i) => {
      const mark = guess.marks[i]!;
      const seen = best.get(letter);
      if (!seen || rank[mark] > rank[seen]) best.set(letter, mark);
    });
  }
  return best;
}

/**
 * What "share" copies: one plain line, with no colored squares and no grid. "cueory pillo, sun 1 nov: solved in 3 of 6"
 */
export function shareText(state: PulseState, day: string): string {
  const used = GUESSES - guessesLeft(state);
  const result = state.status === 'solved' ? `solved in ${used} of ${GUESSES}` : 'not solved this time';
  return `cueory ${gameName('pulse')}, ${day}: ${result}${state.hard ? ', hard mode' : ''}`;
}

/** Days from 1 November 2026 to a calendar date, in the visitor's own time zone. */
export function dayNumber(date: Date): number {
  const start = Date.UTC(2026, 10, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today - start) / 86_400_000);
}

/** Today's puzzle from a list, going round the list one a day. */
export function puzzleForDay<T>(puzzles: readonly T[], day: number): T | undefined {
  if (puzzles.length === 0) return undefined;
  return puzzles[((day % puzzles.length) + puzzles.length) % puzzles.length];
}

/** Milliseconds until the next local midnight, when the next puzzle opens. */
export function untilNextPuzzle(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

/** A wait in plain words, rounded up to the minute: "5 h 12 min", "40 min". */
export function waitInWords(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
