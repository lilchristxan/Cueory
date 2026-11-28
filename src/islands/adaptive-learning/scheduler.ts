import { calendarDay, dayNumber, type StudyClock } from './calendar';
import { RECALL_TARGET, type CardMemory } from './memory';

/** Anchor the interval to the last answer, so opening a session cannot postpone a card. */
export function reviewDue(
  memory: CardMemory,
  clock: StudyClock,
  examDay?: string,
): string {
  const last = dayNumber(memory.lastDay);
  const today = dayNumber(clock.day);
  if (today < last) throw new RangeError('Today cannot precede the last answer.');
  const interval = memory.lastCorrect
    ? Math.min(14, Math.max(1, Math.ceil(-Math.log2(RECALL_TARGET) * memory.halfLifeDays)))
    : 1;
  const normalDue = last + interval;
  const exam = examDay === undefined ? undefined : dayNumber(examDay);
  if (exam === undefined || exam < today || exam <= last + 1) return calendarDay(normalDue);
  return calendarDay(Math.min(normalDue, exam - 1));
}
