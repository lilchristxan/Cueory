import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUES, SAME_CUE_GAP_MS, armGameSound, playGameCue, resetGameSoundForTests, type GameCue } from '../../src/islands/gamesound';

/** A stand-in for the Web Audio API that counts what is scheduled. */
function installFakeAudio(state: AudioContextState = 'suspended') {
  const made = { contexts: 0, oscillators: 0, started: [] as number[], peaks: [] as number[], frequencies: [] as number[], stops: [] as number[] };
  class FakeAudioContext {
    state = state;
    currentTime = 1;
    destination = {};
    resume = vi.fn(() => { this.state = 'running'; return Promise.resolve(); });
    constructor() { made.contexts++; fake.last = this; }
    createGain() {
      return { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn((v: number) => made.peaks.push(v)), exponentialRampToValueAtTime: vi.fn() } };
    }
    createOscillator() {
      made.oscillators++;
      const osc = {
        type: 'sine', frequency: { set value(v: number) { made.frequencies.push(v); } }, connect: vi.fn(),
        start: vi.fn((t: number) => made.started.push(t)), stop: vi.fn((t: number) => made.stops.push(t)),
      };
      return osc;
    }
  }
  const fake: { last?: FakeAudioContext } = {};
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { made, fake };
}

function fakeDocument() {
  const listeners = new Map<string, () => void>();
  const doc = { hidden: false, addEventListener: vi.fn((name: string, fn: () => void) => listeners.set(name, fn)) };
  return { doc, listeners };
}

beforeEach(() => {
  resetGameSoundForTests();
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function arm(hidden = false) {
  const { doc, listeners } = fakeDocument();
  doc.hidden = hidden;
  vi.stubGlobal('document', doc);
  armGameSound(doc as unknown as Document);
  return listeners;
}

describe('game sound cues', () => {
  it('plays nothing before the first gesture', () => {
    const { made } = installFakeAudio();
    arm();
    playGameCue('place');
    expect(made.contexts).toBe(0);
    expect(made.oscillators).toBe(0);
  });

  it('makes one context on the first gesture and resumes it inside that gesture', () => {
    const { made, fake } = installFakeAudio();
    const listeners = arm();
    expect([...listeners.keys()]).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'touchend', 'click']));
    listeners.get('pointerdown')!();
    expect(made.contexts).toBe(1);
    expect(fake.last!.resume).toHaveBeenCalledTimes(1);
    listeners.get('keydown')!();
    expect(made.contexts).toBe(1);
  });

  it('schedules the oscillators of a cue after the gesture, all on the one context', () => {
    const { made } = installFakeAudio();
    arm().get('pointerdown')!();
    playGameCue('good');
    expect(made.oscillators).toBe(CUES.good.length);
    expect(made.frequencies).toEqual(CUES.good.map((note) => note.hz));
    expect(made.contexts).toBe(1);
  });

  it('stays silent when the caller says sound is not allowed', () => {
    const { made } = installFakeAudio();
    arm().get('keydown')!();
    playGameCue('solved', false);
    expect(made.oscillators).toBe(0);
  });

  it('stays silent while the tab is hidden', () => {
    const { made } = installFakeAudio();
    arm(true).get('keydown')!();
    playGameCue('place');
    expect(made.oscillators).toBe(0);
  });

  it('ignores the same cue within the rate limit but allows it later and allows other cues', () => {
    const { made } = installFakeAudio();
    arm().get('keydown')!();
    playGameCue('place');
    playGameCue('place');
    expect(made.oscillators).toBe(1);
    playGameCue('remove');
    expect(made.oscillators).toBe(2);
    vi.advanceTimersByTime(SAME_CUE_GAP_MS + 1);
    playGameCue('place');
    expect(made.oscillators).toBe(3);
  });

  it('resumes a context that went back to suspended when a cue plays', () => {
    const { fake } = installFakeAudio();
    arm().get('keydown')!();
    fake.last!.state = 'suspended';
    playGameCue('place');
    expect(fake.last!.resume).toHaveBeenCalledTimes(2);
  });

  it('makes no audio context at all while the shared game sounds switch is off', () => {
    const { made } = installFakeAudio();
    vi.stubGlobal('window', { addEventListener: vi.fn(), localStorage: { getItem: () => JSON.stringify({ highContrast: false, motion: 'device', sound: false }) } });
    const listeners = arm();
    listeners.get('pointerdown')!();
    playGameCue('place');
    expect(made.contexts).toBe(0);
    expect(made.oscillators).toBe(0);
  });

  it('does not ask a browser that refused an audio context again on every tap', () => {
    const tries = vi.fn();
    vi.stubGlobal('AudioContext', class { constructor() { tries(); throw new Error('blocked'); } });
    const listeners = arm();
    listeners.get('pointerdown')!();
    listeners.get('pointerdown')!();
    expect(tries).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the shared switch was turned off after the caller computed allowed = true', () => {
    const { made } = installFakeAudio();
    const handlers = new Map<string, (event: unknown) => void>();
    vi.stubGlobal('window', { addEventListener: vi.fn((name: string, fn: (event: unknown) => void) => handlers.set(name, fn)), localStorage: { getItem: () => null } });
    arm().get('pointerdown')!();
    playGameCue('place', true);
    expect(made.oscillators).toBe(1);
    handlers.get('cueory:game-settings')!({ detail: { highContrast: false, motion: 'device', sound: false } });
    vi.advanceTimersByTime(SAME_CUE_GAP_MS + 1);
    playGameCue('place', true);
    expect(made.oscillators).toBe(1);
  });

  it('keeps every cue short and at a modest, audible level', () => {
    for (const [name, notes] of Object.entries(CUES) as [GameCue, typeof CUES[GameCue]][]) {
      const end = Math.max(...notes.map((note) => note.at + note.length));
      expect(end, name).toBeLessThanOrEqual(0.4);
      for (const note of notes) {
        expect(note.peak, name).toBeLessThanOrEqual(0.2);
        expect(note.peak, name).toBeGreaterThanOrEqual(0.08);
      }
    }
  });

  it('is silent, and never throws, when Web Audio is missing or refuses to start', () => {
    vi.stubGlobal('AudioContext', undefined);
    arm().get('pointerdown')!();
    expect(() => playGameCue('solved')).not.toThrow();
    resetGameSoundForTests();
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('blocked'); } });
    arm().get('pointerdown')!();
    expect(() => playGameCue('solved')).not.toThrow();
  });
});
