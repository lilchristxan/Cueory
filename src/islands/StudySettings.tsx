import { useEffect, useRef, useState } from 'react';
import { applyChoice, browserStorage, readChoice, saveChoice, type ThemeChoice } from '../scripts/theme';

const CHOICES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
  { value: 'device', label: 'device' },
];

/**
 * The settings button on a focused study screen (Christian's approved render, 2026-11-26). These screens have no site
 * header and their footer is far below, so the one setting a student may want mid-study, the theme, is here too. It
 * uses the same storage and attribute as the footer's theme switch (src/scripts/theme.ts) and keeps that switch in step.
 */
export default function StudySettings() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ThemeChoice>('device');
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setChoice(readChoice(browserStorage())), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !box.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const pick = (next: ThemeChoice) => {
    setChoice(next);
    saveChoice(browserStorage(), next);
    applyChoice(document.documentElement, next);
    const footer = document.querySelector<HTMLInputElement>(`[data-theme-picker] input[value="${next}"]`);
    if (footer) footer.checked = true;
  };

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-label="settings"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        data-testid="study-settings"
        className="press inline-flex size-(--tap-min) items-center justify-center rounded-pill border border-line text-ink"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
        </svg>
      </button>
      {open && (
        <div role="group" aria-label="theme" className="absolute end-0 top-full z-10 mt-2 w-max rounded-xl border border-line bg-page p-2 shadow-card">
          <p className="px-3 pb-1 text-sm text-ink-soft">theme</p>
          {CHOICES.map((row) => (
            <button
              key={row.value}
              type="button"
              aria-pressed={choice === row.value}
              onClick={() => pick(row.value)}
              className="flex min-h-(--tap-min) w-full items-center gap-2 rounded-lg px-3 text-left text-ink hover:bg-surface"
            >
              <span aria-hidden="true" className="inline-block w-4">{choice === row.value ? '✓' : ''}</span>
              {row.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
