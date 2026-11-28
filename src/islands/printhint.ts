/**
 * The "print a copy for your patients!" hint (Christian, 25 Nov). It shows once per page load, fades out by itself after
 * ten seconds, closes at once on x or Escape, and the countdown waits while the bubble is hovered, focused or touched.
 * This file is only the countdown; nothing is stored anywhere. Plain file so it can be unit tested with fake timers.
 */
export const HINT_SHOW_AFTER_MS = 1000;
export const HINT_VISIBLE_MS = 10_000;

export interface HintTimer {
  /** Starts (or restarts) the countdown from the full time. */
  start(): void;
  /** Holds the countdown where it is. */
  pause(): void;
  /** Carries on with the time that was left. */
  resume(): void;
  /** Ends it now. */
  close(): void;
  /** Milliseconds left (the full time before start, 0 after it ended). */
  remaining(): number;
}

export function createHintTimer(onEnd: () => void, duration = HINT_VISIBLE_MS): HintTimer {
  let left = duration;
  let startedAt = 0;
  let handle: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let ended = false;

  const stopClock = () => {
    if (handle !== undefined) clearTimeout(handle);
    handle = undefined;
  };
  const end = () => {
    if (ended) return;
    ended = true;
    running = false;
    left = 0;
    stopClock();
    onEnd();
  };
  const run = () => {
    stopClock();
    startedAt = Date.now();
    running = true;
    handle = setTimeout(end, left);
  };

  return {
    start() {
      if (ended) return;
      left = duration;
      run();
    },
    pause() {
      if (ended || !running) return;
      left = Math.max(0, left - (Date.now() - startedAt));
      running = false;
      stopClock();
    },
    resume() {
      if (ended || running || handle !== undefined) return;
      if (left <= 0) { end(); return; }
      run();
    },
    close: end,
    remaining() {
      if (ended) return 0;
      return running ? Math.max(0, left - (Date.now() - startedAt)) : left;
    },
  };
}

export type HoldKind = 'hover' | 'focus' | 'touch';

export interface HintHolds {
  /** Something (the pointer, keyboard focus, a finger) is on the bubble: the countdown waits. */
  hold(kind: HoldKind): void;
  /** That thing left; the countdown carries on only when nothing else is still on the bubble. */
  release(kind: HoldKind): void;
  active(): boolean;
}

/** Hover, focus and touch pause the same countdown, but each one is tracked on its own. */
export function createHintHolds(timer: Pick<HintTimer, 'pause' | 'resume'>): HintHolds {
  const held = new Set<HoldKind>();
  return {
    hold(kind) { held.add(kind); timer.pause(); },
    release(kind) { held.delete(kind); if (held.size === 0) timer.resume(); },
    active: () => held.size > 0,
  };
}

/** Bubble and obstacle boxes as the browser reports them. */
export interface Box { left: number; right: number; top: number; bottom: number }

/**
 * True when the bubble is on screen sideways and lies over none of the obstacles, with `gap` of clear space round it.
 * Nothing on the page moves to make this true: a bubble that does not fit is simply not shown.
 */
export function fitsClear(bubble: Box, obstacles: readonly Box[], gap: number, viewWidth: number): boolean {
  if (bubble.left < 0 || bubble.right > viewWidth) return false;
  return !obstacles.some((box) =>
    box.left < bubble.right + gap && box.right > bubble.left - gap && box.top < bubble.bottom + gap && box.bottom > bubble.top - gap);
}
