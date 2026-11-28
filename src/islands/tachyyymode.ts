/**
 * tachyyy mode (Christian, 2026-11-26): on every page where a student guesses the answer, an optional countdown per
 * question. When it runs out, the question is marked not right and the next one comes up at once. Off until the
 * student turns it on; the time is theirs to set. The choice is kept on this device only (like the theme choice).
 * Pure logic, unit tested; the island is TachyyyMode.tsx.
 */
export const MIN_SECONDS = 5;
export const MAX_SECONDS = 120;
export const STEP_SECONDS = 5;
export const DEFAULT_SECONDS = 10;
export const STORAGE_KEY = 'cueory.tachyyy-mode';

export interface TachyyySettings {
  on: boolean;
  seconds: number;
}

export const defaultSettings: TachyyySettings = { on: false, seconds: DEFAULT_SECONDS };

/** A whole number of seconds inside the allowed range, on the 5-second grid. */
export function clampSeconds(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_SECONDS;
  const stepped = Math.round(n / STEP_SECONDS) * STEP_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, stepped));
}

/** One step longer or shorter, staying inside the range. */
export function stepSeconds(seconds: number, direction: 1 | -1): number {
  return clampSeconds(seconds + direction * STEP_SECONDS);
}

/** Saved text back into settings; anything unreadable gives the defaults (off). */
export function parseSettings(raw: string | null | undefined): TachyyySettings {
  if (!raw) return { ...defaultSettings };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return { ...defaultSettings };
    const record = value as Record<string, unknown>;
    return { on: record.on === true, seconds: clampSeconds(record.seconds) };
  } catch {
    return { ...defaultSettings };
  }
}

export function serializeSettings(settings: TachyyySettings): string {
  return JSON.stringify({ on: settings.on, seconds: clampSeconds(settings.seconds) });
}

/** Whole seconds left, never below zero, rounded up so the display reaches 0 exactly when time is up. */
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** The part of the bar still full, from 1 down to 0. */
export function barLeft(deadline: number, now: number, seconds: number): number {
  return Math.min(1, Math.max(0, (deadline - now) / (seconds * 1000)));
}

/** "0:06", "1:30". */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** "10 seconds", "1 minute", "1 minute 30 seconds". */
export function inWords(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts: string[] = [];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (rest || !minutes) parts.push(`${rest} ${rest === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}
