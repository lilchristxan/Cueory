import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import SpeakButton from './SpeakButton';
import {
  advance,
  canAdvance,
  choose,
  fillParts,
  giveUp,
  isOver,
  masteredCount,
  overrule,
  reveal,
  startLearn,
  stepOf,
  submit,
  type LearnCard,
  type LearnState,
  type Step,
} from './learn';

interface Props {
  cards: LearnCard[];
  /** Where "Back to the lesson" on the summary card goes. */
  lessonHref?: string;
}

const primaryButton =
  'press inline-flex min-h-(--tap-min) items-center justify-center gap-2 rounded-pill bg-button px-6 py-3 text-on-button hover:bg-button-hover';
const secondaryButton =
  'press inline-flex min-h-(--tap-min) items-center justify-center gap-2 rounded-pill border border-control px-6 py-3 text-ink no-underline';
// The summary card: a plain surface with the soft card shadow (Task 77). Study screens stay plain.
const cardClass = 'rounded-xl border border-line bg-surface px-6 py-10 shadow-card sm:px-10';
// One panel holds the prompt, the answers and the buttons (Christian, 2026-11-26): a focused card on the plain page.
const panelClass = 'mt-6 rounded-2xl border border-line bg-(--study-card) px-5 py-6 shadow-card sm:px-8 sm:py-8';
const bubble = 'inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-pill px-2 text-sm font-medium';
/** The progress row is cut into at most this many pieces. */
const MAX_SEGMENTS = 6;

const stepLabel: Record<Step, string> = {
  see: 'New card',
  choose: 'Choose an answer',
  type: 'Type the answer',
  fill: 'Fill in the blank',
};

/** A tick or a cross next to the words, so right and wrong never depend on color. */
function ResultIcon({ correct }: { correct: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {correct ? <path d="M4 12.5 9.5 18 20 6" /> : <path d="M6 6 18 18M18 6 6 18" />}
    </svg>
  );
}


/**
 * Learn mode (D-43): each card is seen, then chosen from the deck's answers, then typed or filled in, and anything
 * missed comes back until every card is mastered. Every control is a real button or text field, so it works by
 * tapping, clicking or keyboard, and nothing moves on by itself. Rendered only in the browser (client:only); without
 * JavaScript the page shows its <noscript> note instead.
 */
export default function LearnSession({ cards, lessonHref = '/learn/study-skills' }: Props) {
  const [state, setState] = useState<LearnState>(() => startLearn(cards));
  const [typed, setTyped] = useState('');
  // Every action moves keyboard focus to the card, so the next thing to do is right there.
  const [focusRequest, setFocusRequest] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const fillRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Cards the student has missed this session: when one comes back it says "let's try again".
  const [missed, setMissed] = useState<ReadonlySet<number>>(() => new Set());
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // An empty answer is explained, not silently refused: the message is text (not colour), tied to the field with
  // aria-describedby and aria-invalid, and announced through the always-present live region below.
  const [problem, setProblem] = useState('');

  // Cards rise in (.enter, Task 77) only after the student does something: the first card is there at once on page
  // load, so nothing waits to fade in.
  const enter = focusRequest > 0 ? 'enter ' : '';

  const total = cards.length;
  const mastered = masteredCount(state);
  const progress = total > 0 ? mastered / total : 0;
  const segments = Math.min(total, MAX_SEGMENTS);
  /** How full each piece of the progress row is, 0 to 1. */
  const segmentFill = (i: number) => Math.max(0, Math.min(1, progress * segments - i));
  /** The count sits after the pieces that are full. */
  const countAfter = Math.min(segments, Math.floor(progress * segments + 1e-9));

  useEffect(() => {
    if (focusRequest > 0) cardRef.current?.focus();
  }, [focusRequest]);

  // The bar's length is a CSS custom property set through the element's style object, never a style="" attribute, so
  // the strict style-src policy allows it (the .progress-fill pattern in global.css). It runs after every render
  // because the summary screen draws a new bar element.
  useEffect(() => {
    fillRefs.current.forEach((el, i) => el?.style.setProperty('--progress', String(segmentFill(i))));
  });

  const act = (next: (s: LearnState) => LearnState) => {
    setState(next);
    setFocusRequest((n) => n + 1);
  };
  const moveOn = () => {
    const onScreen = state.queue[0];
    if (onScreen !== undefined && state.result && !state.result.correct) setMissed((before) => new Set(before).add(onScreen));
    setTyped('');
    setProblem('');
    act((s) => advance(s, cards));
  };
  const check = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim() === '') {
      setProblem('type an answer first, or look at the card again.');
      inputRef.current?.focus();
      return;
    }
    setProblem('');
    act((s) => submit(s, cards, typed));
  };

  const count = (
    <span key="count" data-testid="learn-count" aria-hidden="true" className={`${bubble} bg-button text-on-button`}>
      {mastered}
    </span>
  );
  const progressBar = (
    <div
      className="flex items-center gap-1.5"
      role="progressbar"
      aria-label="Cards recalled today"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={mastered}
      aria-valuetext={`${mastered} of ${total}`}
    >
      <span className="sr-only">
        recalled today {mastered} of {total}
      </span>
      {Array.from({ length: segments }, (_, i) => [
        i === countAfter ? count : null,
        <div key={i} className="progress-track h-3 min-w-0 flex-1" data-testid="learn-segment">
          <div
            ref={(el) => {
              fillRefs.current[i] = el;
            }}
            className="progress-fill"
          />
        </div>,
      ])}
      {countAfter >= segments && count}
      <span data-testid="learn-total" aria-hidden="true" className={`${bubble} bg-surface text-ink`}>
        {total}
      </span>
    </div>
  );

  if (isOver(state)) {
    return (
      <div>
        {progressBar}
        {/* A calm summary: no confetti, no streaks. */}
        <div ref={cardRef} tabIndex={-1} className={`${enter}mt-stack ${cardClass}`}>
          <p className="text-xl">
            You know all {total} {total === 1 ? 'card' : 'cards'}.
          </p>
          <p className="mt-2 text-sm text-ink-soft">Each one was seen, chosen and recalled.</p>
          <p className="mt-stack text-sm text-ink-soft">
            recalled today: {total} · still learning: 0
          </p>
        </div>
        <div className="mt-stack flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setMissed(new Set());
              act(() => startLearn(cards));
            }}
            className={primaryButton}
          >
            Start again
          </button>
          <a href={lessonHref} className={secondaryButton}>
            Back to the lesson
          </a>
        </div>
      </div>
    );
  }

  const index = state.queue[0]!;
  const card = cards[index]!;
  const step = stepOf(state, cards)!;
  const result = state.result;
  const fill = step === 'fill' ? fillParts(card) : null;
  const expected = step === 'fill' ? card.blank! : card.back;

  const retry = missed.has(index) && step !== 'see';
  const spoken = step === 'see' && state.revealed ? `${card.front}. ${card.back}` : card.front;

  return (
    <div>
      {progressBar}

      <div className={panelClass} data-testid="learn-panel">
        {/*
          The deck's one live region stays in the page; the card inside it is drawn fresh for every card and step, so
          it rises in after each action. Under reduced motion it simply appears.
        */}
        <div aria-live="polite">
          <div key={`${index}-${step}`} ref={cardRef} tabIndex={-1} data-testid="learn-card" className={`${enter}rounded-lg`}>
            <div className="flex min-h-(--tap-min) items-center gap-1 text-sm text-ink-soft">
              <span>{step === 'see' ? 'card' : 'term'}</span>
              <SpeakButton text={spoken} />
            </div>
            <p data-testid="learn-prompt" className="mt-3 mb-14 wrap-anywhere text-xl">
              {card.front}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span data-testid="learn-step" className="text-sm font-bold text-ink-soft lowercase">
                {stepLabel[step]}
              </span>
              {retry && (
                <span data-testid="learn-retry" className="rounded-pill bg-surface px-3 py-0.5 text-sm text-ink">
                  let's try again
                </span>
              )}
            </p>

            {step === 'see' && state.revealed && (
              <p className="enter mt-stack border-t border-line pt-stack text-lg">
                <span className="sr-only">Answer: </span>
                {card.back}
              </p>
            )}

            {fill && (
              <p className="mt-stack border-t border-line pt-stack text-lg">
                {fill.before}
                <span aria-hidden="true">______</span>
                <span className="sr-only">blank</span>
                {fill.after}
              </p>
            )}

            {result && (
              <div className="enter mt-stack border-t border-line pt-stack" data-testid="learn-feedback">
                <p className="flex items-center gap-2 text-lg">
                  <ResultIcon correct={result.correct} />
                  {result.overruled ? 'Counted as right.' : result.correct ? 'Correct.' : 'Not quite.'}
                </p>
                {!result.correct && (
                  <p className="mt-2">
                    <span className="text-ink-soft">The answer: </span>
                    {expected}
                  </p>
                )}
                {!result.correct && typeof result.given === 'string' && result.given !== '' && (
                  <p className="mt-1 text-ink-soft">You wrote: {result.given}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {step === 'choose' && (
          <ul aria-label="Answers" className="mt-4 grid gap-3.5 sm:auto-rows-fr sm:grid-cols-2">
            {state.choices.map((choice) => {
              const picked = result?.given === choice;
              const isAnswer = choice === index;
              const note = result ? (isAnswer ? 'The answer' : picked ? 'Your choice' : '') : '';
              // After a pick, the answer gets a tick and a dark border, a wrong pick a cross; the words below each say
              // which is which, so the state never depends on the border or icon alone.
              const tone = !result
                ? 'border-line hover:bg-surface'
                : isAnswer
                  ? 'border-ink ring-1 ring-ink'
                  : picked
                    ? 'border-control'
                    : 'border-line';
              return (
                <li key={choice} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => act((s) => choose(s, cards, choice))}
                    disabled={result !== null}
                    aria-pressed={result ? picked : undefined}
                    className={`press flex h-full min-h-15 w-full items-center gap-3 rounded-xl border bg-(--study-card) px-5 py-4 text-left text-ink disabled:cursor-default ${tone}`}
                  >
                    {result && (isAnswer || picked) && (
                      <span className="flex shrink-0">
                        <ResultIcon correct={isAnswer} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      {cards[choice]!.back}
                      {note && <span className="block text-sm text-ink-soft">{note}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {(step === 'type' || step === 'fill') && !result && (
          <form onSubmit={check} noValidate className="mt-4">
            <label htmlFor={inputId} className="block text-sm text-ink-soft">
              {step === 'fill' ? 'The missing words' : 'Your answer'}
            </label>
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => {
                setTyped(e.currentTarget.value);
                setProblem('');
              }}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${inputId}-problem` : undefined}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="mt-2 min-h-(--tap-min) w-full rounded-xl border border-control bg-page px-5 py-4 text-lg text-ink"
            />
            <p id={`${inputId}-problem`} role="alert" className="mt-2 text-sm text-ink" data-testid="answer-problem">
              {problem && <><span className="font-medium">problem:</span> {problem}</>}
            </p>
            <button type="submit" className={`mt-stack ${primaryButton}`}>
              Check
            </button>
          </form>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {step === 'see' && !state.revealed && (
            <button type="button" onClick={() => act((s) => reveal(s, cards))} className={primaryButton}>
              Show answer
            </button>
          )}
          {canAdvance(state, cards) && (
            <button type="button" onClick={moveOn} className={primaryButton}>
              {step === 'see' ? 'Next card' : 'Continue'}
            </button>
          )}
          {result && !result.correct && result.given !== '' && (step === 'type' || step === 'fill') && (
            <button type="button" onClick={() => act((s) => overrule(s, cards))} className={secondaryButton}>
              I was right
            </button>
          )}
          {step !== 'see' && !result && (
            <button
              type="button"
              aria-label="flag or comment on this card"
              data-testid="learn-flag"
              onClick={() => {
                // One report form per page (Task 115): this opens the page's own, in the footer.
                const flag = document.querySelector<HTMLElement>('#footer-flag button, #footer-flag a');
                flag?.scrollIntoView({ block: 'center' });
                flag?.click();
              }}
              className="press ml-auto inline-flex size-(--tap-min) items-center justify-center rounded-pill text-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 21V4h11l-2 4 2 4H5" />
              </svg>
            </button>
          )}
          {step !== 'see' && !result && (
            <button
              type="button"
              onClick={() => {
                setProblem('');
                act((s) => giveUp(s, cards));
              }}
              className="press inline-flex min-h-(--tap-min) items-center px-2 font-bold text-ink underline underline-offset-4"
            >
              don't know?
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
