/**
 * Vialo's solve timer (Christian, 25 Nov 2026: "show the timer"). It starts at the first letter, stops at the final
 * guess and does not run while the tab is hidden. Kept in memory for this game only: nothing is stored.
 */
export interface SolveTimer {
  /** Milliseconds counted so far, not including a running stretch. */
  elapsed: number;
  /** When the current running stretch began, or undefined while stopped or paused. */
  since: number | undefined;
  started: boolean;
  stopped: boolean;
}

export function newTimer(): SolveTimer {
  return { elapsed: 0, since: undefined, started: false, stopped: false };
}

/** First letter typed: begin counting (once). A hidden tab does not begin a stretch. */
export function startTimer(t: SolveTimer, now: number, visible: boolean): SolveTimer {
  if (t.started || t.stopped) return t;
  return { ...t, started: true, since: visible ? now : undefined };
}

export function pauseTimer(t: SolveTimer, now: number): SolveTimer {
  if (t.since === undefined) return t;
  return { ...t, elapsed: t.elapsed + (now - t.since), since: undefined };
}

export function resumeTimer(t: SolveTimer, now: number): SolveTimer {
  if (!t.started || t.stopped || t.since !== undefined) return t;
  return { ...t, since: now };
}

/** Final accepted guess: stop for good. */
export function stopTimer(t: SolveTimer, now: number): SolveTimer {
  const paused = pauseTimer(t, now);
  return { ...paused, stopped: true };
}

export function timerElapsed(t: SolveTimer, now: number): number {
  return t.elapsed + (t.since === undefined ? 0 : Math.max(0, now - t.since));
}

/** "0:42", "12:05". Whole seconds, rounded down; never negative. */
export function formatSolveTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
