/**
 * Every browser storage key Cueory uses, in one list: its name, where the browser keeps it, what it holds and why.
 * Delete-my-account clears from this list (src/islands/deleteaccount.ts), and tests/unit/privacy-keys.test.ts checks
 * that /privacy names every key here. Adding a key: add it here, describe it on /privacy, and the tests do the rest.
 *
 * Names come from the module that uses each key, so this list can never spell one differently.
 */
import { BREAK_STORAGE_KEY } from '../scripts/breakstore';
import { NOTE_SOUND_STORAGE_KEY } from '../scripts/notesound';
import { legacyStarsKey, PROGRESS_STORAGE_KEY } from '../scripts/progress';
import { PROMO_STORAGE_KEY } from '../scripts/promo';
import { RESUME_STORAGE_KEY } from '../scripts/resume';
import { SIGNUP_POPUP_STORAGE_KEY } from '../scripts/signuppopup';
import { THEME_STORAGE_KEY } from '../scripts/theme';
import { CROSSWORD_SETTINGS_KEY } from '../islands/cuewordkeys';
import { STATS_STORAGE_KEY, SUDOKU_STATS_STORAGE_KEY } from '../islands/gameresults';
import { GAME_SETTINGS_STORAGE_KEY } from '../islands/gamesettings';
import { GAME_HELP_STORAGE_KEY } from '../islands/gamehelpkeys';
import { GUEST_IMPORT_MARKER_PREFIX } from '../islands/guestimportrun';
import { HOME_TIP_STORAGE_KEY } from '../islands/home-screen-tip';
import { LAST_WELCOME_STORAGE_KEY, VISIT_STORAGE_KEY } from '../islands/stickynote';
import { SUDOKU_SETTINGS_KEY } from '../islands/sudoku';
import { SURVEY_STORAGE_KEYS } from '../islands/surveykeys';
import {
  AUTH_STORAGE_KEY, PKCE_FLOW_LIST_STORAGE_KEY, PKCE_VERIFIER_STORAGE_KEY, pkceFlowStorageKey,
} from '../islands/supabaseclient';

export interface StorageKey {
  /** The exact key. For a family of keys, the name as /privacy shows it, with a <placeholder> for the varying part. */
  name: string;
  /** For a family of keys: the fixed start every key in it shares. */
  prefix?: string;
  /** local: localStorage, stays until cleared. session: sessionStorage, this tab only. */
  storage: 'local' | 'session';
  /** What it holds, in plain words. */
  holds: string;
  /** Why the site keeps it. */
  purpose: string;
  /** What delete-my-account does with it. sign-out: signing out removes it (deletion signs out). */
  onDeletion: 'cleared' | 'sign-out';
}

export const storageKeys: readonly StorageKey[] = Object.freeze([
  { name: PROGRESS_STORAGE_KEY, storage: 'local', holds: 'setup answers, card piles and stars', purpose: 'keep study progress on this device', onDeletion: 'cleared' },
  { name: legacyStarsKey('<deck>'), prefix: legacyStarsKey(''), storage: 'local', holds: 'older per-deck stars', purpose: 'keep stars saved before they moved into the progress record', onDeletion: 'cleared' },
  { name: RESUME_STORAGE_KEY, storage: 'local', holds: 'the activity, page and question you were on, with your answers so far', purpose: 'let you pick up where you stopped', onDeletion: 'cleared' },
  { name: PROMO_STORAGE_KEY, storage: 'local', holds: 'when the launch-list panel was shown', purpose: 'keep the panel away for a while', onDeletion: 'cleared' },
  { name: SIGNUP_POPUP_STORAGE_KEY, storage: 'local', holds: 'when the launch-updates pop-up was last shown or closed', purpose: 'show the pop-up at most once every 3 hours', onDeletion: 'cleared' },
  { name: THEME_STORAGE_KEY, storage: 'local', holds: 'Light or Dark, when you pick one', purpose: 'remember your theme pick', onDeletion: 'cleared' },
  { name: STATS_STORAGE_KEY, storage: 'local', holds: 'daily game results, when stats are on', purpose: 'show game stats and streaks', onDeletion: 'cleared' },
  { name: SUDOKU_STATS_STORAGE_KEY, storage: 'local', holds: 'sudoku solve days, levels and times, when stats are on', purpose: 'show sudoku stats per level', onDeletion: 'cleared' },
  { name: CROSSWORD_SETTINGS_KEY, storage: 'local', holds: 'crossword settings', purpose: 'remember crossword settings', onDeletion: 'cleared' },
  { name: SUDOKU_SETTINGS_KEY, storage: 'local', holds: 'sudoku settings', purpose: 'remember sudoku settings', onDeletion: 'cleared' },
  { name: GAME_SETTINGS_STORAGE_KEY, storage: 'local', holds: 'high contrast, reduced motion and game sounds', purpose: 'remember the shared game settings', onDeletion: 'cleared' },
  { name: GAME_HELP_STORAGE_KEY, storage: 'local', holds: "which daily games' rules you've seen (game names only)", purpose: "stop showing a game's first-visit rules once you've seen them", onDeletion: 'cleared' },
  { name: HOME_TIP_STORAGE_KEY, storage: 'local', holds: 'up to three days you finished a puzzle, and whether you dismissed the tip', purpose: 'decide when to suggest adding cueory to the home screen', onDeletion: 'cleared' },
  { name: LAST_WELCOME_STORAGE_KEY, storage: 'local', holds: 'the previous welcome note', purpose: 'show a different one next visit', onDeletion: 'cleared' },
  { name: NOTE_SOUND_STORAGE_KEY, storage: 'local', holds: 'whether glove-note sounds are on', purpose: 'remember the glove-note sound choice', onDeletion: 'cleared' },
  ...SURVEY_STORAGE_KEYS.map((name) => ({ name, storage: 'local' as const, holds: 'that you closed the survey prompt', purpose: 'keep the prompt closed', onDeletion: 'cleared' as const })),
  { name: `${GUEST_IMPORT_MARKER_PREFIX}<id>`, prefix: GUEST_IMPORT_MARKER_PREFIX, storage: 'local', holds: "that this browser's progress was imported into an account, or that you said no", purpose: 'ask only once per account', onDeletion: 'cleared' },
  { name: AUTH_STORAGE_KEY, storage: 'local', holds: 'your sign-in session', purpose: 'keep you signed in', onDeletion: 'sign-out' },
  { name: PKCE_VERIFIER_STORAGE_KEY, storage: 'local', holds: 'a one-time sign-in check', purpose: 'finish a sign-in safely', onDeletion: 'cleared' },
  { name: PKCE_FLOW_LIST_STORAGE_KEY, storage: 'local', holds: 'the list of sign-ins in progress', purpose: 'finish a sign-in safely', onDeletion: 'cleared' },
  { name: pkceFlowStorageKey('<id>'), prefix: `${AUTH_STORAGE_KEY}-flow-`, storage: 'local', holds: 'a one-time sign-in check for one sign-in', purpose: 'finish a sign-in safely', onDeletion: 'cleared' },
  { name: VISIT_STORAGE_KEY, storage: 'session', holds: 'which glove notes appeared during this visit', purpose: 'not repeat a note', onDeletion: 'cleared' },
  { name: BREAK_STORAGE_KEY, storage: 'session', holds: "your break timer's state, for up to two hours", purpose: 'keep the timer through a reload', onDeletion: 'cleared' },
] satisfies StorageKey[]);

/** localStorage keys with a fixed name that deletion clears. */
export function fixedLocalKeysToClear(keys: readonly StorageKey[] = storageKeys): string[] {
  return keys.filter((key) => key.storage === 'local' && key.onDeletion === 'cleared' && !key.prefix).map((key) => key.name);
}

/** The fixed starts of localStorage key families that deletion clears. */
export function localPrefixesToClear(keys: readonly StorageKey[] = storageKeys): string[] {
  return keys.filter((key) => key.storage === 'local' && key.onDeletion === 'cleared' && key.prefix).map((key) => key.prefix!);
}

/** sessionStorage keys deletion clears in this tab. */
export function sessionKeysToClear(keys: readonly StorageKey[] = storageKeys): string[] {
  return keys.filter((key) => key.storage === 'session' && key.onDeletion === 'cleared').map((key) => key.name);
}
