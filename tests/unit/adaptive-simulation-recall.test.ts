import { expect, it } from 'vitest';
import { syntheticRecallOn } from '../../scripts/adaptive-simulation-recall';

it('uses the whole delay since each card was last practiced at a common follow-up', () => {
  const followUpDay = 51;
  const trueHalfLife = 7;
  expect(syntheticRecallOn({ trueHalfLife, lastDay: 44 }, followUpDay)).toBe(0.5);
  expect(syntheticRecallOn({ trueHalfLife, lastDay: 35 }, followUpDay)).toBeCloseTo(0.20508384);
  expect(syntheticRecallOn({ trueHalfLife }, followUpDay)).toBe(0.55);
});
