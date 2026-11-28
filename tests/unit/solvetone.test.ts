import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armGameSound, resetGameSoundForTests } from '../../src/islands/gamesound';
import { playSolvedTone } from '../../src/islands/solvetone';

// playSolvedTone is now a thin wrapper over the shared sound module (gamesound.ts, tested in gamesound.test.ts).
beforeEach(() => { resetGameSoundForTests(); });
afterEach(() => vi.unstubAllGlobals());

describe('playSolvedTone', () => {
  it('plays the solved cue once the page has had a gesture', () => {
    const started = vi.fn();
    vi.stubGlobal('AudioContext', class {
      state = 'running'; currentTime = 0; destination = {};
      resume() { return Promise.resolve(); }
      createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
      createOscillator() { return { frequency: {}, connect() {}, start: started, stop() {} }; }
    });
    const listeners = new Map<string, () => void>();
    const doc = { hidden: false, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn) };
    vi.stubGlobal('document', doc);
    armGameSound(doc as unknown as Document);
    playSolvedTone();
    expect(started).not.toHaveBeenCalled();
    listeners.get('pointerdown')!();
    playSolvedTone();
    expect(started).toHaveBeenCalledTimes(3);
  });

  it('stays silent when the browser has no Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => playSolvedTone()).not.toThrow();
  });
});
