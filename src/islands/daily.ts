/** Shared by the daily games on /play (D-61, D-63). Pure, so it can be unit tested (tests/unit/triage.test.ts). */

/** The date on a share line, in the visitor's own words: "sun 1 nov". */
export function dayLabel(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  return `${weekday} ${date.getDate()} ${month}`;
}

/** The local Date constructor accounts for 23-hour and 25-hour DST days. */
export function msUntilLocalMidnight(date: Date | null): number | null {
  try {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
    // Date(year, ...) maps years 0–99 to 1900–1999, creating an overflowing timer on a bad device clock.
    // Clone first, then move to the next local midnight without changing the caller's Date.
    const next = new Date(date.getTime());
    next.setHours(24, 0, 0, 0);
    const remaining = next.getTime() - date.getTime();
    return Number.isFinite(remaining) && remaining > 0 ? remaining : null;
  } catch {
    return null;
  }
}
