/** The home-page date is local to the visitor, never frozen at build time (W01-2). */
import { dayLabel } from './daily';
import { msUntilLocalMidnight } from './localmidnight';

export { msUntilLocalMidnight };

export const MIDNIGHT_MESSAGE = 'the date changes at midnight on your device. some sample puzzles repeat.';
const UNAVAILABLE_MESSAGE = "your device's date is unavailable. " + MIDNIGHT_MESSAGE;
const RETRY_MS = 60_000;

/** Pure text formatter. Never present an invented date if the device clock is unavailable. */
export function dailyLine(date: Date | null): string {
  try {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return UNAVAILABLE_MESSAGE;
    return "today's set: " + dayLabel(date) + '. ' + MIDNIGHT_MESSAGE;
  } catch {
    return UNAVAILABLE_MESSAGE;
  }
}

/** Allows blocked or invalid clocks to fall back without breaking the page. */
export function dailyLineFromClock(clock: () => Date): string {
  try {
    return dailyLine(clock());
  } catch {
    return UNAVAILABLE_MESSAGE;
  }
}

/** Browser-only mounting. The matching Astro component renders a no-JS fallback first. */
function mountDailyLine(): void {
  const target = document.querySelector<HTMLElement>('[data-daily-games-date]');
  if (!target) return;
  let timeout: number | undefined;

  const refresh = () => {
    if (timeout !== undefined) window.clearTimeout(timeout);
    let now: Date | null = null;
    try { now = new Date(); } catch { /* A blocked clock must not break the homepage. */ }
    const line = dailyLine(now);
    // A same-day focus or visibility event must not repeat a live announcement.
    if (target.textContent !== line) target.textContent = line;
    timeout = window.setTimeout(refresh, msUntilLocalMidnight(now) ?? RETRY_MS);
  };

  refresh();
  // Hidden tabs may have throttled timers, so update immediately when the student returns.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  // Restored pages can skip visibilitychange while their midnight timer was suspended.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refresh();
  });
  // Switching back to this window also reconciles device clock or time-zone changes.
  window.addEventListener('focus', () => {
    if (!document.hidden) refresh();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDailyLine, { once: true });
  } else {
    mountDailyLine();
  }
}
