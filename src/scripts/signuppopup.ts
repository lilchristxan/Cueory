/**
 * The launch-updates pop-up (lane 14, Christian's request). Pure helpers, kept apart from the page script in
 * src/components/SignupPopup.astro so they can be unit tested (tests/unit/signup-popup.test.ts). The only thing
 * remembered is a time in this browser's local storage, which never reaches us.
 */
import type { KeyValueStorage } from './storage';

/** Local-storage key: when the pop-up was last shown or closed, in milliseconds since 1 January 1970. */
export const SIGNUP_POPUP_STORAGE_KEY = 'cueory-signup-popup-seen';

/** It appears this long after a page opens (counted while the page is on screen). */
export const POPUP_DELAY_MS = 10 * 1000;

/** After it has been shown or closed, it stays away this long. */
export const POPUP_WAIT_MS = 3 * 60 * 60 * 1000;

/**
 * Whether the pop-up may appear now. A browser that can't remember (storage missing or blocked) never sees it, because
 * it would otherwise come back on every page. A saved value that isn't a time, or a time more than the wait away in
 * either direction (a clock that was wrong), doesn't count.
 */
export function mayShowPopup(storage: KeyValueStorage | undefined, now: number, waitMs: number = POPUP_WAIT_MS): boolean {
  if (!storage) return false;
  let saved: string | null;
  try {
    saved = storage.getItem(SIGNUP_POPUP_STORAGE_KEY);
  } catch {
    return false;
  }
  if (saved === null || !/^\d+$/.test(saved.trim())) return true;
  return Math.abs(now - Number(saved)) >= waitMs;
}

/** Remembers that the pop-up was shown or closed. Returns false when this browser can't remember it. */
export function rememberPopup(storage: KeyValueStorage | undefined, now: number): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SIGNUP_POPUP_STORAGE_KEY, String(Math.round(now)));
    return true;
  } catch {
    return false;
  }
}

/** Lesson and study screens live under /learn: the pop-up never appears there. */
export function isStudyPath(pathname: string): boolean {
  return /^\/learn(?:[/.]|$)/.test(pathname);
}

/**
 * Each daily game has its own page under /play/ (the hub itself is /play). A modal over a game in progress would
 * interrupt it the way it would a lesson, so the pop-up stays off game pages too (lane 14 default; Christian can
 * change it).
 */
export function isGamePath(pathname: string): boolean {
  return /^\/play\/[^/]/.test(pathname);
}

/** Where the pop-up may appear: anywhere except lesson, study and game pages. */
export function popupAllowedOn(pathname: string): boolean {
  return !isStudyPath(pathname) && !isGamePath(pathname);
}
