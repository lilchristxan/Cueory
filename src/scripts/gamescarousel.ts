/**
 * Daily games carousel on Home v2 (nurse's station games).
 * Loops 6 playing cards (280x392) in a circle (look-alike cards on each side, swapped silently at the join), handles previous/next buttons, arrow keys, touch swipe, dots,
 * and maintains data-carousel-state="settled|turning".
 */
import { msUntilLocalMidnight } from '../islands/localmidnight';

const DEFAULT_STATUS_HTML = '<span class="gstatus-sym" aria-hidden="true">○</span> not started';
const DONE_STATUS_HTML = '<span class="gstatus-sym" aria-hidden="true">✓</span> done today';

function matchesGame(cardGameId: string, resultGame: string | undefined): boolean {
  if (!resultGame) return false;
  if (cardGameId === 'vialo') return resultGame === 'vialo' || resultGame === 'pulse' || resultGame === 'pillo';
  if (cardGameId === 'tachyyy') return resultGame === 'tachyyy' || resultGame === 'stat';
  if (cardGameId === 'piccline') return resultGame === 'piccline' || resultGame === 'suture';
  if (cardGameId === 'crossword') return resultGame === 'cueword' || resultGame === 'crossword';
  if (cardGameId === 'sudoku') return resultGame === 'triage' || resultGame === 'sudoku';
  return resultGame === cardGameId;
}

/** Wraps a carousel position into 0..count-1 (the arrows, swipe and keyboard all go round and round). */
export function wrapPosition(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((Math.trunc(index) % count) + count) % count;
}

/**
 * The shortest way round the circle from one position to another: a whole number of steps in (-count/2, count/2].
 * A tie (exactly half way round) goes forward. Dots and focus use it so a jump across the join never rewinds the row.
 */
export function shortestDelta(from: number, to: number, count: number): number {
  if (count <= 0) return 0;
  const forward = wrapPosition(to - from, count);
  return forward * 2 > count ? forward - count : forward;
}

/**
 * The row keeps one set of look-alike cards on each side of the real ones, so a virtual position may run from
 * -count to 2 * count - 1 and still show a card. True when a position is inside that range.
 */
export function fitsClones(virtual: number, count: number): boolean {
  return count > 0 && virtual >= -count && virtual < 2 * count;
}

/** True when a virtual position sits on a look-alike card and must be silently swapped for the real one once settled. */
export function needsSnap(virtual: number, count: number): boolean {
  return count > 0 && (virtual < 0 || virtual >= count);
}

/** True when the row is too narrow for two whole cards, so the active card is centred (phones in portrait). */
export function centresActiveCard(rowWidth: number, cardWidth: number, step: number): boolean {
  return cardWidth > 0 && rowWidth < cardWidth + step;
}

/** The accessible name of a pager dot: its place in the row and the game it opens. */
export function pagerDotLabel(game: string, index: number, count: number): string {
  return `${game}, ${index + 1} of ${count}`;
}

/** Which dot is current: exactly one, and none when the position is out of range. */
export function pagerCurrentFlags(count: number, activeIndex: number): boolean[] {
  return Array.from({ length: Math.max(0, count) }, (_, idx) => idx === activeIndex);
}

export function hydrateGameStatuses(root: HTMLElement): void {
  try {
    const pad = (n: number) => String(n).padStart(2, '0');
    let today = '';
    try {
      const now = new Date();
      if (Number.isFinite(now.getTime())) {
        today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      }
    } catch {
      // If clock is unavailable, default status remains
    }
    const raw = localStorage.getItem('cueory-game-stats');

    let results: Array<{ game?: string; day?: string; solved?: boolean }> = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          results = parsed;
        } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown }).results)) {
          results = (parsed as { results: Array<{ game?: string; day?: string; solved?: boolean }> }).results;
        }
      } catch {
        results = [];
      }
    }

    const statusEls = root.querySelectorAll<HTMLElement>('[data-game-status], [data-clone-status]');
    statusEls.forEach((el) => {
      const gameId = el.getAttribute('data-game-status') ?? el.getAttribute('data-clone-status');
      if (!gameId) return;
      const done =
        Boolean(today) &&
        gameId !== 'hello-cards' &&
        results.some((r) => matchesGame(gameId, r?.game) && r?.day === today);
      const targetHtml = done ? DONE_STATUS_HTML : DEFAULT_STATUS_HTML;
      if (el.innerHTML !== targetHtml) {
        el.innerHTML = targetHtml;
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
  const dots = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-games-dot]'));

  if (!track || !car || cards.length === 0) return;

  let activeIndex = 0;
  // The position the row is showing. It runs past either end onto the look-alike cards (see below) and is swapped
  // for the matching real position, with no animation, once the slide has settled.
  let virtualIndex = 0;
  let moved = false;
  const count = cards.length;

  // The row is a circle: one set of look-alike cards sits before the real ones and one after, so going on from the
  // last card slides in the first, and going back from the first slides in the last. The look-alikes are hidden from
  // screen readers, cannot be tabbed to and carry no card marker, so there is still exactly one real set of cards.
  const makeClone = (card: HTMLAnchorElement): HTMLAnchorElement => {
    const clone = card.cloneNode(true) as HTMLAnchorElement;
    clone.removeAttribute('data-game-card');
    clone.removeAttribute('aria-label');
    clone.classList.remove('on');
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-game-clone', '');
    clone.tabIndex = -1;
    clone.querySelectorAll<HTMLElement>('[data-game-status]').forEach((el) => {
      el.setAttribute('data-clone-status', el.getAttribute('data-game-status') ?? '');
      el.removeAttribute('data-game-status');
    });
    return clone;
  };
  if (count > 1) {
    const before = document.createDocumentFragment();
    const after = document.createDocumentFragment();
    cards.forEach((card) => {
      before.appendChild(makeClone(card));
      after.appendChild(makeClone(card));
    });
    track.insertBefore(before, cards[0]);
    track.appendChild(after);
  }

  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  const isReducedMotion = () => !!motionQuery?.matches;

  let transitionTimer: number | undefined;

  const setState = (state: 'settled' | 'turning') => {
    root.dataset.carouselState = isReducedMotion() ? 'settled' : state;
  };

  const getStep = (): number => {
    if (cards.length >= 2) {
      const rect0 = cards[0].getBoundingClientRect();
      const rect1 = cards[1].getBoundingClientRect();
      const dist = rect1.left - rect0.left;
      if (dist > 0) return dist;
    }
    const cardWidth = cards[0]?.offsetWidth || 280;
    const computedGap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 28;
    return cardWidth + computedGap;
  };

  /** The row's offset for a virtual position, with the real first card at 0 (the look-alikes before it sit at negative x). */
  const offsetFor = (virtual: number, step: number): number => {
    const carWidth = car.clientWidth || 320;
    const cardWidth = cards[0]?.offsetWidth ?? 0;
    // Where fewer than two whole cards fit (phones in portrait), the active card is centred with a peek of its
    // neighbours on both sides, as on the board; elsewhere it stands at the row's left edge.
    if (centresActiveCard(carWidth, cardWidth, step)) {
      // The board's first sight of the row (nothing touched yet) keeps the first card at the row's left padding with a
      // peek of the next; once the visitor moves, every card, the first included, is centred.
      if (!moved && virtual === 0) return 0;
      const paddingLeft = parseFloat(getComputedStyle(car).paddingLeft) || 0;
      return virtual * step + paddingLeft - (carWidth - cardWidth) / 2;
    }
    return virtual * step;
  };

  const paint = (virtual: number, animate: boolean) => {
    const step = getStep();
    // Pull the track left by the look-alikes before the real cards so the real first card sits where it always did.
    // The same amount is added back on the other side so the track keeps the row's width (percent card widths stay put).
    track.style.marginInlineStart = count > 1 ? `-${count * step}px` : '';
    track.style.marginInlineEnd = count > 1 ? `${count * step}px` : '';
    track.style.transition = animate ? 'transform 0.55s cubic-bezier(0.2, 0.7, 0.2, 1)' : 'none';
    track.style.transform = `translateX(${-offsetFor(virtual, step)}px)`;
  };

  /** Swaps a look-alike position for the real one, instantly: the two look the same, so nothing visibly moves. */
  const settle = () => {
    if (transitionTimer !== undefined) window.clearTimeout(transitionTimer);
    transitionTimer = undefined;
    if (needsSnap(virtualIndex, count)) {
      virtualIndex = activeIndex;
      paint(virtualIndex, false);
      void track.offsetWidth; // apply the unanimated jump before any later slide starts
    }
    setState('settled');
  };

  /** Moves the row by a whole number of cards (positive goes forward, negative back; 0 repaints in place). */
  const move = (delta: number) => {
    // Past the look-alikes, swap to the real position first (only after many quick presses in a row).
    if (!fitsClones(virtualIndex + delta, count)) settle();
    virtualIndex += Math.trunc(delta);
    if (delta !== 0) moved = true;
    activeIndex = wrapPosition(virtualIndex, count);

    cards.forEach((card, idx) => {
      card.classList.toggle('on', idx === activeIndex);
    });
    // The pager follows every way of moving (arrows, swipe, keyboard, focus and the dots themselves).
    const flags = pagerCurrentFlags(dots.length, activeIndex);
    dots.forEach((dot, idx) => {
      if (flags[idx]) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });

    setState('turning');
    if (isReducedMotion()) {
      paint(virtualIndex, false);
      settle();
    } else {
      paint(virtualIndex, true);
      if (transitionTimer !== undefined) window.clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(settle, 600);
    }
  };

  /** Moves to a real card by the shortest way round the circle. */
  const goTo = (index: number) => {
    move(shortestDelta(activeIndex, index, count));
  };

  track.addEventListener('transitionend', (e) => {
    if (e.target === track && e.propertyName === 'transform') {
      settle();
    }
  });

  prevBtn?.addEventListener('click', () => {
    move(-1);
  });

  nextBtn?.addEventListener('click', () => {
    move(1);
  });

  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => {
      goTo(idx);
    });
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(1);
      cards[activeIndex]?.focus({ preventScroll: true });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(-1);
      cards[activeIndex]?.focus({ preventScroll: true });
    }
  });

  cards.forEach((card, idx) => {
    card.addEventListener('focus', () => {
      // A browser may scroll the clipped row to show a focused card; the row moves by its own transform instead.
      car.scrollLeft = 0;
      if (idx !== activeIndex) {
        goTo(idx);
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
        move(1);
      } else {
        move(-1);
      }
    }
  }, { passive: true });

  let midnightTimer: number | undefined;

  const refreshStatuses = () => {
    if (midnightTimer !== undefined) window.clearTimeout(midnightTimer);
    hydrateGameStatuses(root);
    let now: Date | null = null;
    try {
      now = new Date();
    } catch {
      // Ignore clock errors
    }
    const delay = (msUntilLocalMidnight(now) ?? 60_000) + 200;
    midnightTimer = window.setTimeout(refreshStatuses, delay);
  };

  refreshStatuses();

  // Hidden tabs may have throttled timers, so update immediately when visitor returns.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshStatuses();
  });

  // Restored pages (BFCache) can skip visibilitychange while their midnight timer was suspended.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refreshStatuses();
  });

  // Switching back to this window also reconciles device clock or time-zone changes.
  window.addEventListener('focus', () => {
    if (!document.hidden) refreshStatuses();
  });

  window.addEventListener('cueory:game-result', () => {
    refreshStatuses();
  });
  window.addEventListener('cueory:sudoku-solved', () => {
    refreshStatuses();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'cueory-game-stats') {
      refreshStatuses();
    }
  });

  window.addEventListener('resize', () => {
    settle();
    move(0);
  }, { passive: true });

  // Text size, fonts and window size all change the card step: repaint in place, without a slide, whenever it does.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      settle();
      paint(virtualIndex, false);
    }).observe(cards[0]);
  }

  paint(virtualIndex, false);
  setState('settled');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGamesCarousel, { once: true });
  } else {
    initGamesCarousel();
  }
}
