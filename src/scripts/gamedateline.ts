import { dayNumber } from '../islands/pulse';

/**
 * Formats the date line for Games v2: "friday, november 20th · #312" in lowercase italic.
 */
export function formatGameDateLine(date: Date = new Date(), puzzleNumber?: number | string): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const month = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const day = date.getDate();
  const j = day % 10;
  const k = day % 100;
  let suffix = 'th';
  if (j === 1 && k !== 11) suffix = 'st';
  else if (j === 2 && k !== 12) suffix = 'nd';
  else if (j === 3 && k !== 13) suffix = 'rd';

  const num = puzzleNumber != null ? `#${puzzleNumber}` : `#${dayNumber(date) + 1}`;
  return `${weekday}, ${month} ${day}${suffix} · ${num}`;
}
