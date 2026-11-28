/**
 * Read-aloud with the device's own voices (Christian, 2026-11-26): pure logic, kept apart so it can be unit tested.
 *
 * The browser lists the voices a device has (SpeechSynthesisVoice: name, lang, localService, default, voiceURI). We
 * only ever use voices the browser marks as supplied by a local speech synthesizer (`localService: true`), so the text
 * being read is not handed to a remote speech service, and among those we take the best one the device offers.
 */
export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
  voiceURI: string;
}

/** Words makers use for their better voices, best first, and for their small fallback ones. */
const BETTER = [/premium/i, /enhanced/i, /natural/i, /neural/i] as const;
const LESSER = /compact|espeak|novelty/i;

const base = (tag: string) => tag.toLowerCase().split(/[-_]/)[0] ?? '';
const same = (a: string, b: string) => a.toLowerCase().replace('_', '-') === b.toLowerCase().replace('_', '-');

/** How good a voice is for a reader who prefers `languages` (most wanted first). Higher is better. */
export function voiceScore(voice: VoiceLike, languages: readonly string[]): number {
  const label = `${voice.name} ${voice.voiceURI}`;
  let score = 0;
  const better = BETTER.findIndex((word) => word.test(label));
  if (better >= 0) score += 40 - better * 5;
  if (LESSER.test(label)) score -= 20;
  // The reader's own region (en-GB before en-US for a British reader) matters less than the voice's quality.
  const region = languages.findIndex((language) => same(language, voice.lang));
  if (region >= 0) score += 10 - Math.min(region, 5);
  if (voice.default) score += 3;
  return score;
}

/**
 * The voice to read `pageLanguage` text with: the best on-device voice in that language, or null when the device has
 * none (the listen button then stays hidden). Voices from a remote service are never chosen.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], languages: readonly string[] = [], pageLanguage = 'en'): V | null {
  const usable = voices.filter((voice) => voice.localService && base(voice.lang) === base(pageLanguage));
  let best: V | null = null;
  let bestScore = -Infinity;
  for (const voice of usable) {
    const score = voiceScore(voice, languages);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}
