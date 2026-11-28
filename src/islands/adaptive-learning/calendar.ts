export const DAY_MS = 86_400_000;

export interface StudyClock {
  /** Instant at which the student answered or made a selection. */
  now: number;
  /** The student's local calendar day at that instant. */
  day: string;
}

export function dayNumber(day: string): number {
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day.startsWith('0000-') ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== day
  ) {
    throw new RangeError('Expected a calendar day in YYYY-MM-DD format.');
  }
  return time / DAY_MS;
}

export function calendarDay(number: number): string {
  const day = new Date(number * DAY_MS).toISOString().slice(0, 10);
  dayNumber(day);
  return day;
}
