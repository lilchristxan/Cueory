/**
 * The words on vialo's paper sheet (printed from /play/wordpill), a two-person paper game (Christian, 2026-11-25): page 1 is the
 * guesser's board and alphabet, page 2 is the keeper's instructions and the word of the day. Edit the text here:
 * the page only lays it out. The three marks are the game's own (MARK_SYMBOL and MARK_WORDS in src/islands/pulse.ts).
 */
import { gameName } from './games';
import { GUESSES, WORD_LENGTH } from '../islands/pulse';

const name = gameName('vialo');

export const vialoSheet = {
  name,
  /** The page's title, for the tab and screen readers. */
  title: `${name} on paper`,
  /** On screen only: above the two pages. */
  copyGuesser: "guesser's copy",
  copyKeeper: "keeper's copy",
  caption: 'guess the five-letter word in six tries.',
  boardLabel: `empty board, ${WORD_LENGTH} letters by ${GUESSES} tries`,
  keysLabel: 'letters, to cross off by pen',
  footerOne: 'cueory.app · page 1 of 2',
  footerTwo: 'cueory.app · page 2 of 2',
  keeperLine: 'knows the word and marks each guess · keep this copy away from the guesser',
  howHeading: 'how to play',
  steps: [
    "two players. the guesser gets the guesser's copy. the keeper keeps this copy hidden.",
    'the guesser says a valid five-letter word and confirms the guess.',
    'the keeper writes the word in the next empty row of the pill pack.',
    'the keeper marks each letter:',
    `cross used letters off the alphabet. the guesser has ${GUESSES === 6 ? 'six' : GUESSES} tries.`,
  ],
  /** Step 4 holds the legend: three pen marks drawn on a sample letter. The kind names the drawing in the stylesheet. */
  markStep: 3,
  sampleLetter: 'a',
  marks: [
    { kind: 'line', words: 'not in the word', label: 'a line through the letter: not in the word' },
    { kind: 'cross', words: 'in the word, wrong column', label: 'an x over the letter: in the word, wrong column' },
    { kind: 'ring', words: 'correct column', label: 'a circle around the letter: correct column' },
  ],
  /** The dashed fold line above the answers, shared by every game's sheet. */
  foldLabel: 'fold to hide answers',
  wordLabel: 'word of the day',
  /** Shown instead of the word until today's vialo is finished in this browser, and always without JavaScript. */
  locked: `finish today's ${name} to print the keeper's copy`,
} as const;
