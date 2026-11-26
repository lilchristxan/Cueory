/**
 * The words on piccline's paper sheet (printed from /play/piccline), a two-person paper game (Christian, 2026-11-25):
 * page 1 is the guesser's board with a numbered list to write the answers on, page 2 the keeper's rules and answers.
 * Edit the text here: the page only lays it out. The rules are the game's own (src/islands/gamehelpcontent.ts).
 */
import { gameName } from './games';

const name = gameName('piccline');

/** The few words the board's page draws in the browser: kept apart so the page's first load carries no more text than it needs. */
export const picclineBoardText = {
  clueLabel: "today's cue",
  boardLabel: 'letter board, 6 columns by 8 rows',
  listTitle: (count: number) => `${count} ${count === 1 ? 'word' : 'words'} to find`,
} as const;

export const picclineSheet = {
  ...picclineBoardText,
  name,
  copyGuesser: "guesser's copy",
  copyKeeper: "keeper's copy",
  caption: 'find each word on the board. draw a line through its letters and tick it off.',
  footerOne: 'cueory.app · page 1 of 2',
  footerTwo: 'cueory.app · page 2 of 2',
  keeperLine: 'knows the answers and checks each one · keep this copy away from the guesser',
  howHeading: 'how to play',
  steps: [
    "two players. the guesser gets the guesser's copy. the keeper keeps this copy hidden.",
    'every letter belongs to exactly one answer. one answer, the thread, names the theme and runs from one side of the board to the other.',
    'an answer runs through touching letters: up, down, sideways or diagonally. it can turn, and it never uses the same letter twice.',
    'the guesser draws a line through the letters of each answer found, and ticks its word off the list.',
  ],
  foldLabel: 'fold to hide answers',
  answersLabel: 'answers',
  threadTag: 'the thread',
  pathLabel: (number: number, word: string) => `answer ${number}: ${word}`,
  /** Shown instead of the answers until today's piccline is finished in this browser, and always without JavaScript. */
  locked: `finish today's ${name} to print the keeper's copy`,
} as const;
