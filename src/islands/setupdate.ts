/**
 * The exam date typed in setup (/start), checked before anything is saved (lane 2). Pure logic: today is passed in.
 *
 * The date is optional, so a blank field is fine. A field the browser reports as unfinished (a date control shows
 * blank while half typed) gets its own message, so the student never thinks a half-typed date was kept. A date the
 * student typed must be from today through two years ahead (730 days, the account's own horizon in
 * exam_plans_guard()). A date already saved and left untouched is not judged again here.
 */
import { daysUntil } from './examdate';
import { isExamDate } from '../scripts/progress';

export const SETUP_DATE_MESSAGES = {
  incomplete: 'that date isn’t finished. finish it, use the date picker, or clear it.',
  invalid: 'that date doesn’t look right. use the date picker, or leave it blank.',
  past: 'that date has already passed. pick today or a later date, or leave it blank.',
  tooFar: 'that’s more than two years away. pick a date in the next two years, or leave it blank.',
} as const;

/** The longest an exam date may be ahead, in days (the account's limit). */
export const MAX_DAYS_AHEAD = 730;

export interface SetupDate {
  /** The field's value: '' when blank or unfinished. */
  value: string;
  /** The browser says the field holds something it can't read as a date (`validity.badInput`). */
  unfinished: boolean;
  /** The student changed the date on this visit. */
  typed: boolean;
  /** Today on this device, YYYY-MM-DD. */
  today: string;
}

/** Null when the date can be saved; otherwise one plain sentence saying what to do. */
export function setupDateProblem({ value, unfinished, typed, today }: SetupDate): string | null {
  if (unfinished) return SETUP_DATE_MESSAGES.incomplete;
  if (value === '') return null;
  if (!isExamDate(value)) return SETUP_DATE_MESSAGES.invalid;
  if (!typed) return null;
  let ahead: number;
  try {
    ahead = daysUntil(value, today);
  } catch {
    // The device's own date can't be read: don't block the student over it; the account checks its window itself.
    return null;
  }
  if (ahead < 0) return SETUP_DATE_MESSAGES.past;
  if (ahead > MAX_DAYS_AHEAD) return SETUP_DATE_MESSAGES.tooFar;
  return null;
}
