import { useCallback, useEffect, useRef, useState } from 'react';
import { createHintHolds, createHintTimer, HINT_SHOW_AFTER_MS, roomNeeded, type Box, type HintHolds, type HintTimer } from './printhint';

/** The things on a game page that the hint must never lie over: the date line's text, the cue, the game's drawn parts. */
const OBSTACLES = [
  '.game-frame-cue-slot > *',
  '.game-frame-controls-row select',
  '.game-frame-board [role="grid"]',
  '.game-frame-board [role="gridcell"]',
  '.game-frame-board button',
  '.game-frame-board input',
  '.game-frame-board img',
  '.game-frame-board svg',
  '.game-frame-board canvas',
  '.game-frame-board .vialo-pack',
  '.game-frame-board h2',
  '.game-frame-board h3',
  '.game-frame-board p',
].join(', ');

function obstacleBoxes(self: HTMLElement): Box[] {
  const boxes: Box[] = [];
  const add = (rect: DOMRect) => {
    if (rect.width > 0 && rect.height > 0) boxes.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
  };
  const dateLine = document.querySelector('.game-frame-dateline');
  if (dateLine) {
    const range = document.createRange();
    range.selectNodeContents(dateLine);
    for (const rect of range.getClientRects()) add(rect);
  }
  for (const node of document.querySelectorAll<HTMLElement>(OBSTACLES)) {
    if (!self.contains(node)) add(node.getBoundingClientRect());
  }
  return boxes;
}

/**
 * "print a copy for your patients!" (Christian, 25 Nov): a speech bubble that hangs under the printer button, tail up at
 * it. It appears a moment after the page loads, takes no focus, fades out by itself after ten seconds, closes at once on
 * x or Escape, and waits while it is hovered, focused or touched. Nothing is stored: it shows once per page load. If the
 * bubble would lie over the date line or the game, the Frame makes room for it above them for as long as it shows.
 */
export default function PrintHint() {
  const [phase, setPhase] = useState<'waiting' | 'shown' | 'fading' | 'gone'>('waiting');
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<HintTimer | null>(null);
  const holds = useRef<HintHolds | null>(null);
  const hadFocus = useRef(false);
  const reduced = useRef(false);
  /** x and Escape end it at once; only running out of time fades it. */
  const closing = useRef(false);

  const makeRoom = useCallback(() => {
    const node = bubble.current;
    const main = node?.closest<HTMLElement>('.game-frame-main');
    if (!node || !main) return;
    const gap = parseFloat(getComputedStyle(node).scrollMarginTop) || 0;
    let tries = 0;
    const step = () => {
      const rect = node.getBoundingClientRect();
      const need = roomNeeded({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, obstacleBoxes(node), gap);
      if (need > 0.5 && tries < 6) {
        const now = parseFloat(main.style.getPropertyValue('--game-frame-hint-room')) || 0;
        main.style.setProperty('--game-frame-hint-room', `${Math.ceil(now + need)}px`);
        tries += 1;
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, []);

  /** A finger or key already on the game before the bubble is due means the player is playing: no bubble, so nothing moves under them. */
  const touched = useRef(false);
  /** True while a pointer is held down, so making room is put back only after the gesture ends. */
  const pressed = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onDown = () => { touched.current = true; pressed.current = true; };
    const onUp = () => { pressed.current = false; };
    const onKeyDown = () => { touched.current = true; };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('keydown', onKeyDown, true);
    const show = setTimeout(() => setPhase(touched.current ? 'gone' : 'shown'), HINT_SHOW_AFTER_MS);
    return () => {
      clearTimeout(show);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'shown') return;
    const end = () => {
      if (reduced.current || closing.current) { setPhase('gone'); return; }
      setPhase('fading');
    };
    const countdown = createHintTimer(end);
    timer.current = countdown;
    holds.current = createHintHolds(countdown);
    countdown.start();
    makeRoom();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { closing.current = true; countdown.close(); } };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      countdown.pause();
      timer.current = null;
      holds.current = null;
    };
  }, [phase, makeRoom]);

  useEffect(() => {
    if (phase !== 'fading') return;
    const done = setTimeout(() => setPhase('gone'), 400);
    return () => clearTimeout(done);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'gone') return;
    const release = () => document.querySelector<HTMLElement>('.game-frame-main')?.style.removeProperty('--game-frame-hint-room');
    if (!pressed.current) { release(); return; }
    // Mid-gesture (a drag across the board): put the room back when the finger lifts, not under it.
    const later = () => { release(); document.removeEventListener('pointerup', later, true); document.removeEventListener('pointercancel', later, true); };
    document.addEventListener('pointerup', later, true);
    document.addEventListener('pointercancel', later, true);
    return () => { document.removeEventListener('pointerup', later, true); document.removeEventListener('pointercancel', later, true); };
  }, [phase]);

  /** If the bubble goes away while something inside it has focus, focus goes to the printer button, never to the page. */
  useEffect(() => {
    if (phase !== 'gone') return;
    if (document.activeElement === document.body || document.activeElement === null) {
      if (hadFocus.current) document.querySelector<HTMLElement>('[data-testid="game-frame-print"]')?.focus();
    }
    hadFocus.current = false;
  }, [phase]);

  const visible = phase === 'shown' || phase === 'fading';
  const pointerHold = (event: { pointerType: string }) => (event.pointerType === 'touch' ? 'touch' : 'hover') as 'touch' | 'hover';
  return (
    <>
      {/* Said once, politely, when the bubble appears; the bubble's own copy is hidden from screen readers. */}
      <div role="status" className="sr-only" data-testid="print-hint-status">{visible ? 'print a copy for your patients!' : ''}</div>
      {visible && (
        <div
          ref={bubble}
          className="game-frame-hint"
          data-testid="print-hint"
          data-phase={phase}
          onPointerEnter={(event) => holds.current?.hold(pointerHold(event))}
          onPointerLeave={(event) => holds.current?.release(pointerHold(event))}
          onPointerCancel={(event) => holds.current?.release(pointerHold(event))}
          onFocus={() => { hadFocus.current = true; holds.current?.hold('focus'); }}
          onBlur={() => { hadFocus.current = false; holds.current?.release('focus'); }}
        >
          <span className="game-frame-hint-text" aria-hidden="true">print a copy for your patients!</span>
          <button type="button" className="game-frame-hint-close" aria-label="close" data-testid="print-hint-close" onClick={() => { closing.current = true; timer.current?.close(); }}>
            <svg viewBox="0 0 24 24" className="game-frame-hint-x" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
