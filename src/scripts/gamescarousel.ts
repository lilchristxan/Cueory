/**
 * Daily games carousel on Home v2 (nurse's station games).
 * Wraps 6 playing cards (280x392), handles previous/next buttons, arrow keys, touch swipe,
 * and maintains data-carousel-state="settled|turning".
 */

export function initGamesCarousel(): void {
  const root = document.querySelector<HTMLElement>('[data-games-carousel]');
  if (!root) return;

  const track = root.querySelector<HTMLElement>('[data-games-track]');
  const car = root.querySelector<HTMLElement>('[data-games-car]');
  const prevBtn = root.querySelector<HTMLButtonElement>('[data-games-prev]');
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-games-next]');
  const cards = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-game-card]'));

  if (!track || !car || cards.length === 0) return;

  let activeIndex = 0;
  const count = cards.length;
  const CARD_WIDTH = 280;
  const GAP = 28;
  const STEP = CARD_WIDTH + GAP;

  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  const isReducedMotion = () => !!motionQuery?.matches;

  let transitionTimer: number | undefined;

  const setState = (state: 'settled' | 'turning') => {
    root.dataset.carouselState = isReducedMotion() ? 'settled' : state;
  };

  const updatePosition = (newIndex: number) => {
    activeIndex = ((newIndex % count) + count) % count;

    cards.forEach((card, idx) => {
      card.classList.toggle('on', idx === activeIndex);
    });

    const carWidth = car.clientWidth || 320;
    const totalScroll = count * STEP - GAP;
    const maxScroll = Math.max(0, totalScroll - carWidth);

    let offset = activeIndex * STEP;
    if (offset > maxScroll) offset = maxScroll;

    setState('turning');
    if (isReducedMotion()) {
      track.style.transition = 'none';
      track.style.transform = `translateX(-${offset}px)`;
      setState('settled');
    } else {
      track.style.transition = 'transform 0.55s cubic-bezier(0.2, 0.7, 0.2, 1)';
      track.style.transform = `translateX(-${offset}px)`;

      if (transitionTimer !== undefined) window.clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        setState('settled');
      }, 600);
    }
  };

  track.addEventListener('transitionend', (e) => {
    if (e.target === track && e.propertyName === 'transform') {
      if (transitionTimer !== undefined) window.clearTimeout(transitionTimer);
      setState('settled');
    }
  });

  prevBtn?.addEventListener('click', () => {
    updatePosition(activeIndex - 1);
  });

  nextBtn?.addEventListener('click', () => {
    updatePosition(activeIndex + 1);
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      updatePosition(activeIndex + 1);
      cards[activeIndex]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      updatePosition(activeIndex - 1);
      cards[activeIndex]?.focus();
    }
  });

  cards.forEach((card, idx) => {
    card.addEventListener('focus', () => {
      if (idx !== activeIndex) {
        updatePosition(idx);
      }
    });
  });

  let startX = 0;
  let startY = 0;
  let isSwiping = false;

  car.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    isSwiping = true;
  }, { passive: true });

  car.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe intention
    }
  }, { passive: true });

  car.addEventListener('touchend', (e) => {
    if (!isSwiping) return;
    isSwiping = false;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        updatePosition(activeIndex + 1);
      } else {
        updatePosition(activeIndex - 1);
      }
    }
  }, { passive: true });

  // Hydrate today's status from localStorage if available
  try {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const raw = localStorage.getItem('cueory-game-stats');
    if (raw) {
      const stats = JSON.parse(raw);
      if (Array.isArray(stats)) {
        const statusEls = root.querySelectorAll<HTMLElement>('[data-game-status]');
        statusEls.forEach((el) => {
          const gameId = el.getAttribute('data-game-status');
          if (!gameId) return;
          const done = stats.some(
            (r: { game?: string; day?: string }) =>
              (r.game === gameId || (gameId === 'vialo' && r.game === 'pulse') || (gameId === 'piccline' && r.game === 'suture') || (gameId === 'tachyyy' && r.game === 'stat')) &&
              r.day === today
          );
          if (done) {
            el.innerHTML = '<span class="gstatus-sym" aria-hidden="true">✓</span> done today';
          }
        });
      }
    }
  } catch {
    // Ignore storage errors
  }

  setState('settled');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGamesCarousel, { once: true });
  } else {
    initGamesCarousel();
  }
}
