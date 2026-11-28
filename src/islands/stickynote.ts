/**
 * When a glove note may appear (Christian's pop-up request, D-94; Task 50; message gloves, D-pending). Pure decisions:
 * no timers, no DOM, no storage calls inside `decideNote`. The page script (src/components/GloveNote.astro) measures
 * the visit and asks; this file answers. Internal names still say "sticky note" (the request started as one); every
 * visible word says "glove note".
 *
 * The rules, in short:
 * - Message notes (Christian, 24 Nov 2026): a message glove from the whole set (200-odd handwritten messages), on every
 *   page except game pages (/play and below) and the never-pages. The first comes 30 minutes after the visit starts,
 *   then every 30 minutes after the last one was shown, counted across page loads in the same tab. It waits for a pause
 *   and for nothing else to be open. The glove is random, never the same twice in a row, and not repeating until the
 *   whole set was used within the visit. This replaces the old "one break note after 25 minutes of active study, once
 *   per visit" (the timer-off path); the break timer's own notes below are unchanged.
 * - Welcome notes: marketing pages only, at most one per visit, never in the first 5 seconds, then after 8 seconds on
 *   screen or halfway down the page. What they say rotates between visits: the launch list (skipped once the visitor
 *   has joined or has an account), supporting our mission, a break idea; never the same as last visit's.
 * - Break notes (break timer on only): study pages, at a pause (3 seconds without interaction, or the end of a question
 *   set or step), when the timer says a break is due (its own snooze and skip decide the rest, #67). Closing a break
 *   note while the timer says a break is due snoozes it (the timer's own 5 minutes).
 * - Never on `/start`, the signup thank-you page, `/admin` or `/privacy` (page kind `never`), and never while the
 *   visitor is typing, dragging, mid-question, or has the menu panel, a preview or the account menu open.
 * - One note on screen at a time; a break note may replace a welcome note, never the other way round. Once a welcome
 *   or break note was shown (and so closed or left), no other note of that kind appears that visit, apart from the
 *   timer's.
 * - A browser that can't remember (session storage missing or blocked) gets at most one welcome or break note per page
 *   load; message notes still repeat, counted from the page load, because the page keeps the visit in memory.
 */
import type { KeyValueStorage } from '../scripts/storage';
import { type BreakState, snooze } from './breaks';

export type NoteKind = 'welcome' | 'break' | 'message';
export type WelcomeContent = 'launch-list' | 'mission' | 'break-idea';
/** `game`: /play and everything under it (no message note). `other`: any page that is none of the rest. */
export type PageKind = 'marketing' | 'study' | 'game' | 'other' | 'never';

/** The five glove photos (five colors, five angles). */
export const PHOTO_COUNT = 5;
/** No welcome note before this many seconds on screen. */
export const WELCOME_EARLIEST_SECONDS = 5;
/** A welcome note may appear after this many seconds on screen... */
export const WELCOME_AFTER_SECONDS = 8;
/** ...or once the visitor is this far down the page (0 at the top, 1 at the bottom). */
export const WELCOME_SCROLL = 0.5;
/** A message glove comes this many minutes after the visit starts, then this many after the last one was shown. */
export const MESSAGE_EVERY_MINUTES = 30;
const MESSAGE_EVERY_MS = MESSAGE_EVERY_MINUTES * 60 * 1000;
/** A pause: this many seconds without interaction. */
export const PAUSE_IDLE_SECONDS = 3;
/** The order welcome notes rotate in between visits. */
export const WELCOME_ROTATION: readonly WelcomeContent[] = ['launch-list', 'mission', 'break-idea'];

import { LAST_WELCOME_STORAGE_KEY, VISIT_STORAGE_KEY } from './stickynotekeys';

export { LAST_WELCOME_STORAGE_KEY, VISIT_STORAGE_KEY };

/** What this visit remembers. */
export interface Visit {
  /** The kinds of note already shown this visit (a shown note counts whether it was closed or left). */
  shown: NoteKind[];
  /** When the visit started (ms since 1970), or null before the page script has set it. */
  startedAt: number | null;
  /** When the last message glove was shown (ms), or null before the first. */
  lastMessageAt: number | null;
  /** Message gloves (0-based positions in the set) already used in this round of the set. */
  gloves: number[];
  /** The message glove shown last, so the next one is never the same. */
  lastGlove: number | null;
  /** The last glove photo used, 0 to 4, or null before the first note. */
  lastPhoto: number | null;
}

export interface Busy {
  typing: boolean;
  dragging: boolean;
  midQuestion: boolean;
  menuOpen: boolean;
  previewOpen: boolean;
  accountMenuOpen: boolean;
}

export interface NoteInput {
  visit: Visit;
  /** False when this browser can't keep the visit's memory; then `visit` covers this page load only. */
  remembered: boolean;
  page: PageKind;
  secondsOnScreen: number;
  /** How far down the page, 0 to 1. */
  scrollFraction: number;
  secondsIdle: number;
  /** At the end of a question set or a step. */
  atStepEnd: boolean;
  busy: Busy;
  timerOn: boolean;
  /** The break timer's own "a break is due" (only read when the timer is on). */
  timerBreakDue: boolean;
  /** The note on screen now, if any. */
  noteOnScreen: NoteKind | null;
  joinedLaunchList: boolean;
  hasAccount: boolean;
  /** What the last visit's welcome note said, if anything. */
  lastWelcome: WelcomeContent | null;
  /** A number from 0 (inclusive) to 1 (exclusive), like Math.random; tests pass a fixed one. */
  random: () => number;
  /** The current time in ms since 1970 (a test passes a fixed one). */
  now: number;
  /** How many message gloves exist. Zero (the list isn't loaded) means no message note. */
  gloveCount: number;
}

export type NoteDecision =
  | { show: false }
  | { show: true; kind: 'welcome'; photoIndex: number; content: WelcomeContent }
  | { show: true; kind: 'break'; photoIndex: number }
  | { show: true; kind: 'message'; gloveIndex: number };

const NOTHING: NoteDecision = { show: false };

function isBusy(busy: Busy): boolean {
  return busy.typing || busy.dragging || busy.midQuestion || busy.menuOpen || busy.previewOpen || busy.accountMenuOpen;
}

function validPhoto(index: unknown): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < PHOTO_COUNT;
}

/** A random index from 0 to `count - 1`, safe against a `random` that returns something outside 0..1. */
function pick(count: number, random: () => number): number {
  const value = random();
  const unit = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1 - Number.EPSILON) : 0;
  return Math.floor(unit * count);
}

/** The next glove photo: any of the five, never the one used last. */
export function nextPhoto(lastPhoto: number | null, random: () => number): number {
  if (!validPhoto(lastPhoto)) return pick(PHOTO_COUNT, random);
  const others = Array.from({ length: PHOTO_COUNT }, (_, index) => index).filter((index) => index !== lastPhoto);
  return others[pick(others.length, random)]!;
}

/**
 * What this visit's welcome note says: the next one in the rotation after last visit's, skipping the launch list once
 * the visitor has joined it or has an account. Never the same as last visit's.
 */
export function nextWelcome(
  lastWelcome: WelcomeContent | null,
  joinedLaunchList: boolean,
  hasAccount: boolean,
): WelcomeContent {
  const launchListOpen = !joinedLaunchList && !hasAccount;
  const available = WELCOME_ROTATION.filter((content) => content !== 'launch-list' || launchListOpen);
  const start = lastWelcome === null ? -1 : WELCOME_ROTATION.indexOf(lastWelcome);
  for (let step = 1; step <= WELCOME_ROTATION.length; step += 1) {
    const candidate = WELCOME_ROTATION[(start + step) % WELCOME_ROTATION.length]!;
    if (available.includes(candidate) && candidate !== lastWelcome) return candidate;
  }
  return available[0]!;
}

function atPause(input: NoteInput): boolean {
  return input.atStepEnd || input.secondsIdle >= PAUSE_IDLE_SECONDS;
}

function breakDue(input: NoteInput): boolean {
  if (input.page !== 'study' || input.noteOnScreen === 'break') return false;
  if (!atPause(input)) return false;
  // With the timer off there is no break note: the message glove (every 30 minutes) took its place.
  return input.timerOn && input.timerBreakDue;
}

/** The moment the next message glove is counted from: the last one shown, else the start of the visit. */
function messageAnchor(visit: Visit): number | null {
  return visit.lastMessageAt ?? visit.startedAt;
}

/** Whether 30 minutes have passed since the visit started or the last message glove (the page script loads the list of gloves only then). */
export function messageTimeDue(visit: Visit, now: number): boolean {
  const anchor = messageAnchor(visit);
  return anchor !== null && now - anchor >= MESSAGE_EVERY_MS;
}

function messageDue(input: NoteInput): boolean {
  if (input.page === 'never' || input.page === 'game' || input.noteOnScreen !== null || input.gloveCount < 1) return false;
  return atPause(input) && messageTimeDue(input.visit, input.now);
}

/**
 * The next message glove: any of `count`, never the one shown last, and none twice until every glove was used in
 * this round (then a new round starts). With only one glove it repeats, because it has to.
 */
export function nextGlove(visit: Pick<Visit, 'gloves' | 'lastGlove'>, count: number, random: () => number): number {
  const roundOver = visit.gloves.filter((index) => index < count).length >= count;
  const used = roundOver ? [] : visit.gloves;
  let pool = Array.from({ length: count }, (_, index) => index).filter((index) => !used.includes(index));
  if (pool.length > 1) pool = pool.filter((index) => index !== visit.lastGlove);
  return pool[pick(pool.length, random)]!;
}

/** Sets the start of the visit if it has none yet. */
export function startVisit(visit: Visit, now: number): Visit {
  return visit.startedAt === null ? { ...visit, startedAt: now } : visit;
}

const GAME_PATH = /^\/play(?:\/|$)/;
// /breaks is the page a message glove links to, so a glove there would only point at the page you are reading.
const NEVER_PATHS = new Set(['/start', '/subscribed', '/privacy', '/breaks']);
const STUDY_PATH = /^\/learn(?:\/|$)/;
const MARKETING_PATHS = new Set(['/', '/about', '/support', '/courses', '/resources', '/terms', '/disclaimer', '/coming-soon']);

/** What kind of page a path is. Static hosting may show /privacy as /privacy.html; both count. */
export function pageKindFor(pathname: string): PageKind {
  const path = (pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/+$/, '') || '/');
  if (NEVER_PATHS.has(path) || path === '/admin' || path.startsWith('/admin/')) return 'never';
  if (GAME_PATH.test(path)) return 'game';
  if (STUDY_PATH.test(path)) return 'study';
  return MARKETING_PATHS.has(path) ? 'marketing' : 'other';
}

function welcomeDue(input: NoteInput): boolean {
  if (input.page !== 'marketing' || input.noteOnScreen !== null) return false;
  if (input.visit.shown.includes('welcome')) return false;
  if (input.secondsOnScreen < WELCOME_EARLIEST_SECONDS) return false;
  return input.secondsOnScreen >= WELCOME_AFTER_SECONDS || input.scrollFraction >= WELCOME_SCROLL;
}

/** Whether a glove note should appear now, and which. */
export function decideNote(input: NoteInput): NoteDecision {
  if (input.page === 'never' || isBusy(input.busy)) return NOTHING;
  // A browser that can't remember gets at most one note per page load.
  if (messageDue(input)) {
    return { show: true, kind: 'message', gloveIndex: nextGlove(input.visit, input.gloveCount, input.random) };
  }
  if (!input.remembered && input.visit.shown.some((kind) => kind !== 'message')) return NOTHING;
  if (breakDue(input)) return { show: true, kind: 'break', photoIndex: nextPhoto(input.visit.lastPhoto, input.random) };
  if (welcomeDue(input)) {
    return {
      show: true,
      kind: 'welcome',
      photoIndex: nextPhoto(input.visit.lastPhoto, input.random),
      content: nextWelcome(input.lastWelcome, input.joinedLaunchList, input.hasAccount),
    };
  }
  return NOTHING;
}

/** The visit's memory after a note was shown. */
export function recordShown(visit: Visit, decision: NoteDecision, now: number = Date.now(), gloveCount = 0): Visit {
  if (!decision.show) return visit;
  if (decision.kind === 'message') {
    const roundOver = gloveCount > 0 && visit.gloves.filter((index) => index < gloveCount).length >= gloveCount;
    return {
      ...visit,
      shown: visit.shown.includes('message') ? [...visit.shown] : [...visit.shown, 'message'],
      lastMessageAt: now,
      gloves: [...(roundOver ? [] : visit.gloves), decision.gloveIndex],
      lastGlove: decision.gloveIndex,
    };
  }
  return {
    ...visit,
    shown: visit.shown.includes(decision.kind) ? [...visit.shown] : [...visit.shown, decision.kind],
    lastPhoto: decision.photoIndex,
  };
}

/** A visit with nothing shown yet. */
export function emptyVisit(): Visit {
  return { shown: [], lastPhoto: null, startedAt: null, lastMessageAt: null, gloves: [], lastGlove: null };
}

/** Reads the visit's memory strictly; anything unreadable or malformed is a fresh visit. */
export function readVisit(storage: KeyValueStorage | undefined): Visit {
  if (!storage) return emptyVisit();
  let raw: string | null;
  try {
    raw = storage.getItem(VISIT_STORAGE_KEY);
  } catch {
    return emptyVisit();
  }
  if (raw === null) return emptyVisit();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyVisit();
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return emptyVisit();
  const { shown, lastPhoto, startedAt, lastMessageAt, gloves, lastGlove } = data as Record<string, unknown>;
  if (!Array.isArray(shown) || shown.some((kind) => kind !== 'welcome' && kind !== 'break' && kind !== 'message')) return emptyVisit();
  if (lastPhoto !== null && !validPhoto(lastPhoto)) return emptyVisit();
  // Older saves have none of the message fields: they read as "not set".
  const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
  const index = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100000 ? value : null);
  const used = Array.isArray(gloves) ? gloves.filter((value): value is number => index(value) !== null).slice(0, 1000) : [];
  return {
    shown: [...new Set(shown as NoteKind[])],
    lastPhoto: lastPhoto as number | null,
    startedAt: time(startedAt),
    lastMessageAt: time(lastMessageAt),
    gloves: [...new Set(used)],
    lastGlove: index(lastGlove),
  };
}

/** Saves the visit's memory. Returns false when this browser can't remember it. */
export function writeVisit(storage: KeyValueStorage | undefined, visit: Visit): boolean {
  if (!storage) return false;
  try {
    storage.setItem(VISIT_STORAGE_KEY, JSON.stringify(visit));
    return true;
  } catch {
    return false;
  }
}

/** What the last visit's welcome note said, or null if nothing (or nothing readable) is saved. */
export function readLastWelcome(storage: KeyValueStorage | undefined): WelcomeContent | null {
  if (!storage) return null;
  try {
    const saved = storage.getItem(LAST_WELCOME_STORAGE_KEY);
    return WELCOME_ROTATION.includes(saved as WelcomeContent) ? (saved as WelcomeContent) : null;
  } catch {
    return null;
  }
}

/** Saves what this visit's welcome note said. Returns false when this browser can't remember it. */
export function writeLastWelcome(storage: KeyValueStorage | undefined, content: WelcomeContent): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LAST_WELCOME_STORAGE_KEY, content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the timer state after closing a break note. When the timer is in `break due`, it snoozes (5 minutes of
 * focus time) so the note does not re-appear at the next pause. All other statuses are returned unchanged.
 */
export function closeBreakNote(timer: BreakState, now: number): BreakState {
  return timer.status === 'break due' ? snooze(timer, now) : timer;
}
