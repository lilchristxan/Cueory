import { afterEach, describe, expect, it, vi } from 'vitest';
import { playSolvedTone } from '../../src/islands/solvetone';

/** A small stand-in for the Web Audio API that records what the tone does. */
function installFakeAudio() {
  const calls: string[] = [];
  const listeners: Record<string, () => void> = {};
  const oscillator = {
    frequency: { value: 0 },
    connect: vi.fn((target: unknown) => calls.push(`osc.connect:${target === gain ? 'gain' : '?'}`)),
    start: vi.fn(() => calls.push('start')),
    stop: vi.fn((time: number) => calls.push(`stop:${time}`)),
    addEventListener: vi.fn((name: string, fn: () => void, options: unknown) => {
      listeners[name] = fn;
      calls.push(`listen:${name}:${JSON.stringify(options)}`);
    }),
  };
  const gain = {
    gain: {
      setValueAtTime: vi.fn((value: number, time: number) => calls.push(`set:${value}@${time}`)),
      exponentialRampToValueAtTime: vi.fn((value: number, time: number) => calls.push(`ramp:${value}@${time}`)),
    },
    connect: vi.fn((target: unknown) => calls.push(`gain.connect:${target === destination ? 'destination' : '?'}`)),
  };
  const destination = { kind: 'destination' };
  const close = vi.fn();
  class FakeAudioContext {
    currentTime = 2;
    destination = destination;
    createOscillator() { return oscillator; }
    createGain() { return gain; }
    close = close;
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { calls, listeners, oscillator, gain, close };
}

afterEach(() => vi.unstubAllGlobals());

describe('playSolvedTone', () => {
  it('plays a quiet 523 Hz tone that fades out over 0.35 s from the current time', () => {
    const audio = installFakeAudio();
    playSolvedTone();
    expect(audio.oscillator.frequency.value).toBe(523);
    expect(audio.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.08, 2);
    expect(audio.gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 2.35);
    expect(audio.oscillator.start).toHaveBeenCalledTimes(1);
    expect(audio.oscillator.stop).toHaveBeenCalledWith(2.35);
  });

  it('routes the oscillator through the gain node to the speakers', () => {
    const audio = installFakeAudio();
    playSolvedTone();
    expect(audio.calls).toContain('osc.connect:gain');
    expect(audio.calls).toContain('gain.connect:destination');
  });

  it('closes the audio context once, only after the tone ends', () => {
    const audio = installFakeAudio();
    playSolvedTone();
    expect(audio.close).not.toHaveBeenCalled();
    expect(audio.oscillator.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function), { once: true });
    audio.listeners.ended();
    expect(audio.close).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the browser has no Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => playSolvedTone()).not.toThrow();
  });

  it('stays silent when the audio context refuses to start', () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('blocked'); } });
    expect(() => playSolvedTone()).not.toThrow();
  });
});
