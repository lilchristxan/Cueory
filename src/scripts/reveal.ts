/**
 * Home page sections fade in with a small rise as they first come into view, once (D-62). Only the sections still
 * below the window when this runs are made to wait, so a section is never hidden without JavaScript, never hidden
 * once it is on screen, and with reduced motion nothing waits at all. The look is in global.css ([data-reveal]).
 */

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
 * Once a waiting section has been made visible, let the browser finish the
 * focus scroll against its final (untranslated) layout. WebKit can otherwise
 * keep the newly focused control a few pixels below the viewport edge.
 */
export function keepFocusedTargetInView(target: HTMLElement): void {
  window.requestAnimationFrame(() => {
    if (document.activeElement === target) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });
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
        target.dataset.reveal = 'shown';
        observer.unobserve(target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const section of document.querySelectorAll<HTMLElement>('[data-reveal-section]')) {
    if (!waitsForReveal(section.getBoundingClientRect().top, window.innerHeight)) continue;
    section.dataset.reveal = 'waiting';
    const onFocusIn = (event?: FocusEvent) => {
      if (section.dataset.reveal === 'waiting') {
        revealInstantly(section, observer);
        section.removeEventListener('focusin', onFocusIn);
        const target = event?.target;
        if (target && typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
          keepFocusedTargetInView(target);
        }
      }
    };
    section.addEventListener('focusin', onFocusIn);
    observer.observe(section);
  }
}
