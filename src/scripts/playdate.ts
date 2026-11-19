import { dayLabel } from '../islands/daily';
import { localDay } from '../islands/gameresults';

/**
 * The /play breadcrumb's date (redesign P8). The site is built ahead of time, so a date written at build time would
 * show the build day to every visitor; this fills it from the visitor's own clock instead. One local Date gives both
 * the words ("sun 1 nov") and the machine-readable value ("2026-11-01", the same local day the game cards use), so the
 * two never disagree. The date sits at the end of the breadcrumb's one line, so showing it moves nothing.
 */
export function showPlayDate(root: ParentNode, now: Date = new Date()): void {
  const holder = root.querySelector<HTMLElement>('[data-play-date]');
  const time = holder?.querySelector('time');
  if (!holder || !time) return;
  time.dateTime = localDay(now);
  time.textContent = dayLabel(now);
  holder.hidden = false;
}
