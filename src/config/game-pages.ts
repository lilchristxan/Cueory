import type { DailyGame } from './games';

export const gamePages: Readonly<Record<DailyGame['id'], string>> = Object.freeze({
  vialo: '/play/wordpill',
  pulse: '/play/wordpill',
  triage: '/play/sudoku',
  cueword: '/play/crossword',
  suture: '/play/piccline',
  piccline: '/play/piccline',
  tachyyy: '/play/tachyyy',
  stat: '/play/tachyyy',
});
