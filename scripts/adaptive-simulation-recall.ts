/** Latent recall in the synthetic comparison, measured on an absolute simulation day. */
export function syntheticRecallOn(card: { lastDay?: number; trueHalfLife: number }, day: number): number {
  return card.lastDay === undefined ? 0.55 : 2 ** (-(day - card.lastDay) / card.trueHalfLife);
}
