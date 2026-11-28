import { DAY_MS, dayNumber, type StudyClock } from './calendar';

export const RECALL_TARGET = 0.8;

export interface CardMemory {
  lastAt: number;
  lastDay: string;
  lastCorrect: boolean;
  halfLifeDays: number;
  spacedSuccesses: number;
}

export interface ConceptEvidence {
  right: number;
  wrong: number;
  lastCorrect: boolean;
  lastDay: string;
}

export function predictedRecall(memory: CardMemory, clock: StudyClock): number {
  // Math.exp, not `2 **`: V8's power function gives different last digits in Node 22 and Node 24, and a card sitting on
  // a threshold must not change status with the Node version (the seeded simulation depends on it).
  return Math.exp(-Math.LN2 * (Math.max(0, clock.now - memory.lastAt) / DAY_MS / memory.halfLifeDays));
}

export function recordAnswer(
  previous: CardMemory | undefined,
  correct: boolean,
  clock: StudyClock,
): CardMemory {
  const today = dayNumber(clock.day);
  const lastDay = previous ? dayNumber(previous.lastDay) : undefined;
  if (
    !Number.isFinite(clock.now) ||
    (previous && clock.now < previous.lastAt) ||
    (lastDay !== undefined && today < lastDay)
  ) {
    throw new RangeError('An answer needs a valid clock in chronological order.');
  }
  const spaced = lastDay !== undefined && today > lastDay;
  const strength = previous?.halfLifeDays ?? 3;
  return {
    lastAt: clock.now,
    lastDay: clock.day,
    lastCorrect: correct,
    halfLifeDays: correct ? Math.min(120, spaced ? strength * 1.6 : strength) : Math.max(1, strength / 2),
    spacedSuccesses: correct ? Math.min(2, (previous?.spacedSuccesses ?? 0) + Number(spaced)) : 0,
  };
}

export function recordConceptAnswer(
  previous: ConceptEvidence | undefined,
  correct: boolean,
  clock: StudyClock,
): ConceptEvidence {
  const today = dayNumber(clock.day);
  if (previous && today < dayNumber(previous.lastDay)) {
    throw new RangeError('Concept answers must be in calendar order.');
  }
  return {
    right: (previous?.right ?? 0) + Number(correct),
    wrong: (previous?.wrong ?? 0) + Number(!correct),
    lastCorrect: correct,
    lastDay: clock.day,
  };
}

export function cardMastered(memory: CardMemory, clock: StudyClock): boolean {
  return memory.spacedSuccesses >= 2 && predictedRecall(memory, clock) >= RECALL_TARGET;
}

/** The map is keyed by card ID, so one practiced card can never count twice. */
export function conceptMastered(memories: ReadonlyMap<string, CardMemory>, clock: StudyClock): boolean {
  if (memories.size < 2) return false;
  for (const memory of memories.values()) if (!cardMastered(memory, clock)) return false;
  return true;
}
