import { useCallback, useMemo, useState } from 'react';
import { heldRounds, loadStats, localDay } from './gameresults';
import { dailyStats, recordResult, type GameStats } from './gamestats';
import { useStatsVisible } from './gamestatsgate';
import { useRefreshOnStatsChange } from './finishstatsrefresh';
import { browserStorage } from '../scripts/storage';
import { gameName } from '../config/games';
import { buildShareUrl } from './share';
import ShareDialog from './ShareDialog';
import { yieldToBrowser } from './sharedialogmodel';
import type { ShareGame, ShareSticker } from './sharedialogmodel';
import type { SharePayload } from './vialosharing';
import {
  PICCLINE_STICKER_KINDS,
  PICCLINE_STICKER_NAMES,
  PICCLINE_STICKER_SIZE,
  picclineDescription,
  picclineFileName,
  picclineStats,
  type PicclineStickerKind,
} from './picclinesticker';
import { stickerDate } from './vialosticker';
import type { PicclineAssets, PicclinePalette } from './picclinestickerdraw';

/*
  Piccline's use of the shared share dialog: it supplies the two sticker drawings, the wordmark and icon files and the
  words. Loaded (with the canvas drawing code) only after a board ends, so /play/piccline's first load does not grow.
*/

export interface PicclineShareProps {
  open: boolean;
  onClose: () => void;
  /** One entry per answer, in the order found: true for the word of the day. No letters ever reach the sticker. */
  found: readonly boolean[];
  /** Silent solve time in ms; undefined for a board finished before the timer existed. */
  solveMs: number | undefined;
  /** The player's local date for this puzzle. */
  date: Date;
  /** The one-line result the game already shows. */
  resultLine: string;
  siteUrl: string;
}

const GAME: ShareGame = {
  game: 'piccline',
  title: `share your ${gameName('piccline')} result`,
  wordmarkSrc: '/brand/games/piccline-wordmark-light.svg',
  wordmarkAlt: gameName('piccline'),
  cornerSrc: '/brand/games/piccline-light.svg',
  countdownLabel: `next ${gameName('piccline')} in`,
};

const LABELS: Record<PicclineStickerKind, string> = { centered: 'portrait sticker', 'lower-third': 'landscape sticker' };

/**
 * The numbers the stats panel shows, read here (not in the board) so the board's first load does not carry the stats
 * code. Read when the card mounts and again whenever the stats record changes (forget all, another tab).
 */
function readAccount(): { winPercent: number; streak: number } | undefined {
  const day = localDay(new Date());
  const saved = loadStats(browserStorage(), day);
  if (!saved.on) return undefined;
  const all = heldRounds().reduce<GameStats>((kept, round) => recordResult(kept, round), saved.stats);
  const stats = dailyStats(all, 'suture', day, 1);
  return { winPercent: stats.winPercent, streak: stats.currentStreak };
}

export default function PicclineShare(props: PicclineShareProps) {
  const { open, onClose, found, solveMs, date, resultLine, siteUrl } = props;
  const statsVisible = useStatsVisible();
  const [read, setRead] = useState(readAccount);
  useRefreshOnStatsChange(true, () => setRead(readAccount()));
  const account = statsVisible ? read : undefined;
  const stats = useMemo(() => picclineStats({ solveMs, found: found.length, total: found.length, account }), [solveMs, found, account]);
  const input = useMemo(() => ({ found, date: stickerDate(date), stats }), [found, date, stats]);
  const payload: SharePayload = useMemo(() => ({ title: gameName('piccline'), text: resultLine, url: buildShareUrl('suture', siteUrl) }), [resultLine, siteUrl]);
  const description = `${resultLine}. ${picclineDescription(input)}`;
  const stickersKey = JSON.stringify(input);

  const makeStickers = useCallback(async (): Promise<ShareSticker[]> => {
    const draw = await import('./picclinestickerdraw');
    const palette: PicclinePalette = draw.readPicclinePalette();
    await draw.waitForPicclineFonts(palette);
    const assets: PicclineAssets = await draw.loadPicclineAssets();
    const made: ShareSticker[] = [];
    for (const kind of PICCLINE_STICKER_KINDS) {
      await yieldToBrowser();
      const canvas = draw.renderPicclineSticker(kind, input, assets, palette);
      made.push({
        id: PICCLINE_STICKER_NAMES[kind],
        label: LABELS[kind],
        width: PICCLINE_STICKER_SIZE[kind].width,
        height: PICCLINE_STICKER_SIZE[kind].height,
        canvas,
        file: await draw.picclineStickerFile(canvas, picclineFileName(kind, date)),
      });
    }
    return made;
    // `input` is covered by stickersKey; the date only names the files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickersKey]);

  return <ShareDialog game={GAME} open={open} onClose={onClose} description={description} payload={payload} makeStickers={makeStickers} stickersKey={stickersKey} />;
}
