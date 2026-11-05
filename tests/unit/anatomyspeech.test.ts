import { describe, expect, it } from 'vitest';
import { canSpeak, speak, stop, type SpeechLike } from '../../src/islands/anatomyspeech';

/** A fake speechSynthesis that records what it was asked to say. */
function fakeSynthesis(): SpeechLike & { spoken: { text: string; lang: string; rate: number }[]; cancels: number } {
  return {
    spoken: [],
    cancels: 0,
    speak(utterance) {
      this.spoken.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate });
    },
    cancel() {
      this.cancels++;
    },
  };
}

/** A fake SpeechSynthesisUtterance with just the fields the lab sets. */
class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  constructor(text: string) {
    this.text = text;
  }
}
const Utterance = FakeUtterance as unknown as new (text: string) => SpeechSynthesisUtterance;

describe('canSpeak', () => {
  it('is true only with both a synthesis object and an utterance class', () => {
    expect(canSpeak(fakeSynthesis(), Utterance)).toBe(true);
    expect(canSpeak(undefined, Utterance)).toBe(false);
    expect(canSpeak(fakeSynthesis(), undefined)).toBe(false);
  });

  it('is false in this test environment, which has no window.speechSynthesis', () => {
    expect(canSpeak()).toBe(false);
  });
});

describe('speak', () => {
  it('says the exact text in English, cancelling anything still being said first', () => {
    const synthesis = fakeSynthesis();
    expect(speak('left ventricle', { lang: 'en' }, synthesis, Utterance)).toBe(true);
    expect(synthesis.spoken).toEqual([{ text: 'left ventricle', lang: 'en', rate: 1 }]);
    expect(synthesis.cancels).toBe(1);
  });

  it('defaults the language to en and clamps the rate', () => {
    const synthesis = fakeSynthesis();
    speak('heart', {}, synthesis, Utterance);
    speak('heart', { rate: 99 }, synthesis, Utterance);
    speak('heart', { rate: 0 }, synthesis, Utterance);
    expect(synthesis.spoken.map((s) => [s.lang, s.rate])).toEqual([['en', 1], ['en', 10], ['en', 0.1]]);
  });

  it('is a no-op without speech synthesis, for blank text, and when the browser throws', () => {
    expect(speak('heart', {}, undefined, Utterance)).toBe(false);
    expect(speak('heart', {}, fakeSynthesis(), undefined)).toBe(false);
    const synthesis = fakeSynthesis();
    expect(speak('   ', {}, synthesis, Utterance)).toBe(false);
    expect(synthesis.spoken).toEqual([]);
    const broken: SpeechLike = {
      speak() {
        throw new Error('not allowed');
      },
      cancel() {},
    };
    expect(speak('heart', {}, broken, Utterance)).toBe(false);
    expect(speak('heart')).toBe(false);
  });
});

describe('stop', () => {
  it('cancels, and does nothing without speech synthesis or when cancel throws', () => {
    const synthesis = fakeSynthesis();
    stop(synthesis);
    expect(synthesis.cancels).toBe(1);
    expect(() => stop(undefined)).not.toThrow();
    expect(() => stop()).not.toThrow();
    expect(() =>
      stop({
        speak() {},
        cancel() {
          throw new Error('gone');
        },
      }),
    ).not.toThrow();
  });
});
