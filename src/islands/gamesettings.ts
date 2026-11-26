/**
 * Shared settings for every daily game (docs/GAMES-PARITY.md, "All games"; issue #734): high contrast, reduced motion
 * and sound. Theme is not stored here: the panel's theme rows drive the site's own footer switch (sitetheme.ts), so
 * there is only one theme system and one theme key (cueory-theme).
 *
 * Pure helpers, so they can be unit tested without a browser. The React side is GameSettings.tsx.
 *
 * Stored in this browser only, under cueory-game-settings, and never sent to us. A missing, malformed or blocked value
 * falls back to the defaults: normal contrast, follow the device's reduced-motion setting, sound on (each game's own
 * "sound on solve" setting still has to agree, see gameSoundAllowed).
 */
import type { KeyValueStorage } from '../scripts/storage';

export const GAME_SETTINGS_STORAGE_KEY = 'cueory-game-settings';

/** Fired on window after a change, so every open game (and every open panel) picks it up at once. */
export const GAME_SETTINGS_EVENT = 'cueory:game-settings';

/** "device" follows prefers-reduced-motion; "reduce" always reduces. There is no way to force motion on. */
export type MotionChoice = 'device' | 'reduce';

export interface SharedGameSettings {
  highContrast: boolean;
  motion: MotionChoice;
  sound: boolean;
  /** Vialo's "time: m:ss" line on the board (Christian, 25 Nov 2026). On by default; the timer still runs when hidden. */
  showTimer: boolean;
}

export const DEFAULT_GAME_SETTINGS: Readonly<SharedGameSettings> = Object.freeze({
  highContrast: false,
  motion: 'device',
  sound: true,
  showTimer: true,
});

export const MOTION_ROWS: ReadonlyArray<{ value: MotionChoice; label: string; detail: string }> = [
  { value: 'device', label: 'follow device', detail: 'less motion only if your device asks for it.' },
  { value: 'reduce', label: 'always reduce', detail: 'no sliding, flipping or fading in the games.' },
];

/** Only exact saved values are understood; anything else keeps its default. */
export function parseGameSettings(raw: string | null | undefined): SharedGameSettings {
  if (!raw) return { ...DEFAULT_GAME_SETTINGS };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_GAME_SETTINGS };
  const saved = value as Record<string, unknown>;
  return {
    highContrast: typeof saved.highContrast === 'boolean' ? saved.highContrast : DEFAULT_GAME_SETTINGS.highContrast,
    motion: saved.motion === 'reduce' || saved.motion === 'device' ? saved.motion : DEFAULT_GAME_SETTINGS.motion,
    sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULT_GAME_SETTINGS.sound,
    showTimer: typeof saved.showTimer === 'boolean' ? saved.showTimer : DEFAULT_GAME_SETTINGS.showTimer,
  };
}

export function loadGameSettings(storage: KeyValueStorage | undefined): SharedGameSettings {
  try {
    return parseGameSettings(storage?.getItem(GAME_SETTINGS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

function isDefault(settings: SharedGameSettings): boolean {
  return settings.highContrast === DEFAULT_GAME_SETTINGS.highContrast
    && settings.motion === DEFAULT_GAME_SETTINGS.motion
    && settings.sound === DEFAULT_GAME_SETTINGS.sound
    && settings.showTimer === DEFAULT_GAME_SETTINGS.showTimer;
}

/** Defaults are not stored, so a visitor who never changes anything has nothing saved. Blocked storage is ignored. */
export function saveGameSettings(storage: KeyValueStorage | undefined, settings: SharedGameSettings): void {
  try {
    if (isDefault(settings)) storage?.removeItem(GAME_SETTINGS_STORAGE_KEY);
    else storage?.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify({
      highContrast: settings.highContrast, motion: settings.motion, sound: settings.sound, showTimer: settings.showTimer,
    }));
  } catch {
    // Not remembered; the change still applies to this page.
  }
}

/** True when games should drop animation: the visitor chose it, or the device asks for it. */
export function motionReduced(settings: Pick<SharedGameSettings, 'motion'>, deviceReduces: boolean): boolean {
  return settings.motion === 'reduce' || deviceReduces;
}

/** A game plays a sound only when the shared switch and the game's own sound setting (if it has one) both allow it. */
export function gameSoundAllowed(settings: Pick<SharedGameSettings, 'sound'>, gameSetting = true): boolean {
  return settings.sound && gameSetting;
}

/**
 * Marks <html> so CSS (src/styles/gamesettings.css) and games can follow the settings:
 * data-game-contrast="high" and data-game-motion="reduce". Normal values remove the attribute.
 */
export function applyGameSettings(
  root: { dataset: DOMStringMap },
  settings: SharedGameSettings,
  deviceReduces: boolean,
): void {
  if (settings.highContrast) root.dataset.gameContrast = 'high';
  else delete root.dataset.gameContrast;
  if (motionReduced(settings, deviceReduces)) root.dataset.gameMotion = 'reduce';
  else delete root.dataset.gameMotion;
}

/**
 * Focus trap for the settings dialog: the index Tab (or Shift+Tab) should move to, or undefined to let the browser
 * move focus normally. `current` is -1 when focus is outside the dialog.
 */
export function trappedFocusIndex(count: number, current: number, backwards: boolean): number | undefined {
  if (count <= 0) return undefined;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  if (backwards && current === 0) return count - 1;
  if (!backwards && current === count - 1) return 0;
  return undefined;
}


export interface FocusCandidate {
  type?: string;
  name?: string;
  checked?: boolean;
}

/**
 * The controls Tab actually stops on, in order. A radio group is one stop: its checked radio, or its first radio when
 * none is checked. Everything else is kept.
 */
export function tabStops<T extends FocusCandidate>(items: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (item.type === 'radio' && item.name) groups.set(item.name, [...(groups.get(item.name) ?? []), item]);
  }
  return items.filter((item) => {
    if (item.type !== 'radio' || !item.name) return true;
    const group = groups.get(item.name)!;
    const checked = group.find((radio) => radio.checked);
    return checked ? item === checked : item === group[0];
  });
}
