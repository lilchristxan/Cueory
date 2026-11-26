import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Both board formats pick their cue on the visitor's date. The Frame's cue slot precedes its gear and Help controls. */
export default function PicclineCue({ id, text }: { id: string; text: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const frame = anchor.current?.closest('.game-frame-main');
    // Only a route that fills the Frame's cue slot itself moves the cue there (none does today: the corner buttons are
    // the Frame's, and the cue stays inside the game, above the board).
    if (frame?.querySelector('[data-frame-cue-portal]')) {
      setSlot(frame.querySelector<HTMLElement>('.game-frame-cue-slot'));
    }
  }, []);
  const heading = (
    <h3 id={id} className="wordpath-cue wordpath-label" data-print-hidden={slot ? true : undefined} data-testid="suture-theme">
      <span aria-hidden="true">today’s cue · </span>{text}
    </h3>
  );
  return (
    <>
      <span ref={anchor} hidden />
      {slot ? createPortal(heading, slot) : heading}
      {slot && <p data-print-only>{text}</p>}
    </>
  );
}
