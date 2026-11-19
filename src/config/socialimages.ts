/**
 * The share cards in public/share/ (built by scripts/build-share-cards.mjs): their size, file type and the words drawn
 * on each, so a link preview can give the image's size and a text alternative (og:image:alt, twitter:image:alt).
 * Every card is 1200 × 630. The scene and ivory cards show the group name and the motto; the bronze-coin card shows
 * only the group name. Keep this in step with build-share-cards.mjs.
 */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 } as const;

const MOTTO = 'by nursing students, for nursing students.';

const GROUP_NAMES: Readonly<Record<string, string>> = { games: 'daily games', study: 'study skills' };

export interface SocialImageMeta {
  width: number;
  height: number;
  type: 'image/png';
  alt: string;
}

/** Size, type and text alternative for a share card's site path (for example /share/games-scene.png). */
export function socialImageMeta(path: string): SocialImageMeta | undefined {
  const match = /^\/share\/(games|study)-(scene|ivory|bronze-coin)\.png$/.exec(path);
  if (!match) return undefined;
  const name = GROUP_NAMES[match[1]];
  const alt = match[2] === 'bronze-coin' ? `cueory · ${name}` : `cueory · ${name} · ${MOTTO}`;
  return { ...SHARE_CARD_SIZE, type: 'image/png', alt };
}
