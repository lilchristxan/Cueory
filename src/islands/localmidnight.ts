/** Pure Home date helper. Kept separate from the shared daily-game module so Home-only code does not enlarge /account. */
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
