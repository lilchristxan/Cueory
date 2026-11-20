/**
 * How to play, for every daily game (issue #736; docs/GAMES-PARITY.md, "All games"). Pure data and helpers, so they can
 * be unit tested without a browser. The React side is GameHelp.tsx.
 *
 * The rules show on a game's first visit, as a card above its board with a "got it" button, and from then on behind the
 * game's "?" button, in a dialog. All four games share one page (/play), so four dialogs opening at once on a first
 * visit would stack; a card per game keeps the page usable and still shows the rules before the first move.
 *
 * The help describes only how to play and the settings: no clinical facts, no answers.
 *
 * "Seen" is kept in this browser only, under cueory-game-help-seen, as a list of game ids, and never sent to us. A
 * missing, malformed or blocked value counts as not seen, so the card shows again: harmless, it is only the rules.
 */
import type { KeyValueStorage } from '../scripts/storage';
import { GAME_HELP_STORAGE_KEY } from './gamehelpkeys';
import { GUESSES, MARK_SYMBOL, WORD_LENGTH } from './pulse';
import { crosswordLevels } from './cueword';
import { MIN_WORD, WORDS_PER_HINT } from './suturepath';
import { gameName } from '../config/games';

export { GAME_HELP_STORAGE_KEY };

/** The four daily games, by their ids in src/config/games.ts. */
export const HELP_GAMES = ['vialo', 'triage', 'cueword', 'suture'] as const;
export type HelpGame = (typeof HELP_GAMES)[number] | 'pulse';

/** Which help text to show. Word path has two board formats, so it has two texts but one "seen" mark. */
export type HelpTopic = HelpGame | 'suture-search';

export interface GameHelpContent {
  /** The game the "seen" mark belongs to. */
  game: HelpGame;
  /** How to play, one step per line. */
  play: readonly string[];
  /** Where the game's own settings are, or that it has none. */
  settingsIntro: string;
  /** The game's own settings: a name and what it does. */
  settings: ReadonlyArray<{ name: string; detail: string }>;
}

/** Said in every game's help: the shared panel (issue #734) sits at the top of /play. */
export const SHARED_SETTINGS_NOTE =
  'theme, high contrast, motion and game sounds are shared by every game. change them with the gear at the top left of a game (on sudoku, with game settings above the game).';

const sizes = crosswordLevels.map(({ level, size }) => `${level} is ${size} by ${size}`).join(', ');

export const GAME_HELP: Readonly<Record<HelpTopic, GameHelpContent>> = Object.freeze({
  vialo: {
    game: 'vialo',
    play: [
      `guess the ${WORD_LENGTH}-letter word in ${GUESSES} guesses. there's one word a day.`,
      'type a word and press enter, or tap the letters below the board.',
      `after each guess every letter gets a mark: ${MARK_SYMBOL.here} in its place, ${MARK_SYMBOL.elsewhere} in the word but somewhere else, ${MARK_SYMBOL.absent} not in the word. the letter keys show the same marks.`,
      'a letter you use twice is marked twice only if the word has it twice.',
      "a word that isn't in the word list doesn't use up a guess.",
      'when you finish you see your result, a one-line share and the time until the next word.',
    ],
    settingsIntro: `${gameName('vialo')} settings are behind the gear at the top left. hard mode and on-screen keyboard only last for this visit.`,
    settings: [
      { name: 'hard mode', detail: 'letters shown in place or in the word must be used in every later guess. you can change it only before your first guess of the day.' },
      { name: 'on-screen keyboard only', detail: 'only the letter keys below type, so your device keyboard stays closed.' },
    ],
  },
  pulse: {
    game: 'pulse',
    play: [
      `guess the ${WORD_LENGTH}-letter word in ${GUESSES} guesses. there's one word a day.`,
      'type a word and press enter, or tap the letters below the board.',
      `after each guess every letter gets a mark: ${MARK_SYMBOL.here} in its place, ${MARK_SYMBOL.elsewhere} in the word but somewhere else, ${MARK_SYMBOL.absent} not in the word. the letter keys show the same marks.`,
      'a letter you use twice is marked twice only if the word has it twice.',
      "a word that isn't in the word list doesn't use up a guess.",
      'when you finish you see your result, a one-line share and the time until the next word.',
    ],
    settingsIntro: `${gameName('pulse')} settings are behind the gear at the top left. hard mode and on-screen keyboard only last for this visit.`,
    settings: [
      { name: 'hard mode', detail: 'letters shown in place or in the word must be used in every later guess. you can change it only before your first guess of the day.' },
      { name: 'on-screen keyboard only', detail: 'only the letter keys below type, so your device keyboard stays closed.' },
    ],
  },
  triage: {
    game: 'triage',
    play: [
      'fill each row, column and 3 by 3 box with 1 to 9, with no repeats.',
      'pick easy, mid or hard. each level has one puzzle a day.',
      'pick a square, then type or tap a number. arrow keys move between squares.',
      'normal mode fills the square; cue mode adds small cue numbers. space switches modes, and holding shift switches for that moment. auto cues fills them in for you.',
      'undo takes back your last move, clear empties the square (backspace does too), and check puzzle marks wrong squares with a slash. x adds your own mark.',
      'pause hides every number, the original ones too, until you press play. leaving the page pauses it for you.',
    ],
    settingsIntro: 'sudoku settings are behind the gear button above the board. they stay on this device.',
    settings: [
      { name: 'check guesses when entered', detail: 'marks a wrong number as soon as you enter it, and adds it to the error counter.' },
      { name: 'start in auto cue mode', detail: 'fills in cue numbers when a puzzle starts.' },
      { name: 'show error counter', detail: 'counts the wrong numbers you enter.' },
      { name: 'show timer', detail: 'shows the time above the board.' },
      { name: 'highlight conflicts', detail: 'marks numbers that repeat in a row, column or box.' },
      { name: 'highlight row and column', detail: 'shades the row and column of the square you picked.' },
      { name: 'highlight box', detail: 'shades the 3 by 3 box of the square you picked.' },
      { name: 'highlight identical numbers', detail: 'shades every square with the same number as the one you picked.' },
      { name: 'play sound on solve', detail: 'a short sound when you finish.' },
    ],
  },
  cueword: {
    game: 'cueword',
    play: [
      `pick a level: ${sizes}.`,
      'tap a square and type, or use the letter buttons.',
      'tap the selected square again, or press space, to switch across and down. an arrow against the current direction switches direction first, then moves.',
      'tab and shift+tab go to the next or previous cue. backspace deletes. tab on the last cue, shift+tab on the first, or escape leaves the grid.',
      'check and reveal work on a square, a word or the whole puzzle. a solve with them still counts, but only a solve without them, within 48 hours of the puzzle\'s date, extends your streak.',
      "if every square is filled and it isn't solved yet, the game says something's not right yet.",
      'blocked squares are striped. pause hides your letters and stops the timer. show cue list lists every cue, and the printer button makes a blank grid with the complete cue list.',
    ],
    settingsIntro: 'crossword settings are behind the gear at the top left. they stay on this device.',
    settings: [
      { name: 'autocheck', detail: "marks each letter right or wrong as you type. it counts as help, so the solve won't extend your streak." },
      { name: 'skip filled squares', detail: 'typing passes over squares that already have a letter.' },
      { name: 'jump back', detail: 'at the end of a word, go back to its first blank square.' },
      { name: 'jump to the next cue', detail: 'when a word is full, go to the next cue with a blank square.' },
      { name: 'show the timer', detail: 'shows the time beside the pause button.' },
      { name: 'sound when solved', detail: 'a short sound when you finish.' },
      { name: 'cue text size', detail: 'small, medium or large.' },
    ],
  },
  suture: {
    game: 'suture',
    play: [
      'find every answer on the board. each letter belongs to exactly one answer.',
      'answers run through touching letters, up, down, sideways or diagonally, and can turn. a path never uses the same letter twice.',
      'one answer, the thread, names the theme and runs from one side of the board to the other. found theme words get a dot, and the thread gets a diamond.',
      'drag across the letters, or tap them one by one and press submit. tapping the last letter again also submits, and clear starts over.',
      'on a keyboard, arrows move, enter or space adds a letter, enter on the last letter submits, backspace takes one back and escape clears.',
      `every ${WORDS_PER_HINT} other words of ${MIN_WORD} letters or more earn a cue. a cue marks the letters of one answer, and a second cue on it numbers them in order. there's no limit on guesses.`,
    ],
    settingsIntro: `${gameName('suture')} has no settings of its own; its gear at the top left holds the shared ones.`,
    settings: [],
  },
  'suture-search': {
    game: 'suture',
    play: [
      'find every word in the list. words run up, down, left or right.',
      "tap a word's first letter, then its last letter. tap the first letter again to start over.",
      'on a keyboard, arrows move, enter or space picks, and escape clears.',
    ],
    settingsIntro: `${gameName('suture')} has no settings of its own; its gear at the top left holds the shared ones.`,
    settings: [],
  },
});

const VALID_HELP_GAMES: readonly string[] = ['pulse', ...HELP_GAMES];

/** Only known game ids are kept; anything else in the saved value is ignored. */
export function parseHelpSeen(raw: string | null | undefined): Set<HelpGame> {
  if (!raw) return new Set();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((id): id is HelpGame => VALID_HELP_GAMES.includes(id as string)));
}

export function helpSeen(storage: KeyValueStorage | undefined, game: HelpGame): boolean {
  try {
    const seen = parseHelpSeen(storage?.getItem(GAME_HELP_STORAGE_KEY));
    if (seen.has(game)) return true;
    if (game === 'vialo' && seen.has('pulse')) return true;
    return false;
  } catch {
    return false;
  }
}

/** Remembers that this game's rules were seen. Blocked storage is ignored: the card just shows again next visit. */
export function markHelpSeen(storage: KeyValueStorage | undefined, game: HelpGame): void {
  try {
    const seen = parseHelpSeen(storage?.getItem(GAME_HELP_STORAGE_KEY));
    if (seen.has(game)) return;
    seen.add(game);
    if (game === 'vialo') seen.add('pulse');
    storage?.setItem(GAME_HELP_STORAGE_KEY, JSON.stringify(VALID_HELP_GAMES.filter((id) => seen.has(id as HelpGame))));
  } catch {
    // Not remembered.
  }
}
