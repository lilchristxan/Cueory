/**
 * The labelled sample puzzles each daily game plays for now (D-71), read from /content at build time. /play and each
 * game's own page (/play/pillo, /play/sudoku, /play/crossword, /play/word-path) use these, so a broken sample stops
 * the build with one plain message whichever page is built first. Sudoku makes its puzzles in the browser.
 */
import { getCollection } from 'astro:content';
import { parsePuzzle } from '../islands/cueword';
import { parseWordPath } from '../islands/suturepath';

export async function pilloSamples() {
  return (await getCollection('pulse'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ data }) => ({ word: data.word, cue: data.cue }));
}

/** Each crossword sample goes through the game's own rules here. */
export async function crosswordSamples() {
  return (await getCollection('cueword'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, data }) => {
      try {
        return parsePuzzle({ id, sample: true, level: data.level, grid: data.grid, clues: data.clues });
      } catch (error) {
        throw new Error(`content/games/cueword/${id}.json: ${(error as Error).message}`);
      }
    });
}

/** A board-format file (#722) says "format": "path"; an older word search has a theme instead of a clue. */
export async function wordPathSamples() {
  return (await getCollection('suture'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, data }) => {
      try {
        return parseWordPath(data.format === 'path'
          ? { id, sample: true, format: data.format, clue: data.clue, grid: data.grid, words: data.words, extras: data.extras }
          : { id, sample: true, theme: data.theme, grid: data.grid, words: data.words });
      } catch (error) {
        throw new Error(`content/games/suture/${id}.json: ${(error as Error).message}`);
      }
    });
}
