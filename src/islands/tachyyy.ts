import { dayLabel } from './daily';
import { STAT_QUESTIONS } from './stat';

/**
 * Approved share line for tachyyy: "tachyyy · [date] · [score] · cueory.app".
 * Neutral wording, brand style, plain text.
 */
export function tachyyyShareText(score: number, day: string, total = STAT_QUESTIONS): string {
  return `tachyyy · ${day} · ${score}/${total} · cueory.app`;
}

export function tachyyyShareLine(date: Date, score: number): string {
  return `tachyyy · ${dayLabel(date)} · ${score}/${STAT_QUESTIONS} · cueory.app`;
}
