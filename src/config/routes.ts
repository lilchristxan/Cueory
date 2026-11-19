import { crosswordOpen } from './site';

/**
 * Pages that may be listed in the public sitemap. Noindex and preview pages stay out. Lesson pages generated from
 * /content are added to the sitemap at build time (src/pages/sitemap.xml.ts, Task 300); the study-skills sample lesson is held back on the live build (src/lessons/draftgate.ts), so it is not listed here.
 */
export const indexablePages = [
  '/',
  '/courses',
  '/learn',
  '/play',
  // The crossword page is a "coming soon" note (and noindex) while crosswordOpen (site.ts) is false.
  ...(crosswordOpen ? ['/play/crossword' as const] : []),
  '/play/pillo',
  '/play/sudoku',
  '/play/word-path',
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
