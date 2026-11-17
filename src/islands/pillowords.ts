/**
 * The five-letter words pillo accepts as guesses (Task 719), from ./pillowords.txt (MIT-licensed list, notice in the
 * file). The list is loaded only when the game first needs it, so it never slows the page down.
 */
import { forbiddenGameWords } from '../config/games';
import { WORD_LENGTH } from './pulse';

/** Reads the list: one word a line; notes (#) and anything that isn't five lowercase letters are skipped. */
export function parseWordList(text: string): ReadonlySet<string> {
  const shape = new RegExp(`^[a-z]{${WORD_LENGTH}}$`);
  const avoid = new Set<string>(forbiddenGameWords);
  const words = new Set<string>();
  for (const line of text.split('\n')) {
    const word = line.trim();
    if (shape.test(word) && !avoid.has(word)) words.add(word);
  }
  return words;
}

let loading: Promise<ReadonlySet<string> | undefined> | undefined;

/** The word list, or undefined if it couldn't load (then any five letters are accepted, so play never stops). */
export function loadWordList(): Promise<ReadonlySet<string> | undefined> {
  loading ??= import('./pillowords.txt?raw').then(
    (module) => parseWordList(module.default),
    () => {
      loading = undefined;
      return undefined;
    },
  );
  return loading;
}
