import { dailyGames, type DailyGame } from './games';
import { crosswordOpen } from './site';

/**
 * The page of each daily game. A game is listed in the sitemap only when games.ts marks it ready (playable) and, for the
 * crossword, the crosswordOpen switch (site.ts) is on. Coming-soon games stay out, so the sitemap follows that config.
 */
const gamePageById: readonly { id: DailyGame['id']; path: string; open: boolean }[] = [
  { id: 'vialo', path: '/play/wordpill', open: true },
  { id: 'cueword', path: '/play/crossword', open: crosswordOpen },
  { id: 'triage', path: '/play/sudoku', open: true },
  { id: 'suture', path: '/play/piccline', open: true },
];

/** Playable daily game pages, derived from dailyGames (games.ts) and the crossword switch. */
export const playableGamePages: readonly string[] = gamePageById
  .filter((page) => page.open && dailyGames.some((game) => game.id === page.id && game.ready))
  .map((page) => page.path);


/**
 * Pages that may be listed in the public sitemap. Noindex and preview pages stay out. Lesson pages generated from
 * /content are added to the sitemap at build time (src/pages/sitemap.xml.ts, Task 300); the study-skills sample lesson is held back on the live build (src/lessons/draftgate.ts), so it is not listed here.
 */
export const indexablePages = [
  '/',
  '/courses',
  '/learn',
  '/play',
  // Playable games (vialo, sudoku, piccline; the crossword once crosswordOpen is on) come from games.ts.
  ...playableGamePages,
  '/support',
  // Final legal text (Christian, 2026-11-17).
  '/terms',
  '/disclaimer',
  '/privacy',
] as const;

/**
 * The study-skills sample lesson's two hand-built pages (the rest are generated from /content). They are listed in the
 * sitemap only on builds that show the sample lesson; the live build holds them behind a coming-soon page.
 */
export const sampleLessonPages = ['/learn/study-skills/label-it', '/learn/study-skills/questions'] as const;
