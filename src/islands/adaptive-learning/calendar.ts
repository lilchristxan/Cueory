export const DAY_MS = 86_400_000;

export interface StudyClock {
  /** Instant at which the student answered or made a selection. */
  now: number;
  /** The student's local calendar day at that instant. */
  day: string;
}

// Valid days only, so an invalid string still throws every time. Bounded so a long session cannot grow it.
const validDays = new Map<string, number>();
const MAX_CACHED_DAYS = 2048;

export function dayNumber(day: string): number {
  const cached = validDays.get(day);
  if (cached !== undefined) return cached;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day.startsWith('0000-') ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== day
  ) {
    throw new RangeError('Expected a calendar day in YYYY-MM-DD format.');
  }
  if (validDays.size >= MAX_CACHED_DAYS) validDays.clear();
  validDays.set(day, time / DAY_MS);
  return time / DAY_MS;
}

export function calendarDay(number: number): string {
  const day = new Date(number * DAY_MS).toISOString().slice(0, 10);
  dayNumber(day);
  return day;
}
