/**
 * Pages that may be listed in the public sitemap. Noindex and preview pages stay out. Lesson pages generated from
 * /content are added to the sitemap at build time (src/pages/sitemap.xml.ts, Task 300); the study-skills sample lesson is held back on the live build (src/lessons/draftgate.ts), so it is not listed here.
 */
export const indexablePages = [
  '/',
  '/courses',
  '/learn',
  '/play',
  '/play/crossword',
  '/play/pillo',
  '/play/sudoku',
  '/play/word-path',
  '/support',
  // Final legal text (Christian, 2026-11-17).
  '/terms',
  '/disclaimer',
  '/privacy',
] as const;
