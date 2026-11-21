import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { dayLabel } from './daily';
import { showFocusRing } from './focusring';
import { helloResultCard, showResultCard } from './gameresults';
import {
  HELLO_CATEGORY_LABELS,
  HELLO_DEPTH_LABELS,
  type HelloDepth,
  dayIndex,
  isReflective,
  msUntilNextDay,
  promptOfTheDay,
  nextStarter,
  startersFor,
  type HelloStarter,
} from './hello-cards';

const faceClass =
  'col-start-1 row-start-1 flex min-h-56 min-w-0 flex-col items-center justify-center rounded-xl border border-line bg-surface px-6 py-10 text-center shadow-card sm:px-10';

/**
 * Flip-the-card conversation starters. The card is one real button: tap, click, Enter or Space turns it over
 * (aria-pressed says which side shows). Choices stay in memory only; nothing is scored, saved or sent.
 */
export default function HelloCards({ starters }: { starters: readonly HelloStarter[] }) {
  const [depth, setDepth] = useState<HelloDepth>('small');
  const [current, setCurrent] = useState<HelloStarter | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [flipsToday, setFlipsToday] = useState(0);
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const [today, setToday] = useState(() => new Date());
  const dayRef = useRef(dayIndex(today));
  const daily = useMemo(() => promptOfTheDay(starters, today, depth), [starters, today, depth]);

  // The first card is drawn after hydration so the server and browser never disagree about a random pick.
  useEffect(() => {
    const first = nextStarter(starters, 'all', 'small', [], null);
    setCurrent(first.starter);
    setSeen(first.seen);
    setReady(true);
  }, [starters]);

  // A tab left open past local midnight moves on to the new day: a timer for midnight, plus a check when the tab
  // comes back into view or focus (timers can pause while a device sleeps). Both are cleared on unmount.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = new Date();
      setToday((previous) => (dayIndex(previous) === dayIndex(now) ? previous : now));
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextDay(new Date()));
    };
    const check = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        schedule();
      }
    };
    schedule();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  // The five-flip encouragement belongs to the local day, but remains deliberately session-only like the cards.
  useEffect(() => {
    const nextDay = dayIndex(today);
    if (nextDay === dayRef.current) return;
    dayRef.current = nextDay;
    setFlipsToday(0);
    setCompletionDismissed(false);
    setNotice('a new day, with five new cards to flip.');
  }, [today]);

  const draw = (nextDepth: HelloDepth, history: string[], last: string | null) => {
    const result = nextStarter(starters, 'all', nextDepth, history, last);
    setCurrent(result.starter);
    setSeen(result.seen);
    setFlipped(false);
    return result.starter;
  };

  const chooseDepth = (next: HelloDepth) => {
    if (next === depth) return;
    setDepth(next);
    draw(next, [], null);
    setNotice(`${HELLO_DEPTH_LABELS[next]} chosen. a new card is face down.`);
  };

  const flip = (event: MouseEvent<HTMLButtonElement>) => {
    if (!current) return;
    const next = !flipped;
    setFlipped(next);
    if (next) {
      setFlipsToday((previous) => Math.min(5, previous + 1));
      setCompletionDismissed(false);
    }
    setNotice(next ? `card turned over. ${current && isReflective(current.category) ? 'ask yourself' : 'try asking'}: ${current.text}` : 'card turned face down.');
    // Enter or Space after a click: Firefox keeps the card without its focus ring (focusring.ts).
    if (event.detail === 0) showFocusRing(event.currentTarget);
  };

  const another = () => {
    draw(depth, seen, current?.id ?? null);
    setNotice('a new card is face down.');
    cardRef.current?.focus();
  };

  const toggleFavorite = () => {
    if (!current) return;
    setFavorites((previous) => {
      const next = new Set(previous);
      if (next.has(current.id)) next.delete(current.id);
      else next.add(current.id);
      return next;
    });
    setNotice(favorites.has(current.id) ? 'removed this card from favorites for this visit.' : 'saved this card as a favorite for this visit.');
  };

  const keepGoing = () => {
    setCompletionDismissed(true);
    another();
    setNotice('keep going. a new card is face down.');
  };

  const count = startersFor(starters, 'all', depth).length;

  return (
    <div className="text-ink">
      {daily && (
        <section aria-labelledby="hello-daily-heading" className="mb-8 rounded-xl border-2 border-control bg-surface p-6 text-center shadow-card sm:p-8" data-testid="hello-daily">
          <h2 id="hello-daily-heading" className="text-sm font-bold">prompt of the day · {dayLabel(today)} · {HELLO_DEPTH_LABELS[depth]}</h2>
          <p className="mt-1 text-sm text-ink-soft">{isReflective(daily.category) ? 'a question for yourself' : `for ${HELLO_CATEGORY_LABELS[daily.category]}`}</p>
          <p className="mt-3 wrap-anywhere text-2xl" data-testid="hello-daily-text">{daily.text}</p>
          <button
            type="button"
            className="mt-4 min-h-(--tap-min) rounded-pill border border-control px-5 py-2.5"
            onClick={() => showResultCard(helloResultCard({
              prompt: daily.text,
              date: dayLabel(today),
              deck: HELLO_DEPTH_LABELS[depth],
            }))}
          >
            share today's card
          </button>
        </section>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center" data-testid="hello-depth">
        <span aria-hidden="true" className={`min-w-0 wrap-anywhere text-lg ${depth === 'small' ? 'font-bold underline underline-offset-4' : 'text-ink-soft'}`}>
          {HELLO_DEPTH_LABELS.small}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={depth === 'deep'}
          aria-label="deep convo"
          disabled={!ready}
          onClick={() => chooseDepth(depth === 'deep' ? 'small' : 'deep')}
          data-testid="hello-depth-switch"
          className="press relative inline-flex h-(--tap-min) w-18 shrink-0 cursor-pointer touch-manipulation items-center rounded-pill border-2 border-control bg-page disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`absolute left-1 flex size-8 items-center justify-center rounded-full bg-button text-sm text-on-button transition-transform duration-(--duration-base) ease-(--ease-soft) motion-reduce:transition-none ${depth === 'deep' ? 'translate-x-8' : 'translate-x-0'}`}
          >
          </span>
        </button>
        <span aria-hidden="true" className={`min-w-0 wrap-anywhere text-lg ${depth === 'deep' ? 'font-bold underline underline-offset-4' : 'text-ink-soft'}`}>
          {HELLO_DEPTH_LABELS.deep}
        </span>
      </div>

      <section className="mt-stack" aria-label="today's conversation card board">
        <div className="mb-5 flex items-center justify-center gap-2" role="status" aria-label={`${flipsToday} of 5 cards flipped today`} data-testid="hello-flip-progress">
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`size-3 rounded-full border-2 border-control ${index < flipsToday ? 'bg-ink' : 'bg-surface'}`}
            />
          ))}
          <span className="sr-only">{flipsToday} of 5 cards flipped today</span>
        </div>

        <div className="relative mx-auto grid w-full max-w-md grid-cols-1 py-5 sm:py-7">
          <span aria-hidden="true" className="col-start-1 row-start-1 mx-6 min-h-72 rotate-[-6deg] rounded-xl bg-ink shadow-card" />
          <span aria-hidden="true" className="col-start-1 row-start-1 mx-6 min-h-72 rotate-[5deg] rounded-xl bg-ink shadow-card" />
          <div className={`flip col-start-1 row-start-1${flipped ? ' is-flipped' : ''}`}>
            <button
              ref={cardRef}
              type="button"
              aria-pressed={flipped}
              aria-label="conversation card"
              aria-describedby="hello-card-hint hello-card-question"
              disabled={!ready || !current}
              onClick={flip}
              data-testid="hello-card"
              className="press relative block w-full cursor-pointer touch-manipulation rounded-xl text-left disabled:cursor-default"
            >
              <span className="flip-inner grid min-w-0 grid-cols-1">
                <span className={`flip-face ${faceClass}`} aria-hidden={flipped || undefined}>
                  <span className="text-sm text-ink-soft">{HELLO_DEPTH_LABELS[depth]}</span>
                  <span className="mt-3 text-xl font-bold">tap to turn over</span>
                </span>
                <span className={`flip-back relative ${faceClass}`} aria-hidden={!flipped || undefined} data-testid="hello-card-back">
                  <span className="text-sm text-ink-soft">{current && isReflective(current.category) ? 'ask yourself' : 'try asking'}</span>
                  <span className="mt-3 wrap-anywhere text-xl" data-testid="hello-card-text">{current?.text ?? ''}</span>
                </span>
              </span>
            </button>
          </div>
        </div>

        {flipsToday === 5 && !completionDismissed && (
          <section className="mx-auto mt-4 max-w-md rounded-xl border-2 border-control bg-surface p-6 text-center shadow-card" aria-labelledby="hello-complete-heading" data-testid="hello-complete">
            <h2 id="hello-complete-heading" className="font-display text-3xl">congrats!</h2>
            <p className="mt-2">You made the world friendlier today.</p>
            <p className="mt-3 text-sm font-bold uppercase tracking-wide text-ink-soft">5 of 5 cards flipped</p>
            <button type="button" className="press mt-5 min-h-(--tap-min) rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover" onClick={keepGoing}>
              Keep going
            </button>
          </section>
        )}
      </section>
      <p id="hello-card-question" className="sr-only">
        {flipped && current ? `${isReflective(current.category) ? 'ask yourself' : 'try asking'}: ${current.text}` : ''}
      </p>
      <p id="hello-card-hint" className="mt-2 text-sm text-ink-soft">
        {flipped ? 'press the card again to turn it face down.' : 'press the card to turn it over.'}
      </p>

      <div className="mt-stack flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={!ready || !current}
          onClick={another}
          className="press min-h-(--tap-min) rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-60"
        >
          Flip next card
        </button>
        <button
          type="button"
          disabled={!ready || !current}
          aria-pressed={Boolean(current && favorites.has(current.id))}
          onClick={toggleFavorite}
          className="press min-h-(--tap-min) rounded-pill border border-control px-5 py-2.5 disabled:opacity-60"
        >
          Favorite
        </button>
        <button
          type="button"
          disabled={!ready || !current}
          onClick={another}
          className="press min-h-(--tap-min) rounded-pill border border-control px-5 py-2.5 disabled:opacity-60"
        >
          Shuffle
        </button>
        <p className="w-full text-center text-sm text-ink-soft">{count} cards in this pile, shuffled · favorites last for this visit only</p>
      </div>
      <p className="sr-only" role="status" aria-label="hello cards update" aria-atomic="true">{notice}</p>
    </div>
  );
}
