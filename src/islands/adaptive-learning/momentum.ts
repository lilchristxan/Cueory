// Momentum (Christian, 2026-11-28): make coming back to study feel good, without burning students out.
//
// The rules here reward real progress and give honest stopping points. They never punish a missed day, never
// invent urgency, and never hide how much is left. Pure rules; design in docs/design/module-mastery-path.md.

/** Practice comes in short sets, each with its own small finish line. */
export const SET_SIZE = 5;
/** After this many sets in one sitting, the page offers a good place to stop. */
export const SETS_BEFORE_BREAK = 4;
/** Rest days a streak can absorb in any rolling week, so one missed day costs nothing. */
export const REST_DAYS_PER_WEEK = 2;
/** A falling share right across two sets in a row reads as tiredness. */
export const TIRED_DROP = 0.2;

export interface SetResult {
  right: number;
  asked: number;
}

export type Moment =
  | { kind: 'set done'; right: number; asked: number }
  | { kind: 'clean set' }
  | { kind: 'comeback'; concept: string }
  | { kind: 'level shown'; concept: string; level: string }
  | { kind: 'ready for the practice test' }
  | { kind: 'good place to stop'; why: 'sets done' | 'tiring' };

/** True when the sitting has reached a natural break: enough sets done, or results sliding two sets running. */
export function breakSuggestion(sets: readonly SetResult[]): 'sets done' | 'tiring' | undefined {
  const full = sets.filter((set) => set.asked > 0);
  if (full.length >= 3) {
    const [a, b, c] = full.slice(-3).map((set) => set.right / set.asked) as [number, number, number];
    if (a - b >= TIRED_DROP / 2 && b - c >= TIRED_DROP / 2 && a - c >= TIRED_DROP) return 'tiring';
  }
  return full.length > 0 && full.length % SETS_BEFORE_BREAK === 0 ? 'sets done' : undefined;
}

/** The moments worth marking when a set ends, most meaningful first. Wins are tied to what the student did. */
export function momentsAfterSet(
  sets: readonly SetResult[],
  events: { comebacks?: readonly string[]; levelsShown?: readonly { concept: string; level: string }[]; nowReady?: boolean },
): Moment[] {
  const last = sets.at(-1);
  if (!last || last.asked === 0) return [];
  const moments: Moment[] = [];
  if (events.nowReady) moments.push({ kind: 'ready for the practice test' });
  for (const shown of events.levelsShown ?? []) moments.push({ kind: 'level shown', ...shown });
  for (const concept of events.comebacks ?? []) moments.push({ kind: 'comeback', concept });
  moments.push(last.right === last.asked ? { kind: 'clean set' } : { kind: 'set done', right: last.right, asked: last.asked });
  const stop = breakSuggestion(sets);
  if (stop) moments.push({ kind: 'good place to stop', why: stop });
  return moments;
}

function dayNumber(day: string): number {
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isNaN(time)) throw new Error(`invalid day: ${day}`);
  return Math.round(time / 86_400_000);
}

export interface Streak {
  /** Days studied in the current run. */
  days: number;
  /** Rest days used inside the last seven days, out of REST_DAYS_PER_WEEK. */
  restUsed: number;
  /** Whether today already counts. */
  studiedToday: boolean;
}

/**
 * A forgiving streak: it counts days studied, and a gap is bridged while no more than REST_DAYS_PER_WEEK rest days
 * fall in any seven-day window. A student is never told a streak is "about to be lost".
 */
export function streak(studiedDays: readonly string[], today: string): Streak {
  const studied = new Set(studiedDays.map(dayNumber));
  const now = dayNumber(today);
  const studiedToday = studied.has(now);
  let days = 0;
  const bridged: number[] = []; // rest days with a study day on both sides
  let pending: number[] = []; // rest days waiting for an earlier study day to bridge to
  // Today not yet studied is neither a study day nor a rest day: the day is not over.
  for (let day = studiedToday ? now : now - 1; day > now - 3650; day -= 1) {
    if (studied.has(day)) {
      days += 1;
      bridged.push(...pending);
      pending = [];
      continue;
    }
    const inWindow = [...bridged, ...pending].filter((rest) => rest - day < 7).length;
    if (inWindow >= REST_DAYS_PER_WEEK) break;
    pending.push(day);
  }
  return { days, restUsed: bridged.filter((rest) => now - rest < 7).length, studiedToday };
}

/** Today's goal, sized to be finishable: one set on a first day, growing slowly, never more than the break point. */
export function dailyGoalSets(streakDays: number): number {
  return Math.min(SETS_BEFORE_BREAK, 1 + Math.floor(Math.max(0, streakDays) / 7));
}
