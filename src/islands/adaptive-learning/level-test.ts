import type { AdaptiveAttempt, AdaptiveQuestion } from '../adaptive';
import { levelTestEvidence, nextInLevelTest } from '../leveltest';

export function selectLevelQuestion(
  questions: readonly AdaptiveQuestion[],
  attempts: readonly AdaptiveAttempt[],
  random: () => number,
): string | undefined {
  if (questions.length === 0) return;
  const draw = random();
  const bounded = Number.isFinite(draw) ? Math.min(1 - Number.EPSILON, Math.max(0, draw)) : 0;
  // One stable seed feeds the existing selection rule without changing its public callers.
  return nextInLevelTest(questions, attempts, Math.floor(bounded * 2 ** 32));
}

export function estimateLevel(
  questions: readonly AdaptiveQuestion[],
  attempts: readonly AdaptiveAttempt[],
) {
  if (questions.length === 0) return [];
  return levelTestEvidence(questions, attempts).map(evidence => {
    const { right, asked } = evidence;
    const z = 1.96;
    const fraction = asked ? right / asked : 0;
    const adjustment = asked ? (z * z) / asked : 0;
    const center = (fraction + adjustment / 2) / (1 + adjustment);
    const width = asked ? z * Math.sqrt((fraction * (1 - fraction) + adjustment / 4) / asked) / (1 + adjustment) : 0;
    return {
      ...evidence,
      // Descriptive only: the adaptive question path is not an independent random sample.
      descriptiveRange: asked ? { lower: Math.max(0, center - width), upper: Math.min(1, center + width) } : undefined,
    };
  });
}
