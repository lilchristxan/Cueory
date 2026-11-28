import { useCallback, useMemo } from 'react';
import { gameName } from '../config/games';
import { buildShareUrl } from './share';
import ShareDialog from './ShareDialog';
import { yieldToBrowser } from './sharedialogmodel';
import type { ShareGame, ShareSticker } from './sharedialogmodel';
import type { SharePayload } from './vialosharing';
import type { SudokuLevel } from './sudoku';
import {
  SUDOKU_STICKER_KINDS,
  SUDOKU_STICKER_NAMES,
  SUDOKU_STICKER_SIZE,
  sudokuDateLine,
  sudokuDescription,
  sudokuFileName,
  sudokuStats,
  type SudokuStickerKind,
} from './sudokusticker';
import { stickerDate } from './vialosticker';
import type { SudokuPalette } from './sudokustickerdraw';

/*
  Sudoku's use of the shared share dialog: it supplies the two sticker drawings and the words. Loaded (with the canvas
  drawing code) only after a puzzle is solved, so the game's first load does not grow.
*/

export interface SudokuShareProps {
  open: boolean;
  onClose: () => void;
  level: SudokuLevel;
  /** The game's own clock, whole seconds. */
  seconds: number;
  /** The player's local date for this puzzle. */
  date: Date;
  /** The numbers the stats panel shows; undefined for a signed-out player (their sticker shows the time only). */
  account: { winPercent: number; streak: number } | undefined;
  /** The one-line result the game shows. */
  resultLine: string;
  siteUrl: string;
}

const GAME: ShareGame = {
  game: 'sudoku',
  title: `share your ${gameName('triage')} result`,
  wordmarkAlt: gameName('triage'),
  cornerText: '9',
  countdownLabel: `next ${gameName('triage')} in`,
};

const LABELS: Record<SudokuStickerKind, string> = { centered: 'portrait sticker', 'lower-third': 'landscape sticker' };

export default function SudokuShare(props: SudokuShareProps) {
  const { open, onClose, level, seconds, date, account, resultLine, siteUrl } = props;
  const stats = useMemo(() => sudokuStats({ seconds, account }), [seconds, account]);
  const input = useMemo(() => ({ dateLine: sudokuDateLine(stickerDate(date), level), stats }), [date, level, stats]);
  const payload: SharePayload = useMemo(() => ({ title: gameName('triage'), text: resultLine, url: buildShareUrl('triage', siteUrl) }), [resultLine, siteUrl]);
  const description = `${resultLine}. ${sudokuDescription(input)}`;
  const stickersKey = JSON.stringify(input);

  const makeStickers = useCallback(async (): Promise<ShareSticker[]> => {
    const draw = await import('./sudokustickerdraw');
    const palette: SudokuPalette = draw.readSudokuPalette();
    await draw.waitForSudokuFonts(palette);
    const made: ShareSticker[] = [];
    for (const kind of SUDOKU_STICKER_KINDS) {
      await yieldToBrowser();
      const canvas = draw.renderSudokuSticker(kind, input, palette);
      made.push({
        id: SUDOKU_STICKER_NAMES[kind],
        label: LABELS[kind],
        width: SUDOKU_STICKER_SIZE[kind].width,
        height: SUDOKU_STICKER_SIZE[kind].height,
        canvas,
        file: await draw.sudokuStickerFile(canvas, sudokuFileName(kind, date)),
      });
    }
    return made;
    // `input` is covered by stickersKey; the date only names the files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickersKey]);

  return <ShareDialog game={GAME} open={open} onClose={onClose} description={description} payload={payload} makeStickers={makeStickers} stickersKey={stickersKey} />;
}
