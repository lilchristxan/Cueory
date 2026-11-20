/**
 * Daily games carousel on Home v2 (nurse's station games).
 * Wraps 6 playing cards (280x392), handles previous/next buttons, arrow keys, touch swipe,
 * and maintains data-carousel-state="settled|turning".
 */

function matchesGame(cardGameId: string, resultGame: string | undefined): boolean {
  if (!resultGame) return false;
  if (cardGameId === 'vialo') return resultGame === 'vialo' || resultGame === 'pulse' || resultGame === 'pillo';
  if (cardGameId === 'tachyyy') return resultGame === 'tachyyy' || resultGame === 'stat';
  if (cardGameId === 'piccline') return resultGame === 'piccline' || resultGame === 'suture';
  if (cardGameId === 'crossword') return resultGame === 'cueword' || resultGame === 'crossword';
  if (cardGameId === 'sudoku') return resultGame === 'triage' || resultGame === 'sudoku';
  return resultGame === cardGameId;
}

export function hydrateGameStatuses(root: HTMLElement): void {
  try {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const raw = localStorage.getItem('cueory-game-stats');
    if (!raw) return;

    let results: Array<{ game?: string; day?: string; solved?: boolean }> = [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      results = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown }).results)) {
      results = (parsed as { results: Array<{ game?: string; day?: string; solved?: boolean }> }).results;
    }

    if (results.length === 0) return;

    const statusEls = root.querySelectorAll<HTMLElement>('[data-game-status]');
    statusEls.forEach((el) => {
      const gameId = el.getAttribute('data-game-status');
      if (!gameId || gameId === 'hello-cards') return;
      const done = results.some(
        (r) => matchesGame(gameId, r?.game) && r?.day === today
      );
      if (done) {
        el.innerHTML = '<span class="gstatus-sym" aria-hidden="true">✓</span> done today';
      }
    });
  } catch {
    // Ignore storage errors
  }
}

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

  hydrateGameStatuses(root);

  window.addEventListener('cueory:game-result', () => {
    hydrateGameStatuses(root);
  });
  window.addEventListener('cueory:sudoku-solved', () => {
    hydrateGameStatuses(root);
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'cueory-game-stats') {
      hydrateGameStatuses(root);
    }
  });

  setState('settled');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGamesCarousel, { once: true });
  } else {
    initGamesCarousel();
  }
}
