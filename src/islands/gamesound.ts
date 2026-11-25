/**
 * Soft sound cues for the games, made in the browser with the Web Audio API: no sound file, no network, no storage.
 *
 * Why this module exists: browsers keep an AudioContext "suspended" until a real tap or key press has resumed it, and
 * the old solve tone made a new context at solve time, so it started suspended and stayed silent. Here one context is
 * made and resumed inside the first real gesture on the page (armGameSound listens once), and cues play only after that.
 *
 * Callers pass `allowed` from `soundAllowed(...)` (src/islands/GameSettings.tsx), so the shared "game sounds" switch and
 * a game's own sound setting both silence every cue. Sound is never the only signal of anything: every cue sits beside
 * feedback the game already shows. Any failure is silent.
 */

import { browserStorage } from '../scripts/storage';
import { GAME_SETTINGS_EVENT, loadGameSettings, parseGameSettings } from './gamesettings';

export type GameCue = 'place' | 'remove' | 'invalid' | 'good' | 'solved' | 'timeup';

interface Note { readonly hz: number; readonly at: number; readonly length: number; readonly peak: number; readonly wave: OscillatorType }

/** Every cue is at most 0.4 s long and peaks at or below 0.2. Triangle waves carry on small phone speakers better than sine. */
export const CUES: Readonly<Record<GameCue, readonly Note[]>> = {
  place: [{ hz: 740, at: 0, length: 0.06, peak: 0.12, wave: 'triangle' }],
  remove: [{ hz: 520, at: 0, length: 0.05, peak: 0.08, wave: 'triangle' }],
  invalid: [{ hz: 262, at: 0, length: 0.18, peak: 0.17, wave: 'triangle' }],
  good: [
    { hz: 587, at: 0, length: 0.1, peak: 0.16, wave: 'triangle' },
    { hz: 880, at: 0.09, length: 0.16, peak: 0.16, wave: 'triangle' },
  ],
  solved: [
    { hz: 523, at: 0, length: 0.12, peak: 0.18, wave: 'triangle' },
    { hz: 659, at: 0.1, length: 0.12, peak: 0.18, wave: 'triangle' },
    { hz: 784, at: 0.2, length: 0.2, peak: 0.18, wave: 'triangle' },
  ],
  timeup: [
    { hz: 440, at: 0, length: 0.12, peak: 0.15, wave: 'triangle' },
    { hz: 330, at: 0.14, length: 0.2, peak: 0.15, wave: 'triangle' },
  ],
};

/** The same cue is ignored if it repeats within this many milliseconds, so fast typing never piles up into noise. */
export const SAME_CUE_GAP_MS = 40;

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

let context: AudioContext | undefined;
let unlocked = false;
let armedOn: Document | undefined;
let failed = false;
/** The shared "game sounds" switch as last announced on this page; undefined means read it from storage. */
let liveSwitch: boolean | undefined;
const lastPlayed = new Map<GameCue, number>();

/** The shared "game sounds" switch right now, for a game that has no sound setting of its own. */
export function soundSwitchOn(): boolean {
  return switchOn();
}

function switchOn(): boolean {
  return liveSwitch ?? loadGameSettings(browserStorage()).sound;
}

function makeContext(): AudioContext | undefined {
  if (context || failed) return context;
  try {
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    context = new Ctor();
  } catch { failed = true; /* Sound is optional, and a browser that refuses is not asked again. */ }
  return context;
}

function unlock(): void {
  try {
    // With the shared switch off no audio context is made at all; turning it on unlocks at the next tap or key press.
    if (!switchOn()) return;
    const ctx = makeContext();
    if (!ctx) return;
    unlocked = true;
    // resume() has to be called inside the gesture handler; an already running context needs nothing.
    if (ctx.state !== 'running') void Promise.resolve(ctx.resume()).catch(() => undefined);
  } catch { /* Sound is optional. */ }
}

/** Listens (once per page) for the first real tap or key press and unlocks the one shared audio context inside it. */
export function armGameSound(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc || armedOn === doc) return;
  armedOn = doc;
  for (const name of GESTURES) doc.addEventListener(name, unlock, { capture: true, passive: true });
  if (typeof window !== 'undefined') {
    // Follow the switch live (also when storage is blocked), like useSharedGameSettings does.
    window.addEventListener(GAME_SETTINGS_EVENT, (event) => { liveSwitch = parseGameSettings(JSON.stringify((event as CustomEvent<unknown>).detail ?? null)).sound; });
    window.addEventListener('storage', () => { liveSwitch = undefined; });
  }
}

/** Plays a cue if `allowed`, the page has had a real gesture, and the tab is visible. Never throws. */
export function playGameCue(cue: GameCue, allowed = true): void {
  try {
    if (!allowed || !unlocked || !context) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = Date.now();
    const before = lastPlayed.get(cue);
    if (before !== undefined && now - before < SAME_CUE_GAP_MS) return;
    lastPlayed.set(cue, now);
    const ctx = context;
    if (ctx.state === 'suspended') void Promise.resolve(ctx.resume()).catch(() => undefined);
    const base = ctx.currentTime;
    for (const note of CUES[cue]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = base + note.at;
      const end = start + note.length;
      oscillator.type = note.wave;
      oscillator.frequency.value = note.hz;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      // A 5 ms rise then a fade: no click at the start or end.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(note.peak, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    }
  } catch { /* Sound is optional. */ }
}

/** For tests only: forget the context, the unlock and the rate limit. */
export function resetGameSoundForTests(): void {
  context = undefined;
  unlocked = false;
  armedOn = undefined;
  failed = false;
  liveSwitch = undefined;
  lastPlayed.clear();
}

armGameSound();
