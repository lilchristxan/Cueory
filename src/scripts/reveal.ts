/**
 * Home page sections fade in with a small rise as they first come into view, once (D-62). Only the sections still
 * below the window when this runs are made to wait, so a section is never hidden without JavaScript, never hidden
 * once it is on screen, and with reduced motion nothing waits at all. The look is in global.css ([data-reveal]).
 */

/** The fade's length: the same 600 ms as the `[data-reveal="shown"]` transition in global.css. */
export const REVEAL_MS = 600;
/** How long past the fade a section may still be animating before it is forced to its end state. */
export const REVEAL_GRACE_MS = 400;

/**
 * Safety net: a browser that never ticks the transition (seen in WebKit CI) must not leave a shown section at opacity 0.
 * Shortly after the fade should have ended, any animation still on the section is finished.
 */
export function settleReveal(target: Pick<HTMLElement, 'getAnimations'>): void {
  window.setTimeout(() => {
    for (const animation of target.getAnimations()) {
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    }
  }, REVEAL_MS + REVEAL_GRACE_MS);
}

/** A section waits for its reveal only if it starts below the window. */
export function waitsForReveal(top: number, viewportHeight: number): boolean {
  return top >= viewportHeight;
}

/**
 * When keyboard focus lands in a waiting section, reveal it instantly without motion and stop observing it.
 */
export function revealInstantly(section: HTMLElement, observer?: Pick<IntersectionObserver, 'unobserve'>): void {
  if (section.dataset.reveal === 'waiting') {
    section.dataset.reveal = 'instant';
    observer?.unobserve(section);
  }
}

/**
 * Once a waiting section has been made visible, align the still-focused target
 * against its final (untranslated) layout. This must happen in the focus-in
 * turn: WebKit can defer an animation frame while leaving the target below the
 * viewport edge.
 */
export function keepFocusedTargetInView(target: HTMLElement): void {
  if (document.activeElement === target) {
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

export function revealSections(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        if (target.dataset.reveal === 'instant') {
          observer.unobserve(target);
          continue;
        }
        const active = document.activeElement;
        if (active instanceof HTMLElement && target.contains(active) && target.dataset.reveal === 'waiting') {
          revealInstantly(target, observer);
          keepFocusedTargetInView(active);
          continue;
        }
        target.dataset.reveal = 'shown';
        observer.unobserve(target);
        settleReveal(target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const section of document.querySelectorAll<HTMLElement>('[data-reveal-section]')) {
    if (!waitsForReveal(section.getBoundingClientRect().top, window.innerHeight)) continue;
    section.dataset.reveal = 'waiting';
    const onFocusIn = (event?: FocusEvent) => {
      const target = event?.target;
      const focusTarget = target && typeof HTMLElement !== 'undefined' && target instanceof HTMLElement ? target : undefined;
      const inSection = focusTarget ? (typeof section.contains === 'function' ? section.contains(focusTarget) : true) : !event?.target;
      if (
        (section.dataset.reveal === 'waiting' || section.dataset.reveal === 'shown') &&
        inSection
      ) {
        if (section.dataset.reveal === 'waiting') revealInstantly(section, observer);
        else {
          section.dataset.reveal = 'instant';
          observer.unobserve(section);
        }
        section.removeEventListener('focusin', onFocusIn);
        if (focusTarget) keepFocusedTargetInView(focusTarget);
      }
    };
    section.addEventListener('focusin', onFocusIn);
    observer.observe(section);
  }
}
