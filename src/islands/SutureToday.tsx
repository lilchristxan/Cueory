import { useMemo } from 'react';
import SutureGame from './SutureGame';
import SuturePathBoard from './SuturePathBoard';
import type { SuturePuzzle } from './suture';
import { boardPuzzles, isPathPuzzle, type WordPathPuzzle } from './suturepath';
import { dayNumber, puzzleForDay } from './pulse';

interface Props {
  /** Sample puzzles (D-71): the page hands over all of them, and today's is picked from the visitor's own date. */
  puzzles: WordPathPuzzle[];
  /** The game's name as the page shows it, from src/config/games.ts (D-66). */
  name: string;
  /** The daily piccline plays board-format puzzles only; the legacy /play/word-path route keeps the older word search. */
  boardOnly?: boolean;
  /** The page's Frame owns the gear and the "?"; the board keeps only the dialogs. */
  framed?: boolean;
}

/**
 * Word path on /play (D-71): picks the puzzle for the visitor's own date, going round the samples like the other daily
 * games, and hands it to the board. Rendered only in the browser (client:only), so "today" is the visitor's day.
 * A board-format puzzle (#722, "format": "path") gets the path board; an older word search keeps its own game.
 */
export default function SutureToday({ puzzles, name, boardOnly = false, framed = false }: Props) {
  // /play hands over each sample's theme or clue itself, so nothing more is looked up here.
  const puzzle = useMemo(() => puzzleForDay(boardOnly ? boardPuzzles(puzzles) : puzzles, dayNumber(new Date())), [puzzles, boardOnly]);
  if (!puzzle) return <p>no puzzle today.</p>;
  if (isPathPuzzle(puzzle)) return <SuturePathBoard puzzle={puzzle} name={name} framed={framed} />;
  return <SutureGame puzzle={puzzle as SuturePuzzle} name={name} framed={framed} />;
}
