import { useCallback, useMemo } from 'react';
import type { Mark } from './pulse';
import { buildShareUrl } from './share';
import ShareDialog from './ShareDialog';
import type { ShareGame, ShareSticker } from './sharedialogmodel';
import type { SharePayload } from './vialosharing';
import {
  STICKER_KINDS,
  STICKER_NAMES,
  STICKER_SIZE,
  stickerDate,
  stickerDescription,
  stickerFileName,
  stickerStats,
  type StickerKind,
} from './vialosticker';
import type { StickerAssets, StickerPalette } from './vialostickerdraw';

/*
  Vialo's use of the shared share dialog: it supplies the two sticker drawings, the wordmark and icon files and the
  words. Loaded (with the canvas drawing code) only after a game ends, so /play/vialo's first load does not grow.
*/

export interface VialoShareProps {
  open: boolean;
  onClose: () => void;
  /** The marks of each accepted guess. No letters ever reach the sticker. */
  rows: readonly (readonly Mark[])[];
  solved: boolean;
  tries: number;
  maxTries: number;
  /** Silent solve time in ms, for a solved game that was timed. */
  solveMs: number | undefined;
  /** The player's local date for this puzzle. */
  date: Date;
  /** The numbers the stats panel shows; undefined for a signed-out player (their sticker shows the time only). */
  account: { winPercent: number; streak: number } | undefined;
  /** The one-line result, e.g. "vialo · sun 1 nov · 4/6 · cueory.app". */
  resultLine: string;
  siteUrl: string;
}

const GAME: ShareGame = {
  game: 'vialo',
  title: 'share your vialo result',
  wordmarkSrc: '/design/games-v2/assets/vialo-wordmark-oxblood-v3.svg',
  wordmarkAlt: 'vialo',
  cornerSrc: '/design/games-v2/assets/vialo-icon-silver-oxblood.svg',
  countdownLabel: 'next vialo in',
};

const LABELS: Record<StickerKind, string> = { centered: 'portrait sticker', 'lower-third': 'landscape sticker' };

export default function VialoShare(props: VialoShareProps) {
  const { open, onClose, rows, solved, tries, maxTries, solveMs, date, account, resultLine, siteUrl } = props;
  const stats = useMemo(() => stickerStats({ solved, tries, maxTries, solveMs, account }), [solved, tries, maxTries, solveMs, account]);
  const input = useMemo(() => ({ rows, date: stickerDate(date), stats }), [rows, date, stats]);
  const payload: SharePayload = useMemo(() => ({ title: 'vialo', text: resultLine, url: buildShareUrl('vialo', siteUrl) }), [resultLine, siteUrl]);
  const description = `${resultLine}. ${stickerDescription(input, solved, tries, maxTries)}`;
  const stickersKey = JSON.stringify(input);

  const makeStickers = useCallback(async (): Promise<ShareSticker[]> => {
    const draw = await import('./vialostickerdraw');
    const palette: StickerPalette = draw.readStickerPalette();
    await draw.waitForStickerFonts(palette);
    const assets: StickerAssets = await draw.loadStickerAssets();
    const made: ShareSticker[] = [];
    for (const kind of STICKER_KINDS) {
      const canvas = draw.renderSticker(kind, input, assets, palette);
      made.push({
        id: STICKER_NAMES[kind],
        label: LABELS[kind],
        width: STICKER_SIZE[kind].width,
        height: STICKER_SIZE[kind].height,
        canvas,
        file: await draw.stickerFile(canvas, stickerFileName(kind, date)),
      });
    }
    return made;
    // `input` is covered by stickersKey; the date only names the files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickersKey]);

  return <ShareDialog game={GAME} open={open} onClose={onClose} description={description} payload={payload} makeStickers={makeStickers} stickersKey={stickersKey} />;
}
