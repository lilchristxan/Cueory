/**
 * The words on sudoku's paper sheet (printed from /play/sudoku), a two-person paper game (Christian, 2026-11-25): page 1
 * is the guesser's grid with its given numbers, page 2 the keeper's rules and the solved grid. The level on the page is
 * named on both pages. Edit the text here: the page only lays it out. The rules are the game's own help
 * (src/islands/gamehelpcontent.ts).
 */
import { gameName } from './games';
import { site } from './site';

const name = gameName('triage');

/** The few words the grid pages draw in the browser, kept apart so the page's first load carries no more text than it needs. */
export const sudokuBoardText = {
  boardLabel: '9 by 9 sudoku grid',
  levelLine: (level: string, givens: number) => `${name} · ${level} · ${givens} given numbers`,
} as const;

export const sudokuSheet = {
  ...sudokuBoardText,
  /** The brand's own logo is the page heading: sudoku has no artwork of its own. */
  brand: site.wordmarkName,
  name,
  copyGuesser: "guesser's copy",
  copyKeeper: "keeper's copy",
  caption: 'fill each row, column and 3 by 3 box with 1 to 9, with no repeats.',
  footerOne: 'cueory.app · page 1 of 2',
  footerTwo: 'cueory.app · page 2 of 2',
  keeperLine: 'knows the solution and checks each number · keep this copy away from the guesser',
  howHeading: 'how to play',
  steps: [
    "two players. the guesser gets the guesser's copy. the keeper keeps this copy hidden.",
    'fill each row, column and 3 by 3 box with 1 to 9, with no repeats. the printed numbers are given.',
    'the guesser writes the rest in the empty squares, and the keeper checks them against the solved grid below the fold.',
  ],
  foldLabel: 'fold to hide answers',
  solvedLabel: 'solved grid',
  /** Shown instead of the solved grid until this level of today's sudoku is finished in this browser, and always without JavaScript. */
  locked: `finish today's ${name} to print the keeper's copy`,
} as const;
