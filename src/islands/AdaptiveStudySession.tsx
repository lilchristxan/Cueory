import { useEffect, useRef, useState } from 'react';
import { DAY_MS, dayNumber, type StudyClock } from './adaptive-learning/calendar';
import {
  cardMastered, recordAnswer, recordConceptAnswer, type CardMemory, type ConceptEvidence,
} from './adaptive-learning/memory';
import { reviewDue } from './adaptive-learning/scheduler';
import { selectPractice, SESSION_LIMIT, type PracticeSelection } from './adaptive-learning/selector';
import { localDay } from '../scripts/progress';

export interface SampleStudyCard {
  id: string;
  front: string;
  back: string;
}

interface Session {
  memory: ReadonlyMap<string, CardMemory>;
  evidence?: ConceptEvidence;
  answered: number;
  current?: PracticeSelection;
  clock: StudyClock;
  simulated?: true;
}

const action = 'press min-h-(--tap-min) rounded-pill border border-control px-6 py-3 text-ink';
const primary = 'press min-h-(--tap-min) rounded-pill bg-button px-6 py-3 text-on-button hover:bg-button-hover';
const concept = 'study-skills';

function browserClock(): StudyClock {
  const now = new Date();
  return { now: now.getTime(), day: localDay(now) };
}

function sessionClock(session: Session): StudyClock {
  if (session.simulated) return session.clock;
  const now = browserClock();
  // A device clock or time zone can move back mid-session. Keep the last accepted
  // instant and day until the device catches up, without counting extra spaced practice.
  return now.now < session.clock.now || now.day < session.clock.day ? session.clock : now;
}

function nextCard(
  cards: readonly SampleStudyCard[],
  session: Session,
  clock: StudyClock,
  examDay?: string,
): PracticeSelection | undefined {
  const evidence = session.evidence ? new Map([[concept, session.evidence]]) : new Map();
  return selectPractice(
    cards.map(({ id }) => {
      const memory = session.memory.get(id);
      return { id, concept, level: 2, dueDay: memory && reviewDue(memory, clock, examDay) };
    }),
    { selections: session.answered, previousId: session.current?.id, evidence, preferredLevels: new Map() },
    clock,
    Math.random,
  );
}

export default function AdaptiveStudySession({
  cards,
  allowPreviewAdvance = false,
}: {
  cards: SampleStudyCard[];
  allowPreviewAdvance?: boolean;
}) {
  const [session, setSession] = useState<Session>();
  const [examDay, setExamDay] = useState('');
  const [revealed, setRevealed] = useState(false);
  const startButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  const card = cards.find(item => item.id === session?.current?.id);

  useEffect(() => {
    if (!session) {
      if (returnFocus.current) startButton.current?.focus();
      return;
    }
    if (revealed) result.current?.focus();
    else heading.current?.focus();
  }, [session, revealed]);

  function start() {
    returnFocus.current = true;
    const empty: Session = { memory: new Map(), answered: 0, clock: browserClock() };
    setSession({ ...empty, current: nextCard(cards, empty, empty.clock, examDay || undefined) });
    setRevealed(false);
  }

  function answer(right: boolean) {
    if (!session || !card || !revealed) return;
    const clock = sessionClock(session);
    const updated: Session = {
      ...session,
      clock,
      memory: new Map(session.memory).set(card.id, recordAnswer(session.memory.get(card.id), right, clock)),
      evidence: recordConceptAnswer(session.evidence, right, clock),
      answered: session.answered + 1,
    };
    setSession({ ...updated, current: nextCard(cards, updated, clock, examDay || undefined) });
    setRevealed(false);
  }

  if (!session) {
    return (
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); start(); }}>
        <label className="block" htmlFor="adaptive-preview-exam">exam date (optional)</label>
        <p id="adaptive-preview-exam-format" className="text-sm text-ink-soft">enter a date as YYYY-MM-DD.</p>
        <input id="adaptive-preview-exam" type="text" value={examDay}
          aria-describedby="adaptive-preview-exam-format"
          onChange={event => {
            const input = event.currentTarget;
            input.setCustomValidity('');
            if (input.value) {
              try {
                dayNumber(input.value);
              } catch {
                input.setCustomValidity('Enter a valid date as YYYY-MM-DD.');
              }
            }
            setExamDay(input.value);
          }}
          className="block min-h-(--tap-min) max-w-full rounded-lg border border-control bg-page px-3 text-ink" />
        <button ref={startButton} type="submit" className={primary}>start sample session</button>
      </form>
    );
  }

  if (!card) {
    const clock = sessionClock(session);
    const memories = [...session.memory.values()];
    const nextDue = memories.map(memory => reviewDue(memory, clock, examDay || undefined)).sort()[0];
    const mastered = memories.filter(memory => cardMastered(memory, clock)).length;

    const practiceAgain = (day: string) => {
      const elapsed = dayNumber(day) - dayNumber(clock.day);
      const next: Session = {
        memory: session.memory, evidence: session.evidence, answered: 0, simulated: true,
        clock: { day, now: clock.now + elapsed * DAY_MS },
      };
      setSession({ ...next, current: nextCard(cards, next, next.clock, examDay || undefined) });
    };
    return (
      <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
        <h2 ref={heading} tabIndex={-1} className="text-xl">
          {session.answered >= SESSION_LIMIT ? 'session limit reached' : 'nothing else due now'}
        </h2>
        <p>{session.answered} {session.answered === 1 ? 'card' : 'cards'} answered this session.</p>
        <p>{mastered} of {cards.length} cards meet the spaced mastery rule.</p>
        {nextDue && <p>next scheduled review <time dateTime={nextDue}>{nextDue}</time></p>}
        <div className="flex flex-wrap gap-3">
          {allowPreviewAdvance && nextDue && nextDue > clock.day && (
            <button type="button" className={primary} onClick={() => practiceAgain(nextDue)}>
              jump to that review day
            </button>
          )}
          <button type="button" className={action} onClick={() => setSession(undefined)}>restart the sample</button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
      {session.simulated && <p className="text-sm text-ink-soft">sample day {session.clock.day}</p>}
      <p className="text-sm text-ink-soft">{session.current?.reason} · card {session.answered + 1}</p>
      <h2 ref={heading} tabIndex={-1} className="text-xl">{card.front}</h2>
      {revealed ? (
        <>
          <p ref={result} tabIndex={-1}>{card.back}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={() => answer(true)}>i knew it</button>
            <button type="button" className={action} onClick={() => answer(false)}>i missed it</button>
          </div>
        </>
      ) : (
        <button type="button" className={primary} onClick={() => setRevealed(true)}>show answer</button>
      )}
    </section>
  );
}
