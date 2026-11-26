/**
 * A gentle sideways shake for a wrong pick, through the Web Animations API, so no stylesheet is injected (the CSP allows
 * none) and the distance and timing come from the design tokens. Nothing moves when the device asks for reduced motion.
 */
export function shake(element: HTMLElement | null) {
  if (!element || typeof element.animate !== 'function') return;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (motion?.matches) return;
  const tokens = getComputedStyle(element);
  const step = tokens.getPropertyValue('--spacing').trim();
  const duration = Number.parseFloat(tokens.getPropertyValue('--duration-base'));
  if (!step || !Number.isFinite(duration)) return;
  const away = (sign: number) => ({ translate: `calc(${step} * ${sign}) 0` });
  const animation = element.animate([{ translate: '0 0' }, away(-1), away(1), away(-1), { translate: '0 0' }], { duration, easing: 'ease-in-out' });
  // A preference change must also stop a shake that has already started.
  const stop = (event: MediaQueryListEvent) => {
    if (event.matches) animation.cancel();
  };
  const cleanup = () => motion?.removeEventListener('change', stop);
  motion?.addEventListener('change', stop);
  // Cancellation rejects finished; handle both paths and release the media listener.
  void animation.finished.then(cleanup, cleanup);
}
