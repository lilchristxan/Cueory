import { useEffect, useRef, useState } from 'react';
import { pickVoice } from './speech';

interface Props {
  /** What to read aloud. */
  text: string;
  /** What the button reads, e.g. "this card". */
  what?: string;
}

/**
 * A listen button (Christian, 2026-11-26): reads `text` aloud with the best on-device voice (src/islands/speech.ts).
 * Nothing plays by itself; the same button stops it; it is a real button, so it works by tap, click and keyboard. It
 * is not drawn at all when the browser cannot speak or the device has no on-device voice in the page's language.
 */
export default function SpeakButton({ text, what = 'this card' }: Props) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    const synth = window.speechSynthesis;
    // Some browsers fill the list a moment after the page loads and say so with `voiceschanged`.
    const load = () => setVoice(pickVoice(synth.getVoices(), navigator.languages ?? [], document.documentElement.lang || 'en'));
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => {
      synth.removeEventListener?.('voiceschanged', load);
      current.current = null;
      synth.cancel();
    };
  }, []);

  // A new card: whatever was being read stops.
  useEffect(() => {
    if (!current.current) return;
    current.current = null;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [text]);

  if (!voice) return null;

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      current.current = null;
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    const done = () => {
      if (current.current !== utterance) return;
      current.current = null;
      setSpeaking(false);
    };
    utterance.onend = done;
    utterance.onerror = done;
    current.current = utterance;
    setSpeaking(true);
    synth.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      aria-label={speaking ? 'stop reading' : `read ${what} aloud`}
      data-testid="speak-button"
      className="press inline-flex size-(--tap-min) shrink-0 items-center justify-center rounded-pill text-ink-soft hover:text-ink"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10v4h3l5 4V6L7 10H4Z" />
        {speaking ? <path d="M16 9v6M19.5 9v6" /> : <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />}
      </svg>
    </button>
  );
}
