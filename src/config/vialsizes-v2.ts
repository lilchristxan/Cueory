/**
 * The real pixel size of each rebuilt vial picture in public/vials/v2/ (Home v3 hand-off). VialPlatter.astro writes
 * these as the image's width and height so the browser reserves the right space before a lazily loaded vial arrives.
 * tests/unit/vial-platter.test.ts checks them against the files.
 */
import type { StudyVial } from './modes';

export const VIAL_V2_SIZES: Record<StudyVial | 'practice-exams', { width: number; height: number }> = {
  'adaptive-quiz': { width: 912, height: 1948 },
  'fill-in': { width: 912, height: 1969 },
  flashcards: { width: 912, height: 1948 },
  'label-it': { width: 912, height: 1940 },
  'learn-mode': { width: 912, height: 1955 },
  'level-test': { width: 912, height: 1924 },
  matching: { width: 912, height: 1940 },
  organizer: { width: 912, height: 1904 },
  'practice-exams': { width: 912, height: 1924 },
  questions: { width: 912, height: 1980 },
  'spaced-review': { width: 912, height: 1952 },
  'video-lessons': { width: 912, height: 1937 },
};
