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

/** Bubble and obstacle boxes as the browser reports them. */
export interface Box { left: number; right: number; top: number; bottom: number }

/**
 * How far the board has to move down so the bubble, which hangs under the corner buttons, does not lie over anything.
 * Obstacles the bubble does not share a column with do not count. 0 when the bubble already has free space.
 */
export function roomNeeded(bubble: Box, obstacles: readonly Box[], gap: number): number {
  let room = 0;
  for (const box of obstacles) {
    const shares = box.left < bubble.right && box.right > bubble.left;
    const reaches = box.bottom > bubble.top && box.top < bubble.bottom + gap;
    if (shares && reaches) room = Math.max(room, bubble.bottom + gap - box.top);
  }
  return room;
}
