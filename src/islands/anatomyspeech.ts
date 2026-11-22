/**
 * Say a structure's official name aloud (Task 178, part B), with the browser's own speech synthesis only: no network,
 * no third party, nothing added to the content security policy. Where the browser has no speech synthesis, every
 * function is a harmless no-op, so the "say it" button can simply stay hidden (`canSpeak()` is false).
 *
 * The words spoken are exactly the text given (the source file's name); pronunciation is the browser voice's own.
 */

/** The parts of SpeechSynthesis the lab uses, so tests can pass a fake and the island can pass the real one. */
export interface SpeechLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  readonly speaking?: boolean;
}

export interface SpeakOptions {
  /** A BCP 47 language tag; the lab's content is English. */
  lang?: string;
  /** 0.1 to 10; names are easier to catch a little slower than the default 1. */
  rate?: number;
}

type UtteranceFactory = new (text: string) => SpeechSynthesisUtterance;

function defaultSynthesis(): SpeechLike | undefined {
  if (typeof window === 'undefined') return undefined;
  const synthesis = (window as { speechSynthesis?: unknown }).speechSynthesis;
  return synthesis && typeof (synthesis as SpeechLike).speak === 'function' ? (synthesis as SpeechLike) : undefined;
}

function defaultUtterance(): UtteranceFactory | undefined {
  if (typeof window === 'undefined') return undefined;
  const factory = (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  return typeof factory === 'function' ? (factory as UtteranceFactory) : undefined;
}

/** True when this browser can speak: it has speechSynthesis and the utterance class. */
export function canSpeak(synthesis: SpeechLike | undefined = defaultSynthesis(), utterance = defaultUtterance()): boolean {
  return synthesis !== undefined && utterance !== undefined;
}

/**
 * Speak `text`, stopping anything still being said first so a quick second tap never queues names up. Returns true
 * when the browser was asked to speak, false when it cannot (or the text is blank). Never throws: a browser that
 * refuses to speak leaves the lab working as before.
 */
export function speak(
  text: string,
  options: SpeakOptions = {},
  synthesis: SpeechLike | undefined = defaultSynthesis(),
  Utterance = defaultUtterance(),
): boolean {
  const words = text.trim();
  if (!words || !synthesis || !Utterance) return false;
  try {
    const utterance = new Utterance(words);
    utterance.lang = options.lang ?? 'en';
    if (options.rate !== undefined) utterance.rate = Math.min(10, Math.max(0.1, options.rate));
    synthesis.cancel();
    synthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** Stop speaking; a no-op when the browser cannot speak. */
export function stop(synthesis: SpeechLike | undefined = defaultSynthesis()): void {
  try {
    synthesis?.cancel();
  } catch {
    // Nothing to stop.
  }
}
