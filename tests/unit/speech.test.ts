import { describe, expect, it } from 'vitest';
import { pickVoice, voiceScore, type VoiceLike } from '../../src/islands/speech';
import { giveUp, overrule, startLearn, advance, reveal, stepOf, canAdvance, type LearnCard } from '../../src/islands/learn';

const voice = (name: string, lang: string, localService: boolean, extra: Partial<VoiceLike> = {}): VoiceLike => ({
  name,
  lang,
  localService,
  default: false,
  voiceURI: name.toLowerCase(),
  ...extra,
});

describe('read-aloud voice choice', () => {
  it('never picks a voice from a remote service, however good its name sounds', () => {
    const voices = [voice('Online Natural', 'en-US', false, { default: true }), voice('Plain', 'en-US', true)];
    expect(pickVoice(voices, ['en-US'])?.name).toBe('Plain');
    expect(pickVoice([voice('Online Natural', 'en-US', false)], ['en-US'])).toBeNull();
  });

  it('prefers the better on-device voices: premium, then enhanced, over the standard and compact ones', () => {
    const voices = [
      voice('Samantha', 'en-US', true, { default: true }),
      voice('Samantha (Enhanced)', 'en-US', true),
      voice('Ava (Premium)', 'en-US', true),
      voice('Fred', 'en-US', true, { voiceURI: 'com.apple.voice.compact.en-US.Fred' }),
    ];
    expect(pickVoice(voices, ['en-US'])?.name).toBe('Ava (Premium)');
    expect(pickVoice(voices.slice(0, 2), ['en-US'])?.name).toBe('Samantha (Enhanced)');
    expect(voiceScore(voices[3]!, ['en-US'])).toBeLessThan(voiceScore(voices[0]!, ['en-US']));
  });

  it("reads English pages with an English voice, in the reader's own region when quality is equal", () => {
    const voices = [voice('Amelie', 'fr-FR', true, { default: true }), voice('Daniel', 'en-GB', true), voice('Alex', 'en-US', true)];
    expect(pickVoice(voices, ['en-GB', 'en'])?.name).toBe('Daniel');
    expect(pickVoice(voices, ['en-US'])?.name).toBe('Alex');
    expect(pickVoice([voices[0]!], ['fr-FR'])).toBeNull();
    expect(pickVoice([], ['en-US'])).toBeNull();
  });
});

describe("learn mode: don't know?", () => {
  const cards: LearnCard[] = [
    { front: 'a', back: 'one' },
    { front: 'b', back: 'two' },
    { front: 'c', back: 'three' },
  ];
  const first = () => 0;

  it('does nothing while the card is only being shown', () => {
    const state = startLearn(cards, [0, 1, 2], first);
    expect(stepOf(state, cards)).toBe('see');
    expect(giveUp(state, cards)).toBe(state);
  });

  it('counts as a miss on the choose step, with no answer picked, and keeps the card on that step', () => {
    let state = startLearn(cards, [0], first);
    state = advance(reveal(state, cards), cards, first);
    expect(stepOf(state, cards)).toBe('choose');
    const gaveUp = giveUp(state, cards);
    expect(gaveUp.result).toEqual({ correct: false, given: -1, overruled: false });
    expect(canAdvance(gaveUp, cards)).toBe(true);
    expect(giveUp(gaveUp, cards)).toBe(gaveUp);
    const next = advance(gaveUp, cards, first);
    expect(next.stages[0]).toBe(1);
  });

  it('cannot be turned into "I was right" on a typed step', () => {
    const state = { ...startLearn(cards, [0], first), stages: [2, 0, 0] as (0 | 1 | 2 | 3)[] };
    expect(stepOf(state, cards)).toBe('type');
    const gaveUp = giveUp(state, cards);
    expect(gaveUp.result).toEqual({ correct: false, given: '', overruled: false });
    expect(overrule(gaveUp, cards)).toBe(gaveUp);
  });
});
