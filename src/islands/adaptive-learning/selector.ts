import { dayNumber, type StudyClock } from './calendar';
import type { ConceptEvidence } from './memory';

export const SESSION_LIMIT = 20;

export interface PracticeItem {
  id: string;
  concept: string;
  level: 1 | 2 | 3;
  /** A scheduled review, distinct from an unscheduled practice item. */
  dueDay?: string;
  tried?: boolean;
}

export interface PracticeSession {
  selections: number;
  previousId?: string;
  evidence: ReadonlyMap<string, ConceptEvidence>;
  preferredLevels: ReadonlyMap<string, PracticeItem['level']>;
}

export interface PracticeSelection {
  id: string;
  reason: 'due review' | 'weak concept' | 'new material';
}

function compareRank(left: readonly number[], right: readonly number[]): number {
  for (const [index, value] of left.entries()) {
    if (value !== right[index]) return value - right[index]!;
  }
  return 0;
}

export function selectPractice(
  items: readonly PracticeItem[],
  session: PracticeSession,
  clock: StudyClock,
  random: () => number,
): PracticeSelection | undefined {
  if (session.selections >= SESSION_LIMIT) return;
  const today = dayNumber(clock.day);
  let best: { choices: PracticeSelection[]; rank: number[] } | undefined;

  for (const item of items) {
    if (item.id === session.previousId) continue;
    const due = item.dueDay === undefined ? undefined : dayNumber(item.dueDay);
    if (due !== undefined && due > today) continue;

    const evidence = session.evidence.get(item.concept);
    // A prior of one right and one wrong keeps small samples from ranking as certainties.
    const success = evidence && (evidence.right + 1) / (evidence.right + evidence.wrong + 2);
    const preferred = session.preferredLevels.get(item.concept) ?? 2;
    const reason = due !== undefined ? 'due review' : evidence ? 'weak concept' : 'new material';
    const rank = [
      due !== undefined ? 0 : evidence ? 1 : 2,
      due ?? success ?? 0,
      evidence?.lastCorrect === false ? -dayNumber(evidence.lastDay) : 0,
      Math.abs(item.level - preferred),
      item.level,
      Number(item.tried === true),
    ];
    const selection = { id: item.id, reason } as const;
    const difference = best ? compareRank(rank, best.rank) : -1;
    if (difference < 0) best = { choices: [selection], rank };
    else if (difference === 0) best?.choices.push(selection);
  }

  if (!best || best.choices.length === 1) return best?.choices[0];
  const draw = random();
  const index = Number.isFinite(draw)
    ? Math.min(best.choices.length - 1, Math.max(0, Math.floor(draw * best.choices.length)))
    : 0;
  return best.choices[index];
}
