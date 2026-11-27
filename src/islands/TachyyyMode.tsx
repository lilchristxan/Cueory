import { useEffect, useId, useRef, useState } from 'react';
import { browserStorage } from '../scripts/theme';
import {
  barLeft, clock, inWords, MAX_SECONDS, MIN_SECONDS, parseSettings, secondsLeft, serializeSettings, stepSeconds, STORAGE_KEY,
  type TachyyySettings,
} from './tachyyymode';

interface Props {
  /** Changes with every new question, so the countdown starts again. */
  questionKey: string;
  /** True while the student is still guessing this question. */
  guessing: boolean;
  /** Called once when the time runs out: mark the question not right and move on. */
  onTimeUp: () => void;
  /** The tachyyy tile (the game's own artwork), passed in so this island stays free of image imports. */
  icon: string;
}

const round = 'press inline-flex size-(--tap-min) shrink-0 items-center justify-center rounded-pill border border-control text-ink';

/**
 * The tachyyy mode chip, its settings and the bar that runs down. The countdown pauses while the settings are open.
 * The time left is shown as text as well as a bar, so the bar is never the only signal.
 */
export default function TachyyyMode({ questionKey, guessing, onTimeUp, icon }: Props) {
  const [settings, setSettings] = useState<TachyyySettings>(() => parseSettings(null));
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // The deadline remembers which question it belongs to, so a new question never inherits the last one's spent time.
  const [timer, setTimer] = useState({ key: '', deadline: 0 });
  const fired = useRef(false);
  const bar = useRef<HTMLDivElement>(null);
  const timeUp = useRef(onTimeUp);
  timeUp.current = onTimeUp;
  const panelId = useId();
  const running = settings.on && guessing && !open;
  const timerKey = `${questionKey}|${settings.seconds}|${settings.on}`;
  const current = timer.key === timerKey;

  // The saved choice is read after the first paint, so the server-free first render matches (client:only islands too).
  useEffect(() => {
    try {
      setSettings(parseSettings(browserStorage()?.getItem(STORAGE_KEY)));
    } catch {
      /* private mode: stay with the defaults */
    }
  }, []);

  const save = (next: TachyyySettings) => {
    setSettings(next);
    try {
      browserStorage()?.setItem(STORAGE_KEY, serializeSettings(next));
    } catch {
      /* nothing kept; the mode still works for this visit */
    }
  };

  // A new question, a new time, or turning the mode on: a fresh, full countdown.
  useEffect(() => {
    fired.current = false;
    const start = Date.now();
    setNow(start);
    setTimer({ key: timerKey, deadline: start + settings.seconds * 1000 });
  }, [timerKey, settings.seconds]);

  // While the settings are open the countdown waits: on closing, the deadline moves by the time spent there.
  const pausedAt = useRef<number | null>(null);
  useEffect(() => {
    if (open) pausedAt.current = Date.now();
    else if (pausedAt.current !== null) {
      const waited = Date.now() - pausedAt.current;
      pausedAt.current = null;
      setTimer((t) => ({ ...t, deadline: t.deadline + waited }));
      setNow(Date.now());
    }
  }, [open]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running || fired.current || timer.key !== timerKey || now < timer.deadline) return;
    fired.current = true;
    timeUp.current();
  }, [running, now, timer, timerKey]);

  // The bar's length is a custom property set on the element itself (the .progress-fill pattern), never a style attribute.
  useEffect(() => {
    bar.current?.style.setProperty('--progress', String(settings.on && guessing ? (current ? barLeft(timer.deadline, now, settings.seconds) : 1) : 0));
  });

  const left = current ? secondsLeft(timer.deadline, now) : settings.seconds;
  return (
    <div className="relative" data-testid="tachyyy-mode">
      <div className="flex justify-end">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          data-testid="tachyyy-chip"
          className="press inline-flex min-h-(--tap-min) items-center gap-2 rounded-pill border border-control py-1 ps-1.5 pe-3 text-sm font-bold text-ink"
        >
          <img src={icon} alt="" width="32" height="32" loading="lazy" decoding="async" className="size-8 rounded-pill" />
          <span>tachyyy mode</span>
          {settings.on ? (
            <span className="rounded-pill bg-button px-2 py-0.5 text-on-button" data-testid="tachyyy-clock">
              <span aria-hidden="true">{guessing ? clock(left) : clock(settings.seconds)}</span>
              <span className="sr-only">on, {inWords(settings.seconds)} for each question</span>
            </span>
          ) : (
            <span className="font-normal text-ink-soft">off</span>
          )}
        </button>
      </div>
      {settings.on && (
        <div className="progress-track mt-2 h-1.5" aria-hidden="true">
          <div ref={bar} className="progress-fill" data-testid="tachyyy-bar" />
        </div>
      )}
      {open && (
        <div id={panelId} role="group" aria-label="tachyyy mode" data-testid="tachyyy-panel" className="absolute end-0 top-full z-10 mt-2 w-72 max-w-full rounded-xl border border-line bg-page p-4 shadow-card">
          <label className="flex min-h-(--tap-min) items-center justify-between gap-3">
            <span>{settings.on ? 'on' : 'off'}</span>
            <input type="checkbox" role="switch" checked={settings.on} onChange={(e) => save({ ...settings, on: e.currentTarget.checked })} className="size-6 accent-(--color-button)" aria-label="tachyyy mode" />
          </label>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button type="button" className={round} aria-label="less time" disabled={settings.seconds <= MIN_SECONDS} onClick={() => save({ ...settings, seconds: stepSeconds(settings.seconds, -1) })}>
              <span aria-hidden="true">−</span>
            </button>
            <p className="text-lg font-bold" aria-live="polite" data-testid="tachyyy-seconds">{inWords(settings.seconds)}</p>
            <button type="button" className={round} aria-label="more time" disabled={settings.seconds >= MAX_SECONDS} onClick={() => save({ ...settings, seconds: stepSeconds(settings.seconds, 1) })}>
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            when the time runs out, the question is marked not right and the next one comes up. the countdown waits while this panel is open.
          </p>
          <button type="button" className="mt-2 inline-flex min-h-(--tap-min) items-center text-sm underline" onClick={() => setOpen(false)}>
            done
          </button>
        </div>
      )}
    </div>
  );
}
